// recursos-ola2-a.test.js · pruebas de la Ola 2 (parte A) de «Recursos»: «Plan de tormenta» y «Guía de la ruta en la EPS».
// Sin navegador y sin dependencias. Correr desde app\:  node --test pruebas/recursos-ola2-a.test.js
//
// Qué revisa: caparazón IDÉNTICO al de «Así soy yo», política de seguridad, cero red (solo la fuente),
// líneas de ayuda SOLO 106 / 123 / 141, palabras prohibidas, que no existan campos de datos personales,
// el enlace (#t1.) ida y vuelta y que un enlace dañado no reviente, y que TODO el contenido de la guía EPS
// salga de conocimiento\biblioteca\ruta-colombia\ (sin pasos, plazos, artículos ni cifras agregados).
// Regla: estas pruebas no se editan para que pasen; si fallan, se arregla la página.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECURSOS = path.join(APP, "public", "recursos");
const BIBLIO = path.resolve(APP, "..", "conocimiento", "biblioteca", "ruta-colombia");
const leer = (f) => fs.readFileSync(path.join(RECURSOS, f), "utf8");
const asy = leer("asi-soy-yo.html");

const INI = "/* === CARAPAZON CONTIGO v1 === */";
const FIN = "/* === FIN CARAPAZON CONTIGO v1 === */";
const HTML_ARRIBA = ["<!-- === CARAPAZON CONTIGO v1 · HTML (fondo, cabecera, sello) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (arriba) === -->"];
const HTML_ABAJO = ["<!-- === CARAPAZON CONTIGO v1 · HTML (barra fija y capas) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (abajo) === -->"];

