// agente.js · el corazón del Acompañante. La misma función responder() sirve
// para el chat de la terminal y, después, para el adaptador de WhatsApp.
//
// Orden fijo de cada mensaje (plan.md, v0.1):
//   1. candado de crisis      -> respuesta fija (106 y 123) + aviso a guardia. No llama al modelo.
//   2. candado de maltrato    -> respuesta fija (ICBF 141) + aviso a guardia. No llama al modelo.
//   (chequeo de bienestar en curso, «persona», «diario:» y «resumen» se atienden sin modelo)
//   3. bibliotecario          -> fragmentos de la biblioteca
//   4. modelo                 -> conversa como experta (v2); cita [fuente: id] cuando usa la biblioteca
//   5. filtro de diagnóstico  -> si bloquea, un reintento; si vuelve a bloquear, plantilla segura
//   6. verificación de citas  -> (v2, 2026-11-02) solo falla por (a) cita a un id que no se entregó
//                                o (b) dato de Colombia / cifra de instrumento sin cita; en los dos
//                                casos responde «no lo sé; consúltalo con…» (respuestaSinFuente).
//                                La charla, el apoyo y lo general pasan sin cita.
//
// Las sesiones viven en memoria (Map). Se pierden al cerrar el programa (v0.1).
// Piloto web (2026-11-02): además, responderConEstado / chequeoConEstado /
// resumenConEstado trabajan sobre una sesión que guarda el navegador: reciben el
// objeto de sesión, lo validan, lo actualizan y lo devuelven (api\chat.js no
// guarda nada). Mismo orden, mismos textos y mismas llamadas al modelo.
// Los resultados traen además los fragmentos recuperados y el aviso a la guardia
// (para el panel «Por dentro»). Versión anterior: agente.js.bak_2026-11-02_antes-web.

import crypto from "node:crypto";
import { buscar, fuentes } from "./biblioteca.js";
import { detectarCrisis, detectarMaltrato, filtrarDiagnostico, verificarCitas, extraerCitas, valorRespuestaEscala } from "./candados.js";
import { avisarGuardia } from "./guardia.js";
import { completar, ErrorModelo } from "./modelo.js";
import {
  SYSTEM,
  SYSTEM_RESUMEN,
  INSTRUCCION_REINTENTO_DIAGNOSTICO,
  RESPUESTA_CRISIS,
  RECORDATORIO_CRISIS,
  RESPUESTA_MALTRATO,
  RESPUESTA_DIAGNOSTICO_SEGURA,
  RESPUESTA_RECHAZO,
  RESPUESTA_ERROR,
  SALUDO_SIN_PERFIL,
  respuestaSinPerfil,
  respuestaSinFuente,
  construirTurno,
} from "./prompt.js";

// 2026-11-10 · Perfil sensorial (Natalia / Integrar: «no generalizamos»).
// - El perfil vive SOLO en el navegador. Llega en cada mensaje como {nina, cuidadora}
//   (dos resúmenes cortos en texto), se limpia y se recorta aquí y va al modelo dentro
//   de <perfil_sensorial> (prompt.js). No se guarda en la sesión, ni en la guardia, ni en logs.
// - Los candados de crisis y maltrato corren ANTES y no dependen del perfil.
// - En la web (opciones.exigirPerfil), sin perfil completo no hay orientación general:
//   respuesta fija que invita a hacerlo (sin modelo). El chat de terminal no lo exige.
// Versión anterior: agente.js.bak_2026-11-10.
import { normalizar } from "./texto.js";

const MAX_TURNOS = 20; // turnos (pregunta + respuesta) que se recuerdan por sesión
const K_FRAGMENTOS = 6;
const sesiones = new Map();

function sesion(id) {
  const clave = String(id ?? "sin-id");
  if (!sesiones.has(clave)) {
    sesiones.set(clave, { historial: [], enCrisis: false, diario: [], chequeo: null });
  }
  return sesiones.get(clave);
}

export function estadoSesion(id) {
  const s = sesion(id);
  return { enCrisis: s.enCrisis, entradasDiario: s.diario.length, chequeo: s.chequeo ? { ...s.chequeo } : null, turnos: s.historial.length / 2 };
}

