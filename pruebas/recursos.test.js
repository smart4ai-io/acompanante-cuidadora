// recursos.test.js · pruebas de las piezas de «Recursos» (empieza con «Así soy yo»), sin navegador y sin dependencias.
// Correr desde app\:  node --test pruebas/recursos.test.js
//
// Qué revisa: peso, que no existan campos de datos que identifiquen a la niña, palabras prohibidas,
// el caparazón común, cero llamadas de red, letra y botones mínimos, y que el enlace (#) y el QR
// se arman bien (el código del caparazón y del codec se corre aquí mismo, aislado, con node:vm).
// Regla: estas pruebas no se editan para que pasen; si fallan, se arregla la página.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUTA = path.join(APP, "public", "recursos", "asi-soy-yo.html");
const html = fs.readFileSync(RUTA, "utf8");
const PESO = fs.statSync(RUTA).size;

const INI = "/* === CARAPAZON CONTIGO v1 === */";
const FIN = "/* === FIN CARAPAZON CONTIGO v1 === */";
const INI_CODEC = "/* === ASI SOY YO · DATOS Y CODEC === */";
const FIN_CODEC = "/* === FIN ASI SOY YO · DATOS Y CODEC === */";

// Utilidades
const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function bloque(texto, ini, fin) {
  const a = texto.indexOf(ini);
  const b = texto.indexOf(fin, a + ini.length);
  assert.ok(a >= 0 && b > a, `no encontré el bloque ${ini}`);
  return texto.slice(a, b + fin.length);
}
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const estilos = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const jsCaparazon = bloque(scripts.find((s) => s.includes(INI)) || "", INI, FIN);
const jsCodec = bloque(scripts.find((s) => s.includes(INI_CODEC)) || "", INI_CODEC, FIN_CODEC);
const visible = (fragmento) => fragmento.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");

// Corre el caparazón + el codec en una caja aislada (sin DOM): solo funciones puras
const caja = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(jsCaparazon + "\n" + jsCodec + "\n;globalThis.__C = Contigo; globalThis.__A = AsiSoyYo;", caja);
const C = caja.__C;
const A = caja.__A;
const plano = (x) => JSON.parse(JSON.stringify(x)); // quita los prototipos de la caja para comparar

