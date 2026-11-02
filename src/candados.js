// candados.js · reglas fijas, SIN modelo de lenguaje (regla 4 de la casa:
// lo crítico es determinista). Si una regla duda, gana la seguridad de la
// cuidadora en crisis y de la niña; en lo demás, precisión sobre cobertura.
//
// - detectarCrisis(texto, contexto)   -> { detectado, motivo }
// - detectarMaltrato(texto)           -> { detectado, motivo }
// - filtrarDiagnostico(respuesta)     -> { bloqueado, motivo }
// - verificarCitas(respuesta, frags)  -> { ok, falla, motivo, citas, invalidas }  (regla v2, 2026-11-02)
// - datosQueExigenCita(respuesta)     -> [motivos]  (datos de Colombia y cifras de instrumentos)

import { normalizar } from "./texto.js";

// ---------------------------------------------------------------- crisis
// Se busca sobre el texto normalizado (minúsculas, sin tildes), así
// "no quiero vivir" y "NO QUIERO VIVÍR" cuentan igual.
const PATRONES_CRISIS = [
  [/\bsuicid\w*/, "suicidio"],
  [/\bno quiero (seguir )?vivir\b(?!\s+(en|cerca|lejos|alla|aca|aqui|con mi suegra)\b)/, "no quiero vivir"],
  [/\bno (quiero|deseo) (seguir )?(existiendo|estar viva|despertar)\b/, "no quiero existir"],
  [/\b(me quiero|quiero|quisiera|quisieramos) morir(me)?\b(?!\s+de\s+(la\s+)?(risa|pena|verguenza|amor))/, "quiero morir"],
  [/\bganas de morir(me)?\b/, "ganas de morir"],
  // Añadido 2026-11-02 por decisión de Santiago; pendiente de aval de la especialista clínica.
  [/\bya no puedo mas\b/, "ya no puedo más"],
  [/\b(estaria|estariamos|estaremos|estariamos) mejor muert[ao]s?\b|\bmejor muert[ao]\b/, "mejor muerta"],
  [/\bquitarme la vida\b|\bme quito la vida\b/, "quitarme la vida"],
  [/\b(acabar|terminar) con (mi vida|todo esto de una vez|mi existencia)\b/, "acabar con mi vida"],
  [/\b(hacerme|me voy a hacer|me hago|me he hecho) (dano|danio)\b/, "hacerme daño"],
  [/\b(lastimarme|cortarme|me corto las venas|matarme|me voy a matar|me mato)\b/, "autolesión"],
  [/\bya no aguanto (mas|nada)\b/, "ya no aguanto más"],
  [/\b(tomarme|me tomo|me tome) (todas )?las pastillas\b/, "pastillas"],
  [/\b(desaparecer para siempre|dormirme y no despertar|quiero desaparecer)\b/, "desaparecer"],
  [/\b(estaria|estarian|estarian todos|vivirian|viviria) mejor sin mi\b/, "estarían mejor sin mí"],
  [/\b(yo )?mejor no (estaria|existiria|existir)\b|\bno deberia (estar viva|existir|seguir aqui)\b/, "mejor no estaría"],
  [/\b(estoy|estamos) en peligro\b(?!\s+de\b)/, "en peligro ahora"],
];

// Ítem 9 del PHQ-9: cualquier valor > 0 es alerta. Acepta números y palabras.
export function valorRespuestaEscala(texto) {
  const t = normalizar(texto).trim();
  const num = t.match(/^\s*([0-3])\b/);
  if (num) return Number(num[1]);
  if (/\b(nunca|ningun|ninguno|para nada|nada)\b/.test(t)) return 0;
  if (/\bmas de la mitad\b/.test(t)) return 2;
  if (/\b(casi todos|todos los dias|siempre|casi siempre)\b/.test(t)) return 3;
  if (/\b(varios dias|algunos dias|a veces|unos dias)\b/.test(t)) return 1;
  return null;
}