export function reiniciarSesion(id) {
  sesiones.delete(String(id ?? "sin-id"));
}

function usoCero() {
  return { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, llamadas: 0 };
}
function sumarUso(total, parcial) {
  for (const k of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]) total[k] += parcial[k] || 0;
  total.llamadas += 1;
}

// Las respuestas fijas de crisis y maltrato salen de estos documentos de la
// biblioteca (CA9: toda afirmación clínica o legal lleva fuente). Solo se citan
// los que de verdad están cargados; si faltan, la respuesta fija sale igual.
const FUENTES_CRISIS = ["protocolo-crisis", "lineas-ayuda-colombia"];
const FUENTES_MALTRATO = ["protocolo-maltrato", "icbf-141"];
function conFuentesFijas(texto, idsDeseados) {
  const disponibles = new Set(fuentes().map((f) => f.id));
  const ids = idsDeseados.filter((id) => disponibles.has(id));
  return { texto: ids.length ? `${texto}\n[fuente: ${ids.join(", ")}]` : texto, ids };
}

function hoy() {
  return new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD en hora local
}

function guardarTurno(s, pregunta, respuesta) {
  s.historial.push({ role: "user", content: pregunta }, { role: "assistant", content: respuesta });
  while (s.historial.length > MAX_TURNOS * 2) s.historial.splice(0, 2);
}

function resultado(s, texto, extra = {}) {
  let final = texto;
  // Si la sesión pasó por una crisis, toda respuesta posterior recuerda las líneas.
  if (s.enCrisis && extra.candado !== "crisis") final = `${texto}\n\n${RECORDATORIO_CRISIS}`;
  return { texto: final, fuentes_usadas: extra.fuentes_usadas || [], candado: extra.candado ?? null, uso: extra.uso || usoCero(), ...extra.otros };
}

// ---------------------------------------------------------------- responder

// Lo que el panel «Por dentro» muestra del aviso a la guardia (sin el texto).
function aviso(linea) {
  return linea ? { hora: linea.hora, tipo: linea.tipo, motivo: linea.motivo } : null;
}

export async function responder(sesionId, mensaje, opciones = {}) {
  return responderEn(sesion(sesionId), sesionId, mensaje, opciones);
}

