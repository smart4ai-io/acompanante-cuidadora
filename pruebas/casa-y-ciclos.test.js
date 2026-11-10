// casa-y-ciclos.test.js · pruebas de «Casa Contigo» (public\casa-contigo.html), «Sus ciclos, su ritmo»
// (public\recursos\sus-ciclos.html) y la ficha conocimiento\biblioteca\bienestar\ciclos-y-neurodivergencia.md.
// Sin navegador y sin dependencias. Correr desde app\:  node --test pruebas/casa-y-ciclos.test.js
//
// Qué revisa: enlaces internos de la Casa que apuntan a archivos que existen, palabras y nombres prohibidos,
// caparazón IDÉNTICO al de «Así soy yo» en «Sus ciclos», la clave contigo.sus-ciclos (con un celular simulado),
// el patrón del ciclo con datos de ejemplo y con entradas raras, y la ficha con su encabezado válido.
// Regla: estas pruebas no se editan para que pasen; si fallan, se arregla la página o la ficha.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parsearFicha, documentoValido } from "../src/biblioteca.js";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(APP, "public");
const RUTA_CASA = path.join(PUBLIC, "casa-contigo.html");
const RUTA_CICLOS = path.join(PUBLIC, "recursos", "sus-ciclos.html");
const RUTA_FICHA = path.resolve(APP, "..", "conocimiento", "biblioteca", "bienestar", "ciclos-y-neurodivergencia.md");
const RUTA_FUENTES = path.resolve(APP, "..", "investigacion", "2026-11-10_CICLOS_neurodivergencia_fuentes.md");
const casa = fs.readFileSync(RUTA_CASA, "utf8");
const ciclos = fs.readFileSync(RUTA_CICLOS, "utf8");
const ficha = fs.readFileSync(RUTA_FICHA, "utf8");
const asy = fs.readFileSync(path.join(PUBLIC, "recursos", "asi-soy-yo.html"), "utf8");

const CI = "/* === CARAPAZON CONTIGO v1 === */";
const CF = "/* === FIN CARAPAZON CONTIGO v1 === */";
const ARRIBA = ["<!-- === CARAPAZON CONTIGO v1 · HTML (fondo, cabecera, sello) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (arriba) === -->"];
const ABAJO = ["<!-- === CARAPAZON CONTIGO v1 · HTML (barra fija y capas) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (abajo) === -->"];
const sinT = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plano = (x) => JSON.parse(JSON.stringify(x));
function tramo(t, i, f, desde = 0) {
  const a = t.indexOf(i, desde);
  const b = t.indexOf(f, a + i.length);
  assert.ok(a >= 0 && b > a, `no encontré ${i}`);
  return t.slice(a, b + f.length);
}
const cssCap = (h) => tramo(h, CI, CF);
const jsCap = (h) => tramo(h, CI, CF, h.indexOf(cssCap(h)) + cssCap(h).length);
const visible = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
const lineas = (t, re) => t.split("\n").filter((l) => re.test(l));