export function detectarCrisis(texto, contexto = {}) {
  const t = normalizar(texto);
  if (contexto && contexto.enItemPHQ9) {
    const v = valorRespuestaEscala(texto);
    if (v !== null && v > 0) return { detectado: true, motivo: `PHQ-9 ítem 9 = ${v}` };
  }
  for (const [patron, motivo] of PATRONES_CRISIS) {
    if (patron.test(t)) return { detectado: true, motivo };
  }
  return { detectado: false, motivo: null };
}

// ---------------------------------------------------------------- maltrato
// Solo frases donde ALGUIEN le hace daño a la niña. No cuentan "mi hija me
// pega" ni "se golpea la cabeza" (pueden ser conductas de la niña, no maltrato).
const PATRONES_MALTRATO = [
  [/\b(le|les) (pega|pegan|pegaba|pegaban|pego|pegue|pegamos|dan golpes|da golpes|daba golpes|dio golpes|dieron golpes|da correa|dan correa|da rejo|da chancla|da palo|dan palo)\b/, "golpes a la niña"],
  [/\bla (golpea|golpean|golpeaba|golpeaban|golpeo|golpee|golpeamos|maltrata|maltratan|maltrataba|maltrataban|quema|queman|quemo|amarra|amarran|amarraba|ahorca|ahorcan|patea|patean|pateo)\b/, "maltrato físico a la niña"],
  [/\b(golpearla|pegarle|maltratarla|quemarla|amarrarla|patearla)\b/, "maltrato físico a la niña"],
  [/\babus\w*\s+(sexual\w*|de ella|de mi hija|de mi nieta|de la nina)\b|\babusaron de\b|\babusa de\b|\babusan de\b/, "abuso"],
  [/\bla (toca|tocan|tocaba|tocaban|toco) (en )?(sus partes|indebidamente|sus partes intimas|donde no)\b/, "abuso sexual"],
  [/\b(maltrato|maltratan|maltrata) (a|hacia|contra) (la nina|mi hija|mi nieta|la bebe|mi bebe)\b/, "maltrato a la niña"],
  [/\bviolencia (intrafamiliar|sexual)\b/, "violencia"],
  [/\b(hacerle dano|lastimarla|hacerle algo malo) a (la nina|mi hija|mi nieta)\b|\b(ganas|miedo|temo) (de )?(hacerle dano|lastimarla|pegarle|golpearla)\b/, "riesgo de daño a la niña"],
  [/\bla (abandonaron|abandona|abandonan|abandono)\b/, "abandono de la niña"],
];

export function detectarMaltrato(texto) {
  const t = normalizar(texto);
  for (const [patron, motivo] of PATRONES_MALTRATO) {
    if (patron.test(t)) return { detectado: true, motivo };
  }
  return { detectado: false, motivo: null };
}

// ---------------------------------------------------------------- diagnóstico (salida)
// Se busca en minúsculas CON tildes, porque "sí tiene autismo" (afirmación)
// no es lo mismo que "si tiene autismo" (condicional: "no puedo decirte si...").
const PATRONES_DIAGNOSTICO = [
  [/\bsí,?\s+(tiene|presenta|es)\s+(autismo|tea\b|autista|un trastorno del espectro)/, "afirma autismo"],
  [/\bno\s+(tiene|presenta)\s+(autismo|tea\b|un trastorno del espectro)/, "descarta autismo"],
  [/\b(es|son)\s+(claramente\s+|seguramente\s+|probablemente\s+|definitivamente\s+)?autistas?\b/, "afirma que es autista"],
  [/\bno\s+es\s+autista\b/, "descarta que sea autista"],
  [/\bprobabilidad(es)?\s+(alta\s+|baja\s+)?(de\s+)?(que\s+(tenga|sea)\s+)?(autismo|tea\b|autista)/, "probabilidad de autismo"],
  [/\b(muy\s+)?probable\s+que\s+(tenga\s+(autismo|tea\b)|sea\s+autista)/, "probabilidad de autismo"],
  [/\bpuntaje\s+(de|en|del)\s+(el\s+)?(autismo|tea\b|m-?chat|espectro)/, "puntaje de autismo"],
  [/\d+\s*%[^.\n]{0,40}(autismo|\btea\b|autista|espectro)|(autismo|\btea\b|autista|espectro)[^.\n]{0,40}\d+\s*%/, "porcentaje junto a autismo"],
  [/\bcumple\s+(con\s+)?(los\s+|todos\s+los\s+)?criterios\b/, "cumple criterios"],
  [/\b(tiene|presenta)\s+(rasgos|signos|síntomas)\s+(claros\s+)?(de\s+autismo|autistas|de\s+tea\b)/, "atribuye rasgos de autismo"],
];