async function responderEn(s, sesionId, mensaje, opciones = {}) {
  const texto = String(mensaje ?? "").trim();
  if (!texto) return resultado(s, "No nos llegó tu mensaje. ¿Nos cuentas otra vez?");

  // 1 · crisis (también revisa la respuesta al ítem 9 del PHQ-9)
  const enItem9 = Boolean(s.chequeo && s.chequeo.fase === "phq" && s.chequeo.indice === 8);
  const crisis = detectarCrisis(texto, { enItemPHQ9: enItem9 });
  if (crisis.detectado) {
    s.enCrisis = true;
    s.chequeo = null;
    const linea = avisarGuardia({ sesion: sesionId, tipo: "crisis", texto, motivo: crisis.motivo });
    const { texto: respuesta, ids } = conFuentesFijas(RESPUESTA_CRISIS, FUENTES_CRISIS);
    guardarTurno(s, texto, respuesta);
    return resultado(s, respuesta, { candado: "crisis", fuentes_usadas: ids, otros: { motivo_candado: crisis.motivo, guardia: aviso(linea) } });
  }

  // 2 · maltrato
  const maltrato = detectarMaltrato(texto);
  if (maltrato.detectado) {
    const linea = avisarGuardia({ sesion: sesionId, tipo: "maltrato", texto, motivo: maltrato.motivo });
    const { texto: respuesta, ids } = conFuentesFijas(RESPUESTA_MALTRATO, FUENTES_MALTRATO);
    guardarTurno(s, texto, respuesta);
    return resultado(s, respuesta, { candado: "maltrato", fuentes_usadas: ids, otros: { motivo_candado: maltrato.motivo, guardia: aviso(linea) } });
  }

  // Chequeo de bienestar en curso: lo guía el código, no el modelo.
  if (s.chequeo) return avanzarChequeo(sesionId, s, texto);

  const n = normalizar(texto).replace(/[^a-z ]/g, "").trim();
  if (n === "persona" || n === "quiero hablar con una persona") {
    const linea = avisarGuardia({ sesion: sesionId, tipo: "pide-persona", texto: "pide hablar con una persona" });
    return resultado(s, "Listo. Dejamos registrada tu solicitud para que el equipo la revise; la respuesta de una persona puede tardar. Si necesitas hablar ya con alguien: *Línea 106* (apoyo emocional) o *123* (emergencias).", { otros: { guardia: aviso(linea) } });
  }
  if (n === "resumen") return resumenEn(s);

  // Diario: mensajes que empiezan por «diario:» (con fecha opcional) o notas marcadas.
  const diario = texto.match(/^diario(?:\s+(\d{4}-\d{2}-\d{2}))?\s*:\s*([\s\S]+)$/i);
  if (diario || opciones.esDiario) {
    const fecha = (diario && diario[1]) || opciones.fecha || hoy();
    const nota = diario ? diario[2].trim() : texto;
    s.diario.push({ fecha, texto: nota });
    return resultado(s, `Anotado en tu bitácora (${fecha}). Cuando quieras, escribe «resumen» y armamos el resumen para la consulta.`);
  }

  // Perfil sensorial: sin perfil completo no hay orientación general (solo en la web).
  const perfil = opciones.perfil || null;
  const infoPerfil = { nina: Boolean(perfil && perfil.nina), cuidadora: Boolean(perfil && perfil.cuidadora), caracteres: perfil ? (perfil.nina || "").length + (perfil.cuidadora || "").length : 0 };
  if (opciones.exigirPerfil && !(infoPerfil.nina && infoPerfil.cuidadora)) {
    const respuesta = esSaludo(texto) && !infoPerfil.nina && !infoPerfil.cuidadora ? SALUDO_SIN_PERFIL : respuestaSinPerfil({ nina: !infoPerfil.nina, cuidadora: !infoPerfil.cuidadora });
    guardarTurno(s, texto, respuesta);
    return resultado(s, respuesta, { candado: "sin-perfil", otros: { perfil: infoPerfil } });
  }

  // 3 · bibliotecario
  const fragmentos = buscar(texto, K_FRAGMENTOS);
  const recuperados = fragmentos.map((f) => ({ id_fuente: f.id_fuente, seccion: f.seccion, puntaje: f.puntaje }));

  // 4 · modelo (el perfil va en el turno, delimitado; la sesión guarda solo el mensaje)
  const uso = usoCero();
  const mensajes = [...s.historial, { role: "user", content: construirTurno(texto, fragmentos, perfil) }];
  let candado = null;
  let respuestaFinal;
  try {
    let r = await completar({ system: SYSTEM, mensajes });
    sumarUso(uso, r.uso);
    if (r.stop_reason === "refusal") return rechazo(sesionId, s, texto, uso, recuperados);

    // 5 · filtro de diagnóstico (a la salida)
    const filtro1 = filtrarDiagnostico(r.texto);
    let motivoDiagnostico = null;
    if (filtro1.bloqueado) {
      candado = "diagnostico";
      motivoDiagnostico = filtro1.motivo;
      const r2 = await completar({ system: SYSTEM, mensajes: [...mensajes, { role: "system", content: INSTRUCCION_REINTENTO_DIAGNOSTICO }] });
      sumarUso(uso, r2.uso);
      if (r2.stop_reason === "refusal") return rechazo(sesionId, s, texto, uso, recuperados);
      const filtro2 = filtrarDiagnostico(r2.texto);
      if (filtro2.bloqueado) {
        guardarTurno(s, texto, RESPUESTA_DIAGNOSTICO_SEGURA);
        return resultado(s, RESPUESTA_DIAGNOSTICO_SEGURA, { candado, uso, otros: { motivo_candado: `${motivoDiagnostico} · reintento: ${filtro2.motivo}`, fragmentos: recuperados, perfil: infoPerfil } });
      }
      r = r2;
    }

    // 6 · verificación de citas (v2): falla (a) «cita-inexistente» o (b) «dato-sin-cita»;
    // en ambos casos la respuesta de reemplazo es la misma (respuestaSinFuente).
    let textoModelo = r.texto;
    let v = verificarCitas(textoModelo, fragmentos);
    let citasQuitadas = [];
    // 6b (2026-11-02) · si la única falla es citar una ficha REAL de la biblioteca que
    // no venía en este turno (el modelo recordó su id), se quita esa cita y se vuelve a
    // verificar: lo que quede sin cita cae en la regla (b) si era un dato que la exige.
    // Un id que no existe en la biblioteca sigue tumbando la respuesta entera.
    if (textoModelo && !v.ok && v.falla === "cita-inexistente") {
      const conocidas = new Set(fuentes().map((f) => f.id));
      if (v.invalidas.every((id) => conocidas.has(id))) {
        citasQuitadas = [...v.invalidas];
        textoModelo = quitarCitas(textoModelo, citasQuitadas);
        v = verificarCitas(textoModelo, fragmentos);
      }
    }
    if (!textoModelo || !v.ok) {
      respuestaFinal = respuestaSinFuente(texto);
      candado = "sin-fuente";
      guardarTurno(s, texto, respuestaFinal);
      return resultado(s, respuestaFinal, { candado, uso, otros: { motivo_candado: textoModelo ? v.motivo : "respuesta vacía", falla_citas: textoModelo ? v.falla : "respuesta-vacia", fragmentos: recuperados, perfil: infoPerfil } });
    }
    respuestaFinal = textoModelo;
    guardarTurno(s, texto, respuestaFinal);
    const otros = { motivo_candado: motivoDiagnostico, fragmentos: recuperados, perfil: infoPerfil };
    if (citasQuitadas.length) otros.citas_quitadas = citasQuitadas;
    return resultado(s, respuestaFinal, { candado, uso, fuentes_usadas: [...new Set(v.citas)], otros });
  } catch (error) {
    if (!(error instanceof ErrorModelo)) throw error;
    console.error(`[agente] ${error.tipo}: ${error.message}`);
    return resultado(s, RESPUESTA_ERROR, { candado: "error", uso, otros: { error: error.tipo, fragmentos: recuperados, perfil: infoPerfil } });
  }
}