// Un celular de mentira: localStorage en memoria (para ver con qué clave guarda la pieza)
function celular() {
  const m = new Map();
  return { m, localStorage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } };
}
function cargarCiclos() {
  const cel = celular();
  const caja = vm.createContext({ TextEncoder, TextDecoder, btoa, atob, window: { localStorage: cel.localStorage } });
  vm.runInContext(jsCap(ciclos) + "\n" + tramo(ciclos, "/* === SUS CICLOS · DATOS === */", "/* === FIN SUS CICLOS · DATOS === */") + "\n;globalThis.__C = Contigo; globalThis.__S = SusCiclos;", caja);
  return { C: caja.__C, S: caja.__S, cel };
}
function tono(hex) { // matiz (0-360) de un color #RRGGBB
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("Casa Contigo · la página", () => {
  test("todos los enlaces internos apuntan a archivos que existen (y cada #sala tiene su sala)", () => {
    const sinCodigo = casa.replace(/<script[\s\S]*?<\/script>/g, " "); // los href que arma el código con variables no cuentan
    const hrefs = [...sinCodigo.matchAll(/\bhref="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(hrefs.length > 30, `solo ${hrefs.length} enlaces`);
    const archivos = new Set();
    for (const h of hrefs) {
      if (/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(h)) continue; // la fuente, igual que en las piezas
      assert.doesNotMatch(h, /^(https?:|\/\/|mailto:|tel:|javascript:)/i, `enlace externo o raro: ${h}`);
      if (h.startsWith("#")) {
        const id = h.slice(1);
        assert.ok(new RegExp(`id="${id}"`).test(casa), `el ancla ${h} no existe en la página`);
        continue;
      }
      const ruta = h.split("#")[0].split("?")[0];
      const local = ruta === "/" || ruta === "" ? "index.html" : ruta.replace(/^\//, "");
      archivos.add(local);
      assert.ok(fs.existsSync(path.join(PUBLIC, local)), `no existe public\\${local} (enlace ${h})`);
    }
    for (const r of ["index.html", "recursos/asi-soy-yo.html", "recursos/asi-estoy.html", "recursos/mi-dia.html", "recursos/calma.html", "recursos/el-vaso.html", "recursos/plan-de-tormenta.html", "recursos/sus-ciclos.html"]) {
      assert.ok(archivos.has(r), `la Casa no enlaza ${r}`);
    }
  });

  test("las 10 salas existen: en el plano, en la lista del celular y como sala abierta", () => {
    const SALAS = ["biblioteca", "expertos", "refugio", "ciclos", "integracion", "cine", "inspiracion", "cocina", "seguro", "jardin"];
    const plan = tramo(casa, '<nav class="plano"', "</nav>");
    const lista = tramo(casa, '<nav class="lista-salas"', "</nav>");
    for (const s of SALAS) {
      assert.match(plan, new RegExp(`<a class="sala" href="#sala-${s}" aria-label="[^"]{10,}"`), `falta ${s} en el plano (con nombre accesible)`);
      assert.ok(lista.includes(`href="#sala-${s}"`), `falta ${s} en la lista del celular`);
      assert.match(casa, new RegExp(`<section class="vista sala-vista[^"]*" id="sala-${s}" data-sala="${s}"`), `falta la sala ${s}`);
      assert.match(casa, new RegExp(`id="t-${s}" tabindex="-1"`), `la sala ${s} no tiene título enfocable`);
    }
    const caja = vm.createContext({});
    vm.runInContext(tramo(casa, "/* === CASA CONTIGO · DATOS === */", "/* === FIN CASA CONTIGO · DATOS === */") + "\n;globalThis.__K = CasaContigo;", caja);
    assert.deepEqual(plano(caja.__K.SALAS).sort(), [...SALAS].sort());
    assert.equal(caja.__K.salaDe("#sala-cine"), "cine");
    for (const raro of ["", "#", "#sala-", "#sala-inventada", "#casa", "#sala-cine<script>", null, undefined, 5]) assert.equal(caja.__K.salaDe(raro), null, String(raro));
  });

  test("no aparece «tiene autismo», «Comfama» ni «Siete Sentidos» (tampoco en «Sus ciclos» ni en la ficha)", () => {
    for (const [nombre, t] of [["casa", casa], ["sus-ciclos", ciclos], ["ficha", ficha]]) {
      const s = sinT(t);
      for (const f of ["tiene autismo", "comfama", "confama", "siete sentidos", "7sentidos", "david escobar", "supersubsidio", "la acompanante", "aqui estas a salvo", "padece", "sufre de", "sintoma"]) {
        assert.ok(!s.includes(f), `${nombre} contiene «${f}»`);
      }
    }
    // «Somos Extraordinarios» solo vive en un comentario del caparazón (de dónde salen los colores); nunca en lo que se ve
    for (const [nombre, t] of [["casa", casa], ["sus-ciclos", ciclos]]) assert.ok(!sinT(visible(t)).includes("somos extraordinarios"), `${nombre} muestra «Somos Extraordinarios»`);
  });

  test("textos clave: lema, frase guía, botón al chat y pie «Una iniciativa de Pulso Mundo y Smart4AI»", () => {
    const v = visible(casa).replace(/\s+/g, " ").replace(/ ([.,])/g, "$1");
    assert.ok(v.includes("El espacio de bienestar donde cuidadoras de niñas y adolescentes extraordinarias encuentran conocimiento, calma y su lugar seguro."));
    assert.ok(v.includes("Elige una sala. Todo lo que guardes se queda en tu celular."));
    assert.ok((casa.match(/<a class="c-boton" href="\/#chat">[\s\S]*?Conversar con Contigo<\/a>/g) || []).length >= 2, "falta «Conversar con Contigo» (arriba y en el pie)");
    assert.match(tramo(casa, '<footer class="pie-casa"', "</footer>"), /Una iniciativa de Pulso Mundo y Smart4AI/);
    assert.ok(v.includes("Este es tu lugar seguro."));
    assert.ok(v.includes("No diagnosticamos, no formulamos, no generalizamos."));
  });

  test("sala de los expertos: los 4 episodios de la maqueta tal cual, marcados «Próximamente»", () => {
    const s = tramo(casa, 'id="sala-expertos"', "</section>");
    assert.match(s, /Próximamente/);
    for (const t of ["¿Cómo diferencio una pataleta de un colapso sensorial?", "¿Cómo le presto mi calma a un niño/a en crisis?", "¿Cómo le ayudo a auto-gerenciarse mejor en los diferentes entornos?", "¿Qué quiere decir respetar su identidad autista o divergente?", "Ayola Acuesta, Terapeuta Ocupacional", "Patricia Gaviria, Psicóloga clínica", "Dr. Ernesto Reaño, Psicólogo clínico y lingüista"]) {
      assert.ok(s.includes(t), `falta «${t}»`);
    }
  });

  test("salón de inspiración: Simone Biles por TDAH (no por autismo), solo nombres con hecho público", () => {
    const s = tramo(casa, 'id="sala-inspiracion"', "</section>");
    assert.match(s, /Próximamente/);
    const biles = tramo(s, "<strong>Simone Biles</strong>", "</li>");
    assert.match(biles, /TDAH/);
    assert.doesNotMatch(sinT(biles), /autis|espectro/);
  });

  test("cocina: 3 ideas, 1 receta crujiente y dulce, y nada de «sin gluten», «sin azúcar» ni tratamiento", () => {
    const s = tramo(casa, 'id="sala-cocina"', "</section>");
    assert.equal((tramo(s, '<ul class="ideas">', "</ul>").match(/<li>/g) || []).length, 3);
    assert.match(s, /Crujiente y dulce/);
    assert.doesNotMatch(sinT(s), /gluten|azucar|lactosa|dieta (especial|libre)|cura/);
    assert.match(s, /no un tratamiento ni una dieta/);
  });

  test("cine: funciones distendidas y las 2 películas de la maqueta como sugerencia", () => {
    const s = tramo(casa, 'id="sala-cine"', "</section>");
    for (const t of ["función distendida", "Intensa-Mente (Inside Out)", "WALL·E", "Son sugerencias"]) assert.ok(s.includes(t), `falta «${t}»`);
  });

  test("lugar seguro: plan de tormenta y las líneas 123, 106 y 141 con el MISMO texto de la barra del caparazón", () => {
    const s = tramo(casa, 'id="sala-seguro"', "</section>");
    assert.ok(s.includes('href="recursos/plan-de-tormenta.html"'));
    const deCap = lineas(tramo(asy, ...ABAJO), /<li><strong>\d{3}<\/strong>/).map((l) => l.trim());
    const deCasa = lineas(tramo(s, '<ul class="lineas">', "</ul>"), /<li><strong>\d{3}<\/strong>/).map((l) => l.trim());
    assert.equal(deCap.length, 3);
    assert.deepEqual(deCasa, deCap);
    assert.match(s, /Reglas fijas, no la inteligencia artificial/);
  });

  test("biblioteca: las fichas embebidas existen en biblioteca.json, incluye la nueva y no lista leyes", () => {
    const json = JSON.parse(fs.readFileSync(path.join(APP, "biblioteca.json"), "utf8"));
    const ids = new Set(json.archivos.map((a) => parsearFicha(a.contenido).ficha.id));
    const caja = vm.createContext({});
    vm.runInContext(tramo(casa, "/* === CASA CONTIGO · DATOS === */", "/* === FIN CASA CONTIGO · DATOS === */") + "\n;globalThis.__K = CasaContigo;", caja);
    const embebidas = caja.__K.FICHAS.flatMap((g) => g.fichas);
    assert.ok(embebidas.length >= 12);
    for (const f of embebidas) assert.ok(ids.has(f.id), `la ficha ${f.id} no está en biblioteca.json`);
    assert.ok(embebidas.some((f) => f.id === "ciclos-y-neurodivergencia"));
    for (const f of embebidas) assert.doesNotMatch(f.titulo, /\bley\b|art[ií]culo|\d{4} de \d{4}/i, `título con ley: ${f.titulo}`);
    assert.doesNotMatch(visible(casa), /\bLey \d/);
    const s = tramo(casa, 'id="sala-biblioteca"', "</section>");
    for (const t of ["El cerebro afirmativo del niño", "Daniel J. Siegel y Tina Payne Bryson", "Wonderfully Wired Brains"]) assert.ok(s.includes(t), `falta «${t}»`);
  });

  test("refugio: El vaso, chequeo por el chat y respiración de 1 minuto que se puede detener", () => {
    const s = tramo(casa, 'id="sala-refugio"', "</section>");
    assert.ok(s.includes('href="recursos/el-vaso.html"'));
    assert.ok(s.includes('href="/#chequeo"') /* spec 2026-11-10: el chequeo abre directo */ && s.includes("Chequeo de tu bienestar"));
    assert.match(s, /id="b-respirar" aria-pressed="false">Empezar 1 minuto/);
    const js = tramo(casa, "/* === CASA CONTIGO · PANTALLA === */", "/* === FIN CASA CONTIGO · PANTALLA === */");
    assert.match(js, /resp\.restante = 60/);
    assert.match(js, /if \(resp\.activo\) pararRespiracion\(false\); else empezarRespiracion\(\);/);
    assert.match(js, /if \(resp\.activo && sala !== 'refugio'\) pararRespiracion\(false\);/, "la respiración se detiene al salir de la sala");
  });

  test("misma barra de seguridad, mismo CSS y JS del caparazón; sin red; acción en morado (nunca verde)", () => {
    assert.equal(cssCap(casa), cssCap(asy), "CSS del caparazón distinto");
    assert.equal(jsCap(casa), jsCap(asy), "JS del caparazón distinto");
    assert.equal(tramo(casa, ...ABAJO), tramo(asy, ...ABAJO), "barra y capas distintas");
    for (const b of ["Pausa", "Calma", "Necesito ayuda", "Salir"]) assert.ok(tramo(casa, ...ABAJO).includes(`</svg>${b}</button>`));
    assert.deepEqual(lineas(casa, /http-equiv="Content-Security-Policy"/), lineas(asy, /http-equiv="Content-Security-Policy"/));
    for (const patron of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket/, /<img\b/i, /<iframe\b/i, /<video\b/i, /<audio\b/i]) assert.doesNotMatch(casa, patron, `encontré ${patron}`);
    const principal = cssCap(casa).match(/--principal: (#[0-9A-Fa-f]{6})/)[1];
    const h = tono(principal);
    assert.ok(h !== null && !(h >= 75 && h <= 175), `la acción es verde: ${principal}`);
    assert.doesNotMatch(tramo(casa, "/* ===== Casa Contigo ===== */", "</style>"), /\.c-boton[^{]*\{[^}]*background:\s*#(1F7A55|4DAB81)/i);
  });
});

describe("Sus ciclos, su ritmo · la pieza", () => {
  test("el caparazón (CSS, JS, HTML de arriba y de abajo, símbolos i-*, política y fuente) es IDÉNTICO al de «Así soy yo»", () => {
    assert.equal(cssCap(ciclos), cssCap(asy), "CSS del caparazón distinto");
    assert.equal(jsCap(ciclos), jsCap(asy), "JS del caparazón distinto");
    assert.ok([...ciclos.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].includes(jsCap(ciclos)), "el JS del caparazón no está en el primer <script>");
    for (const par of [ARRIBA, ABAJO]) assert.equal(tramo(ciclos, ...par), tramo(asy, ...par), `HTML distinto: ${par[0]}`);
    assert.deepEqual(lineas(ciclos, /^<symbol id="i-/).filter((l) => !l.includes('id="i-flecha"')), lineas(asy, /^<symbol id="i-/), "símbolos i-* distintos");
    assert.deepEqual(lineas(ciclos, /http-equiv="Content-Security-Policy"/), lineas(asy, /http-equiv="Content-Security-Policy"/), "política de seguridad distinta");
    assert.deepEqual(lineas(ciclos, /^<link [^>]*fonts\.g/), lineas(asy, /^<link [^>]*fonts\.g/), "carga de la fuente distinta");
    assert.match(ciclos, /C\.iniciar\(\{ vistaAdulto: true/);
  });

  test("guarda en la clave contigo.sus-ciclos (y solo ahí, por el baúl del caparazón)", () => {
    const { C, S, cel } = cargarCiclos();
    assert.equal(S.CLAVE, "sus-ciclos");
    assert.equal(C.PREFIJO + S.CLAVE, "contigo.sus-ciclos");
    const datos = S.marcar(S.vacio(), "2026-11-02", "s", 1);
    assert.equal(C.baul.guardar(S.CLAVE, datos), true);
    assert.deepEqual([...cel.m.keys()], ["contigo.sus-ciclos"]);
    assert.deepEqual(JSON.parse(cel.m.get("contigo.sus-ciclos")), { v: 1, dias: { "2026-11-02": { s: 1 } } });
    assert.deepEqual(plano(S.normalizar(C.baul.leer(S.CLAVE))), plano(datos));
    C.baul.quitar(S.CLAVE);
    assert.equal(cel.m.size, 0, "«Borrar todo el registro» deja el celular sin la clave");
    // La página no toca localStorage por fuera del baúl, ni otras memorias del navegador
    assert.equal(ciclos.split("localStorage").length - 1, jsCap(ciclos).split("localStorage").length - 1);
    for (const patron of [/sessionStorage/, /indexedDB/, /document\.cookie/, /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/]) assert.doesNotMatch(ciclos, patron);
    assert.match(ciclos, /C\.baul\.guardar\(S\.CLAVE, nuevos\)/);
    assert.match(ciclos, /C\.baul\.quitar\(S\.CLAVE\)/);
    assert.match(ciclos, /C\.dobleToque\(\$\('#b-borrar-todo'\)/, "borrar todo pide doble toque");
  });

  test("las 4 partes: prepárala antes, calendario (dolor 1-10, sentidos, ánimo, crisis), lo que se repite y cuándo consultar", () => {
    for (const p of ["prepara", "calendario", "patron", "consultar"]) assert.match(ciclos, new RegExp(`data-pantalla="${p}"`));
    const prep = tramo(ciclos, 'data-pantalla="prepara"', "</section>");
    assert.equal((prep.match(/<li class="t-/g) || []).length, 5, "5 pasos visuales");
    const ed = tramo(ciclos, '<div class="hoja editor"', "</fieldset>\n      <p class=\"estado-guardado\"");
    for (const c of ["s", "d", "n", "a", "c"]) assert.match(ed, new RegExp(`data-campo="${c}"`));
    for (let n = 1; n <= 10; n++) assert.match(ed, new RegExp(`data-valor="${n}">${n}</button>`));
    const cons = tramo(ciclos, 'data-pantalla="consultar"', "</section>");
    assert.match(cons, /Dolor o sangrado muy fuertes/);
    assert.match(cons, /se quiere hacer daño/);
    assert.match(ciclos, /C\.abrirCapa\('c-capa-ayuda'\)/);
  });

  test("solo existen los botones del registro: ningún campo de nombre, documento, EPS ni diagnóstico", () => {
    const campos = [...ciclos.matchAll(/<(input|select)\b[^>]*>/gi)].map((m) => m[0]);
    assert.deepEqual(campos, [], "la pieza no tiene campos de texto");
    assert.deepEqual([...ciclos.matchAll(/<textarea\b[^>]*id="([^"]+)"/g)].map((m) => m[1]), ["texto-manual"]);
  });

  test("el patrón con el ejemplo: 3 ciclos de 28 días y las crisis de los días 23 a 26 (la semana antes)", () => {
    const { S } = cargarCiclos();
    const hoy = "2026-11-10";
    const d = S.ejemplo(hoy);
    assert.ok(Object.keys(d.dias).every((k) => k <= hoy), "el ejemplo no tiene días en el futuro");
    const p = S.patron(d);
    assert.deepEqual(plano(p.inicios), ["2026-09-01", "2026-09-29", "2026-10-27"]);
    assert.equal(p.duracion, 28);
    assert.equal(p.proxima, "2026-11-24");
    assert.equal(p.suficiente, true);
    assert.deepEqual(plano(p.ventana), { desde: 23, hasta: 26, n: 6, de: 9 });
    const fr = plano(S.frases(p)).map((f) => f.texto);
    assert.ok(fr.includes("Las crisis se repiten más en los días 23 a 26 del ciclo: 6 de las 9 crisis anotadas."), fr.join(" | "));
    assert.ok(fr.some((t) => /fueron en la semana antes de la regla/.test(t)));
    assert.ok(fr.some((t) => /dolor anotado es más alto durante la regla/.test(t)));
    assert.match(S.textoRitmo(p), /unos 28 días.*24 de noviembre/);
    const r = S.resumen(d, hoy);
    assert.match(r, /no un diagnóstico/);
    assert.match(r, /Inicios de ciclo: 1 de septiembre, 29 de septiembre, 27 de octubre/);
    assert.doesNotMatch(sinT(r + fr.join(" ")), /tdpm|trastorno|autis|sintoma|%/);
  });

  test("con pocos datos no inventa un patrón; los ciclos se cuentan bien", () => {
    const { S } = cargarCiclos();
    assert.match(S.frases(S.patron(S.vacio()))[0].texto, /Todavía no hay días anotados/);
    let d = S.vacio();
    for (const k of ["2026-10-01", "2026-10-02", "2026-10-03"]) d = S.marcar(d, k, "s", 1);
    d = S.marcar(d, "2026-10-20", "c", 1);
    const p = S.patron(d);
    assert.deepEqual(plano(p.inicios), ["2026-10-01"], "días seguidos de sangrado son un solo inicio");
    assert.equal(p.suficiente, false);
    assert.equal(p.ventana, null);
    assert.match(S.frases(p)[0].texto, /pocos registros/);
    assert.equal(S.diaDelCiclo("2026-10-20", p.inicios), 20);
    assert.equal(S.diaDelCiclo("2026-09-30", p.inicios), null);
    assert.equal(S.diaDelCiclo("2026-12-30", p.inicios), null, "a más de 45 días ya no se cuenta");
    // un día sin anotar en medio de la regla no abre otro ciclo
    d = S.marcar(d, "2026-10-05", "s", 1);
    assert.deepEqual(plano(S.inicios(S.normalizar(d).dias)), ["2026-10-01"]);
  });

  test("entradas raras se limpian y nunca rompen (lo guardado puede venir dañado)", () => {
    const { S } = cargarCiclos();
    for (const raro of [null, undefined, 0, "hola", [], [1], { dias: "x" }, { dias: [] }, { dias: null }]) assert.deepEqual(plano(S.normalizar(raro)), { v: 1, dias: {} });
    const n = plano(S.normalizar(JSON.parse('{"v":9,"dias":{"2026-02-30":{"s":1},"2026-11-01":{"s":1,"d":11,"n":"x","a":"triste","c":"si","otro":5},"2026-11-02":{"d":3.5},"__proto__":{"s":1},"2026-11-03":{"d":0,"n":"alto","c":true},"1999-01-01":{"s":1},"hola":{"s":1}}}')));
    assert.deepEqual(n, { v: 1, dias: { "2026-11-01": { s: 1, a: "triste" }, "2026-11-03": { d: 0, n: "alto", c: 1 } } });
    const muchos = { dias: {} };
    for (let i = 0; i < 700; i++) muchos.dias[S.sumar("2025-01-01", i)] = { s: 0 };
    assert.equal(Object.keys(S.normalizar(muchos).dias).length, S.MAX_DIAS, "guarda como máximo los últimos 500 días");
    assert.deepEqual(plano(S.marcar(S.vacio(), "no-es-fecha", "s", 1)), { v: 1, dias: {} });
    assert.deepEqual(plano(S.marcar(S.vacio(), "2026-11-01", "nombre", "Luna")), { v: 1, dias: {} }, "un campo inventado no entra");
    const conDia = S.marcar(S.vacio(), "2026-11-01", "d", 7);
    assert.deepEqual(plano(S.marcar(conDia, "2026-11-01", "d", null)), { v: 1, dias: {} }, "quitar el único dato borra el día");
    assert.deepEqual(plano(S.quitarDia(conDia, "2026-11-01")), { v: 1, dias: {} });
    assert.equal(S.bonita("2026-11-10"), "martes 10 de noviembre");
  });

  test("lo que se ve no usa palabras prohibidas ni habla de la niña como etiqueta", () => {
    const t = sinT(visible(ciclos));
    for (const re of [/tiene autismo/, /(?<!espectro )\bautista\b/,/\bpadece\b/, /\bsufre\b/, /sintoma/, /anormal/, /\bcurar?\b/, /tdpm/, /trastorno/, /\d+ ?%/]) assert.doesNotMatch(t, re, `encontré ${re}`);
  });
});

describe("Ficha de la biblioteca · ciclos-y-neurodivergencia", () => {
  test("encabezado válido con los 11 campos, id, tema y aval pedidos", () => {
    const { ficha: f, cuerpo } = parsearFicha(ficha);
    assert.ok(f, "sin encabezado");
    for (const c of ["id", "titulo", "fuente", "fecha", "licencia", "idioma", "tema", "cubre", "aval", "url", "estado"]) assert.ok(f[c], `falta ${c}`);
    assert.equal(f.id, "ciclos-y-neurodivergencia");
    assert.equal(f.tema, "bienestar");
    assert.equal(f.idioma, "es");
    assert.equal(f.aval, "pendiente validación Integrar");
    assert.equal(f.estado, "parcial");
    assert.ok(documentoValido(ficha));
    const cabeza = ficha.slice(4, ficha.indexOf("\n---", 4));
    for (const l of cabeza.split("\n")) assert.doesNotMatch(l.replace(/^[a-z]+: /, ""), /: /, `valor con «: »: ${l}`);
    for (const s of ["Qué puede cambiar con el ciclo", "Cómo anticiparle la primera menstruación", "Elegir productos según cómo se sienten", "Registrar el ciclo y el dolor (escala del 1 al 10)", "Cuándo consultar", "Qué no decir", "Cuándo remitir"]) {
      assert.ok(cuerpo.includes(`\n## ${s}\n`) || cuerpo.startsWith(`## ${s}\n`), `falta la sección «${s}»`);
    }
    assert.ok(cuerpo.trimEnd().split("\n## ").pop().startsWith("Cuándo remitir"), "cierra con «Cuándo remitir»");
  });

  test("solo cita lo que respalda el archivo de fuentes (las 3 direcciones y los 4 autores)", () => {
    const fuentes = fs.readFileSync(RUTA_FUENTES, "utf8");
    const urls = [...ficha.matchAll(/https?:\/\/[^\s)\]]+/g)].map((m) => m[0].replace(/[.,;]$/, ""));
    assert.ok(urls.length >= 3);
    for (const u of urls) assert.ok(fuentes.includes(u), `dirección que no está en las fuentes: ${u}`);
    for (const a of ["Ellis", "Skommer", "Broughton", "Child Mind Institute"]) { assert.ok(ficha.includes(a)); assert.ok(fuentes.includes(a)); }
    assert.doesNotMatch(ficha, /\b(9,8|31,4|41,1) ?%/, "no repite las cifras de TDPM");
    assert.doesNotMatch(sinT(ficha), /tiene autismo|padece|\bsufre\b|sintoma|dosis de|mg\b/);
  });

  test("biblioteca.json está al día con la ficha (si falla: npm run biblioteca)", () => {
    const json = JSON.parse(fs.readFileSync(path.join(APP, "biblioteca.json"), "utf8"));
    const a = json.archivos.find((x) => x.ruta === "bienestar/ciclos-y-neurodivergencia.md");
    assert.ok(a, "la ficha no está en biblioteca.json");
    assert.equal(a.contenido, ficha);
  });
});
