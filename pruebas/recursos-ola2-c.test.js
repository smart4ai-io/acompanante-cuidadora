// recursos-ola2-c.test.js · pruebas de «Lo que va a pasar» (cuentos.html), pieza C de la Ola 2 de «Recursos». Sin navegador y sin dependencias.
// Correr desde app\:  node --test pruebas/recursos-ola2-c.test.js
//
// Qué revisa: peso, caparazón IDÉNTICO al de «Así soy yo», política de seguridad y cero red, palabras y frases prohibidas,
// las 5 historias (6 a 9 páginas, primera persona, sin órdenes ni promesas), «lo que me ayuda» desde el perfil,
// los ajustes del adulto (entradas raras), el enlace #h1 ida y vuelta y que un enlace dañado nunca revienta.
// El código del caparazón y de los datos se corre aquí mismo, aislado, con node:vm.
// Regla: estas pruebas no se editan para que pasen; si fallan, se arregla la página.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUTA = path.join(APP, "public", "recursos", "cuentos.html");
const RUTA_ASY = path.join(APP, "public", "recursos", "asi-soy-yo.html");
const hc = fs.readFileSync(RUTA, "utf8");
const asy = fs.readFileSync(RUTA_ASY, "utf8");

const CI = "/* === CARAPAZON CONTIGO v1 === */";
const CF = "/* === FIN CARAPAZON CONTIGO v1 === */";
const sinT = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function tramo(texto, ini, fin, desde = 0) {
  const a = texto.indexOf(ini, desde);
  const b = texto.indexOf(fin, a + ini.length);
  assert.ok(a >= 0 && b > a, `no encontré ${ini}`);
  return texto.slice(a, b + fin.length);
}
const visible = (f) => f.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
const estilos = [...hc.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const scripts = [...hc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const cssCap = tramo(hc, CI, CF);
const jsCap = tramo(hc, CI, CF, hc.indexOf(cssCap) + cssCap.length);
const jsDatos = tramo(hc, "/* === CUENTOS · DATOS Y CODEC === */", "/* === FIN CUENTOS · DATOS Y CODEC === */");
const jsNina = tramo(hc, "/* === CUENTOS · VISTA NIÑA === */", "/* === FIN CUENTOS · VISTA NIÑA === */");
const detector = tramo(hc, "/* --- Detector de frases", "/* --- fin detector --- */");
const principal = tramo(hc, '<main id="principal"', "</main>");

// Caparazón + datos en una caja aislada (sin DOM)
const caja = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(jsCap + "\n" + jsDatos + "\n;globalThis.__C = Contigo; globalThis.__H = Cuentos;", caja);
const C = caja.__C;
const H = caja.__H;
const p = (x) => JSON.parse(JSON.stringify(x)); // quita los prototipos de la caja para comparar

// Los ids de «Lo que la calma» de «Así soy yo» (se corre su codec para no copiarlos a mano)
const jsCodecAsy = tramo(asy, "/* === ASI SOY YO · DATOS Y CODEC === */", "/* === FIN ASI SOY YO · DATOS Y CODEC === */");
const jsCapAsy = tramo(asy, CI, CF, asy.indexOf(tramo(asy, CI, CF)) + tramo(asy, CI, CF).length);
const cajaA = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(jsCapAsy + "\n" + jsCodecAsy + "\n;globalThis.__A = AsiSoyYo;", cajaA);
const CALMA_ASY = p(cajaA.__A.tarjeta("calma").opciones.map((o) => o.id));

// Todos los textos que puede ver la niña o el adulto: HTML visible de la pieza + datos (historias, ayudas, mensajes, pie)
const textosDatos = () => {
  const t = [H.PIE, H.ATRIBUCION, H.mensaje("Voy al médico", "Luna", "X"), H.sugerencia("debo"), H.sugerencia("no duele")];
  for (const Hi of H.HISTORIAS) { t.push(Hi.titulo); for (const P of Hi.paginas) t.push(P.texto); }
  for (const a of H.AYUDAS) t.push(a.texto);
  return t.join("\n");
};
const sinDetector = hc.replace(detector, " ");

describe("cuentos · la página", () => {
  test("pesa 300 KB o menos", () => {
    const peso = fs.statSync(RUTA).size;
    assert.ok(peso <= 300 * 1024, `pesa ${peso} bytes`);
  });

  test("el caparazón (CSS, JS, HTML de arriba y de abajo, símbolos i-*, política y fuente) es IDÉNTICO al de «Así soy yo»", () => {
    const cssA = tramo(asy, CI, CF);
    assert.equal(cssCap, cssA, "CSS del caparazón distinto");
    assert.ok(estilos.includes(cssCap), "el CSS del caparazón no está dentro de <style>");
    assert.equal(jsCap, jsCapAsy, "JS del caparazón distinto");
    assert.ok(scripts[0].includes(jsCap), "el JS del caparazón no está en el primer <script>");
    for (const [i, f] of [["<!-- === CARAPAZON CONTIGO v1 · HTML (fondo, cabecera, sello) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (arriba) === -->"], ["<!-- === CARAPAZON CONTIGO v1 · HTML (barra fija y capas) === -->", "<!-- === FIN CARAPAZON CONTIGO v1 · HTML (abajo) === -->"]]) {
      assert.equal(tramo(hc, i, f), tramo(asy, i, f), `HTML distinto: ${i}`);
    }
    const lineas = (t, re) => t.split("\n").filter((l) => re.test(l));
    assert.deepEqual(lineas(hc, /^<symbol id="i-/), lineas(asy, /^<symbol id="i-/), "símbolos i-* distintos");
    assert.deepEqual(lineas(hc, /http-equiv="Content-Security-Policy"/), lineas(asy, /http-equiv="Content-Security-Policy"/), "política de seguridad distinta");
    assert.deepEqual(lineas(hc, /^<link [^>]*fonts\.g/), lineas(asy, /^<link [^>]*fonts\.g/), "carga de la fuente distinta");
    assert.ok(hc.includes("Prototipo · datos de ejemplo"), "falta el sello");
    assert.match(hc, /\b(Contigo|C)\.iniciar\(\{ vistaAdulto: false/, "las vistas de niña arrancan con vistaAdulto: false");
  });

  test("política de seguridad: nada de red, ni bases, ni formularios; solo imágenes data:", () => {
    const csp = hc.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)[1];
    for (const parte of ["default-src 'none'", "connect-src 'none'", "img-src data:", "base-uri 'none'", "form-action 'none'", "font-src https://fonts.gstatic.com"]) assert.ok(csp.includes(parte), `falta ${parte}`);
  });

  test("la única dirección externa es la fuente (fonts.googleapis / fonts.gstatic)", () => {
    const posiciones = [...hc.matchAll(/http/gi)].map((m) => m.index);
    assert.ok(posiciones.length > 0);
    for (const i of posiciones) {
      if (hc.startsWith('http-equiv="Content-Security-Policy"', i)) continue;
      assert.match(hc.slice(i, i + 40), /^https:\/\/fonts\.(googleapis|gstatic)\.com/, `dirección no permitida: ${hc.slice(i, i + 60)}`);
    }
  });

  test("cero llamadas de red; la única imagen que se carga es el mini-libro en data:", () => {
    for (const patron of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket/, /EventSource/, /\bimport\s*\(/, /<img\b/i, /<iframe\b/i, /<audio\b/i, /<video\b/i, /\bsrc=/i, /window\.print\s*\(/]) {
      assert.doesNotMatch(hc, patron, `encontré ${patron}`);
    }
    const cargas = [...hc.matchAll(/\.src\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.equal(cargas.length, 1);
    assert.match(cargas[0], /^'data:image\/svg\+xml/);
    for (const u of [...estilos.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1])) assert.match(u, /^#/, `url() externa: ${u}`);
  });

  test("no usa ni menciona bancos de dibujos con otra licencia (ARASAAC, Sclera, OpenMoji, Mulberry)", () => {
    assert.doesNotMatch(hc, /arasaac|sclera|openmoji|mulberry/i);
  });

  test("frases prohibidas en ninguna parte (salvo el detector que las señala al adulto)", () => {
    const t = sinT(sinDetector);
    for (const f of ["portarme bien", "no va a doler", "no llores", "no llorar", "debo portarme", "tiene autismo", "sintoma", "evaluacion sensorial", "menstru", "pubertad"]) assert.ok(!t.includes(f), `contiene «${f}»`);
  });

  test("palabras prohibidas en lo que se ve: «tiene», «parece», órdenes, diagnóstico ni puntajes", () => {
    // El aviso de consentimiento SÍ nombra «diagnóstico» para pedir que no se ponga (igual que «Así soy yo»); se excluye solo esa frase
    const aviso = "no pongas su nombre completo, documento, EPS ni diagnóstico.";
    assert.ok(principal.includes(aviso));
    const t = sinT(visible(principal.replace(aviso, " ")) + "\n" + textosDatos());
    for (const re of [/\btiene\b/, /\bparece\b/, /\bdebo\b/, /\bdebes\b/, /\btengo que\b/, /\btienes que\b/, /\bdiagnostico\b/, /\bpuntaje\b/, /\bpuntos\b/, /\bincorrect/, /\bmal hecho\b/, /\bperdiste\b/, /\bmuy bien\b/, /\bbien hecho\b/]) {
      assert.doesNotMatch(t, re, `encontré ${re}`);
    }
  });

  test("sello, pie «Textos revisados por terapeuta · 2026-11» y atribución CC BY en la página, el mini-libro y la imagen", () => {
    const pie = "Textos revisados por terapeuta · 2026-11";
    assert.equal(H.PIE, pie);
    assert.ok(tramo(hc, '<footer class="pie-pieza"', "</footer>").includes(pie), "falta en el pie de la página");
    const libro = tramo(hc, '<section class="vista" id="vista-libro"', "</section>");
    assert.ok(libro.includes(pie), "falta en el mini-libro");
    assert.ok(libro.includes("Dibujos: Contigo (Pulso Mundo + Smart4AI), CC BY 4.0"), "falta la atribución en el mini-libro");
    const svgL = tramo(hc, "function svgLibro()", "function libroPNG()");
    assert.match(svgL, /Cu\.pie\(/, "la imagen PNG lleva el pie");
    assert.ok(svgL.includes("Dibujos: Contigo (Pulso Mundo + Smart4AI), CC BY 4.0"), "falta la atribución en la imagen");
    assert.match(estilos, /@page \{ size: letter portrait/);
    assert.match(libro, /Descargar imagen/);
    assert.match(libro, /o imprime esta página desde tu navegador/);
    assert.equal(H.pie(true), pie + " · con cambios de la familia");
  });

  test("solo existen los campos del apodo, las páginas, la casilla y la copia manual (nada de nombre, documento, EPS ni diagnóstico)", () => {
    // Incluye los campos que arma el código (el texto de cada página): <textarea id="texto-' + P.id + '" …>
    const campos = [...hc.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((m) => m[0]);
    for (const c of campos) {
      const attrs = [...c.matchAll(/\b(id|name|placeholder|aria-label|autocomplete|type)="([^"]*)"/gi)].map((m) => sinT(m[2])).join(" ");
      assert.doesNotMatch(attrs, /nombre|documento|cedula|\beps\b|diagnos|telefono|correo|email/, `campo sospechoso: ${c}`);
    }
    const ids = campos.map((c) => (c.match(/\bid="([^"]+)"/) || [])[1]).sort();
    assert.deepEqual(ids, ["acepto", "apodo-cuento", "texto-' + P.id + '", "texto-manual"]);
    for (const e of [...hc.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)].map((m) => sinT(visible(m[1])))) assert.doesNotMatch(e, /nombre|documento|cedula|\beps\b|diagnos/, `etiqueta sospechosa: ${e}`);
    assert.match(hc, /id="apodo-cuento"[^>]*maxlength="20"/);
  });

  test("el guardado vive solo en el baúl del caparazón y la pieza guarda una sola cosa (contigo.cuentos, desde la vista adulto)", () => {
    assert.equal(hc.split("localStorage").length - 1, jsCap.split("localStorage").length - 1, "localStorage fuera del baúl");
    assert.equal([...hc.matchAll(/C\.baul\.guardar\(/g)].length, 1);
    assert.match(tramo(hc, "function guardar() {", "\n  }"), /C\.baul\.guardar\(Cu\.CLAVE, cfg\)/);
    assert.equal(H.CLAVE, "cuentos");
    for (const patron of [/sessionStorage/, /indexedDB/, /document\.cookie/, /caches\./]) assert.doesNotMatch(hc, patron);
  });

  test("la vista niña no escribe nada ni deja historial al leer", () => {
    for (const patron of [/localStorage/, /\.guardar\(/, /cambiarAjuste/, /borrarTodo/, /pushState|replaceState/, /location\.hash\s*=/, /document\.cookie/]) {
      assert.doesNotMatch(jsNina, patron, `la vista niña usa ${patron}`);
    }
  });

  test("sin sonido ni movimiento por defecto: voz solo con «Escuchar», sin audio, sin animaciones propias", () => {
    assert.doesNotMatch(hc, /autoplay/i);
    assert.equal(hc.split(".speak(").length - 1, 1);
    assert.doesNotMatch(hc, /AudioContext|\.animate\(/);
    const propio = estilos.replace(cssCap, " ");
    assert.doesNotMatch(propio, /@keyframes|animation:(?!\s*none)|transition:(?!\s*none)/, "la pieza no agrega movimiento");
    assert.ok((hc.match(/class="c-boton texto c-escuchar boton-escuchar" data-voz hidden/g) || []).length >= 2, "«Escuchar» empieza escondido (lo muestra el caparazón si hay voz)");
  });

  test("letra ≥ 17 px, alturas ≥ 44 px y botones de la niña ≥ 64 px", () => {
    const letras = [...estilos.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    assert.ok(letras.length > 10);
    for (const n of letras) assert.ok(n >= 17, `letra de ${n} px`);
    for (const n of [...estilos.matchAll(/min-height:\s*([\d.]+)px/g)].map((m) => Number(m[1]))) assert.ok(n >= 44, `alto mínimo de ${n} px`);
    for (const regla of [/\.boton-grande \{[^}]*min-height: (\d+)px/, /\.libro-boton \{[^}]*min-height: (\d+)px/, /\.puerta-nina \{[^}]*min-height: (\d+)px/, /\.c-boton\.boton-escuchar \{[^}]*min-height: (\d+)px/]) {
      const m = estilos.match(regla);
      assert.ok(m && Number(m[1]) >= 64, `menos de 64 px: ${regla}`);
    }
    const t = estilos.match(/\.pagina-texto \{[^}]*font-size: (\d+)px/);
    assert.ok(t && Number(t[1]) >= 22, "el texto de la página es grande");
  });

  test("un enlace dañado muestra «Este enlace llegó incompleto» (y el ruteo lo usa)", () => {
    assert.match(tramo(hc, '<section class="vista" id="vista-roto"', "</section>"), /Este enlace llegó incompleto/);
    assert.match(hc, /if \(!r\) return vista\('roto'\);/);
    assert.match(hc, /if \(\/\^#h\\d\+\\\.\/\.test\(h\)\) return vista\('roto'\);/);
  });

  test("compartir pasa por el consentimiento: lista de lo que sale, aviso y casilla «Lo revisé y lo comparto yo»", () => {
    const sec = tramo(hc, '<section class="vista" id="vista-compartir"', "</section>");
    assert.match(sec, /id="lista-sale"/);
    assert.match(sec, /no pongas su nombre completo, documento, EPS ni diagnóstico/);
    assert.match(sec, /Lo revisé y lo comparto yo/);
    assert.match(sec, /id="b-crear-enlace" disabled/);
    assert.match(hc, /if \(!\$\('#acepto'\)\.checked\) return;/);
    const m = H.mensaje("Voy al médico", "Luna", "https://x.invalid/recursos/cuentos.html#h1.AA");
    assert.ok(m.endsWith("\nhttps://x.invalid/recursos/cuentos.html#h1.AA"));
    assert.doesNotMatch(m, /autis|diagn/i);
  });
});

describe("cuentos · las 5 historias", () => {
  const PRIMERA = /\b(me|mi|mis|yo|voy|vamos|puedo|siento|sienta|salgo|vuelvo|esperamos|entramos|salimos|nos|estoy|soy|escucho|despido|sentirme)\b/;

  test("5 historias en orden fijo: médico, colegio, pelo, vacuna, fiesta", () => {
    assert.deepEqual(p(H.HISTORIAS.map((x) => x.id)), ["medico", "colegio", "pelo", "vacuna", "fiesta"]);
    for (const Hi of H.HISTORIAS) assert.ok(Hi.titulo && ["menta", "lavanda", "rosa", "arena"].includes(Hi.color), Hi.id);
  });

  test("cada historia tiene de 6 a 9 páginas, ids únicos, un dibujo propio por página y termina en «lo que me ayuda»", () => {
    for (const Hi of H.HISTORIAS) {
      const n = Hi.paginas.length;
      assert.ok(n >= 6 && n <= 9, `${Hi.id}: ${n} páginas`);
      assert.equal(new Set(Hi.paginas.map((P) => P.id)).size, n, `${Hi.id}: ids repetidos`);
      assert.equal(Hi.paginas[n - 1].ayuda, true, `${Hi.id}: la última no es «lo que me ayuda»`);
      assert.equal(Hi.paginas.filter((P) => P.ayuda).length, 1);
      for (const P of Hi.paginas) {
        const id = H.dibujoDe(Hi, P);
        assert.match(hc, new RegExp(`<symbol id="${id}" viewBox="0 0 160 120">`), `falta el dibujo ${id}`);
      }
      assert.equal(Hi.base.length, 3);
    }
    // cada <use> dentro de los dibujos apunta a un símbolo que existe
    const ids = new Set([...hc.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
    const usos = [...hc.matchAll(/<use href="#([a-z0-9-]+)"/gi)].map((m) => m[1]); // los que arma el código con variables no cuentan aquí
    assert.ok(usos.length > 40, `${usos.length} usos`);
    for (const u of usos) assert.ok(ids.has(u), `falta el símbolo ${u}`);
  });

  test("estilo de historia social: frases cortas, una idea por página, primera persona, mayoría descriptivas", () => {
    for (const Hi of H.HISTORIAS) {
      let conPuedo = 0, primera = 0;
      for (const P of Hi.paginas) {
        assert.ok(P.texto.length <= 120, `${Hi.id}/${P.id}: ${P.texto.length} letras`);
        const frases = P.texto.split(/[.!?]+/).filter((f) => f.trim()).length;
        assert.ok(frases >= 1 && frases <= 2, `${Hi.id}/${P.id}: ${frases} frases (una idea por página)`);
        const t = sinT(P.texto);
        if (/\bpuedo\b/.test(t)) conPuedo++;
        if (PRIMERA.test(t)) primera++;
        assert.doesNotMatch(t, /\b(debo|debes|tengo que|tienes que|hay que|no llores|portate|quedate quieta)\b/, `${Hi.id}/${P.id}: orden de conducta`);
        assert.doesNotMatch(t, /\b(no va a doler|no duele|no pasa nada|todo va a salir bien|va a ser rapido|nunca duele)\b/, `${Hi.id}/${P.id}: promesa`);
        assert.equal(H.sugerencia(P.texto), "", `${Hi.id}/${P.id}: el detector la marcaría`);
      }
      assert.ok(conPuedo >= 1 && conPuedo <= Math.floor(Hi.paginas.length / 2), `${Hi.id}: ${conPuedo} páginas con «Puedo» (pocas opciones, mayoría describe)`);
      assert.ok(primera >= Math.ceil(Hi.paginas.length * 0.75), `${Hi.id}: solo ${primera} páginas en primera persona`);
    }
  });

  test("la vacuna no promete que no duele: dice que puede doler un poco", () => {
    const v = H.HISTORIAS.find((x) => x.id === "vacuna");
    assert.ok(v.paginas.some((P) => /puede doler un poco/i.test(P.texto)));
  });

  test("«lo que me ayuda»: 9 opciones; las 6 primeras son las de «Lo que la calma» de «Así soy yo»", () => {
    assert.equal(H.AYUDAS.length, 9);
    assert.deepEqual(p(H.DEL_PERFIL), CALMA_ASY);
    assert.deepEqual(p(H.AYUDAS.slice(0, 6).map((a) => a.id)), CALMA_ASY);
    for (const a of H.AYUDAS) assert.match(hc, new RegExp(`<symbol id="${a.icono}" viewBox="0 0 48 48">`), `falta ${a.icono}`);
  });

  test("lo que me ayuda sale del perfil: lo elegido por el adulto manda; si no, «Así soy yo»; si no, lo de la historia", () => {
    const med = H.historia("medico");
    const perfil = { v: 1, apodo: "Luna", tarjetas: { calma: { opciones: ["luz", "silencio", "musica", "mecerse"], nota: "" } } };
    assert.deepEqual(p(H.ayudasDe(H.vacia(), med, perfil)), ["silencio", "musica", "mecerse"], "del perfil, en orden y máximo 3");
    assert.deepEqual(p(H.ayudasDe(H.vacia(), med, null)), p(med.base));
    assert.deepEqual(p(H.ayudasDe({ ayudas: ["pausa"] }, med, perfil)), ["pausa"]);
    assert.deepEqual(p(H.ayudasDe({ ayudas: [] }, med, perfil)), [], "elegir ninguna también se respeta");
    for (const raro of ["basura", 5, { tarjetas: { calma: { opciones: "luz" } } }, { tarjetas: null }]) assert.deepEqual(p(H.deLaFlor(raro)), []);
    assert.equal(H.apodoFlor(perfil), "Luna");
    assert.equal(H.apodo({ apodo: "" }, perfil), "Luna");
    assert.equal(H.apodo({ apodo: "Lunita" }, perfil), "Lunita");
    assert.equal(H.apodoFlor({ apodo: "x".repeat(40) }).length, 20);
  });

  test("el apodo va al comienzo de la primera página visible; «lo que me ayuda» se lee completo", () => {
    const med = H.historia("medico");
    assert.equal(H.textoPagina(med, H.vacia(), 0, "Luna"), "Soy Luna. Hoy voy al médico. Voy con una persona de mi familia.");
    assert.equal(H.textoPagina(med, H.vacia(), 0, ""), "Hoy voy al médico. Voy con una persona de mi familia.");
    assert.equal(H.textoPagina(med, { quitadas: ["llego"], textos: {} }, 0, "Luna"), "Soy Luna. Primero esperamos en una sala. A veces hay otras personas esperando.");
    assert.equal(H.textoPagina(med, H.vacia(), 99, "Luna"), "");
    assert.equal(H.conAyudas("Hay cosas que me ayudan.", H.ayudasLista(["audifonos", "objeto", "respirar"])), "Hay cosas que me ayudan: mi objeto favorito, mis audífonos y respirar despacio.");
    assert.equal(H.conAyudas("Hay cosas que me ayudan.", []), "Hay cosas que me ayudan.");
  });

  test("ajustes del adulto: entradas raras se limpian y nunca rompen", () => {
    const base = p(H.porDefecto());
    for (const raro of [null, undefined, 0, "hola", [], [1, 2], { historias: "x" }, { historias: { medico: "x" } }, { apodo: 5 }]) {
      const n = p(H.normalizar(raro));
      assert.deepEqual(Object.keys(n.historias), ["medico", "colegio", "pelo", "vacuna", "fiesta"]);
      if (raro === null || raro === undefined || typeof raro !== "object" || Array.isArray(raro)) assert.deepEqual(n, base);
      for (const id of Object.keys(n.historias)) assert.deepEqual(n.historias[id], { quitadas: [], textos: {}, ayudas: null });
    }
    const n = p(H.normalizar({ apodo: "  Lu\u0000na  ", historias: { medico: {
      quitadas: ["salgo", "inventada", "llego", "sala", "ruido", "entro", "olor", "revisa"],
      textos: { sala: "  Esperamos en la EPS\u0000 ", olor: "", llego: "Hoy voy al médico. Voy con una persona de mi familia.", inventada: "x", revisa: "z".repeat(200), corazon: 7 },
      ayudas: ["pausa", "pausa", "inventada", "silencio", "luz", "musica"]
    }, __proto__: { colegio: { quitadas: ["llego"] } } } }));
    assert.equal(n.apodo, "Lu na");
    assert.deepEqual(n.historias.medico.quitadas, ["llego", "sala", "ruido", "entro", "olor", "revisa"], "orden fijo, sin ids desconocidos y dejando al menos 3 páginas");
    assert.equal(H.paginasVisibles(H.historia("medico"), n.historias.medico).length, 3);
    assert.deepEqual(n.historias.medico.textos, { sala: "Esperamos en la EPS", revisa: "z".repeat(140) }, "limpia, corta a 140 y descarta vacías, iguales o no-texto");
    assert.deepEqual(n.historias.medico.ayudas, ["silencio", "musica", "luz"], "máximo 3, sin repetidos ni inventadas, en orden fijo");
    assert.deepEqual(n.historias.colegio, { quitadas: [], textos: {}, ayudas: null });
    assert.equal(H.editada(n.historias.medico), true);
    assert.equal(H.editada(n.historias.pelo), false);
  });

  test("el detector sugiere (no bloquea) ante órdenes o promesas que escriba el adulto", () => {
    assert.match(H.sugerencia("Debo portarme bien en el médico"), /^Sugerencia: cuenta lo que pasa/);
    assert.match(H.sugerencia("No voy a llorar"), /^Sugerencia/);
    assert.match(H.sugerencia("La vacuna no va a doler"), /^Sugerencia: mejor no prometer/);
    assert.match(H.sugerencia("Tengo que quedarme quieta"), /^Sugerencia/);
    for (const bien of ["Puedo pedir una pausa.", "Puede doler un poco.", "A veces lloro y está bien.", "", null]) assert.equal(H.sugerencia(bien), "", String(bien));
  });

  test("la imagen parte el texto en renglones y corta con «…» si no cabe", () => {
    assert.deepEqual(p(H.lineas("Hoy voy al médico", 10)), ["Hoy voy al", "médico"]);
    assert.deepEqual(p(H.lineas("", 10)), []);
    const l = H.lineas("a b c d e f g h i j k l m n o p", 3, 2);
    assert.equal(l.length, 2);
    assert.ok(l[1].endsWith("…"));
  });
});

describe("cuentos · el enlace (#h1) ida y vuelta", () => {
  const todas = (Hi) => H.paginasVisibles(Hi, H.vacia()).map((P) => P.id);

  test("cada historia por defecto va y vuelve, con y sin «#» y con basura al final", () => {
    for (const Hi of H.HISTORIAS) {
      const frag = H.codificar(Hi.id, H.vacia(), "", Hi.base);
      assert.match(frag, /^h1\.[A-Za-z0-9_-]+$/);
      assert.ok(frag.length < 60, `${Hi.id}: enlace por defecto muy largo (${frag.length})`);
      for (const entrada of [frag, "#" + frag, "#" + frag + ".", "#" + frag + ")"]) {
        const r = H.decodificar(entrada);
        assert.ok(r, `no decodificó ${Hi.id} ${entrada.slice(-4)}`);
        assert.equal(r.historia, Hi.id);
        assert.equal(r.apodo, "");
        assert.deepEqual(p(r.cfg), { quitadas: [], textos: {}, ayudas: p(Hi.base).sort((a, b) => H.AYUDAS.findIndex((x) => x.id === a) - H.AYUDAS.findIndex((x) => x.id === b)) });
      }
      assert.deepEqual(p(H.paginasVisibles(Hi, H.decodificar(frag).cfg).map((P) => P.id)), p(todas(Hi)));
    }
  });

  test("una historia ajustada (apodo, palabras con tildes, ñ, emoji y comillas, páginas quitadas, lo que ayuda) va y vuelve igual", () => {
    const h = { quitadas: ["olor", "salgo"], textos: { sala: 'Esperamos en la EPS de Bello, "sala 2" <b>ñandú</b> 🌙', ruido: "Puedo pedir mis audífonos azules." }, ayudas: ["luz", "audifonos"] };
    const frag = H.codificar("medico", h, "Ñaña 🌙", h.ayudas);
    const r = H.decodificar(frag);
    assert.equal(r.historia, "medico");
    assert.equal(r.apodo, "Ñaña 🌙");
    assert.deepEqual(p(r.cfg), p(H.normalizarHistoria(H.historia("medico"), h)));
    assert.equal(H.textoPagina(H.historia("medico"), r.cfg, 0, r.apodo), "Soy Ñaña 🌙. Hoy voy al médico. Voy con una persona de mi familia.");
  });

  test("recorta: apodo a 20 letras, textos a 140, máximo 3 ayudas; deja al menos 3 páginas", () => {
    const Hi = H.historia("vacuna");
    const ids = Hi.paginas.map((P) => P.id);
    const frag = H.codificar("vacuna", { quitadas: ids, textos: { hoy: "x".repeat(300) } }, "y".repeat(50), ["silencio", "abrazo", "musica", "objeto", "luz"]);
    const r = H.decodificar(frag);
    assert.ok(r);
    assert.equal(r.apodo.length, 20);
    assert.equal(r.cfg.textos.hoy, "x".repeat(140));
    assert.equal(H.paginasVisibles(Hi, r.cfg).length, 3);
    assert.deepEqual(p(r.cfg.ayudas), ["silencio", "abrazo", "musica"]);
  });

  test("una historia de id desconocido no se codifica", () => {
    assert.equal(H.codificar("inventada", H.vacia(), "", []), null);
  });

  test("el enlace más largo posible (9 páginas de 140 letras con tildes) sigue cabiendo en un QR", () => {
    const Hi = H.historia("medico"), textos = {};
    for (const P of Hi.paginas) textos[P.id] = "Página con tildes: árbol, niña, canción ".repeat(4).slice(0, 140);
    const frag = H.codificar("medico", { textos }, "x".repeat(20), ["luz"]);
    assert.ok(frag.length <= 2500, `largo ${frag.length}`);
    assert.deepEqual(p(H.decodificar(frag).cfg.textos), p(H.normalizarHistoria(Hi, { textos }).textos));
    assert.ok(C.qr.matriz("https://contigo.ejemplo/recursos/cuentos.html#" + frag), "el QR no se pudo armar");
  });

  test("enlaces dañados devuelven null (nunca revientan)", () => {
    const bueno = H.codificar("pelo", { quitadas: ["silla"], textos: { hoy: "Hoy me cortan el pelo." } }, "Luna", ["pausa"]);
    const malos = [null, undefined, "", "#", "#h1.", "h1.", "#h2." + bueno.slice(3), "#h1.@@@@", "#h1." + bueno.slice(3, -3), bueno + "AAAA", "#principal", "#a1.AAAA", "#h1.A", 5, {}];
    for (const m of malos) assert.equal(H.decodificar(m), null, `debió fallar: ${String(m).slice(0, 20)}`);
    const crudo = p(C.enlace.desempaquetar("h1", bueno));
    const con = (f) => { const c = crudo.slice(); f(c); return H.decodificar(C.enlace.empaquetar("h1", c)); };
    const despuesApodo = 2 + 1 + crudo[2]; // banderas, historia, largo del apodo, apodo
    assert.equal(con((c) => { c[0] = 1; }), null, "banderas distintas de 0");
    assert.equal(con((c) => { c[1] = 5; }), null, "historia fuera de rango");
    assert.equal(con((c) => { c[despuesApodo] = 255; c[despuesApodo + 1] = 0; }), null, "páginas quitadas de más (quedan menos de 3)");
    assert.equal(con((c) => { c[despuesApodo + 1] = 1; }), null, "bit de página que no existe (pelo tiene 8)");
    assert.equal(con((c) => { c[despuesApodo + 2] = 15; c[despuesApodo + 3] = 0; }), null, "más de 3 ayudas");
    assert.equal(con((c) => { c[despuesApodo + 3] = 2; }), null, "bit de ayuda que no existe");
    assert.equal(con((c) => { c.pop(); }), null, "corto");
    assert.equal(con((c) => { c.push(0); }), null, "con bytes de más");
    assert.equal(con((c) => { c[3] = 0xff; }), null, "apodo con UTF-8 inválido");
  });

  test("600 enlaces al azar: nunca lanzan error y lo que decodifican es válido", () => {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let semilla = 11;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    let validos = 0;
    for (let i = 0; i < 600; i++) {
      let s = "h1.";
      const n = Math.floor(azar() * 80);
      for (let k = 0; k < n; k++) s += abc[Math.floor(azar() * abc.length)];
      const r = H.decodificar(s);
      if (r) {
        validos++;
        const Hi = H.historia(r.historia);
        assert.ok(Hi);
        assert.ok(r.apodo.length <= 20);
        assert.ok(H.paginasVisibles(Hi, r.cfg).length >= 3);
        assert.ok(r.cfg.ayudas.length <= 3);
      }
    }
    // y bytes casi válidos (estructura correcta, valores al azar)
    for (let i = 0; i < 400; i++) {
      const arr = [0, Math.floor(azar() * 6), 0, Math.floor(azar() * 256), Math.floor(azar() * 3), Math.floor(azar() * 256), Math.floor(azar() * 3)];
      for (let k = 0; k < 9; k++) arr.push(Math.floor(azar() * 2));
      const r = H.decodificar(C.enlace.empaquetar("h1", arr));
      if (r) { validos++; assert.ok(H.paginasVisibles(H.historia(r.historia), r.cfg).length >= 3); }
    }
    assert.ok(validos >= 0);
  });
});