// Frases cercanas (antes de la coincidencia) que indican que el modelo está
// diciendo justamente que NO puede diagnosticar: no se bloquean.
const SALVEDADES = /(no\s+(te\s+)?puedo|no\s+podemos|no\s+es\s+posible|no\s+se\s+puede|nadie\s+(te\s+)?puede|solo\s+(un|una)\b|sólo\s+(un|una)\b|\bsi\s+tiene\s+o\b|decir(te|le)?\s+si\b|saber\s+si\b|determinar\s+si\b|confirmar\s+si\b|no\s+significa|no\s+sé\s+si\b|no\s+lo\s+sé)/;

export function filtrarDiagnostico(respuesta) {
  const t = String(respuesta ?? "").toLowerCase();
  for (const [patron, motivo] of PATRONES_DIAGNOSTICO) {
    const g = new RegExp(patron.source, "g");
    let m;
    while ((m = g.exec(t)) !== null) {
      const antes = t.slice(Math.max(0, m.index - 70), m.index);
      // Condicional "si (tu hija) es autista": un "si" sin tilde hasta 3 palabras
      // antes no es afirmación. ("creo que es autista" sí se bloquea.)
      const condicional = /(^|[^\p{L}])si\s+(\S+\s+){0,3}$/u.test(antes) || /(^|[^\p{L}])si\s*$/u.test(antes);
      if (!SALVEDADES.test(antes) && !condicional) {
        return { bloqueado: true, motivo: `${motivo}: «${m[0].trim()}»` };
      }
      if (m.index === g.lastIndex) g.lastIndex++;
    }
  }
  return { bloqueado: false, motivo: null };
}