// Quita de la respuesta las citas a los ids indicados (deja las demás citas del mismo corchete).
function quitarCitas(texto, ids) {
  const fuera = new Set(ids);
  return String(texto)
    .replace(/\[\s*fuente\s*:\s*([^\]]+)\]/gi, (m, lista) => {
      const quedan = lista.split(/[,;]/).map((x) => x.trim()).filter((x) => x && !fuera.has(x));
      return quedan.length ? `[fuente: ${quedan.join(", ")}]` : "";
    })
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

function rechazo(sesionId, s, texto, uso, recuperados) {
  const linea = avisarGuardia({ sesion: sesionId, tipo: "rechazo-del-modelo", texto });
  guardarTurno(s, texto, RESPUESTA_RECHAZO);
  return resultado(s, RESPUESTA_RECHAZO, { candado: "rechazo", uso, otros: { fragmentos: recuperados, guardia: aviso(linea) } });
}

// ---------------------------------------------------------------- chequeo de bienestar (CA4)
// PHQ-2 (= ítems 1 y 2 del PHQ-9) y GAD-2. Si PHQ-2 >= 3, ofrece el PHQ-9
// (ítems 3 a 9) y contacto humano. Nunca muestra un diagnóstico.
// Redacción en español revisada y aprobada por la terapeuta el 2026-11-08.

const OPCIONES = "Responde con un número:\n0 = nunca · 1 = varios días · 2 = más de la mitad de los días · 3 = casi todos los días";
const PHQ9 = [
  "Poco interés o gusto por hacer las cosas",
  "Sentirte decaída, deprimida o sin esperanza",
  "Problemas para dormir o mantenerte dormida, o dormir demasiado",
  "Sentirte cansada o con poca energía",
  "Poco apetito o comer en exceso",
  "Sentirte mal contigo misma, sentir que eres un fracaso o que le has fallado a tu familia",
  "Dificultad para concentrarte, por ejemplo al leer o ver televisión",
  "Moverte o hablar tan despacio que otras personas lo notan, o lo contrario: estar tan inquieta que no puedes quedarte quieta",
  "Pensar que estarías mejor muerta o en hacerte daño de alguna forma",
];
const GAD2 = [
  "Sentirte nerviosa, ansiosa o con los nervios de punta",
  "No poder dejar de preocuparte o no poder controlar la preocupación",
];

