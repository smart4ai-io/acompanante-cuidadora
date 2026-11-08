// recursos-ola2-b.test.js · pruebas de «Mi día» (mi-dia.html) y «Mi rincón de calma» (calma.html), Ola 2 de «Recursos».
// Sin navegador y sin dependencias. Correr desde app\:  node --test pruebas/recursos-ola2-b.test.js
//
// Qué revisa en cada pieza: peso, caparazón IDÉNTICO al de «Así soy yo», política de seguridad, cero red salvo la fuente,
// palabras prohibidas, nada suena ni se mueve al cargar, el enlace (#) de ida y vuelta, que un enlace dañado no revienta,
// que la vista de la niña no escribe en el celular, letra y botones mínimos, y la lógica propia de cada pieza
// (el código de datos se corre aquí mismo, aislado, con node:vm).
// Regla: estas pruebas no se editan para que pasen; si fallan, se arregla la página.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REC = path.join(APP, "public", "recursos");
const asy = fs.readFileSync(path.join(REC, "asi-soy-yo.html"), "utf8");

const CI = "/* === CARAPAZON CONTIGO v1 === */";
const CF = "/* === FIN CARAPAZON CONTIGO v1 === */";
const ARRIBA = ["<!-- === CARAPAZON CONTIGO v1 · HTML (fondo, cabecera, sello) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (arriba) === -->"];
const ABAJO = ["<!-- === CARAPAZON CONTIGO v1 · HTML (barra fija y capas) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (abajo) === -->"];

// Utilidades
const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plano = (x) => JSON.parse(JSON.stringify(x)); // quita los prototipos de la caja para comparar
function tramo(texto, ini, fin, desde = 0) {
  const a = texto.indexOf(ini, desde);
  const b = texto.indexOf(fin, a + ini.length);
  assert.ok(a >= 0 && b > a, `no encontré ${ini}`);
  return texto.slice(a, b + fin.length);
}
const visible = (t) => t.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
function caparazon(t) {
  const css = tramo(t, CI, CF);
  const js = tramo(t, CI, CF, t.indexOf(css) + css.length);
  return {
    css, js,
    arriba: tramo(t, ARRIBA[0], ARRIBA[1]),
    abajo: tramo(t, ABAJO[0], ABAJO[1]),
    csp: (t.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/) || [""])[0],
    fuentes: t.split("\n").filter((l) => /^<link [^>]*fonts\.g/.test(l)),
    simbolos: [...t.matchAll(/<symbol id="i-[^"]+"[\s\S]*?<\/symbol>/g)].map((m) => m[0])
  };
}
const BASE = caparazon(asy);

// Carga una pieza: su HTML, sus estilos y scripts, y su módulo de datos corrido en una caja aislada (sin DOM)
function cargar(archivo, iniDatos, finDatos, nombreGlobal, iniNina, finNina) {
  const ruta = path.join(REC, archivo);
  const html = fs.readFileSync(ruta, "utf8");
  const cap = caparazon(html);
  const estilos = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const jsDatos = tramo(html, iniDatos, finDatos);
  const jsNina = tramo(html, iniNina, finNina);
  const sinCap = html.replace(cap.css, " ").replace(cap.js, " ").replace(cap.arriba, " ").replace(cap.abajo, " ").split("\n").filter((l) => !l.startsWith('<symbol id="i-')).join("\n");
  const cssPieza = estilos.replace(cap.css, " ");
  const jsPieza = scripts.filter((s) => !s.includes(CI)).join("\n");
  const cadenas = [...jsPieza.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]).join("\n"); // textos que la pieza puede mostrar
  const caja = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
  vm.runInContext(cap.js + "\n" + jsDatos + `\n;globalThis.__C = Contigo; globalThis.__X = ${nombreGlobal};`, caja);
  return { ruta, html, cap, estilos, scripts, jsDatos, jsNina, sinCap, cssPieza, jsPieza, cadenas, C: caja.__C, X: caja.__X, peso: fs.statSync(ruta).size };
}