// ---------------------------------------------------------------- citas (spec v2, 2026-11-02)
// REGLA v2 (spec.md, «v2 · Experta conversacional», punto 4). La agente puede
// conversar, acompañar y explicar autismo, desarrollo, crianza y autocuidado con
// su conocimiento general SIN cita. La verificación bloquea solo dos cosas:
//   (a) una cita [fuente: id] cuyo id no está entre los fragmentos de este turno;
//   (b) un dato de Colombia o una cifra de instrumento, si la respuesta no trae
//       NINGUNA cita. Cuenta como dato (frase por frase, texto sin tildes):
//       - ley, decreto, resolución o sentencia CON número («Ley 2628»), o «por ley» /
//         «la ley obliga, establece, ordena, exige, garantiza…»;
//       - tutela como trámite: en la misma frase hay pasos o plazos (número, días,
//         plazo, juez, juzgado, radicar, requisitos, fallo, impugnar, desacato);
//       - EPS o Supersalud como trámite: en la misma frase hay derecho de petición,
//         queja, reclamo, PQR, autorización, negativa por escrito, plazo, número,
//         «está obligada», «tiene que / debe darte…», MIPRES, copago, etc.;
//       - ICBF como trámite: restablecimiento de derechos, PARD, defensor(ía) de
//         familia, proceso, medida de protección, plazo o número (no basta
//         «llama al ICBF, línea 141»: eso es remisión de seguridad y siempre pasa);
//       - teléfono de más de 3 dígitos (01 8000…, 7 o más dígitos seguidos, o
//         «línea / teléfono / llama al» + 4 o más dígitos);
//       - puntaje, rango o punto de corte de un instrumento (PHQ, GAD, M-CHAT,
//         DSM, CIE): la frase nombra el instrumento y trae otra cifra.
// NO bloquea: saludos, apoyo emocional, explicaciones generales, señales en
// general, «habla con tu EPS», «pregúntale al pediatra», las líneas 106/123/141,
// ni una frase que dice «no lo sé / no sé» sin dar cifras.
// Precisión sobre cobertura: ante la duda, deja pasar (lo crítico de verdad
// —crisis, maltrato, diagnóstico— lo cubren los otros candados).
const PATRON_CITA = /\[\s*fuente\s*:\s*([^\]]+)\]/gi;
// Formas en que el agente reconoce que no sabe un dato o no puede darlo (2026-11-02:
// ampliada con las formas naturales de la v2: «no te lo puedo dar», «no tengo los
// teléfonos», «no puedo decirte si…», «no lo sabemos con certeza»).
const FRASE_NO_SE = /no lo s[eé]|no (te |se )?lo (puedo|podr[ií]a) (dar|decir)|no puedo (decirte|afirmarte|asegurarte)|no tengo (esa |esta |los |las |el |la )?(informaci[oó]n|dato|datos|tel[eé]fonos?|n[uú]meros?|cifra)|no est[aá] en (mi|la) biblioteca|no lo sabemos/i;
// Variante por frase, sobre texto normalizado: la frase declara no saber.
const FRASE_NO_SE_NORM = /\b(no lo se|no se (el|la|los|las|cual|cuanto|cuantos|exactamente|con certeza)|no tengo (ese|esa|esos|el) (dato|numero|informacion)|no conozco)\b/;
// Líneas de ayuda que el agente siempre puede dar (no son «datos sin fuente»).
const LINEAS_DE_AYUDA = /\b(106|123|141|155|192)\b/g;

// Reglas de (b). Cada una recibe una frase normalizada (sin tildes, minúsculas)
// con las líneas de ayuda ya quitadas, y devuelve true si es un dato que exige cita.
const DATOS_QUE_EXIGEN_CITA = [
  ["ley o norma con número", (f) => /\b(ley|leyes|decreto|decretos|resolucion|resoluciones|circular|acuerdo)\s+(n\S{0,3}\s*)?\d{2,}/.test(f) || /\bsentencia\s+[tcsu]\s*-?\s*\d+/.test(f) || /\barticulo\s+\d+/.test(f)],
  ["afirmación de lo que dice la ley", (f) => /\bpor ley\b|\bla ley (te |le |les )?(dice|obliga|establece|ordena|exige|garantiza|da derecho)\b/.test(f)],
  ["tutela como trámite", (f) => /\btutelas?\b/.test(f) && /\d|\b(plazo|plazos|termino|terminos|dias|horas|semanas|meses|juez|jueza|juzgado|radicar|radica|requisito|requisitos|pasos|fallo|impugnar|impugnacion|desacato)\b/.test(f)],
  ["EPS o Supersalud como trámite", (f) => /\b(eps|supersalud|superintendencia)\b/.test(f) && (/\d/.test(f) || /\b(derecho de peticion|queja|quejas|reclamo|reclamos|pqrs?d?|autorizacion|autorizaciones|negativa por escrito|negacion por escrito|por escrito|plazo|plazos|obligad[ao]s?|tiene que (darte|dar|entregar|autorizar|responder|garantizar)|debe (darte|dar|entregar|autorizar|responder|garantizar)|mipres|copago|copagos|cuota moderadora|portabilidad|traslado de eps|junta medica)\b/.test(f))],
  ["ICBF como trámite", (f) => /\bicbf\b|bienestar familiar/.test(f) && (/\d/.test(f) || /\b(restablecimiento|pard|defensor|defensora|defensoria|proceso|medida de proteccion|medidas de proteccion|plazo|custodia|requisitos)\b/.test(f))],
  ["teléfono", (f) => {
    if (/\b01\s*-?\s*8000\b/.test(f)) return true;
    // Fechas (2026-11-02, 02/11/2026) y años sueltos (2013, 2026) no son teléfonos.
    const g = f.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(19|20)\d{2}\b/g, " ");
    return /(\d[\s-]?){7,}/.test(g) || /\b(linea|telefono|tel|celular|whatsapp|llama al|llamar al|marca el|marcar el|numero)\b\D{0,15}(\d[\s-]?){4,}/.test(g);
  }],
  ["cifra de instrumento", (f) => {
    if (!/\b(phq|gad|m-?chat|dsm|cie|puntaje|puntajes|puntuacion|punto de corte|puntos de corte)\b/.test(f)) return false;
    // Se quitan los nombres con número («PHQ-9», «GAD-7», «DSM-5», «CIE-11») y se mira si queda otra cifra.
    const sinNombres = f.replace(/\b(phq|gad|dsm|cie|icd)\s*-?\s*\d+\b/g, " ").replace(/\bm-?chat(-?r)?(\/?f)?\b/g, " ");
    return /\d/.test(sinNombres);
  }],
];