function preguntaActual(c) {
  const lista = c.fase === "phq" ? PHQ9 : GAD2;
  return `En las últimas 2 semanas, ¿con qué frecuencia te ha pasado esto?\n*${lista[c.indice]}*\n${OPCIONES}`;
}

export function chequeoBienestar(sesionId) {
  return chequeoEn(sesion(sesionId));
}

function chequeoEn(s) {
  s.chequeo ={ fase: "phq", indice: 0, phq: [], gad: [], ampliado: false };
  const intro = "Gracias por darte este momento. Son 4 preguntas cortas sobre cómo has estado tú. No es un examen ni un diagnóstico; puedes escribir «salir» cuando quieras.";
  return resultado(s, `${intro}\n\n${preguntaActual(s.chequeo)}`, { otros: { chequeo: { fase: "phq", indice: 0 } } });
}

function avanzarChequeo(sesionId, s, texto) {
  const c = s.chequeo;
  const n = normalizar(texto).trim();

  if (/^(salir|cancelar|parar|ya no)\b/.test(n)) {
    s.chequeo = null;
    return resultado(s, "Listo, dejamos el chequeo aquí. Cuando quieras retomarlo, nos dices.");
  }

  // Ofertas después del PHQ-2 / GAD-2 (sí, no o persona).
  if (c.fase === "oferta") {
    if (/\bpersona\b/.test(n)) {
      s.chequeo = null;
      const linea = avisarGuardia({ sesion: sesionId, tipo: "pide-persona", texto: "pide contacto humano tras el chequeo", motivo: `PHQ-2=${suma(c.phq.slice(0, 2))} GAD-2=${suma(c.gad)}` });
      return resultado(s, "Listo. Dejamos registrada tu solicitud para que el equipo la revise; la respuesta puede tardar. Si necesitas hablar ya con alguien: *Línea 106*. No estás sola.", { otros: { puntajes: puntajes(c), guardia: aviso(linea) } });
    }
    if (c.ofrecePHQ9 && /^(si|sí|bueno|dale|ok|listo|claro)\b/.test(n)) {
      c.fase = "phq";
      c.indice = 2;
      c.ampliado = true;
      return resultado(s, `Gracias. Son 7 preguntas más.\n\n${preguntaActual(c)}`);
    }
    if (/^no\b/.test(n) || !c.ofrecePHQ9) {
      s.chequeo = null;
      return resultado(s, "Está bien. Si en algún momento quieres hablar con alguien del equipo, escribe *persona*. Aquí seguimos para lo que necesites.", { otros: { puntajes: puntajes(c) } });
    }
    return resultado(s, "No te entendimos. Responde *sí* para seguir con más preguntas, *no* para terminar, o *persona* para que alguien del equipo te escriba.");
  }

  const valor = valorRespuestaEscala(texto);
  if (valor === null) {
    return resultado(s, `No te entendimos. ${preguntaActual(c)}\n(O escribe «salir» para dejarlo aquí.)`);
  }

  if (c.fase === "phq") {
    c.phq[c.indice] = valor;
    c.indice += 1;
    if (!c.ampliado && c.indice === 2) {
      c.fase = "gad";
      c.indice = 0;
      return resultado(s, preguntaActual(c));
    }
    if (c.ampliado && c.indice < PHQ9.length) return resultado(s, preguntaActual(c));
    if (c.ampliado) return cerrarPHQ9(sesionId, s, c);
  }

  if (c.fase === "gad") {
    c.gad[c.indice] = valor;
    c.indice += 1;
    if (c.indice < GAD2.length) return resultado(s, preguntaActual(c));
    return cerrarCribado(s, c);
  }
  return resultado(s, preguntaActual(c));
}