// Pruebas que valen igual para las dos piezas
function comunes(P, op) {
  test("pesa 300 KB o menos", () => {
    assert.ok(P.peso <= 300 * 1024, `pesa ${P.peso} bytes`);
  });

  test("el caparazón (CSS, JS, HTML de arriba y de abajo, iconos i-*, política y fuente) es IDÉNTICO al de «Así soy yo»", () => {
    assert.equal(P.cap.css, BASE.css, "CSS del caparazón distinto");
    assert.ok(P.estilos.includes(P.cap.css), "el CSS del caparazón no está dentro de <style>");
    assert.equal(P.cap.js, BASE.js, "JS del caparazón distinto");
    assert.ok(P.scripts[0].includes(P.cap.js), "el JS del caparazón no está en el primer <script> (el del <head>)");
    assert.ok(P.html.indexOf(P.scripts[0]) < P.html.indexOf("</head>"), "el primer <script> debe ir en el <head>");
    assert.equal(P.cap.arriba, BASE.arriba, "HTML de arriba distinto");
    assert.equal(P.cap.abajo, BASE.abajo, "HTML de abajo distinto");
    assert.equal(P.cap.csp, BASE.csp, "política de seguridad distinta");
    assert.deepEqual(P.cap.fuentes, BASE.fuentes, "carga de la fuente distinta");
    assert.ok(BASE.simbolos.length >= 10);
    for (const s of BASE.simbolos) assert.ok(P.html.includes(s), `falta el icono ${s.slice(0, 30)}`);
    assert.ok(P.html.includes("Prototipo · datos de ejemplo"), "falta el sello");
    assert.match(P.jsPieza, /C\.iniciar\(\{ vistaAdulto: false/, "la vista de entrada es de niña: vistaAdulto: false");
  });

  test("política de seguridad: sin conexiones, sin scripts externos, imágenes solo data:", () => {
    assert.match(P.cap.csp, /default-src 'none'/);
    assert.match(P.cap.csp, /connect-src 'none'/);
    assert.match(P.cap.csp, /img-src data:;/);
    assert.match(P.cap.csp, /script-src 'unsafe-inline';/);
  });

  test("la única dirección externa es la fuente (fonts.googleapis / fonts.gstatic)", () => {
    const posiciones = [...P.html.matchAll(/http/gi)].map((m) => m.index);
    assert.ok(posiciones.length > 0);
    for (const i of posiciones) {
      if (P.html.startsWith('http-equiv="Content-Security-Policy"', i)) continue; // nombre de atributo, no una dirección
      assert.match(P.html.slice(i, i + 40), /^https:\/\/fonts\.(googleapis|gstatic)\.com/, `dirección no permitida: ${P.html.slice(i, i + 60)}`);
    }
    assert.doesNotMatch(P.html, /\bwa\.me\b|whatsapp\.com|\/\/[a-z0-9-]+\.(com|co|org|net|io)\//i);
  });

  test("cero llamadas de red desde el código", () => {
    for (const patron of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket/, /EventSource/, /\bimport\s*\(/, /<img\b/i, /<iframe\b/i, /<audio\b/i, /<video\b/i, /\bsrc=/i, /window\.print\s*\(/]) {
      assert.doesNotMatch(P.html, patron, `encontré ${patron}`);
    }
    const cargas = [...P.html.matchAll(/\.src\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.equal(cargas.length, op.cargasImagen, "imágenes que se cargan");
    for (const c of cargas) assert.match(c, /^'data:image\/svg\+xml/);
    for (const u of [...P.estilos.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1])) assert.match(u, /^#/, `url() externa: ${u}`);
  });

  test("no usa ni menciona bancos de dibujos con otra licencia (ARASAAC, Sclera, OpenMoji, Mulberry)", () => {
    assert.doesNotMatch(P.html, /arasaac|sclera|openmoji|mulberry/i);
  });

  test("sin palabras prohibidas: «tiene», «parece», «evaluación sensorial», «diagnóstico», «síntoma», «trastorno», puntos o premios", () => {
    const todo = sinTildes(P.html);
    for (const p of ["tiene autismo", "sintoma", "evaluacion sensorial", "diagnostico", "trastorno", "detectar"]) assert.ok(!todo.includes(p), `contiene «${p}»`);
    const pieza = sinTildes(P.sinCap); // todo lo que no es caparazón (textos, datos, comentarios)
    assert.doesNotMatch(pieza, /\btienen?\b|\bparecen?\b/, "la pieza no interpreta a la niña («tiene», «parece»)");
    const textos = sinTildes(visible(P.sinCap) + "\n" + P.cadenas);
    assert.doesNotMatch(textos, /\bpuntos?\b|\bpuntaje|\bpremio|\bracha|perdiste|\bcastig|\bestrellita|\bmuy bien\b|\bsuper bien\b/, "nada puntúa, premia ni castiga");
    assert.doesNotMatch(textos, /\bautis/, "no hace falta nombrar el autismo");
  });

  test("nada suena al cargar: sin audio, sin «autoplay», la única voz es la del caparazón (y solo con un toque)", () => {
    assert.doesNotMatch(P.html, /autoplay/i);
    assert.doesNotMatch(P.html, /AudioContext|new Audio\b|\.play\(\)|vibrate/);
    assert.equal(P.html.split(".speak(").length - 1, 1);
    assert.doesNotMatch(P.jsPieza, /voz\.decir\(/, "la pieza no habla sola");
  });

  test("nada se mueve al cargar: toda animación de la pieza cuelga de una clase que pone un toque", () => {
    const reglas = [...P.cssPieza.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /(^|;|\s)animation\s*:/.test(m[2]) && !/animation\s*:\s*none/.test(m[2]));
    assert.ok(reglas.length > 0, "debería haber alguna animación (suave) tras un toque");
    for (const r of reglas) {
      const sel = r[1].trim();
      if (sel.startsWith("@") || /^(from|to|\d+%)/.test(sel)) continue;
      assert.match(sel, op.clasesAnimadas, `animación sin toque previo: ${sel}`);
    }
    for (const c of op.clasesAnimadas.source.match(/[a-z-]{4,}/g)) assert.doesNotMatch(tramo(P.html, '<main id="principal"', "</main>"), new RegExp(`class="[^"]*\\b${c}\\b`), `«${c}» ya viene puesta en el HTML`);
  });

  test("la vista de la niña no escribe en el celular ni deja historial", () => {
    for (const patron of [/localStorage/, /sessionStorage/, /indexedDB/, /\.guardar\(/, /cambiarAjuste/, /borrarTodo/, /pushState|replaceState/, /location\.hash\s*=/, /document\.cookie/, /caches\./]) {
      assert.doesNotMatch(P.jsNina, patron, `la vista niña usa ${patron}`);
    }
    assert.equal([...P.html.matchAll(/C\.baul\.guardar\(/g)].length, 1, "un solo lugar guarda");
    assert.match(tramo(P.html, "function guardar() {", "\n  }"), op.guardado);
    assert.equal(P.html.split("localStorage").length - 1, P.cap.js.split("localStorage").length - 1, "localStorage fuera del baúl del caparazón");
    assert.doesNotMatch(P.jsPieza, /sessionStorage|indexedDB|document\.cookie/);
    assert.doesNotMatch(P.jsPieza, /baul\.guardar\('perfil'|baul\.quitar\(/, "no toca «Así soy yo»");
  });

  test("sin campos de nombre, documento, EPS ni diagnóstico", () => {
    const campos = [...P.html.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((m) => m[0]).concat([...P.jsPieza.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]));
    for (const c of campos) {
      const attrs = [...c.matchAll(/\b(id|name|placeholder|aria-label|autocomplete|type)="([^"]*)"/gi)].map((m) => sinTildes(m[2])).join(" ");
      assert.doesNotMatch(attrs, /nombre|documento|cedula|\beps\b|diagnos|telefono|correo|email/, `campo sospechoso: ${c}`);
    }
    const ids = [...P.html.matchAll(/<(input|textarea|select)\b[^>]*\bid="([^"]+)"/gi)].map((m) => m[2]).sort();
    assert.deepEqual(ids, op.campos);
    assert.match([...P.html.matchAll(/<textarea\b[^>]*>/g)].map((m) => m[0]).join(""), /readonly/);
  });

  test("letra de 17 px o más, alturas de 44 px o más y lo que toca la niña de 64 px o más", () => {
    const letras = [...P.estilos.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    assert.ok(letras.length > 10);
    for (const n of letras) assert.ok(n >= 17, `letra de ${n} px`);
    for (const n of [...P.estilos.matchAll(/min-height:\s*([\d.]+)px/g)].map((m) => Number(m[1]))) assert.ok(n >= 44, `alto mínimo de ${n} px`);
    for (const regla of op.reglasNina) {
      const m = P.cssPieza.match(regla);
      assert.ok(m && Number(m[1]) >= 64, `menos de 64 px: ${regla}`);
    }
  });

  test("enlaces dañados devuelven null (nunca revientan) · 500 al azar tampoco", () => {
    for (const m of op.malos()) assert.equal(P.X.decodificar(m), null, `debió fallar: ${String(m).slice(0, 30)}`);
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let semilla = 11;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    let validos = 0;
    for (let i = 0; i < 500; i++) {
      let s = (i % 2 ? "#" : "") + P.X.PIEZA + ".";
      const n = Math.floor(azar() * 80);
      for (let k = 0; k < n; k++) s += abc[Math.floor(azar() * abc.length)];
      const r = P.X.decodificar(s);
      if (r) { validos++; op.validar(r); }
    }
    assert.ok(validos < 500, "algo debió rechazarse");
  });

  test("la vista para enlace dañado dice «Este enlace llegó incompleto»", () => {
    assert.match(tramo(P.html, '<section class="vista" id="vista-roto"', "</section>"), /Este enlace llegó incompleto/);
  });
}

// ===================================================================================================
describe("mi-dia", () => {
  const P = cargar("mi-dia.html", "/* === MI DIA · DATOS Y CODEC === */", "/* === FIN MI DIA · DATOS Y CODEC === */", "MiDia", "/* === MI DIA · VISTA NIÑA === */", "/* === FIN MI DIA · VISTA NIÑA === */");
  const D = P.X, C = P.C;
  const seccion = (id) => tramo(P.html, `<section class="vista" id="${id}"`, "</section>");
  const bueno = () => D.codificar({ momento: "noche", pasos: ["comer", "banarse", "pijama", "dientes", "cuento", "dormir"], palabras: { cuento: "Cuento con mamá" }, modo: "tres" });

  comunes(P, {
    cargasImagen: 1,
    clasesAnimadas: /\.(recien|desvaneciendo|llega)\b/,
    guardado: /C\.baul\.guardar\(D\.CLAVE, cfg\)/,
    campos: ["palabra-' + i + '", "revise", "texto-manual"], // «palabra-N»: la palabra de cada paso (la arma el script)
    reglasNina: [/\.piedra \{[^}]*min-height: (\d+)px/, /\.tres-ahora \{[^}]*min-height: (\d+)px/, /\.boton-grande \{[^}]*min-height: (\d+)px/, /\.puerta-nina \{[^}]*min-height: (\d+)px/],
    malos: () => {
      const b = bueno(), crudo = C.enlace.desempaquetar("d1", b);
      const con = (i, v) => { const x = crudo.slice(); x[i] = v; return C.enlace.empaquetar("d1", x); };
      const n = crudo[3], k = 4 + n; // posición del contador de palabras
      return [null, undefined, "", "#", "#d1.", "d1.", "#d1", "#aula", "#principal", "#a1." + b.slice(3), "#d2." + b.slice(3), "#d1.@@@@", "#d1." + b.slice(3, -3), b + "AAAA", "#__proto__", "#d1.A",
        con(0, 2), con(1, 4), con(2, 2), con(3, 0), con(3, 8), con(4, 16), con(k, 17), con(k + 1, 16),
        C.enlace.empaquetar("d1", crudo.slice(0, -1)),
        C.enlace.empaquetar("d1", [0, 0, 0, 8, 0, 1, 2, 3, 4, 5, 6, 7, 0]), // 8 pasos bien armados: uno de más
        C.enlace.empaquetar("d1", [0, 0, 0, 0, 0]), // cero pasos
        C.enlace.empaquetar("d1", [0, 0, 0, 1, 0, 1, 0, 0]), // palabra vacía
        C.enlace.empaquetar("d1", [0, 0, 0, 1, 0, 1, 0, ...[9, 68, 101, 115, 112, 101, 114, 116, 97, 114].slice(0, 1), ...[68, 101, 115, 112, 101, 114, 116, 97, 114]]), // «Despertar» = la de siempre
        C.enlace.empaquetar("d1", [0, 0, 0, 1, 0, 1, 5, 1, 65]), // palabra de un paso que no está
        C.enlace.empaquetar("d1", [0, 0, 0, 2, 0, 5, 2, 5, 1, 65, 0, 1, 66]), // palabras fuera de orden
        C.enlace.empaquetar("d1", [0, 0, 0, 1, 0, 1, 0, 2, 32, 65]) // palabra con espacio al inicio (no está limpia)
      ];
    },
    validar: (r) => {
      assert.ok(r.cfg.pasos.length >= 1 && r.cfg.pasos.length <= 7);
      for (const id of r.cfg.pasos) assert.ok(D.IDS.includes(id));
      for (const [id, w] of Object.entries(r.cfg.palabras)) { assert.ok(r.cfg.pasos.includes(id)); assert.ok(w.length > 0 && Array.from(w).length <= 24); }
    }
  });

  test("16 pasos con dibujo propio p-*, palabra de 1 a 3 palabras, e incluye los del pedido", () => {
    assert.equal(D.PASOS.length, 16);
    assert.equal(new Set(D.IDS).size, 16);
    for (const P2 of D.PASOS) {
      const n = P2.palabra.split(/\s+/).length;
      assert.ok(n >= 1 && n <= 3, `«${P2.palabra}» tiene ${n} palabras`);
      assert.match(P.html, new RegExp(`<symbol id="p-${P2.id}" viewBox="0 0 64 64">`), `falta el dibujo p-${P2.id}`);
      assert.ok(["menta", "lavanda", "rosa", "arena"].includes(P2.color));
    }
    for (const id of ["manos", "comer", "dormir", "salir", "colegio", "bano", "vestirse", "jugar", "tareas", "transporte"]) assert.ok(D.IDS.includes(id), `falta ${id}`);
    assert.equal((P.html.match(/<symbol id="p-/g) || []).length, 16);
    assert.deepEqual(plano(D.IDS.slice(0, 3)), ["despertar", "bano", "manos"], "el orden de PASOS es el formato: no se cambia");
  });

  test("las rutinas de ejemplo usan pasos conocidos y caben (máximo 7)", () => {
    for (const M of D.MOMENTOS) {
      const p = D.PLANTILLAS[M.id];
      assert.ok(p && p.length >= 1 && p.length <= D.MAX_PASOS, M.id);
      for (const id of p) assert.ok(D.IDS.includes(id), `${M.id}: ${id}`);
    }
    assert.equal(D.MAX_PASOS, 7);
  });

  test("el enlace #d1 va y vuelve igual, con y sin «#» y con basura al final", () => {
    const cfg = { v: 1, momento: "noche", pasos: ["comer", "banarse", "pijama", "dientes", "cuento", "dormir"], palabras: { cuento: "Cuento con mamá" }, modo: "tres" };
    const frag = D.codificar(cfg);
    assert.match(frag, /^d1\.[A-Za-z0-9_-]+$/);
    for (const entrada of [frag, "#" + frag, "#" + frag + ".", "#" + frag + ")"]) {
      const r = D.decodificar(entrada);
      assert.ok(r, `no decodificó …${entrada.slice(-6)}`);
      assert.deepEqual(plano(r.cfg), cfg);
      assert.equal(r.ejemplo, false);
    }
    assert.equal(D.decodificar(D.codificar(cfg, { ejemplo: true })).ejemplo, true);
    assert.deepEqual(plano(D.decodificar(D.codificar(D.porDefecto())).cfg), plano(D.porDefecto()), "la rutina de ejemplo también va y vuelve");
  });

  test("tildes, ñ, emoji y comillas en las palabras van y vuelven; los pasos repetidos se conservan", () => {
    const cfg = { momento: "tarde", pasos: ["manos", "comer", "manos", "jugar"], palabras: { manos: "Jabón 🧼 y agua", jugar: 'A "la" <b>pelota</b>', comer: "Ñam, almuerzo" }, modo: "todo" };
    const r = D.decodificar(D.codificar(cfg)).cfg;
    assert.deepEqual(plano(r.pasos), ["manos", "comer", "manos", "jugar"]);
    assert.deepEqual(plano(r.palabras), { manos: "Jabón 🧼 y agua", comer: "Ñam, almuerzo", jugar: 'A "la" <b>pelota</b>' });
    assert.equal(D.palabra(r, "manos"), "Jabón 🧼 y agua");
    assert.equal(D.palabra(r, "dormir"), "Dormir");
  });

  test("recorta y limpia: máximo 7 pasos, ids desconocidos fuera, palabra a 24 letras, vacías e iguales descartadas", () => {
    const r = D.normalizar({ momento: "luna", pasos: ["dormir", "inventado", "comer", "comer", "jugar", "tareas", "salir", "bano", "manos", "dientes"], palabras: { dormir: "  A   dormir\u0000 ", comer: "", jugar: "Jugar", salir: "z".repeat(40), __proto__: { x: 1 }, colegio: "No está en la rutina" }, modo: "raro" });
    assert.equal(r.momento, "manana");
    assert.deepEqual(plano(r.pasos), ["dormir", "comer", "comer", "jugar", "tareas", "salir", "bano"]);
    assert.deepEqual(plano(r.palabras), { dormir: "A dormir", salir: "z".repeat(24) });
    assert.equal(r.modo, "todo");
    const ida = D.decodificar(D.codificar(r)).cfg;
    assert.deepEqual(plano(ida), plano(r));
  });

  test("entradas raras para la rutina nunca rompen y dan la rutina de ejemplo", () => {
    const base = plano(D.porDefecto());
    for (const raro of [null, undefined, 0, "hola", [], [1, 2], true]) assert.deepEqual(plano(D.normalizar(raro)), base);
    assert.deepEqual(plano(D.normalizar({ pasos: [] }).pasos), plano(D.PLANTILLAS.manana), "sin pasos vuelve la de ejemplo");
    assert.deepEqual(plano(D.normalizar({ momento: "noche", pasos: "dormir" }).pasos), plano(D.PLANTILLAS.noche));
    assert.deepEqual(plano(D.normalizar({ pasos: [1, null, {}, "dormir"] }).pasos), ["dormir"]);
  });

  test("«dos casas»: el enlace no lleva lo que ella marcó, ni cuándo, ni quién", () => {
    const cfg = D.porDefecto();
    const conMarcas = Object.assign({}, cfg, { hechos: [true, true, false], quien: "mamá", cuando: "2026-11-08", historial: [1, 2, 3] });
    assert.equal(D.codificar(conMarcas), D.codificar(cfg));
    assert.deepEqual(Object.keys(D.decodificar(D.codificar(conMarcas)).cfg).sort(), ["modo", "momento", "palabras", "pasos", "v"]);
    assert.match(seccion("vista-compartir"), /No lleva lo que ella marcó, ni cuándo, ni quién\./);
    assert.match(seccion("vista-compartir"), /Lo revisé y lo comparto yo/);
    assert.match(seccion("vista-compartir"), /id="b-crear-enlace" disabled/);
  });

  test("el enlace más largo posible sigue siendo manejable (≤ 600 caracteres)", () => {
    const pasos = D.IDS.slice(0, 7), palabras = {};
    for (const id of pasos) palabras[id] = "ñ".repeat(24);
    const frag = D.codificar({ momento: "dia", pasos, palabras, modo: "tres" });
    assert.ok(frag.length <= 600, `largo ${frag.length}`);
    assert.deepEqual(plano(D.decodificar(frag).cfg.palabras), palabras);
  });

  test("mensaje para la otra casa: sin «autismo», sin nombre de la niña, con el enlace al final", () => {
    const enlace = "https://contigo.ejemplo/recursos/mi-dia.html#" + bueno();
    for (const M of D.MOMENTOS) {
      const t = D.mensaje({ momento: M.id }, enlace);
      assert.ok(t.endsWith("\n" + enlace));
      assert.doesNotMatch(t.slice(0, -enlace.length), /autis|diagn|\bla día\b|\bMi\b|@|\d{5,}/i);
      assert.match(t, /^Te mando la rutina de (la mañana|la tarde|la noche|todo el día) que usamos en casa/);
    }
  });

  test("vista de la niña: lo no hecho se desvanece a «otro día» sin rojo ni X; modo «3 a la vez» con ahora · después · luego", () => {
    assert.match(P.jsNina, /'Otro día'/);
    assert.match(P.jsNina, /'Después'/);
    assert.match(P.jsNina, /'Luego'/);
    assert.match(P.jsNina, /class="tres-rotulo">Ahora</);
    assert.match(P.cssPieza, /\.piedra\.otro-dia \{[^}]*border-style: dashed/);
    assert.doesNotMatch(P.cssPieza, /\.otro-dia[^{]*\{[^}]*(#B8125C|var\(--acento\)|red\b)/i, "lo no hecho no va en rojo ni magenta");
    assert.doesNotMatch(P.jsNina, /[✗✕✖×]|'X'/, "sin X");
    assert.match(P.html, /Terminamos por hoy/);
    assert.match(P.html, /data-modo="tres"[^>]*>3 a la vez</);
  });

  test("el adulto ordena con botones (Subir / Bajar / Quitar), no solo arrastrando", () => {
    assert.match(P.jsPieza, /data-subir="/);
    assert.match(P.jsPieza, /data-bajar="/);
    assert.match(P.jsPieza, /data-quitar="/);
    assert.doesNotMatch(P.html, /draggable|dragstart/, "no depende de arrastrar");
    assert.match(seccion("vista-adulto"), /Agregar un paso/);
  });

  test("hoja para el salón: sin señalar a nadie, atribución en la hoja y en la imagen, una carta vertical", () => {
    const aula = seccion("vista-aula");
    const frase = "Dibujos: Contigo (Pulso Mundo + Smart4AI), CC BY 4.0";
    assert.ok(aula.includes(frase), "falta en la hoja");
    assert.ok(tramo(P.html, "function svgHoja()", "function hojaPNG()").includes(frase), "falta en la imagen PNG");
    assert.match(aula, /Descargar hoja/);
    assert.match(aula, /o imprime esta página desde tu navegador/);
    assert.match(aula, /No lleva el nombre de nadie/);
    assert.match(P.estilos, /@page \{ size: letter portrait/);
    assert.doesNotMatch(P.jsPieza, /baul\.leer\('perfil'\)|apodo/, "«Mi día» no lee el perfil ni el apodo: la hoja no puede señalarla");
    for (const M of D.MOMENTOS) assert.match(M.grupo, /^Nuestr[ao] /);
  });

  test("la única clave propia en el celular es contigo.mi-dia", () => {
    assert.equal(D.CLAVE, "mi-dia");
    const claves = [...P.jsPieza.matchAll(/baul\.(leer|guardar)\(([^,)]+)/g)].map((m) => m[2].trim());
    for (const k of claves) assert.equal(k, "D.CLAVE", `clave inesperada: ${k}`);
  });
});

// ===================================================================================================
describe("calma", () => {
  const P = cargar("calma.html", "/* === CALMA · DATOS Y CODEC === */", "/* === FIN CALMA · DATOS Y CODEC === */", "Calma", "/* === CALMA · VISTA NIÑA === */", "/* === FIN CALMA · VISTA NIÑA === */");
  const K = P.X, C = P.C;
  const seccion = (id) => tramo(P.html, `<section class="vista" id="${id}"`, "</section>");
  const PERFIL = { v: 1, apodo: "Luna", tarjetas: { calma: { opciones: ["silencio", "objeto", "mecerse"], nota: "Su cobija azul" }, desborda: { opciones: ["ruido", "gente", "cambios"], nota: "" } } };

  comunes(P, {
    cargasImagen: 0,
    clasesAnimadas: /\.activo\b/,
    guardado: /C\.baul\.guardar\(K\.CLAVE, cfg\)/,
    campos: ["revise", "texto-manual"],
    reglasNina: [/\.opcion-nina \{[^}]*min-height: (\d+)px/, /\[data-piel="nube"\] \.opcion-nina \{[^}]*min-height: (\d+)px/, /\.boton-grande \{[^}]*min-height: (\d+)px/, /\.puerta-nina \{[^}]*min-height: (\d+)px/],
    malos: () => {
      const b = K.codificar(["r1", "l1", "g5"]), crudo = C.enlace.desempaquetar("k1", b);
      return [null, undefined, "", "#", "#k1.", "k1.", "#k1", "#principal", "#d1." + b.slice(3), "#k2." + b.slice(3), "#k1.@@@@", b + "AAAA", "#__proto__",
        C.enlace.empaquetar("k1", [2, 1, 0]), C.enlace.empaquetar("k1", [0, 0]), C.enlace.empaquetar("k1", [0, 23].concat(Array.from({ length: 23 }, (_, i) => i))),
        C.enlace.empaquetar("k1", [0, 1, 22]), C.enlace.empaquetar("k1", [0, 2, 5, 3]), C.enlace.empaquetar("k1", [0, 2, 4, 4]), C.enlace.empaquetar("k1", [0, 2, 1]),
        C.enlace.empaquetar("k1", crudo.concat([0]))];
    },
    validar: (r) => {
      assert.ok(r.sirven.length >= 1 && r.sirven.length <= K.IDEAS.length);
      for (const id of r.sirven) assert.ok(K.IIDS.includes(id));
      assert.deepEqual(plano(r.sirven), plano(K.IIDS.filter((id) => r.sirven.includes(id))), "en el orden del kit");
    }
  });

  test("vista niña: 3 o 4 opciones grandes; por defecto apagar luces, audífonos, abrazo apretado y estar sola", () => {
    assert.deepEqual(plano(K.DEFECTO), ["luces", "audifonos", "abrazo", "sola"]);
    assert.deepEqual(plano(K.DEFECTO.map((id) => K.palabra(id, "cueva"))), ["Apagar las luces", "Mis audífonos", "Abrazo apretado", "Estar sola un rato"]);
    assert.equal(K.MIN_OPC, 3);
    assert.equal(K.MAX_OPC, 4);
    for (const O of K.OPCIONES) {
      assert.match(P.html, new RegExp(`<symbol id="c-${O.id}" viewBox="0 0 64 64">`), `falta el dibujo c-${O.id}`);
      assert.ok(O.nube && O.palabra && O.palabra.split(/\s+/).length <= 4);
    }
  });

  test("respiración lenta: empieza solo con un toque, 5 s / 7 s, y quieta en Modo suave o con «reducir movimiento»", () => {
    assert.equal(P.jsNina.split("empezarRespirar()").length - 1, 2, "se define y se llama una sola vez (en el toque)");
    assert.match(P.jsNina, /addEventListener\('click', function \(\) \{ if \(respirando\) pararRespirar\(\); else empezarRespirar\(\); \}\)/);
    assert.match(P.jsNina, /if \(!C\.suave\(\)\) \{[^}]*classList\.add\('activo'\)/);
    assert.match(P.jsNina, /tiempos = \[5000, 7000\]/);
    assert.match(P.cssPieza, /\.orbe-respira\.activo \{ animation: respirar-lento 12s/);
    assert.doesNotMatch(tramo(P.html, '<main id="principal"', "</main>"), /orbe-respira activo/);
    assert.match(P.cap.css, /:root\[data-suave="si"\] \*[^{]*\{ animation: none !important/);
    assert.match(P.cap.css, /prefers-reduced-motion: reduce\) \{ \*[^{]*\{ animation: none !important/);
  });

  test("piel adolescente «la nube»: nada infantil (sin dibujos de niña, palabras de grande)", () => {
    assert.equal(K.PIELES.nube.frase, "Estás a salvo. Quédate el tiempo que necesites.");
    assert.doesNotMatch(K.PIELES.nube.titulo, /cueva/i);
    assert.match(P.cssPieza, /#vista-nina\[data-piel="nube"\] \.opcion-nina \.dib \{ display: none; \}/);
    assert.match(P.cssPieza, /#mostrar\[data-piel="nube"\] \.mostrar-dibujo \{ display: none; \}/);
    for (const O of K.OPCIONES) assert.doesNotMatch(O.nube, /^Mis? (audífonos|cueva)$|apretado/i, `palabra infantil en la nube: ${O.nube}`);
  });

  test("Kit sensorial: ruidos, luces, texturas, olores y mucha gente, en ideas cortas de casa", () => {
    assert.deepEqual(plano(K.GRUPOS.map((G) => G.id)), ["ruidos", "luces", "texturas", "olores", "gente"]);
    assert.equal(K.IDEAS.length, 22);
    assert.equal(new Set(K.IIDS).size, 22);
    for (const G of K.GRUPOS) {
      assert.ok(G.ideas.length >= 4, `${G.id}: pocas ideas`);
      assert.match(P.html, new RegExp(`<symbol id="${G.icono}" viewBox="0 0 64 64">`), `falta ${G.icono}`);
    }
    for (const I of K.IDEAS) {
      assert.ok(I.texto.length >= 25 && I.texto.length <= 100, `idea muy corta o larga: ${I.texto}`);
      assert.match(I.texto, /\.$/);
      assert.doesNotMatch(sinTildes(I.texto), /terapia|evaluacion|sensorial|compra|\$|pesos|marca\b/, `la idea no es de casa o cuesta: ${I.texto}`);
    }
    assert.match(seccion("vista-adulto"), /Esto no es una terapia; es un lugar para descansar\./);
    assert.doesNotMatch(visible(seccion("vista-nina")), /sensorial/i, "la niña no ve la palabra «sensorial»");
  });

  test("lee contigo.perfil («Así soy yo») solo para destacar lo que la familia ya contó, con sus mismas palabras", () => {
    const d = K.destacar(PERFIL);
    assert.equal(d.hay, true);
    assert.deepEqual(plano(d.grupos), { ruidos: ["Ruido fuerte"], gente: ["Mucha gente", "Cambios de plan"] });
    assert.deepEqual(plano(d.ideas), { r3: ["Silencio"], r4: ["Silencio"], o4: ["Su objeto favorito"], g5: ["Mecerse o columpiarse"] });
    assert.deepEqual(plano(d.opciones), { silencio: ["Silencio"], objeto: ["Su objeto favorito"], mecerse: ["Mecerse o columpiarse"] });
    assert.match(P.jsPieza, /C\.baul\.leer\('perfil'\)/);
    assert.match(P.jsPieza, /En «Así soy yo» marcaste que esto la calma/);
    assert.match(P.jsPieza, /En «Así soy yo» marcaste que esto la desborda/);
  });

  test("perfiles raros o ausentes no destacan nada y nunca rompen", () => {
    for (const raro of [null, undefined, "x", 5, [], {}, { tarjetas: null }, { tarjetas: { calma: { opciones: "luz" } } }, { tarjetas: { calma: { opciones: ["__proto__", "toString", 3] }, desborda: { opciones: ["constructor"] } } }]) {
      const d = K.destacar(raro);
      assert.equal(d.hay, false, JSON.stringify(raro));
    }
  });

  test("ajustes del adulto: entradas raras se limpian (piel, 3 a 4 opciones en orden fijo, ideas conocidas)", () => {
    const base = plano(K.porDefecto());
    for (const raro of [null, undefined, 0, "hola", [], [1, 2], { piel: "volcan" }, { opciones: "luces" }, { opciones: ["luces", "agua"] }]) {
      const n = plano(K.normalizar(raro));
      assert.equal(n.piel, "cueva");
      assert.deepEqual(n.opciones, base.opciones);
    }
    const n = plano(K.normalizar({ piel: "nube", opciones: ["mecerse", "agua", "inventada", "luces", "silencio", "objeto"], sirven: ["g5", "r1", "zz", "r1", "t3"] }));
    assert.equal(n.piel, "nube");
    assert.deepEqual(n.opciones, ["luces", "silencio", "agua", "objeto"], "máximo 4, en su orden fijo");
    assert.deepEqual(n.sirven, ["r1", "t3", "g5"], "sin repetidas, en el orden del kit");
  });

  test("el enlace #k1 de la lista va y vuelve igual, con y sin «#»; una lista vacía no da enlace", () => {
    const lista = ["r1", "l1", "t5", "g5"];
    const frag = K.codificar(lista);
    assert.match(frag, /^k1\.[A-Za-z0-9_-]+$/);
    for (const entrada of [frag, "#" + frag, "#" + frag + ".", "#" + frag + ")"]) assert.deepEqual(plano(K.decodificar(entrada).sirven), lista);
    assert.deepEqual(plano(K.decodificar(K.codificar(["g5", "r1", "r1", "nada"])).sirven), ["r1", "g5"]);
    assert.equal(K.decodificar(K.codificar(lista, { ejemplo: true })).ejemplo, true);
    assert.equal(K.codificar([]), null);
    assert.equal(K.codificar(null), null);
    const todas = K.codificar(K.IIDS);
    assert.ok(todas.length <= 60, `largo ${todas.length}`);
    assert.deepEqual(plano(K.decodificar(todas).sirven), plano(K.IIDS));
  });

  test("lista para compartir: agrupada, sin nada de la niña y con el enlace al final; pide «Lo revisé y lo comparto yo»", () => {
    const enlace = "https://contigo.ejemplo/recursos/calma.html#" + K.codificar(["r1", "o2"]);
    const t = K.textoLista(["o2", "r1"], enlace);
    assert.ok(t.endsWith("\n" + enlace));
    assert.ok(t.indexOf("Ruidos:") < t.indexOf("Olores:"), "en el orden del kit");
    assert.doesNotMatch(t, /autis|diagn|Luna|@|\d{5,}/i);
    assert.match(seccion("vista-adulto"), /Lo revisé y lo comparto yo/);
    assert.match(seccion("vista-adulto"), /id="b-copiar-lista" disabled/);
    assert.match(seccion("vista-lista"), /No se guardan en este celular\./);
  });

  test("la única clave propia en el celular es contigo.calma (y contigo.perfil solo se lee)", () => {
    assert.equal(K.CLAVE, "calma");
    const guardados = [...P.jsPieza.matchAll(/baul\.guardar\(([^,)]+)/g)].map((m) => m[1].trim());
    assert.deepEqual(guardados, ["K.CLAVE"]);
    const leidos = [...P.jsPieza.matchAll(/baul\.leer\(([^,)]+)\)/g)].map((m) => m[1].trim()).sort();
    assert.deepEqual(leidos, ["'perfil'", "K.CLAVE"]);
  });
});