// Devuelve los motivos de (b) que aparecen en la respuesta (lista vacía si ninguno).
export function datosQueExigenCita(respuesta) {
  const sinCitas = String(respuesta ?? "").replace(PATRON_CITA, " ");
  const frases = sinCitas.split(/(?<=[.!?;:])\s+|\n+/).map((x) => normalizar(x)).filter((x) => x.trim());
  const motivos = [];
  for (const frase of frases) {
    const f = ` ${frase.replace(LINEAS_DE_AYUDA, " ")} `;
    // Una frase que dice que no sabe el dato, sin dar cifras, no es una afirmación.
    if (FRASE_NO_SE_NORM.test(f) && !/\d/.test(f)) continue;
    for (const [motivo, regla] of DATOS_QUE_EXIGEN_CITA) {
      if (regla(f)) motivos.push(`${motivo}: «${frase.trim().slice(0, 80)}»`);
    }
  }
  return motivos;
}

export function extraerCitas(respuesta) {
  const ids = [];
  for (const m of String(respuesta ?? "").matchAll(PATRON_CITA)) {
    for (const id of m[1].split(/[,;]/)) {
      const limpio = id.trim();
      if (limpio) ids.push(limpio);
    }
  }
  return ids;
}

// verificarCitas(respuesta, fragmentos) -> { ok, falla, motivo, citas, invalidas }
// falla: null | "cita-inexistente" (caso a) | "dato-sin-cita" (caso b).
export function verificarCitas(respuesta, fragmentosEntregados = []) {
  const texto = String(respuesta ?? "");
  const validos = new Set((fragmentosEntregados || []).map((f) => f && f.id_fuente).filter(Boolean));
  const citas = extraerCitas(texto);
  // (a) toda cita debe apuntar a un fragmento entregado en este turno.
  const invalidas = citas.filter((id) => !validos.has(id));
  if (invalidas.length) {
    return { ok: false, falla: "cita-inexistente", motivo: `cita a una fuente que no se entregó: ${invalidas.join(", ")}`, citas, invalidas };
  }
  // (b) datos de Colombia o cifras de instrumentos: exigen al menos una cita en la respuesta.
  if (!citas.length) {
    const motivos = datosQueExigenCita(texto);
    if (motivos.length) {
      return { ok: false, falla: "dato-sin-cita", motivo: `dato de Colombia o cifra de instrumento sin cita · ${motivos.join(" · ")}`, citas, invalidas };
    }
  }
  return { ok: true, falla: null, motivo: null, citas, invalidas };
}

export { FRASE_NO_SE };