function suma(lista) {
  return lista.reduce((a, b) => a + (b || 0), 0);
}
function puntajes(c) {
  const p = { phq2: suma(c.phq.slice(0, 2)), gad2: suma(c.gad) };
  if (c.ampliado && c.phq.length === PHQ9.length) p.phq9 = suma(c.phq);
  return p;
}

// Fin del PHQ-2 + GAD-2. Los números no se muestran: solo orientan qué ofrecer.
function cerrarCribado(s, c) {
  const p = puntajes(c);
  if (p.phq2 >= 3) {
    c.fase = "oferta";
    c.ofrecePHQ9 = true;
    return resultado(
      s,
      `Gracias por responder con sinceridad. Tus respuestas muestran que estas semanas han sido pesadas para ti. Esto no es un diagnóstico, es una señal para cuidarte.\n• ¿Quieres responder 7 preguntas más (el cuestionario PHQ-9) para entender mejor cómo estás? Escribe *sí* o *no*.\n• Si prefieres hablar con una persona del equipo, escribe *persona*.`,
      { otros: { puntajes: p } },
    );
  }
  if (p.gad2 >= 3) {
    c.fase = "oferta";
    c.ofrecePHQ9 = false;
    return resultado(
      s,
      `Gracias por responder. Tus respuestas muestran que has cargado mucha preocupación estas semanas. Esto no es un diagnóstico.\nSi quieres hablar con una persona del equipo, escribe *persona*. También puedes pedir una cita con psicología en tu EPS.`,
      { otros: { puntajes: p } },
    );
  }
  s.chequeo = null;
  return resultado(s, "Gracias por darte este momento. Por ahora tus respuestas no muestran una carga alta. Cuidarte también es cuidar a la niña o adolescente que acompañas. Puedes repetir el chequeo cuando quieras.", { otros: { puntajes: p } });
}

function cerrarPHQ9(sesionId, s, c) {
  const p = puntajes(c);
  if (p.phq9 >= 10) {
    c.fase = "oferta";
    c.ofrecePHQ9 = false;
    const linea = avisarGuardia({ sesion: sesionId, tipo: "bienestar-alto", texto: "chequeo PHQ-9 con carga alta", motivo: `PHQ-9=${p.phq9}` });
    return resultado(
      s,
      "Gracias por responder todo. Tus respuestas muestran que necesitas apoyo, y pedirlo está bien. Esto no es un diagnóstico.\nTe recomendamos pedir una cita con psicología en tu EPS. Si quieres dejar una solicitud para el equipo, escribe *persona*; y si necesitas hablar ya con alguien, la *Línea 106* atiende a cualquier hora.",
      { otros: { puntajes: p, guardia: aviso(linea) } },
    );
  }
  s.chequeo = null;
  return resultado(s, "Gracias por responder todo. Sigue dándote estos momentos para ti. Si algo cambia o te sientes peor, escríbenos o escribe *persona*.", { otros: { puntajes: p } });
}

// ---------------------------------------------------------------- resumen para la consulta (CA3)

function resumenLiteral(entradas) {
  const lineas = entradas.map((e) => `${e.fecha}: ${e.texto}`);
  return `Resumen de tus notas para la consulta:\n${lineas.join("\n")}\nEste resumen no es un diagnóstico; es para conversar con el profesional.`;
}

export async function resumenConsulta(sesionId) {
  return resumenEn(sesion(sesionId));
}