// ---------- Utilidades ----------
const sinTildes = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plano = (x) => JSON.parse(JSON.stringify(x));
function tramo(texto, ini, fin, desde = 0) {
  const a = texto.indexOf(ini, desde);
  const b = texto.indexOf(fin, a + ini.length);
  assert.ok(a >= 0 && b > a, `no encontré ${ini}`);
  return texto.slice(a, b + fin.length);
}
const visible = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
const estilosDe = (h) => [...h.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const scriptsDe = (h) => [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
function cssCap(h) { return tramo(h, INI, FIN); }
function jsCap(h) { const c = cssCap(h); return tramo(h, INI, FIN, h.indexOf(c) + c.length); }
// Lo propio de la pieza: el HTML sin los bloques del caparazón (para buscar palabras y números)
function sinCaparazon(h) {
  let r = h;
  for (const t of [cssCap(h), jsCap(h), tramo(h, ...HTML_ARRIBA), tramo(h, ...HTML_ABAJO)]) r = r.replace(t, " ");
  return r.split("\n").filter((l) => !l.startsWith('<symbol id="i-')).join("\n");
}
// Corre el caparazón + la parte pura de la pieza en una caja aislada (sin DOM)
function cargar(h, iniDatos, finDatos, nombre) {
  const caja = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
  vm.runInContext(jsCap(h) + "\n" + tramo(h, iniDatos, finDatos) + `\n;globalThis.__C = Contigo; globalThis.__P = ${nombre};`, caja);
  return { C: caja.__C, P: caja.__P };
}

// Pruebas comunes a las dos piezas
function pruebasComunes(nombre, h) {
  const estilos = estilosDe(h);
  test("pesa 300 KB o menos", () => {
    const peso = Buffer.byteLength(h);
    assert.ok(peso <= 300 * 1024, `pesa ${peso} bytes`);
  });

  test("el caparazón es IDÉNTICO al de «Así soy yo» (CSS, JS, HTML de arriba y de abajo, símbolos i-*, fuente)", () => {
    assert.equal(cssCap(h), cssCap(asy), "CSS del caparazón distinto");
    assert.ok(estilos.includes(cssCap(h)), "el CSS del caparazón no está dentro de <style>");
    assert.equal(jsCap(h), jsCap(asy), "JS del caparazón distinto");
    assert.ok(scriptsDe(h)[0].includes(jsCap(h)), "el JS del caparazón no está en el primer <script>");
    assert.ok(h.indexOf(jsCap(h)) < h.indexOf("</head>"), "el JS del caparazón debe ir en el <head>");
    for (const par of [HTML_ARRIBA, HTML_ABAJO]) assert.equal(tramo(h, ...par), tramo(asy, ...par), `HTML distinto: ${par[0]}`);
    const lineas = (t, re) => t.split("\n").filter((l) => re.test(l));
    assert.deepEqual(lineas(h, /^<symbol id="i-/), lineas(asy, /^<symbol id="i-/), "símbolos i-* distintos");
    assert.deepEqual(lineas(h, /^<link [^>]*fonts\.g/), lineas(asy, /^<link [^>]*fonts\.g/), "carga de la fuente distinta");
    assert.match(h, /\bContigo\.iniciar\(\{ vistaAdulto: true|\bC\.iniciar\(\{ vistaAdulto: true/);
    assert.ok(h.indexOf('<main id="principal"') > h.indexOf(HTML_ARRIBA[1]) && h.indexOf('<main id="principal"') < h.indexOf(HTML_ABAJO[0]), "el contenido va dentro de <main id=\"principal\">, entre el HTML de arriba y el de abajo");
  });

  test("política de seguridad idéntica: nada de red (connect-src 'none'), solo imágenes data:", () => {
    const csp = (t) => t.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/g);
    assert.deepEqual(csp(h), csp(asy));
    assert.equal(csp(h).length, 1);
    for (const regla of ["default-src 'none'", "connect-src 'none'", "img-src data:", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp(h)[0].includes(regla), `falta ${regla}`);
  });

  test("la única dirección externa es la fuente (fonts.googleapis / fonts.gstatic)", () => {
    const posiciones = [...h.matchAll(/http/gi)].map((m) => m.index);
    assert.ok(posiciones.length > 0);
    for (const i of posiciones) {
      if (h.startsWith('http-equiv="Content-Security-Policy"', i)) continue;
      assert.match(h.slice(i, i + 40), /^https:\/\/fonts\.(googleapis|gstatic)\.com/, `dirección no permitida: ${h.slice(i, i + 60)}`);
    }
    // 2026-11-10 (auditoría H-08): la única excepción son los enlaces tel: 123, 106 y 141 de la tarjeta
    // «Necesito ayuda» del caparazón (vista adulta). Fuera del caparazón, nada que llame, escriba o abra apps.
    assert.doesNotMatch(sinCaparazon(h), /["'=]\s*(tel|mailto|sms|whatsapp):/i, "sin enlaces que llamen, escriban o abran apps");
    assert.deepEqual([...h.matchAll(/["'=]\s*(tel|mailto|sms|whatsapp):([^"']*)/gi)].map((m) => m[1] + ":" + m[2]), ["tel:123", "tel:106", "tel:141"]);
    assert.doesNotMatch(h, /wa\.me|api\.whatsapp/i);
  });

  test("cero llamadas de red desde el código", () => {
    for (const patron of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket/, /EventSource/, /\bimport\s*\(/, /<img\b/i, /<iframe\b/i, /<audio\b/i, /<video\b/i, /\bsrc=/i, /window\.print\s*\(/, /serviceWorker/]) {
      assert.doesNotMatch(h, patron, `encontré ${patron}`);
    }
    for (const c of [...h.matchAll(/\.src\s*=\s*([^;]+);/g)].map((m) => m[1].trim())) assert.match(c, /^'data:image\/svg\+xml/, `carga que no es data: ${c}`);
    for (const u of [...estilos.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1])) assert.match(u, /^#/, `url() externa: ${u}`);
  });

  test("sin sonido ni movimiento al cargar: voz solo con «Escuchar»", () => {
    assert.doesNotMatch(h, /autoplay/i);
    assert.equal(h.split(".speak(").length - 1, 1, "solo el .speak( del caparazón");
    assert.doesNotMatch(h, /AudioContext|new AC\(|\.vibrate\(/);
    const propio = estilosDe(sinCaparazon(h));
    for (const a of propio.match(/animation\s*:[^;}]*/g) || []) assert.match(a, /animation\s*:\s*none/, `la pieza no trae animaciones propias: ${a}`);
    assert.doesNotMatch(propio, /@keyframes/, "la pieza no define movimientos");
  });

  test("el guardado en el celular vive solo en el baúl del caparazón", () => {
    const total = h.split("localStorage").length - 1;
    assert.equal(total, jsCap(h).split("localStorage").length - 1, "localStorage fuera del baúl");
    const pieza = scriptsDe(h).filter((s) => !s.includes(INI)).join("\n");
    for (const patron of [/sessionStorage/, /indexedDB/, /document\.cookie/, /caches\./, /baul\.borrarTodo/]) assert.doesNotMatch(pieza, patron, `la pieza usa ${patron}`);
  });

  test("letra de 17 px o más y alturas mínimas de 44 px en el CSS", () => {
    const letras = [...estilos.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    assert.ok(letras.length > 10);
    for (const n of letras) assert.ok(n >= 17, `letra de ${n} px`);
    for (const n of [...estilos.matchAll(/min-height:\s*([\d.]+)px/g)].map((m) => Number(m[1]))) assert.ok(n >= 44, `alto mínimo de ${n} px`);
  });

  test("sello «Prototipo · datos de ejemplo» y barra de ayuda con 106 / 123 / 141 escritos", () => {
    assert.ok(h.includes("Prototipo · datos de ejemplo"));
    const ayuda = tramo(h, 'id="c-capa-ayuda"', 'id="c-capa-salir"');
    for (const n of ["106", "123", "141"]) assert.match(ayuda, new RegExp(`<strong>${n}</strong>`));
    assert.match(ayuda, /no llama ni envía nada/);
  });

  test("no usa ni menciona bancos de dibujos con otra licencia (ARASAAC, Sclera, OpenMoji, Mulberry)", () => {
    assert.doesNotMatch(h, /arasaac|sclera|openmoji|mulberry/i);
  });

  test("ningún campo pide nombre, documento, EPS, diagnóstico, teléfono ni correo", () => {
    const campos = [...h.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((m) => m[0]);
    for (const c of campos) {
      const attrs = [...c.matchAll(/\b(id|name|placeholder|aria-label|autocomplete|type)="([^"]*)"/gi)].map((m) => sinTildes(m[2])).join(" ");
      assert.doesNotMatch(attrs, /nombre|documento|cedula|\beps\b|diagnos|telefono|celular|correo|email|\btel\b/, `campo sospechoso: ${c}`);
    }
    const etiquetas = [...h.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)].map((m) => sinTildes(visible(m[1])));
    for (const e of etiquetas) assert.doesNotMatch(e, /nombre|documento|cedula|diagnos|telefono|correo/, `etiqueta sospechosa: ${e}`);
  });
}

// =====================================================================
// «Plan de tormenta» (tarjeta de crisis) · plan-de-tormenta.html
// =====================================================================
describe("plan-de-tormenta · la página", () => {
  const h = leer("plan-de-tormenta.html");
  const { P } = cargar(h, "/* === PLAN DE TORMENTA · DATOS Y CODEC === */", "/* === FIN PLAN DE TORMENTA · DATOS Y CODEC === */", "PlanTormenta");
  // Todo lo que la pieza puede mostrar: su HTML visible (sin caparazón) + sus datos
  const textosDatos = () => {
    const t = [P.ROTULO, P.NO_LLAMA, P.PARA_TI, P.plantillas.familia("X", "U"), P.plantillas.maestra("X", "U"), P.hablado(P.ejemplo())];
    for (const B of P.BLOQUES) { t.push(B.titulo, B.pregunta, B.nota); for (const o of B.opciones) t.push(o.texto); }
    for (const l of P.LINEAS) t.push(l.n + " " + l.texto);
    return t.join("\n");
  };
  const propio = () => visible(sinCaparazon(h)) + "\n" + textosDatos();
  pruebasComunes("plan-de-tormenta", h);

  test("líneas de ayuda: SOLO 106, 123 y 141, escritas, sin llamar ni prometer guardia", () => {
    assert.deepEqual(plano(P.LINEAS.map((l) => l.n)), ["123", "106", "141"]);
    const numeros = [...(visible(h) + "\n" + textosDatos()).matchAll(/\d[\d .-]{2,}\d|\d{3,}/g)].map((m) => m[0].replace(/[ .-]/g, ""));
    for (const n of numeros) assert.ok(["106", "123", "141"].includes(n), `número no permitido: ${n}`);
    assert.doesNotMatch(sinTildes(propio()), /\b192\b|01 ?8000|persona del equipo|de guardia|te va a (escribir|llamar)|te llamaremos|te contactamos|te responderemos/);
    assert.ok(P.NO_LLAMA.includes("Esta página no llama ni envía nada"));
    assert.match(tramo(h, "function svgTarjeta(p)", "function tarjetaPNG(p)"), /Tú decides si llamas/, "la imagen también dice que la página no llama");
  });

  test("palabras prohibidas: ni «tiene», ni «parece», ni puntuar a la niña, ni «evaluación sensorial»", () => {
    const t = sinTildes(propio());
    assert.doesNotMatch(t, /\btiene\b|\bparece\b|evaluacion sensorial|sintoma|tiene autismo|puntaje|puntuacion|\bpuntos\b|nivel de crisis|gravedad|\bescala\b/);
    for (const quien of ["familia", "maestra"]) assert.doesNotMatch(P.plantillas[quien]("Luna", "U"), /autis|diagn/i, `mensaje ${quien}`);
  });

  test("rótulo «no es una indicación médica» en la tarjeta y en la imagen PNG", () => {
    assert.equal(P.ROTULO, "Lo que funciona en casa, según la familia. No es una indicación médica.");
    assert.ok(tramo(h, "function htmlTarjeta(p, op)", "/* ---------- La tarjeta como imagen").includes("P.ROTULO"));
    assert.ok(tramo(h, "function svgTarjeta(p)", "function tarjetaPNG(p)").includes("P.ROTULO"));
    assert.match(tramo(h, "function svgTarjeta(p)", "function tarjetaPNG(p)"), /Dibujos: Contigo \(Pulso Mundo \+ Smart4AI\), CC BY 4\.0/);
  });

  test("dice cuánto tarda antes de pedir algo (inicio: 4 preguntas, 3 minutos; compartir: 1 minuto)", () => {
    const inicio = tramo(h, 'id="pantalla-inicio"', "<!-- FIN pantalla-inicio -->");
    assert.match(visible(inicio), /4 preguntas[\s\S]*3 minutos/);
    assert.match(tramo(h, 'data-pantalla="compartir"', "</section>"), /1 minuto/);
  });

  test("campos: solo apodo, nota corta, la casilla de consentimiento y la copia manual", () => {
    const ids = [...h.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((m) => (m[0].match(/\bid="([^"]+)"/) || [])[1]).sort();
    assert.deepEqual(ids, ["acepto", "apodo", "nota", "texto-manual"]);
    assert.match(h, /<input id="apodo"[^>]*maxlength="20"/);
    assert.match(h, /<input id="nota"[^>]*maxlength="60"/);
  });

  test("compartir pasa por la puerta de 3 s y el consentimiento antes de crear el enlace", () => {
    assert.match(h, /C\.puertaAdulto\(\$\('#b-compartir'\), function \(\) \{ mostrar\('compartir'\); \}, 3000/);
    assert.match(h, /<button type="button" class="c-boton" id="b-crear-enlace" disabled>/);
    assert.match(tramo(h, "$('#b-crear-enlace').addEventListener", "});"), /if \(!\$\('#acepto'\)\.checked\) return;/);
    assert.match(tramo(h, 'data-pantalla="compartir"', "</section>"), /no pongas su nombre completo, documento, EPS, diagnóstico ni teléfonos/);
  });

  test("solo escribe su propia clave (contigo.plan-de-tormenta) y solo lee el perfil de «Así soy yo»", () => {
    assert.equal(P.CLAVE, "plan-de-tormenta");
    const usos = [...h.matchAll(/C\.baul\.(leer|guardar|quitar)\(([^,)]+)/g)].map((m) => m[1] + ":" + m[2].trim());
    assert.ok(usos.length >= 3);
    for (const u of usos) assert.ok(["leer:P.CLAVE", "guardar:P.CLAVE", "quitar:P.CLAVE", "leer:'perfil'"].includes(u), `uso no permitido del baúl: ${u}`);
    assert.ok(usos.includes("leer:'perfil'"), "debe leer contigo.perfil");
  });

  test("dibujos: los que usa existen en la página y son propios (sin imágenes externas)", () => {
    for (const B of P.BLOQUES) {
      assert.ok(h.includes(`<symbol id="${B.icono}"`), `falta ${B.icono}`);
      for (const o of B.opciones) assert.ok(h.includes(`<symbol id="${o.icono}"`), `falta ${o.icono}`);
    }
  });
});

describe("plan-de-tormenta · el enlace (#t1) ida y vuelta", () => {
  const h = leer("plan-de-tormenta.html");
  const { C, P } = cargar(h, "/* === PLAN DE TORMENTA · DATOS Y CODEC === */", "/* === FIN PLAN DE TORMENTA · DATOS Y CODEC === */", "PlanTormenta");

  test("el ejemplo (Luna) va y vuelve igual, con y sin «#» y con basura al final", () => {
    const ej = P.ejemplo();
    const frag = P.codificar(ej);
    assert.match(frag, /^t1\.[A-Za-z0-9_-]+$/);
    for (const entrada of [frag, "#" + frag, "#" + frag + ".", "#" + frag + ")"]) {
      const r = P.decodificar(entrada);
      assert.ok(r, `no decodificó ${entrada.slice(-6)}`);
      assert.deepEqual(plano(r.plan), plano(ej));
      assert.equal(r.ejemplo, false);
    }
    assert.equal(P.decodificar(P.codificar(ej, { ejemplo: true })).ejemplo, true);
    assert.ok(frag.length < 250, `enlace del ejemplo muy largo: ${frag.length}`);
  });

  test("tildes, ñ, emoji y comillas van y vuelven", () => {
    const p = P.planVacio();
    p.apodo = "Ñaña 🌙";
    p.bloques.ayuda = { opciones: ["luz", "bajito"], nota: 'Café ☕, "mamá" <b>y</b> canción' };
    const r = P.decodificar(P.codificar(p));
    assert.equal(r.plan.apodo, "Ñaña 🌙");
    assert.deepEqual(plano(r.plan.bloques.ayuda), { opciones: ["bajito", "luz"], nota: 'Café ☕, "mamá" <b>y</b> canción' });
  });

  test("recorta: apodo a 20 letras, nota a 60, máximo 3 opciones, ids desconocidos fuera", () => {
    const p = P.planVacio();
    p.apodo = "x".repeat(40);
    p.bloques.evitar = { opciones: ["ruido", "gente", "luz", "tocar", "afan", "inventada"], nota: "n".repeat(100) };
    const r = P.decodificar(P.codificar(p)).plan;
    assert.equal(r.apodo.length, 20);
    assert.equal(r.bloques.evitar.nota.length, 60);
    assert.deepEqual(plano(r.bloques.evitar.opciones), ["ruido", "gente", "luz"]);
  });

  test("el plan vacío también va y vuelve", () => {
    assert.deepEqual(plano(P.decodificar(P.codificar(P.planVacio())).plan), plano(P.planVacio()));
  });

  test("enlaces dañados devuelven null (nunca revientan)", () => {
    const bueno = P.codificar(P.ejemplo());
    const malos = [null, undefined, "", "#", "#t1.", "t1.", "#t2." + bueno.slice(3), "#a1." + bueno.slice(3), "#t1.@@@@", "#t1." + bueno.slice(3, -3), bueno + "AAAA", "#principal", "#tarjeta", 42, {}];
    for (const m of malos) assert.equal(P.decodificar(m), null, `debió fallar: ${String(m).slice(0, 20)}`);
    const crudo = plano(C.enlace.desempaquetar("t1", bueno));
    const conBandera = crudo.slice(); conBandera[0] = 2;
    assert.equal(P.decodificar(C.enlace.empaquetar("t1", conBandera)), null, "bandera inválida");
    const conMascara = crudo.slice(); conMascara[2 + crudo[1]] = 64; // «así empieza» tiene 6 opciones: el bit 7 no existe
    assert.equal(P.decodificar(C.enlace.empaquetar("t1", conMascara)), null, "opción que no existe");
  });

  test("500 enlaces al azar: nunca lanzan error y lo que decodifican es válido", () => {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let semilla = 11;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 500; i++) {
      let s = "t1.";
      const n = Math.floor(azar() * 120);
      for (let k = 0; k < n; k++) s += abc[Math.floor(azar() * abc.length)];
      const r = P.decodificar(s);
      if (r) {
        assert.ok(r.plan.apodo.length <= 20);
        for (const B of P.BLOQUES) assert.ok(r.plan.bloques[B.id].opciones.length <= 3 && r.plan.bloques[B.id].nota.length <= 60);
      }
    }
  });

  test("4 notas largas siguen dando un enlace manejable (≤ 600 caracteres)", () => {
    const p = P.ejemplo();
    for (const B of P.BLOQUES) p.bloques[B.id].nota = "a".repeat(60);
    assert.ok(P.codificar(p).length <= 600);
  });

  test("toma lo que ya hay en «Así soy yo» (contigo.perfil): señales, crisis + calma y desborda", () => {
    const asi = cargar(asy, "/* === ASI SOY YO · DATOS Y CODEC === */", "/* === FIN ASI SOY YO · DATOS Y CODEC === */", "AsiSoyYo").P;
    const p = P.desdePerfil(plano(asi.ejemplo()));
    assert.equal(p.apodo, "Luna");
    assert.deepEqual(plano(p.bloques.senales), { opciones: ["oidos", "callada", "esconde"], nota: "" });
    assert.deepEqual(plano(p.bloques.ayuda), { opciones: ["bajito", "espacio", "objeto"], nota: "Contar hasta 10 con ella" });
    assert.deepEqual(plano(p.bloques.evitar), { opciones: ["ruido", "gente", "cambios"], nota: "El timbre del recreo" });
    assert.deepEqual(plano(p.bloques.avisar), { opciones: [], nota: "" });
    // solo «calma»: entra lo que coincide (silencio, luz, objeto)
    const soloCalma = P.desdePerfil({ v: 1, apodo: "", tarjetas: { calma: { opciones: ["abrazo", "silencio", "luz"], nota: "Su cobija" } } });
    assert.deepEqual(plano(soloCalma.bloques.ayuda), { opciones: ["silencio", "luz"], nota: "Su cobija" });
  });

  test("perfil raro, vacío o con datos que identifican: no revienta y no copia esos datos", () => {
    for (const raro of [null, undefined, 0, "basura", [], [1], {}, { tarjetas: 5 }, { tarjetas: { calma: "x" } }, { apodo: 7 }]) assert.equal(P.desdePerfil(raro), null, `debió ignorar ${JSON.stringify(raro)}`);
    const conDatos = P.desdePerfil({ apodo: "Sofi 12345678", tarjetas: { crisis: { opciones: ["agua"], nota: "llamar al 3001234567" }, avisa: { opciones: ["mueve"], nota: "x@y.co" } } });
    assert.equal(conDatos.apodo, "");
    assert.equal(conDatos.bloques.ayuda.nota, "");
    assert.equal(conDatos.bloques.senales.nota, "");
    assert.deepEqual(plano(conDatos.bloques.ayuda.opciones), ["agua"]);
  });

  test("lo guardado en el celular se limpia si viene raro", () => {
    for (const raro of [null, "x", [], { paso: "3" }, { paso: Infinity }, { plan: "x", listo: "si" }]) {
      const g = plano(P.normalizarGuardado(raro));
      assert.equal(g.listo, false);
      assert.ok(g.paso >= 0 && g.paso <= 4);
      assert.deepEqual(g.plan, plano(P.planVacio()));
    }
    assert.equal(P.normalizarGuardado({ paso: 99, listo: true }).paso, 4);
    assert.equal(P.normalizarGuardado({ paso: -3 }).paso, 0);
  });

  test("mensajes para WhatsApp: empiezan por la niña y terminan con el enlace", () => {
    assert.ok(P.plantillas.familia("Luna", "U").startsWith("Te mando la tarjeta de crisis de Luna"));
    assert.ok(P.plantillas.maestra("Luna", "https://x/#t1.AA").endsWith("\nhttps://x/#t1.AA"));
  });

  test("la imagen parte los textos largos en renglones (con tope)", () => {
    assert.deepEqual(plano(P.lineas("Afanarla o pedirle que pare ya", 34, 2)), ["Afanarla o pedirle que pare ya"]);
    assert.deepEqual(plano(P.lineas("Llevarla a un lugar tranquilo", 14, 3)), ["Llevarla a un", "lugar", "tranquilo"]);
    assert.deepEqual(plano(P.lineas("", 10, 2)), []);
    assert.ok(P.lineas("a".repeat(200), 20, 3).length <= 3);
  });
});

// =====================================================================
// «Guía de la ruta en la EPS» · ruta-eps.html
// =====================================================================
describe("ruta-eps · la página", () => {
  const h = leer("ruta-eps.html");
  const { P: R } = cargar(h, "/* === RUTA EPS · DATOS === */", "/* === FIN RUTA EPS · DATOS === */", "RutaEps");
  const ARCHIVOS = ["ruta-eps", "tutela", "ley-1618-2013-discapacidad", "ley-1616-2013-salud-mental", "ley-2628-2026"];
  const norm = (t) => sinTildes(t).replace(/\*/g, "").replace(/\s+/g, " ").trim();
  const biblio = Object.fromEntries(ARCHIVOS.map((a) => [a, norm(fs.readFileSync(path.join(BIBLIO, a + ".md"), "utf8"))]));
  const frases = () => {
    const r = [];
    for (const Pa of R.PASOS) { r.push(...Pa.explica, ...Pa.marcas); if (Pa.cierre) r.push(Pa.cierre); }
    r.push(...R.GUION, ...R.PLANTILLA, ...R.LEYES.map((L) => L.texto), R.MIENTRAS, R.AYUDA);
    return r;
  };
  const textosDatos = () => [R.AVISO, ...R.PASOS.map((Pa) => Pa.titulo), ...R.LEYES.map((L) => L.titulo), ...frases().map((x) => x.texto), R.textoGuion(), R.textoPlantilla()].join("\n");
  const propio = () => visible(sinCaparazon(h)) + "\n" + textosDatos();
  pruebasComunes("ruta-eps", h);

  test("TODO el contenido sale de la biblioteca ruta-colombia (cada frase con su ancla, y el ancla existe)", () => {
    const todas = frases();
    assert.ok(todas.length >= 35, `pocas frases: ${todas.length}`);
    for (const x of todas) {
      assert.ok(ARCHIVOS.includes(x.archivo), `archivo fuera de la biblioteca permitida: ${x.archivo}`);
      const anclas = Array.isArray(x.ancla) ? x.ancla : [x.ancla];
      assert.ok(anclas.length > 0 && x.texto, "frase sin ancla");
      for (const a of anclas) assert.ok(biblio[x.archivo].includes(norm(a)), `«${a}» no está en ${x.archivo}.md (frase: ${x.texto.slice(0, 50)})`);
    }
  });

  test("los 6 pasos son los de ruta-eps.md, en el mismo orden (5 de la EPS + la tutela)", () => {
    assert.deepEqual(plano(R.PASOS.map((Pa) => Pa.id)), ["cita", "prueba", "negativa", "peticion", "supersalud", "tutela"]);
    for (let n = 1; n <= 6; n++) assert.ok(biblio["ruta-eps"].includes(`## paso ${n}`), `ruta-eps.md no tiene el paso ${n}`);
    assert.ok(!biblio["ruta-eps"].includes("## paso 7"));
    const titulos = ["pedir la cita", "guardar prueba", "si te dicen que no hay cita o te la niegan", "derecho de peticion", "queja ante la superintendencia", "si nada funciona"];
    titulos.forEach((t) => assert.ok(biblio["ruta-eps"].includes(t), t));
  });

  test("no agrega plazos, artículos, cifras ni teléfonos: cada número viene de la biblioteca", () => {
    const sinPie = propio().replace(R.PIE, " ").replace(R.VERSION, " ");
    const enBiblio = new Set(Object.values(biblio).join(" ").match(/\d+/g));
    for (const n of sinPie.match(/\d{2,}/g) || []) assert.ok(enBiblio.has(n) || ["141"].includes(n), `número que no está en la biblioteca: ${n}`);
    for (const n of sinPie.match(/\b\d{3}\b/g) || []) assert.ok(["106", "123", "141"].includes(n), `línea no permitida: ${n}`);
    const t = sinTildes(sinPie);
    assert.doesNotMatch(t, /articulo|\bart\.|\d+\s*dias|dias habiles|horas habiles|plazo de \d|en \d+ (dias|horas|meses)|53\.?604|56\.?604|sentencia|\bt-\d/, "plazo, artículo o cifra agregada");
    assert.doesNotMatch(t, /\d{7,}|supersalud\.gov|minsalud\.gov|\.gov\.co/, "teléfono o enlace");
  });

  test("lo marcado [sin verificar] en la biblioteca quedó por fuera o suavizado", () => {
    const t = sinTildes(propio());
    assert.doesNotMatch(t, /articulo 23|articulo 86|\(23\)|\(86\)/, "número de artículo sin verificar");
    assert.match(t, /esta guia no te da un plazo de respuesta ni un formato oficial/);
    assert.match(t, /aqui no ponemos telefonos ni enlaces de la supersalud/);
    assert.match(t, /el nombre puede cambiar segun la eps/);
    assert.match(t, /esta guia no te da un plazo\./);
  });

  test("aviso fijo «orientación general, no es asesoría legal» en el inicio, en cada paso y en las leyes", () => {
    assert.equal(R.AVISO, "Orientación general, no es asesoría legal; los canales cambian según la EPS.");
    for (const p of ["inicio", "paso", "leyes"]) assert.ok(tramo(h, `data-pantalla="${p}"`, "</section>").includes(R.AVISO), `falta el aviso en ${p}`);
  });

  test("pie: «Contenido revisado por asesoría legal · 2026-11» y la fecha de la versión", () => {
    assert.equal(R.PIE, "Contenido revisado por asesoría legal · 2026-11");
    const pie = tramo(h, '<p class="pie" id="pie">', "</p>");
    assert.ok(pie.includes(R.PIE) && pie.includes("Versión del 2026-11-08"));
    assert.ok(h.indexOf('id="pie"') < h.indexOf("</main>"), "el pie va dentro de main (se ve en todas las pantallas)");
  });

  test("palabras prohibidas y promesas: ni «tiene», ni «parece», ni «garantiza», ni «diagnóstico»", () => {
    const t = sinTildes(propio());
    assert.doesNotMatch(t, /\btiene\b|\btienes\b|\bparece\b|evaluacion sensorial|sintoma|diagnos|garantiz|vas a ganar|seguro que|tienes derecho/);
    assert.doesNotMatch(sinTildes(R.textoGuion()), /autis|diagn/);
  });

  test("guion «Qué decir en la cita» copiable y plantilla de prueba sin campos de EPS ni documento", () => {
    assert.match(tramo(h, 'id="caja-guion"', "</div>\n      <div"), /Qué decir en la cita/);
    assert.ok(R.textoGuion().split("\n").length === R.GUION.length);
    assert.ok(R.textoPlantilla().startsWith("Prueba de mi trámite en la EPS\n"));
    assert.doesNotMatch(sinTildes(R.textoPlantilla()), /documento|cedula|nombre de la eps|^eps:|diagnos/m);
    assert.match(h, /\$\('#b-copiar-guion'\)\.addEventListener\('click', function \(\) \{ copiarTexto\(R\.textoGuion\(\)/);
  });

  test("sin borrador de derecho de petición: la biblioteca no trae un modelo", () => {
    for (const a of ARCHIVOS) assert.doesNotMatch(biblio[a], /modelo de derecho de peticion|plantilla de derecho de peticion/, `${a} sí trae modelo: hay que agregar el borrador`);
    assert.doesNotMatch(sinTildes(propio()), /senores eps|respetuosamente solicito|borrador/);
  });

  test("campos: solo casillas para marcar y la copia manual (de solo lectura)", () => {
    const campos = [...h.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((m) => m[0]);
    assert.deepEqual(campos.map((c) => (c.match(/\bid="([^"]+)"/) || [])[1]).filter(Boolean), ["texto-manual"]);
    assert.match(campos.find((c) => c.includes("texto-manual")), /readonly/);
    const casillas = [...h.matchAll(/<input type="checkbox" data-hecho="/g)];
    assert.equal(casillas.length, 1, "las casillas se pintan desde los datos (una plantilla)");
    assert.doesNotMatch(h, /<input type="(text|tel|email|number|date)"/);
  });

  test("solo escribe su propia clave (contigo.ruta-eps) y nunca la de otras piezas", () => {
    assert.equal(R.CLAVE, "ruta-eps");
    const usos = [...h.matchAll(/C\.baul\.(leer|guardar|quitar)\(([^,)]+)/g)].map((m) => m[1] + ":" + m[2].trim());
    assert.ok(usos.length >= 3);
    for (const u of usos) assert.ok(["leer:R.CLAVE", "guardar:R.CLAVE", "quitar:R.CLAVE"].includes(u), `uso no permitido del baúl: ${u}`);
  });
});

describe("ruta-eps · marcas guardadas y entrada por #", () => {
  const h = leer("ruta-eps.html");
  const { P: R } = cargar(h, "/* === RUTA EPS · DATOS === */", "/* === FIN RUTA EPS · DATOS === */", "RutaEps");

  test("los id de las marcas son únicos y fijos (son lo que se guarda)", () => {
    const ids = plano(R.ids());
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, ["p1-canal", "p1-general", "p1-contar", "p2-anotar", "p2-radicado", "p2-escrito", "p3-razon", "p3-otras", "p4-entregar", "p4-copia", "p5-queja", "p6-papeles", "p6-asesoria", "p6-escrito", "p6-juez", "p6-copia"]);
  });

  test("lo guardado raro se limpia y nunca rompe", () => {
    for (const raro of [null, undefined, 0, "x", [], [1, 2], { hechos: "p1-canal" }, { paso: "3" }, { paso: NaN }, { hechos: [5, null, {}] }]) {
      const g = plano(R.normalizar(raro));
      assert.deepEqual(g.hechos, []);
      assert.ok(g.paso >= 1 && g.paso <= 6);
    }
    const g = plano(R.normalizar({ hechos: ["p6-copia", "inventado", "p1-canal", "p1-canal", "__proto__"], paso: 99 }));
    assert.deepEqual(g.hechos, ["p1-canal", "p6-copia"], "orden fijo, sin repetidos ni ids desconocidos");
    assert.equal(g.paso, 6);
  });

  test("marcar y desmarcar; «Estás aquí» es el primer paso con algo sin marcar", () => {
    let g = R.normalizar(null);
    assert.equal(R.estasAqui(g), 1);
    for (const id of ["p1-canal", "p1-general", "p1-contar"]) g = R.alternar(g, id);
    assert.equal(R.marcadas(g, 1), 3);
    assert.equal(R.estasAqui(g), 2);
    g = R.alternar(g, "p1-general");
    assert.equal(R.estasAqui(g), 1);
    assert.deepEqual(plano(R.alternar(g, "no-existe").hechos), plano(g.hechos));
    let todo = R.normalizar({ hechos: R.ids() });
    assert.equal(R.estasAqui(todo), 6);
  });

  test("entrada directa #paso-1 … #paso-6; cualquier otra cosa no revienta (null)", () => {
    for (let n = 1; n <= 6; n++) { assert.equal(R.pasoDeHash(`#paso-${n}`), n); assert.equal(R.pasoDeHash(`paso-${n}`), n); }
    for (const malo of ["", "#", "#paso-0", "#paso-7", "#paso-12", "#paso-1x", "#t1.AAAA", "#a1.AAAA", "#principal", "#__proto__", null, undefined, 3, {}]) assert.equal(R.pasoDeHash(malo), null, `debió ignorar ${String(malo)}`);
  });
});