describe("Así soy yo · la página", () => {
  test("pesa 300 KB o menos", () => {
    assert.ok(PESO <= 300 * 1024, `pesa ${PESO} bytes`);
  });

  test("no existe ningún campo de nombre, documento, EPS ni diagnóstico (solo apodo, nota y casilla)", () => {
    const campos = [...html.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((m) => m[0]);
    assert.ok(campos.length > 0, "debería haber al menos el campo del apodo");
    for (const c of campos) {
      const attrs = [...c.matchAll(/\b(id|name|placeholder|aria-label|autocomplete|type)="([^"]*)"/gi)].map((m) => sinTildes(m[2])).join(" ");
      assert.doesNotMatch(attrs, /nombre|documento|cedula|\beps\b|diagnos|telefono|correo|email/, `campo sospechoso: ${c}`);
    }
    const ids = campos.map((c) => (c.match(/\bid="([^"]+)"/) || [])[1]).sort();
    assert.deepEqual(ids, ["acepto", "apodo", "nota", "texto-manual"]);
    const etiquetas = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)].map((m) => sinTildes(visible(m[1])));
    for (const e of etiquetas) assert.doesNotMatch(e, /nombre|documento|cedula|\beps\b|diagnos/, `etiqueta sospechosa: ${e}`);
  });

  test("no usa ni menciona bancos de dibujos con otra licencia", () => {
    assert.doesNotMatch(html, /arasaac|sclera|openmoji|mulberry/i);
  });

  test("no contiene «tiene autismo», «síntoma» ni «evaluación sensorial»", () => {
    const t = sinTildes(html);
    for (const prohibida of ["tiene autismo", "sintoma", "evaluacion sensorial"]) assert.ok(!t.includes(prohibida), `contiene «${prohibida}»`);
  });

  test("la pantalla de entrada no dice «sensorial»", () => {
    const inicio = bloque(html, 'id="pantalla-inicio"', "<!-- FIN pantalla-inicio -->");
    assert.doesNotMatch(sinTildes(visible(inicio)), /sensorial/);
  });

  test("trae el caparazón común delimitado en CSS y en JS", () => {
    const veces = html.split(INI).length - 1;
    const fines = html.split(FIN).length - 1;
    assert.ok(veces >= 2 && fines >= 2, `marcas: ${veces} inicio, ${fines} fin`);
    assert.ok(estilos.includes(INI) && estilos.includes(FIN), "falta el bloque CSS");
    assert.match(jsCaparazon, /var PREFIJO = 'contigo\.'/);
  });

  test("textos fijos: sello, «no es una evaluación» y 106 / 123 en la tarjeta de ayuda", () => {
    assert.ok(html.includes("Prototipo · datos de ejemplo"));
    assert.ok(html.includes("Esto lo cuenta la familia; no es una evaluación."));
    const ayuda = bloque(html, 'id="c-capa-ayuda"', 'id="c-capa-salir"');
    assert.match(ayuda, /<strong>106<\/strong>/);
    assert.match(ayuda, /<strong>123<\/strong>/);
    assert.match(ayuda, /no llama ni envía nada/);
  });

  test("la única dirección externa es la fuente (fonts.googleapis / fonts.gstatic)", () => {
    const posiciones = [...html.matchAll(/http/gi)].map((m) => m.index);
    assert.ok(posiciones.length > 0);
    for (const i of posiciones) {
      if (html.startsWith('http-equiv="Content-Security-Policy"', i)) continue; // nombre de atributo, no una dirección
      assert.match(html.slice(i, i + 40), /^https:\/\/fonts\.(googleapis|gstatic)\.com/, `dirección no permitida: ${html.slice(i, i + 60)}`);
    }
  });

  test("cero llamadas de red desde el código (y la política de seguridad lo impide)", () => {
    for (const patron of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket/, /EventSource/, /\bimport\s*\(/, /<img\b/i, /<iframe\b/i, /<audio\b/i, /<video\b/i, /\bsrc=/i]) {
      assert.doesNotMatch(html, patron, `encontré ${patron}`);
    }
    const urls = [...estilos.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);
    for (const u of urls) assert.match(u, /^#/, `url() externa en CSS: ${u}`);
    assert.match(html, /Content-Security-Policy[^>]*connect-src 'none'/);
  });

  test("sin sonido al cargar: solo habla dentro de la función «decir» (un toque)", () => {
    assert.doesNotMatch(html, /autoplay/i);
    assert.equal(html.split(".speak(").length - 1, 1);
    assert.match(jsCaparazon, /decir: function[\s\S]*?s\.speak\(u\)/);
  });

  test("el guardado en el celular vive solo en el baúl del caparazón (con try/catch)", () => {
    const total = html.split("localStorage").length - 1;
    const enCaparazon = jsCaparazon.split("localStorage").length - 1;
    assert.ok(total > 0 && total === enCaparazon, `localStorage fuera del baúl: ${total - enCaparazon}`);
    const baul = bloque(jsCaparazon, "var baul = {", "\n  };");
    for (const linea of baul.split("\n").filter((l) => l.includes("localStorage"))) assert.match(linea, /try \{|var ls = window\.localStorage/, `sin try: ${linea.trim()}`);
  });

  test("letra de 17 px o más y alturas mínimas de 44 px en el CSS", () => {
    const letras = [...estilos.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    assert.ok(letras.length > 10);
    for (const n of letras) assert.ok(n >= 17, `letra de ${n} px`);
    const altos = [...estilos.matchAll(/min-height:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    for (const n of altos) assert.ok(n >= 44, `alto mínimo de ${n} px`);
  });
});

describe("Así soy yo · el enlace (#) ida y vuelta", () => {
  test("el ejemplo (Luna) va y vuelve igual, con y sin «#»", () => {
    const ej = A.ejemplo();
    const frag = A.codificar(ej);
    assert.match(frag, /^a1\.[A-Za-z0-9_-]+$/);
    for (const entrada of [frag, "#" + frag, "#" + frag + ".", "#" + frag + ")"]) {
      const r = A.decodificar(entrada);
      assert.ok(r, `no decodificó ${entrada.slice(-6)}`);
      assert.deepEqual(plano(r.perfil), plano(ej));
      assert.equal(r.ejemplo, false);
    }
    assert.equal(A.decodificar(A.codificar(ej, { ejemplo: true })).ejemplo, true);
    assert.ok(frag.length < 250, `enlace del ejemplo muy largo: ${frag.length}`);
  });

  test("tildes, ñ, emoji y comillas van y vuelven", () => {
    const p = A.perfilVacio();
    p.apodo = "Ñaña 🌙";
    p.tarjetas.calma = { opciones: ["luz", "silencio"], nota: 'Café ☕, "mamá" <b>y</b> canción' };
    const r = A.decodificar(A.codificar(p));
    assert.equal(r.perfil.apodo, "Ñaña 🌙");
    assert.deepEqual(plano(r.perfil.tarjetas.calma), { opciones: ["silencio", "luz"], nota: 'Café ☕, "mamá" <b>y</b> canción' });
  });

  test("recorta: apodo a 20 letras, nota a 60, máximo 3 opciones, ids desconocidos fuera", () => {
    const p = A.perfilVacio();
    p.apodo = "x".repeat(40);
    p.tarjetas.desborda = { opciones: ["ruido", "gente", "luz", "cambios", "ropa", "inventada"], nota: "n".repeat(100) };
    const r = A.decodificar(A.codificar(p)).perfil;
    assert.equal(r.apodo.length, 20);
    assert.equal(r.tarjetas.desborda.nota.length, 60);
    assert.deepEqual(plano(r.tarjetas.desborda.opciones), ["ruido", "gente", "luz"]);
  });

  test("el perfil vacío también va y vuelve", () => {
    const r = A.decodificar(A.codificar(A.perfilVacio()));
    assert.deepEqual(plano(r.perfil), plano(A.perfilVacio()));
  });

  test("enlaces dañados devuelven null (nunca revientan)", () => {
    const bueno = A.codificar(A.ejemplo());
    const malos = [null, undefined, "", "#", "#a1.", "a1.", "#a2." + bueno.slice(3), "#a1.@@@@", "#a1." + bueno.slice(3, -3), bueno + "AAAA", "#principal"];
    for (const m of malos) assert.equal(A.decodificar(m), null, `debió fallar: ${String(m).slice(0, 20)}`);
    // banderas inválidas (2) y opciones fuera de rango (64)
    const crudo = C.enlace.desempaquetar("a1", bueno);
    const conBandera = crudo.slice(); conBandera[0] = 2;
    assert.equal(A.decodificar(C.enlace.empaquetar("a1", conBandera)), null);
    const conMascara = crudo.slice(); conMascara[2 + crudo[1]] = 64;
    assert.equal(A.decodificar(C.enlace.empaquetar("a1", conMascara)), null);
  });

  test("500 enlaces al azar: nunca lanzan error y lo que decodifican es válido", () => {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let semilla = 7;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 500; i++) {
      let s = "a1.";
      const n = Math.floor(azar() * 120);
      for (let k = 0; k < n; k++) s += abc[Math.floor(azar() * abc.length)];
      const r = A.decodificar(s);
      if (r) {
        assert.ok(r.perfil.apodo.length <= 20);
        for (const T of A.TARJETAS) assert.ok(r.perfil.tarjetas[T.id].opciones.length <= 3);
      }
    }
  });

  test("6 notas largas siguen dando un enlace manejable (≤ 600 caracteres)", () => {
    const p = A.ejemplo();
    for (const T of A.TARJETAS) p.tarjetas[T.id].nota = "a".repeat(60);
    const frag = A.codificar(p);
    assert.ok(frag.length <= 600, `largo ${frag.length}`);
  });

  test("mensaje para el papá sin la palabra «autismo»; empieza por su hija", () => {
    const papa = A.plantillas.papa("Luna", "X");
    assert.ok(papa.startsWith("Te mando cómo es Luna y qué la calma"));
    assert.doesNotMatch(papa, /autis/i);
    assert.doesNotMatch(A.plantillas.maestra("Luna", "X"), /autis/i);
  });
});

describe("Caparazón · base64url y QR propio", () => {
  test("base64url ida y vuelta con todos los bytes", () => {
    const todos = Array.from({ length: 256 }, (_, i) => i);
    const t = C.bytes.aBase64url(todos);
    assert.match(t, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(plano(C.bytes.deBase64url(t)), todos);
    assert.equal(C.bytes.deBase64url("A"), null);
    assert.equal(C.bytes.deBase64url("ab+c"), null);
  });

  // Lee la información de formato del QR (dos copias) y la valida con el código BCH de la norma
  function formatosValidos() {
    const set = new Set();
    for (let dato = 0; dato < 32; dato++) {
      let r = dato;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      set.add(((dato << 10) | r) ^ 0x5412);
    }
    return set;
  }
  function leerFormato(m, t) {
    let a = 0, b = 0;
    const bit = (v, i) => (v ? 1 << i : 0);
    for (let i = 0; i <= 5; i++) a |= bit(m[i][8], i);
    a |= bit(m[7][8], 6) | bit(m[8][8], 7) | bit(m[8][7], 8);
    for (let i = 9; i < 15; i++) a |= bit(m[8][14 - i], i);
    for (let i = 0; i < 8; i++) b |= bit(m[8][t - 1 - i], i);
    for (let i = 8; i < 15; i++) b |= bit(m[t - 15 + i][8], i);
    return [a, b];
  }
  function buscadorBien(m, x0, y0) {
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
      const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      if (m[y0 + dy][x0 + dx] !== (d !== 2)) return false;
    }
    return true;
  }

  test("el QR tiene buscadores, sincronía, módulo oscuro y formato válidos (varios tamaños)", () => {
    const validos = formatosValidos();
    const base = "https://ejemplo.invalid/recursos/asi-soy-yo.html#";
    for (const largo of [1, 20, 80, 150, 300, 600]) {
      const texto = base + "x".repeat(largo);
      const q = C.qr.matriz(texto);
      assert.ok(q, `sin QR para ${largo}`);
      const t = q.tamano, m = q.modulos;
      assert.equal(t, q.version * 4 + 17);
      assert.ok(buscadorBien(m, 0, 0) && buscadorBien(m, t - 7, 0) && buscadorBien(m, 0, t - 7), "buscadores");
      for (let i = 8; i < t - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
      assert.equal(m[t - 8][8], true, "módulo oscuro");
      const [a, b] = leerFormato(m, t);
      assert.equal(a, b, "las dos copias del formato coinciden");
      assert.ok(validos.has(a), "formato con BCH válido");
      const datos = (a ^ 0x5412) >>> 10;
      assert.equal(datos & 7, q.mascara);
      assert.equal(datos >>> 3, q.nivel === "M" ? 0 : 1);
    }
    assert.match(C.qr.svg(base + "a1.AAAA", "QR"), /^<svg viewBox="0 0 \d+ \d+" role="img" aria-label="QR"/);
  });
});

// ===== «El vaso» (pieza 2 de la Ola 1) · 2026-11-08 =====
// Revisa: peso, palabras prohibidas y cifras, rótulo fijo, caparazón IDÉNTICO al de «Así soy yo»,
// cero red, que no guarda nada (solo el ajuste del caparazón), y la lógica de las dos vistas (3 acciones).
describe("el-vaso", () => {
  const RUTA_V = path.join(APP, "public", "recursos", "el-vaso.html");
  const hv = fs.readFileSync(RUTA_V, "utf8");
  const scriptsV = [...hv.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const estilosV = [...hv.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const jsCapV = bloque(scriptsV.find((s) => s.includes(INI)) || "", INI, FIN);
  const jsDatosV = bloque(scriptsV.find((s) => s.includes("/* === EL VASO · DATOS === */")) || "", "/* === EL VASO · DATOS === */", "/* === FIN EL VASO · DATOS === */");
  const cajaV = vm.createContext({});
  vm.runInContext(jsDatosV + "\n;globalThis.__V = ElVaso;", cajaV);
  const V = cajaV.__V;
  const VISTAS = ["maestra", "familia"];
  // Todos los textos que la página puede mostrar: HTML visible + datos (momentos, ajustes, frases, mensajes)
  const textosDatos = () => {
    const t = [V.MENSAJE, ...V.FRASES_MASCARA];
    for (const id of VISTAS) {
      const v = V.VISTAS[id];
      t.push(v.etiqueta, v.titulo, v.bajada, v.explica, v.bajadaBajar, v.tituloAcciones, v.otroLado);
      if (v.base) t.push(v.base.titulo, v.base.frase);
      if (v.final) t.push(v.final.titulo, v.final.frase, v.casiLleno.titulo, v.casiLleno.bajada);
      for (const x of v.momentos) t.push(x.titulo, x.frase);
      for (const x of v.ajustes) t.push(x.titulo, x.accion);
      for (const d of V.MENSAJES[id]) t.push(d.boton, d.texto("X"));
    }
    return t.join("\n");
  };

  test("pesa 300 KB o menos", () => {
    const peso = fs.statSync(RUTA_V).size;
    assert.ok(peso <= 300 * 1024, `pesa ${peso} bytes`);
  });

  test("no contiene «síntoma», «tiene autismo», «detectar», «trastorno» ni «igual de común»", () => {
    const t = sinTildes(hv);
    for (const prohibida of ["sintoma", "tiene autismo", "detectar", "trastorno", "igual de comun"]) assert.ok(!t.includes(prohibida), `contiene «${prohibida}»`);
  });

  test("no cita cifras (ni porcentajes, ni «X de cada Y», ni «N a 1»)", () => {
    const t = visible(hv) + "\n" + textosDatos();
    assert.doesNotMatch(t, /\d\s*%|por ciento|\d+\s+de\s+cada\s+\d+|\b\d+\s*a\s*1\b|\d+\s*:\s*1\b/i);
  });

  test("rótulo fijo «Es una imagen para entender, no una medida» en el vaso, la máscara y el cierre", () => {
    const R = "Es una imagen para entender, no una medida.";
    for (const p of ["mascara", "vaso", "acciones"]) {
      const sec = bloque(hv, `data-pantalla="${p}"`, "</section>");
      assert.ok(sec.includes(R), `falta el rótulo en la pantalla ${p}`);
    }
    assert.ok(bloque(hv, 'id="escenario"', 'id="panel-llenar"').includes(R), "el rótulo debe ir junto al vaso");
    assert.ok(hv.includes("Prototipo · datos de ejemplo"), "falta el sello");
  });

  test("el caparazón es IDÉNTICO al de «Así soy yo» (CSS, JS, HTML, símbolos, seguridad y fuente)", () => {
    assert.equal(bloque(estilosV, INI, FIN), bloque(estilos, INI, FIN), "CSS distinto");
    assert.equal(jsCapV, jsCaparazon, "JS distinto");
    for (const [a, b] of [["<!-- === CARAPAZON CONTIGO v1 · HTML (fondo, cabecera, sello) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (arriba) === -->"], ["<!-- === CARAPAZON CONTIGO v1 · HTML (barra fija y capas) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (abajo) === -->"]]) {
      assert.equal(bloque(hv, a, b), bloque(html, a, b), `HTML distinto: ${a}`);
    }
    const lineas = (t, re) => t.split("\n").filter((l) => re.test(l));
    assert.deepEqual(lineas(hv, /^<symbol id="i-/), lineas(html, /^<symbol id="i-/), "símbolos i-* distintos");
    assert.deepEqual(lineas(hv, /http-equiv="Content-Security-Policy"/), lineas(html, /http-equiv="Content-Security-Policy"/), "política de seguridad distinta");
    assert.deepEqual(lineas(hv, /^<link [^>]*fonts\.g/), lineas(html, /^<link [^>]*fonts\.g/), "carga de la fuente distinta");
    assert.match(hv, /\b(Contigo|C)\.iniciar\(\{ vistaAdulto: true/);
  });

  test("la única dirección externa es la fuente (fonts.googleapis / fonts.gstatic)", () => {
    const posiciones = [...hv.matchAll(/http/gi)].map((m) => m.index);
    assert.ok(posiciones.length > 0);
    for (const i of posiciones) {
      if (hv.startsWith('http-equiv="Content-Security-Policy"', i)) continue;
      assert.match(hv.slice(i, i + 40), /^https:\/\/fonts\.(googleapis|gstatic)\.com/, `dirección no permitida: ${hv.slice(i, i + 60)}`);
    }
  });

  test("cero llamadas de red desde el código (y la política de seguridad lo impide)", () => {
    for (const patron of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket/, /EventSource/, /\bimport\s*\(/, /<img\b/i, /<iframe\b/i, /<audio\b/i, /<video\b/i, /\bsrc=/i]) {
      assert.doesNotMatch(hv, patron, `encontré ${patron}`);
    }
    for (const u of [...estilosV.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1])) assert.match(u, /^#/, `url() externa en CSS: ${u}`);
    assert.match(hv, /Content-Security-Policy[^>]*connect-src 'none'/);
  });

  test("no guarda nada: el único guardado es el del caparazón (ajustes), la pieza no toca el almacenamiento", () => {
    const total = hv.split("localStorage").length - 1;
    const enCaparazon = jsCapV.split("localStorage").length - 1;
    assert.equal(total, enCaparazon, `localStorage fuera del caparazón: ${total - enCaparazon}`);
    const pieza = scriptsV.filter((s) => !s.includes(INI)).join("\n");
    for (const patron of [/sessionStorage/, /indexedDB/, /document\.cookie/, /baul\.(guardar|quitar|borrarTodo)/, /cambiarAjuste/, /caches\./]) assert.doesNotMatch(pieza, patron, `la pieza guarda algo: ${patron}`);
  });

  test("sin sonido al cargar y sin campos de datos personales", () => {
    assert.doesNotMatch(hv, /autoplay/i);
    assert.equal(hv.split(".speak(").length - 1, 1);
    const campos = [...hv.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((m) => m[0]);
    assert.deepEqual(campos.map((c) => (c.match(/\bid="([^"]+)"/) || [])[1]), ["texto-manual"], "solo el texto de copia manual");
    assert.match(campos[0], /readonly/);
  });

  test("letra de 17 px o más y alturas mínimas de 44 px en el CSS", () => {
    const letras = [...estilosV.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    assert.ok(letras.length > 10);
    for (const n of letras) assert.ok(n >= 17, `letra de ${n} px`);
    for (const n of [...estilosV.matchAll(/min-height:\s*([\d.]+)px/g)].map((m) => Number(m[1]))) assert.ok(n >= 44, `alto mínimo de ${n} px`);
  });

  test("entrada por #maestra y #familia (y nada más)", () => {
    assert.equal(V.vistaDeHash("#maestra"), "maestra");
    assert.equal(V.vistaDeHash("#familia"), "familia");
    assert.equal(V.vistaDeHash("maestra"), "maestra");
    for (const malo of ["", "#", "#principal", "#a1.AAAA", "#constructor", "#__proto__", "#toString", null, undefined]) assert.equal(V.vistaDeHash(malo), null, `debió ignorar ${malo}`);
    assert.ok(hv.includes('data-vista="maestra"') && hv.includes("Soy maestra"));
    // 2026-11-10 (auditoría H-13): «Soy papá / familia» → «Soy de su familia».
    assert.ok(hv.includes('data-vista="familia"') && hv.includes("Soy de su familia"));
    assert.ok(!hv.includes("Soy papá"));
  });

  test("vista colegio: timbre, filas, descanso, cambio de salón, luces y trabajo en grupo; vista 5 p. m.: viaje, ruido, preguntas, comida y tarea", () => {
    assert.deepEqual(plano(V.VISTAS.maestra.momentos.map((x) => x.id)), ["timbre", "filas", "descanso", "cambio", "luces", "grupo"]);
    assert.deepEqual(plano(V.VISTAS.familia.momentos.map((x) => x.id)), ["viaje", "ruido", "preguntas", "comida", "tarea"]);
    for (const id of VISTAS) for (const x of V.VISTAS[id].momentos) {
      assert.ok(x.titulo && x.frase && x.frase.length <= 70, `frase larga o vacía: ${x.id}`);
      assert.ok(hv.includes(`<symbol id="${x.icono}"`), `falta el dibujo ${x.icono}`);
    }
  });

  test("el vaso rebosa solo al final del recorrido, en las dos vistas", () => {
    for (const id of VISTAS) {
      const v = V.VISTAS[id], ids = v.momentos.map((x) => x.id);
      assert.ok(V.rebosa(V.nivelCon(v, ids, true)), `${id}: no rebosa al final`);
      assert.ok(!V.rebosa(V.nivelCon(v, ids.slice(0, -1), false)), `${id}: rebosa antes de tiempo`);
      if (v.final) assert.ok(!V.rebosa(V.nivelCon(v, ids, false)), `${id}: rebosa antes de la gota final`);
      assert.ok(!V.rebosa(V.nivelCon(v, [], false)), `${id}: empieza rebosando`);
      assert.equal(V.enPalabras(V.nivelCon(v, ids, true)), "rebosando");
    }
    assert.equal(V.MENSAJE, "No es mala crianza ni capricho: el vaso venía lleno.");
  });

  test("lo que baja el vaso: cada ajuste baja el nivel y con 3 ya no rebosa", () => {
    for (const id of VISTAS) {
      const v = V.VISTAS[id], lleno = V.nivelCon(v, v.momentos.map((x) => x.id), true);
      let antes = V.nivelTrasAjustes(lleno, 0);
      assert.equal(antes, lleno);
      for (let k = 1; k <= 3; k++) { const n = V.nivelTrasAjustes(lleno, k); assert.ok(n < antes, `${id}: el ajuste ${k} no baja`); antes = n; }
      assert.ok(!V.rebosa(antes));
      assert.equal(V.nivelTrasAjustes(lleno, 9), antes, "más de 3 no baja más");
    }
  });

  test("cierra con EXACTAMENTE 3 acciones concretas por vista (sin repetir, ids raros fuera)", () => {
    assert.equal(V.MAX_AJUSTES, 3);
    for (const id of VISTAS) {
      const v = V.VISTAS[id], ids = v.ajustes.map((x) => x.id);
      assert.ok(ids.length >= 3 && new Set(ids).size === ids.length, `${id}: ajustes repetidos o pocos`);
      for (const x of v.ajustes) { assert.ok(x.accion.length >= 30 && /\.$/.test(x.accion), `${id}: acción poco concreta «${x.accion}»`); assert.ok(hv.includes(`<symbol id="${x.icono}"`), `falta ${x.icono}`); }
      assert.equal(V.acciones(v, ids.slice(0, 3)).length, 3);
      assert.equal(V.acciones(v, ids).length, 3, "más de 3 se recorta");
      assert.deepEqual(plano(V.acciones(v, [ids[2], ids[2], "inventado", ids[0], ids[4]]).map((x) => x.id)), [ids[2], ids[0], ids[4]]);
      assert.ok(v.tituloAcciones.startsWith("Tus 3 acciones"));
    }
  });

  test("«Mandárselo a…»: mensaje con el enlace a la vista correcta, sin datos y sin «autismo»", () => {
    const base = "https://contigo.ejemplo/recursos/el-vaso.html#maestra";
    for (const id of VISTAS) {
      assert.equal(V.MENSAJES[id].length, 2);
      for (const d of V.MENSAJES[id]) {
        const t = V.mensaje(id, d.id, base);
        assert.ok(t.endsWith("\nhttps://contigo.ejemplo/recursos/el-vaso.html#" + d.abre), `${id}/${d.id}: enlace mal armado`);
        assert.doesNotMatch(t, /autis|diagn|@|\d{5,}/i);
        assert.match(d.boton, /^Mandárselo a (la familia|otra profe|la profe)$/);
      }
    }
    assert.equal(V.mensaje("maestra", "inventado", base), null);
    assert.equal(V.mensaje("otra", "profe", base), null);
  });

  test("intro «La máscara»: 4 frases cortas y saltable; ninguna nombra a una niña concreta", () => {
    assert.equal(V.FRASES_MASCARA.length, 4);
    for (const f of V.FRASES_MASCARA) assert.ok(f.length <= 90, f);
    assert.match(hv, /id="b-mascara-seguir">Saltar</);
    assert.doesNotMatch(textosDatos(), /\b(Luna|Mía|Sofía|Valentina)\b/);
  });
});

// ===== «Así estoy, esto necesito» (asi-estoy.html) =====
describe("asi-estoy", () => {
  const RUTA_AE = path.join(APP, "public", "recursos", "asi-estoy.html");
  const RUTA_ASY = path.join(APP, "public", "recursos", "asi-soy-yo.html");
  const ae = fs.readFileSync(RUTA_AE, "utf8");
  const asy = fs.readFileSync(RUTA_ASY, "utf8");
  const CI = "/* === CARAPAZON CONTIGO v1 === */", CF = "/* === FIN CARAPAZON CONTIGO v1 === */";
  const sinT = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function tramo(texto, ini, fin, desde = 0) {
    const a = texto.indexOf(ini, desde);
    const b = texto.indexOf(fin, a + ini.length);
    assert.ok(a >= 0 && b > a, `no encontré ${ini}`);
    return texto.slice(a, b + fin.length);
  }
  const estilosAE = [...ae.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const scriptsAE = [...ae.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const jsDatos = tramo(ae, "/* === ASI ESTOY · DATOS === */", "/* === FIN ASI ESTOY · DATOS === */");
  const jsNina = tramo(ae, "/* === ASI ESTOY · VISTA NIÑA === */", "/* === FIN ASI ESTOY · VISTA NIÑA === */");
  const seccion = (id) => tramo(ae, `<section class="vista" id="${id}"`, "</section>");
  const cajaAE = vm.createContext({});
  vm.runInContext(jsDatos + "\n;globalThis.__AE = AsiEstoy;", cajaAE);
  const AE = cajaAE.__AE;
  const p = (x) => JSON.parse(JSON.stringify(x));

  test("pesa 300 KB o menos", () => {
    const peso = fs.statSync(RUTA_AE).size;
    assert.ok(peso <= 300 * 1024, `pesa ${peso} bytes`);
  });

  test("el caparazón (CSS, JS, HTML de arriba y de abajo, política y fuente) es idéntico al de «Así soy yo»", () => {
    const cssA = tramo(asy, CI, CF), cssB = tramo(ae, CI, CF);
    assert.equal(cssB, cssA, "CSS del caparazón distinto");
    assert.ok(estilosAE.includes(cssB), "el CSS del caparazón no está dentro de <style>");
    const jsA = tramo(asy, CI, CF, asy.indexOf(cssA) + cssA.length), jsB = tramo(ae, CI, CF, ae.indexOf(cssB) + cssB.length);
    assert.equal(jsB, jsA, "JS del caparazón distinto");
    assert.ok(scriptsAE[0].includes(jsB), "el JS del caparazón no está en el primer <script>");
    for (const [i, f] of [["<!-- === CARAPAZON CONTIGO v1 · HTML (fondo, cabecera, sello) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (arriba) === -->"], ["<!-- === CARAPAZON CONTIGO v1 · HTML (barra fija y capas) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (abajo) === -->"]]) {
      assert.equal(tramo(ae, i, f), tramo(asy, i, f), `HTML distinto: ${i}`);
    }
    const csp = (t) => t.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)[0];
    assert.equal(csp(ae), csp(asy), "política de seguridad distinta");
    assert.match(csp(ae), /connect-src 'none'/);
    for (const s of asy.matchAll(/<symbol id="i-[^"]+"[\s\S]*?<\/symbol>/g)) assert.ok(ae.includes(s[0]), `falta el icono ${s[0].slice(0, 30)}`);
    assert.ok(ae.includes("Prototipo · datos de ejemplo"), "falta el sello");
  });

  test("12 tarjetas en orden fijo, cada una con su dibujo propio y palabra de 1 a 3 palabras", () => {
    const orden = ["pausa", "ruido", "ayuda", "duele", "bano", "sed", "hambre", "sola", "abrazo", "si", "no", "otra"];
    assert.deepEqual(p(AE.IDS), orden, "el orden ES la posición: no se cambia");
    for (const T of AE.TARJETAS) {
      const n = T.palabra.split(/\s+/).length;
      assert.ok(n >= 1 && n <= 3, `«${T.palabra}» tiene ${n} palabras`);
      assert.match(ae, new RegExp(`<symbol id="d-${T.id}" viewBox="0 0 64 64">`), `falta el dibujo d-${T.id}`);
    }
    assert.equal((ae.match(/<symbol id="d-/g) || []).length, 12);
    // el tablero de 12 siempre pinta los 12 lugares: una tarjeta escondida deja su hueco
    assert.match(jsNina, /class="hueco" aria-hidden="true"/);
    assert.match(estilosAE, /\.tablero \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  });

  test("aviso «No reemplaza su sistema de comunicación» en la vista de adulto", () => {
    assert.match(seccion("vista-adulto"), /No reemplaza su sistema de comunicación; si usa uno, sigue con ese\./);
  });

  test("atribución «Dibujos: Contigo (Pulso Mundo + Smart4AI), CC BY 4.0» al pie de la hoja y en la imagen descargable", () => {
    const frase = "Dibujos: Contigo (Pulso Mundo + Smart4AI), CC BY 4.0";
    assert.ok(seccion("vista-aula").includes(frase), "falta en la hoja");
    assert.ok(tramo(ae, "function svgHoja()", "function hojaPNG()").includes(frase), "falta en la imagen PNG");
    assert.match(seccion("vista-aula"), /Descargar hoja/);
    assert.match(seccion("vista-aula"), /o imprime esta página desde tu navegador/);
    assert.match(estilosAE, /@page \{ size: letter portrait/);
  });

  test("la única dirección externa es la fuente (fonts.googleapis / fonts.gstatic)", () => {
    const posiciones = [...ae.matchAll(/http/gi)].map((m) => m.index);
    assert.ok(posiciones.length > 0);
    for (const i of posiciones) {
      if (ae.startsWith('http-equiv="Content-Security-Policy"', i)) continue;
      assert.match(ae.slice(i, i + 40), /^https:\/\/fonts\.(googleapis|gstatic)\.com/, `dirección no permitida: ${ae.slice(i, i + 60)}`);
    }
  });

  test("cero llamadas de red; la única imagen que se carga es la hoja en data:", () => {
    for (const patron of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket/, /EventSource/, /\bimport\s*\(/, /<img\b/i, /<iframe\b/i, /<audio\b/i, /<video\b/i, /\bsrc=/i, /window\.print\s*\(/]) {
      assert.doesNotMatch(ae, patron, `encontré ${patron}`);
    }
    const cargas = [...ae.matchAll(/\.src\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.equal(cargas.length, 1);
    assert.match(cargas[0], /^'data:image\/svg\+xml/);
    for (const u of [...estilosAE.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1])) assert.match(u, /^#/, `url() externa: ${u}`);
  });

  test("no usa ni menciona bancos de dibujos con otra licencia (ARASAAC, OpenMoji, Mulberry, Sclera)", () => {
    assert.doesNotMatch(ae, /arasaac|openmoji|mulberry|sclera/i);
  });

  test("la vista niña no escribe en el celular al tocar tarjetas (ni guarda historial)", () => {
    for (const patron of [/localStorage/, /sessionStorage/, /indexedDB/, /\.guardar\(/, /cambiarAjuste/, /borrarTodo/, /pushState|replaceState/, /location\.hash\s*=/, /document\.cookie/]) {
      assert.doesNotMatch(jsNina, patron, `la vista niña usa ${patron}`);
    }
    // el único guardado de la pieza vive en la vista adulto
    const guardados = [...ae.matchAll(/C\.baul\.guardar\(/g)].length;
    assert.equal(guardados, 1);
    assert.match(tramo(ae, "function guardar() {", "\n  }"), /C\.baul\.guardar\(A\.CLAVE, cfg\)/);
    assert.equal(ae.split("localStorage").length - 1, tramo(ae, CI, CF, ae.indexOf(CF) + CF.length).split("localStorage").length - 1, "localStorage fuera del baúl");
  });

  test("sin sonido al cargar: voz solo con «Escuchar» y el tono solo si el adulto lo enciende", () => {
    assert.doesNotMatch(ae, /autoplay/i);
    assert.equal(ae.split(".speak(").length - 1, 1);
    assert.equal(ae.split("new AC()").length - 1, 1);
    assert.match(jsNina, /function tono\(\) \{[\s\S]*?audio = audio \|\| new AC\(\)/);
    assert.deepEqual([...ae.matchAll(/\btono\(\)/g)].length, 2, "tono() se define y se llama una sola vez");
    assert.match(jsNina, /if \(cfg\.sonido\) tono\(\);/);
    assert.equal(AE.porDefecto(null).sonido, false);
  });

  test("letra ≥ 17 px, alturas ≥ 44 px y tarjetas de la niña ≥ 64 px", () => {
    const letras = [...estilosAE.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    for (const n of letras) assert.ok(n >= 17, `letra de ${n} px`);
    const altos = [...estilosAE.matchAll(/min-height:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    for (const n of altos) assert.ok(n >= 44, `alto mínimo de ${n} px`);
    for (const regla of [/\.carta \{[^}]*min-height: (\d+)px/, /\.tablero\.tres \.carta \{[^}]*min-height: (\d+)px/, /\.sino \.carta \{[^}]*min-height: (\d+)px/, /\.puerta-nina \{[^}]*min-height: (\d+)px/, /\.boton-grande \{[^}]*min-height: (\d+)px/]) {
      const m = estilosAE.match(regla);
      assert.ok(m && Number(m[1]) >= 64, `menos de 64 px: ${regla}`);
    }
  });

  test("cada tarjeta es un botón con nombre accesible (su palabra) y el modo mostrar es un diálogo", () => {
    assert.match(jsNina, /'<button type="button" class="carta t-' \+ T\.color \+ '" data-carta="' \+ T\.id \+ '" aria-describedby="pista-nina">' \+ dibujo\(T\.id\) \+ '<span>' \+ esc\(A\.palabra\(cfg, T\.id\)\) \+ '<\/span><\/button>'/);
    assert.match(ae, /function dibujo\(id, clase\) \{[^\n]*aria-hidden="true"/);
    assert.match(ae, /<div class="mostrar" id="mostrar" role="dialog" aria-modal="true" aria-labelledby="mostrar-palabra" hidden>/);
  });

  test("ajustes del adulto: entradas raras se limpian y nunca rompen", () => {
    const base = p(AE.porDefecto(null));
    for (const raro of [null, undefined, 0, "hola", [], [1, 2], { modo: "3" }, { ocultas: "pausa" }, { palabras: ["x"] }, { voz: "no" }]) {
      const n = p(AE.normalizar(raro, null));
      assert.equal(n.modo, 12);
      assert.deepEqual(n.ocultas, []);
      assert.equal(typeof n.voz, "boolean");
      assert.equal(n.sonido, false);
      if (raro === null || raro === undefined || typeof raro !== "object" || Array.isArray(raro)) assert.deepEqual(n, base);
    }
    const n = p(AE.normalizar({ modo: 3, ocultas: ["otra", "inventada", "pausa"], tres: ["si", "no", "otra", "sed", "ruido", "pausa", "bano"], palabras: { bano: "  Pipí\u0000 ", sed: "", hambre: "Tengo hambre", __proto__: { si: "x" }, no: 5, otra: "z".repeat(40) }, voz: false, sonido: true }, null));
    assert.equal(n.modo, 3);
    assert.deepEqual(n.ocultas, ["pausa", "otra"], "orden fijo y sin ids desconocidos");
    assert.deepEqual(n.tres, ["pausa", "ruido", "bano"], "máximo 3, sin Sí ni No, en orden fijo");
    assert.deepEqual(n.palabras, { bano: "Pipí", otra: "z".repeat(24) }, "limpia, corta a 24 y descarta vacías, iguales o no-texto");
    assert.equal(n.voz, false);
    assert.equal(n.sonido, true);
    assert.equal(AE.palabra(n, "bano"), "Pipí");
    assert.equal(AE.palabra(n, "sed"), "Tengo sed");
  });

  test("punto de partida desde «Así soy yo»: si el ruido la desborda, la voz empieza apagada", () => {
    const conRuido = { v: 1, apodo: "Luna", tarjetas: { desborda: { opciones: ["ruido", "gente"], nota: "" } } };
    assert.equal(AE.porDefecto(conRuido).voz, false);
    assert.equal(AE.porDefecto({ v: 1, tarjetas: { desborda: { opciones: ["gente"] } } }).voz, true);
    assert.equal(AE.porDefecto({ tarjetas: { desborda: { opciones: "ruido" } } }).voz, true, "opciones mal formadas no cuentan");
    assert.equal(AE.porDefecto("basura").voz, true);
    assert.equal(AE.normalizar({ voz: true }, conRuido).voz, true, "lo que eligió el adulto manda");
  });

  test("la hoja en imagen parte las palabras en renglones (máximo 3)", () => {
    assert.deepEqual(p(AE.lineas("Necesito una pausa", 14)), ["Necesito una", "pausa"]);
    assert.deepEqual(p(AE.lineas("Sí", 14)), ["Sí"]);
    assert.deepEqual(p(AE.lineas("", 14)), []);
    assert.ok(AE.lineas("a b c d e f g h i j k l m n o p q r s t u v w x y z", 3).length <= 3);
  });

  test("no contiene «tiene autismo», «síntoma» ni «diagnóstico»", () => {
    const t = sinT(visible(ae));
    for (const prohibida of ["tiene autismo", "sintoma", "diagnostico"]) assert.ok(!t.includes(prohibida), `contiene «${prohibida}»`);
  });
});

// =====================================================================
// Auditoría externa 2026-11-10 (H-03, H-04, H-06, H-07, H-08, H-09, H-11, H-13) · sin navegador.
// El recorrido en Chrome (320, 375 y 412 px) se hace aparte; aquí van las reglas que se pueden fijar.
// =====================================================================
describe("Auditoría 2026-11-10 · caparazón, chat y textos", () => {
  const PUB = path.join(APP, "public");
  const PIEZAS = ["asi-soy-yo", "asi-estoy", "calma", "cuentos", "el-vaso", "mi-dia", "plan-de-tormenta", "ruta-eps", "sus-ciclos"].map((p) => path.join(PUB, "recursos", p + ".html"));
  PIEZAS.push(path.join(PUB, "casa-contigo.html"));
  const index = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  // Un celular de mentira: localStorage en memoria, con la interfaz que usa el baúl.
  function celular(inicial) {
    const m = new Map(Object.entries(inicial));
    return { m, localStorage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } };
  }
  function caparazonCon(h, extra) {
    const s = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]).find((x) => x.includes(INI));
    const cajita = vm.createContext({ TextEncoder, TextDecoder, btoa, atob, ...extra });
    vm.runInContext(bloque(s, INI, FIN) + "\n;globalThis.__C = Contigo;", cajita);
    return cajita.__C;
  }

  test("H-04 · inventario: toda clave que index.html guarda empieza por contigo. o acompanante-cuidadora", () => {
    const claves = [...index.matchAll(/const CLAVE_[A-Z_]+ = "([^"]+)"/g)].map((x) => x[1]);
    assert.ok(claves.includes("acompanante-cuidadora-web-v2"), "falta la clave de la conversación en el inventario");
    assert.ok(claves.length >= 6, claves.join(", "));
    assert.deepEqual(plano(C.PREFIJOS_SITIO), ["contigo.", "acompanante-cuidadora"]);
    for (const k of claves) assert.ok(C.PREFIJOS_SITIO.some((p) => k.startsWith(p)), `clave fuera del borrado total: ${k}`);
    // Las piezas solo guardan por el baúl (contigo.*); ninguna escribe con otra clave.
    for (const ruta of PIEZAS) {
      const h = fs.readFileSync(ruta, "utf8");
      for (const lit of h.matchAll(/localStorage\.setItem\(\s*["']([^"']+)["']/g)) assert.ok(C.PREFIJOS_SITIO.some((p) => lit[1].startsWith(p)), `${path.basename(ruta)} guarda ${lit[1]}`);
    }
  });

  test("H-04 · «Borrar todo» de CADA pieza quita la conversación del chat, los perfiles y lo demás de Contigo (y nada ajeno)", () => {
    const sitio = {
      "acompanante-cuidadora-web-v2": JSON.stringify({ v: 2, conversacion: [{ rol: "yo", texto: "nota ficticia" }] }),
      "acompanante-cuidadora-demo": "1",
      "acompanante-cuidadora-avisos": "[]",
      "contigo.perfil": "{}",
      "contigo.mi-perfil": "{}",
      "contigo.asi-soy-yo": "{}",
      "contigo.ajustes": "{}",
      "contigo.sus-ciclos": "{}",
    };
    for (const ruta of PIEZAS) {
      const cel = celular({ ...sitio, "otra-app.preferencias": "x" });
      const Cx = caparazonCon(fs.readFileSync(ruta, "utf8"), { window: { localStorage: cel.localStorage } });
      assert.equal(Cx.baul.borrarTodo(), Object.keys(sitio).length, path.basename(ruta));
      assert.deepEqual([...cel.m.keys()], ["otra-app.preferencias"], `${path.basename(ruta)} dejó claves de Contigo`);
    }
  });

  test("H-04 · el chat, al volver a la página, no muestra ni vuelve a guardar una conversación borrada en otra página", () => {
    assert.match(index, /function sincronizarConversacion\(\)/);
    assert.match(index, /window\.addEventListener\("pageshow", alVolver\)/);
    assert.match(index, /window\.addEventListener\("storage", alVolver\)/);
  });

  test("H-08 · vista adulta: la tarjeta «Necesito ayuda» tiene tel:123, tel:106 y tel:141 con el número escrito; la petición infantil queda igual", () => {
    for (const ruta of PIEZAS) {
      const h = fs.readFileSync(ruta, "utf8");
      const adulto = bloque(h, '<div id="c-ayuda-adulto">', "</div>");
      for (const n of ["123", "106", "141"]) assert.match(adulto, new RegExp(`<a class="c-tel" href="tel:${n}"[^>]*><strong>${n}</strong>`), `${path.basename(ruta)} sin tel:${n}`);
      const tarjeta = bloque(h, '<div class="c-tarjeta-ayuda">', '<div id="c-ayuda-adulto">');
      assert.match(tarjeta, /<p class="c-pide">Por favor, quédate cerca y háblame despacio\.<\/p>/);
      assert.doesNotMatch(tarjeta, /tel:/, "la parte infantil no lleva números ni enlaces");
    }
    // En «Así estoy», la vista de niña o adolescente sigue escondiendo los números.
    const ae = fs.readFileSync(path.join(PUB, "recursos", "asi-estoy.html"), "utf8");
    assert.match(ae, /numeros\.hidden = n === 'nina'/);
    assert.match(ae, /vistaAdulto: false/);
  });

  test("H-07 · ?desde=chat: el caparazón lo reconoce, «Salir» lleva a /#chat y la flor muestra «Volver al chat»", () => {
    assert.equal(caparazonCon(html, { location: { search: "?desde=chat" } }).desdeChat(), true);
    assert.equal(caparazonCon(html, { location: { search: "?x=1&desde=chat" } }).desdeChat(), true);
    for (const s of ["", "?desde=chatx", "?desde=casa"]) assert.equal(caparazonCon(html, { location: { search: s } }).desdeChat(), false, s);
    assert.match(jsCaparazon, /location\.assign\(desdeChat\(\) \? '\/#chat' : '\/'\)/);
    assert.match(html, /<a class="c-boton" id="b-volver-chat" href="\/#chat" hidden>Volver al chat<\/a>/);
    assert.match(html, /\$\('#b-volver-chat'\)\.hidden = estado\.ejemplo \|\| !C\.desdeChat\(\);/);
    // El chat enlaza «Así soy yo» con ?desde=chat (y ningún enlace del chat a «Así soy yo» queda sin él).
    const delChat = [...index.matchAll(/href="\/recursos\/asi-soy-yo\.html([^"]*)"/g)].map((x) => x[1]);
    assert.ok(delChat.length >= 3, delChat.join(" | "));
    for (const q of delChat) assert.equal(q, "?desde=chat");
  });

  test("H-07 · el chat dice cuántas respuestas tiene el perfil cuando no está lleno", () => {
    assert.match(index, /Tu perfil está listo \(puedes completarlo cuando quieras\)\./);
    assert.match(index, /Listo · \$\{e\.nC\} de \$\{PASOS_CUIDADORA\.length\} respuestas/);
    assert.match(index, /Listo · \$\{e\.nN\} de \$\{TARJETAS_NINA\.length\} tarjetas/);
  });

  test("H-06 · aviso exacto antes del primer mensaje y la sección Seguridad dice lo mismo", () => {
    const AVISO = "Tu conversación y tu perfil se guardan solo en este celular. Para responderte, se envían en cada mensaje y no los guardamos. Si escribes algo de riesgo, queda una alerta sin tu nombre.";
    const bienvenida = bloque(index, '<div class="bienvenida" id="ejemplos">', '<p class="titulito">');
    assert.ok(bienvenida.includes(AVISO), "el aviso no está en la bienvenida del chat");
    assert.match(bienvenida, /<p class="tp-nota" id="avisoPrivacidad">/, "el aviso no debe esconderse con el perfil");
    const seg = bloque(index, 'id="seguridad"', "</section>");
    assert.match(seg, /se guardan solo en este celular\. Para responderte, se envían en cada mensaje y no los guardamos\. Si escribes algo de riesgo, queda una alerta sin tu nombre/);
    assert.doesNotMatch(index, /fragmento corto del mensaje|se guardan solo en tu celular\./);
  });

  test("H-09 · la Biblioteca dice exactamente cuándo cita", () => {
    const casa = fs.readFileSync(path.join(PUB, "casa-contigo.html"), "utf8");
    assert.ok(casa.includes("Cuando Contigo da un dato de Colombia o de una escala, lo saca de estas fichas y cita la fuente; lo demás es orientación general."));
    assert.ok(!casa.includes("responde solo desde estas fichas"));
  });

  test("H-11 · franja de ayuda del inicio: enlaces de 44 px de alto y la franja deja aire (todo lo de arriba usa --alto-franja)", () => {
    assert.match(index, /\.franja-ayuda a \{[^}]*min-height: 44px;/);
    const alto = Number(index.match(/--alto-franja: (\d+)px/)[1]);
    assert.ok(alto >= 48, `la franja mide ${alto} px`);
    for (const regla of [/\.cabecera \{[^}]*top: var\(--alto-franja\)/, /body \{[^}]*padding-top: var\(--alto-franja\)/, /\.cajon \{[^}]*top: calc\(var\(--alto-franja\)/, /body\.en-chat \.app-chat \{[^}]*top: var\(--alto-franja\)/]) assert.match(index, regla);
  });

  test("H-03 · el titular de «Así soy yo» se achica y puede partirse (sin ensanchar la página)", () => {
    assert.match(estilos, /\.pantalla h1 \{ font-size: clamp\(26px, 7\.2vw, 38px\);[^}]*overflow-wrap: anywhere;/);
    assert.match(html, /extra&shy;ordinaria&shy;mente/);
  });

  test("H-13 · textos para la cuidadora sin suponer «mi hija» ni «papá»", () => {
    assert.match(html, /id="b-crear-propia">Crear su perfil</);
    for (const ruta of PIEZAS) {
      const v = sinTildes(visible(fs.readFileSync(ruta, "utf8")));
      for (const f of ["crear la de mi hija", "armar la de mi hija", "soy papa / familia", "soy su papa o familiar", "de tu hija"]) assert.ok(!v.includes(f), `${path.basename(ruta)} dice «${f}»`);
    }
  });
});