async function resumenEn(s) {
  const entradas = [...s.diario].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!entradas.length) {
    return resultado(s, "Todavía no tienes notas en tu bitácora. Escribe «diario:» y lo que observaste hoy (por ejemplo: «diario: hoy no quiso entrar al parque por el ruido»).", { otros: { origen: "sin-notas" } });
  }
  const notas = entradas.map((e) => `- ${e.fecha}: ${e.texto}`).join("\n");
  const mensajes = [{ role: "user", content: `<notas_del_diario>\n${notas}\n</notas_del_diario>\n\nArma el resumen para la consulta.` }];
  const uso = usoCero();
  try {
    let r = await completar({ system: SYSTEM_RESUMEN, mensajes });
    sumarUso(uso, r.uso);
    let candado = null;
    if (r.stop_reason !== "refusal" && filtrarDiagnostico(r.texto).bloqueado) {
      candado = "diagnostico";
      r = await completar({ system: SYSTEM_RESUMEN, mensajes: [...mensajes, { role: "system", content: "Tu resumen anterior fue bloqueado porque sonaba a diagnóstico. Rehazlo solo con lo observado, sin nombrar autismo, TEA, trastornos, puntajes ni probabilidades." }] });
      sumarUso(uso, r.uso);
    }
    // Red de seguridad determinista: si el modelo rechaza, sigue sonando a
    // diagnóstico o se le olvida alguna fecha, se entregan las notas tal cual.
    const faltaFecha = entradas.some((e) => !r.texto.includes(e.fecha));
    if (r.stop_reason === "refusal" || !r.texto || filtrarDiagnostico(r.texto).bloqueado || faltaFecha || extraerCitas(r.texto).length) {
      return resultado(s, resumenLiteral(entradas), { candado, uso, otros: { origen: "literal" } });
    }
    return resultado(s, r.texto, { candado, uso, otros: { origen: "modelo" } });
  } catch (error) {
    if (!(error instanceof ErrorModelo)) throw error;
    console.error(`[agente] ${error.tipo}: ${error.message}`);
    return resultado(s, resumenLiteral(entradas), { candado: "error", uso, otros: { origen: "literal", error: error.tipo } });
  }
}

// ---------------------------------------------------------------- sesión que guarda el navegador (piloto web)
// El servidor no guarda nada: el navegador manda su sesión en cada mensaje y
// recibe la sesión actualizada. Como viene de afuera, se valida entera; lo que no
// cuadra se rechaza (ErrorEstado) en vez de adivinar. Si alguien la manipula, solo
// afecta a su propia conversación; los candados de crisis y maltrato miran el
// mensaje nuevo, no la sesión, así que no se pueden apagar desde aquí.

export const LIMITES_ESTADO = { caracteresPorTurno: 8000, notasDiario: 300, caracteresPorNota: 2000 };

export class ErrorEstado extends Error {}

const ID_VALIDO = /^[A-Za-z0-9_-]{8,64}$/;
const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const esEntero = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

function validarChequeo(c) {
  if (c === null || c === undefined) return null;
  if (!esObjeto(c)) throw new ErrorEstado("chequeo no es un objeto");
  if (!["phq", "gad", "oferta"].includes(c.fase)) throw new ErrorEstado("chequeo.fase inválida");
  // phq: 0-8 · gad: 0-1 · oferta: el índice queda donde terminó (hasta 9).
  const maxIndice = { phq: PHQ9.length - 1, gad: GAD2.length - 1, oferta: PHQ9.length }[c.fase];
  if (!esEntero(c.indice, 0, maxIndice)) throw new ErrorEstado("chequeo.indice inválido");
  const respuestas = (lista, max, nombre) => {
    if (!Array.isArray(lista) || lista.length > max) throw new ErrorEstado(`chequeo.${nombre} inválido`);
    return lista.map((v) => {
      if (v === null) return null; // hueco en la lista (no debería pasar, pero no rompe)
      if (!esEntero(v, 0, 3)) throw new ErrorEstado(`chequeo.${nombre} con un valor fuera de 0-3`);
      return v;
    });
  };
  const limpio = { fase: c.fase, indice: c.indice, phq: respuestas(c.phq, PHQ9.length, "phq"), gad: respuestas(c.gad, GAD2.length, "gad"), ampliado: c.ampliado === true };
  if (c.ofrecePHQ9 !== undefined) limpio.ofrecePHQ9 = c.ofrecePHQ9 === true;
  return limpio;
}

// estado (lo que mandó el navegador, o nada) -> sesión limpia y nueva (copia).
export function validarEstado(estado) {
  if (estado === null || estado === undefined) {
    return { id: crypto.randomUUID(), historial: [], enCrisis: false, diario: [], chequeo: null };
  }
  if (!esObjeto(estado)) throw new ErrorEstado("estado no es un objeto");
  const id = typeof estado.id === "string" && ID_VALIDO.test(estado.id) ? estado.id : crypto.randomUUID();

  const historial = estado.historial === undefined ? [] : estado.historial;
  if (!Array.isArray(historial) || historial.length % 2 !== 0) throw new ErrorEstado("historial inválido");
  const historialLimpio = historial.map((m, i) => {
    const rol = i % 2 === 0 ? "user" : "assistant"; // siempre pregunta, respuesta, pregunta…
    if (!esObjeto(m) || m.role !== rol || typeof m.content !== "string") throw new ErrorEstado(`historial[${i}] inválido`);
    if (m.content.length > LIMITES_ESTADO.caracteresPorTurno) throw new ErrorEstado(`historial[${i}] demasiado largo`);
    return { role: rol, content: m.content };
  });
  while (historialLimpio.length > MAX_TURNOS * 2) historialLimpio.splice(0, 2);

  const diario = estado.diario === undefined ? [] : estado.diario;
  if (!Array.isArray(diario) || diario.length > LIMITES_ESTADO.notasDiario) throw new ErrorEstado("diario inválido");
  const diarioLimpio = diario.map((e, i) => {
    if (!esObjeto(e) || typeof e.fecha !== "string" || !FECHA_VALIDA.test(e.fecha) || typeof e.texto !== "string") throw new ErrorEstado(`diario[${i}] inválido`);
    if (e.texto.length > LIMITES_ESTADO.caracteresPorNota) throw new ErrorEstado(`diario[${i}] demasiado largo`);
    return { fecha: e.fecha, texto: e.texto };
  });

  if (estado.enCrisis !== undefined && typeof estado.enCrisis !== "boolean") throw new ErrorEstado("enCrisis inválido");
  return { id, historial: historialLimpio, enCrisis: estado.enCrisis === true, diario: diarioLimpio, chequeo: validarChequeo(estado.chequeo) };
}

// ---------------------------------------------------------------- perfil sensorial (2026-11-10)
// Tope por parte (caracteres). Un perfil completo de «Así soy yo» con notas cabe en ~600.
export const LIMITE_PERFIL_PARTE = 700;

// Limpia una parte del perfil: sin caracteres de control, sin < > [ ] { } ` (no puede
// cerrar el bloque <perfil_sensorial> ni imitar una cita), espacios simples y tope de largo.
function limpiarParte(x) {
  if (typeof x !== "string") return "";
  const limpio = x
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ")
    .replace(/[<>\[\]{}`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(limpio).slice(0, LIMITE_PERFIL_PARTE).join("").trim();
}

// perfil (lo que mandó el navegador) -> { nina, cuidadora } limpio, o null si no sirve.
// Nunca lanza error: un perfil dañado se trata como ausente (así nunca frena una crisis).
export function validarPerfil(perfil) {
  if (!esObjeto(perfil)) return null;
  const limpio = { nina: limpiarParte(perfil.nina), cuidadora: limpiarParte(perfil.cuidadora) };
  return limpio.nina || limpio.cuidadora ? limpio : null;
}

// ¿El mensaje es solo un saludo? (para responder cálido aunque no haya perfil)
function esSaludo(texto) {
  const n = normalizar(texto).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return /^(hola|holi|ola|hey|buenas|buenos dias|buenas tardes|buenas noches|buen dia|saludos|que tal)( (contigo|como estas|como estan|como vas|que tal|buenas|buenos dias|buenas tardes|buenas noches))*$/.test(n);
}

// Las tres entradas de la web: reciben la sesión y devuelven {estado, respuesta}.
// En la web el perfil es obligatorio para la orientación (exigirPerfil). El perfil no
// entra en la sesión: viaja aparte en cada petición y no vuelve al navegador.
export async function responderConEstado(estado, mensaje, opciones = {}) {
  const s = validarEstado(estado);
  const perfil = validarPerfil(opciones.perfil);
  const respuesta = await responderEn(s, s.id, mensaje, { ...opciones, perfil, exigirPerfil: opciones.exigirPerfil !== false });
  return { estado: s, respuesta };
}

export function chequeoConEstado(estado) {
  const s = validarEstado(estado);
  return { estado: s, respuesta: chequeoEn(s) };
}

export async function resumenConEstado(estado) {
  const s = validarEstado(estado);
  return { estado: s, respuesta: await resumenEn(s) };
}
