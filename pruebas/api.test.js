// api.test.js · pruebas del piloto web (api\chat.js + src\web.js), deterministas.
// Correr: node --test pruebas/api.test.js   (npm test sigue corriendo solo ca.test.js)
//
// Esta prueba NUNCA llama a una API real ni gasta: fuerza el modo manual con una
// carpeta temporal vacía (cualquier llamada al modelo quedaría «pendiente» y se
// nota), y las pruebas del gateway usan un gateway FALSO en 127.0.0.1.
// Regla: estas pruebas no se editan para que pasen; si fallan, se arregla el código.

import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "acompanante-api-"));
const DIR_MANUAL = path.join(TMP, "manual");
process.env.MODELO_MANUAL = DIR_MANUAL;
process.env.ALERTAS_LOG = path.join(TMP, "alertas.log");
process.env.GUARDIA_SILENCIO = "1";
for (const k of ["GUARDIA_WEBHOOK", "VERCEL", "LIMITE_POR_HORA", "LIMITE_IP_POR_HORA", "BIBLIOTECA_DIR", "BIBLIOTECA_JSON", "PROVEEDOR"]) delete process.env[k];

const funcion = (await import("../api/chat.js")).default;
const { LIMITE_CUERPO, LIMITE_MENSAJE } = await import("../src/web.js");
const { reiniciarLimites } = await import("../src/limite.js");
const { RESPUESTA_ERROR } = await import("../src/prompt.js");
const { obtenerUsoTotal, proveedor } = await import("../src/modelo.js");
const biblioteca = await import("../src/biblioteca.js");

const RUTA_ALERTAS_APP = path.join(APP, "alertas.log");
let ipSiguiente = 1;
const ipNueva = () => `10.0.0.${ipSiguiente++}`;

function pedir(cuerpo, { metodo = "POST", tipo = "application/json", origen, ip = "10.9.9.9", crudo, cabeceras = {} } = {}) {
  const headers = new Headers({ host: "acompanante.test", "x-forwarded-for": ip, ...cabeceras });
  if (tipo) headers.set("content-type", tipo);
  if (origen) headers.set("origin", origen);
  const body = metodo === "GET" ? undefined : crudo !== undefined ? crudo : JSON.stringify(cuerpo);
  return funcion.fetch(new Request("http://acompanante.test/api/chat", { method: metodo, headers, body }));
}
async function pedirJson(cuerpo, opciones) {
  const r = await pedir(cuerpo, opciones);
  return { status: r.status, datos: await r.json(), cabeceras: r.headers };
}
const pendientes = () => (fs.existsSync(path.join(DIR_MANUAL, "pendientes")) ? fs.readdirSync(path.join(DIR_MANUAL, "pendientes")).length : 0);
function alertas() {
  if (!fs.existsSync(process.env.ALERTAS_LOG)) return [];
  return fs.readFileSync(process.env.ALERTAS_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

beforeEach(() => reiniciarLimites());

test("arranca en modo manual (garantía de que esta prueba no gasta)", () => {
  assert.equal(proveedor(), "manual");
});

describe("Crisis por la web, sin llamar al modelo", () => {
  test("«ya no aguanto más, quisiera morirme»: candado de crisis, 106 y 123, aviso a la guardia, 0 llamadas", async () => {
    const antes = alertas().length;
    const { status, datos } = await pedirJson({ mensaje: "ya no aguanto más, quisiera morirme" }, { ip: ipNueva() });
    assert.equal(status, 200);
    const r = datos.respuesta;
    assert.equal(r.candado, "crisis");
    assert.match(r.texto, /106/);
    assert.match(r.texto, /123/);
    assert.equal(r.uso.llamadas, 0);
    assert.equal(r.guardia.tipo, "crisis");
    assert.equal(datos.estado.enCrisis, true);
    assert.equal(typeof datos.estado.id, "string");
    const nuevas = alertas().slice(antes);
    assert.equal(nuevas.length, 1);
    assert.equal(nuevas[0].tipo, "crisis");
    assert.ok(nuevas[0].extracto.length <= 80);
    assert.equal(pendientes(), 0, "se intentó llamar al modelo");
    assert.equal(obtenerUsoTotal().llamadas, 0);

    // La sesión vuelve con el navegador: el siguiente mensaje recuerda las líneas.
    const siguiente = await pedirJson({ estado: datos.estado, mensaje: "diario 2026-10-30: hoy durmió mejor" }, { ip: ipNueva() });
    assert.equal(siguiente.status, 200);
    assert.match(siguiente.datos.respuesta.texto, /Anotado/);
    assert.match(siguiente.datos.respuesta.texto, /106/);
    assert.equal(siguiente.datos.estado.id, datos.estado.id);
    assert.equal(siguiente.datos.estado.diario.length, 1);
  });

  test("maltrato: ICBF 141, sin modelo", async () => {
    const { status, datos } = await pedirJson({ mensaje: "El papá de la niña le pega con la correa" }, { ip: ipNueva() });
    assert.equal(status, 200);
    assert.equal(datos.respuesta.candado, "maltrato");
    assert.match(datos.respuesta.texto, /141/);
    assert.equal(datos.respuesta.uso.llamadas, 0);
  });
});

describe("Cuerpos y peticiones inválidas: JSON de error con RESPUESTA_ERROR", () => {
  const casos = [
    ["no es JSON", { crudo: "{no es json" }, 400, "json-invalido"],
    ["Content-Type text/plain", { crudo: JSON.stringify({ mensaje: "hola" }), tipo: "text/plain" }, 415, "tipo-de-contenido"],
    ["sin Content-Type", { crudo: JSON.stringify({ mensaje: "hola" }), tipo: null }, 415, "tipo-de-contenido"],
    ["el cuerpo es una lista", { cuerpo: [] }, 400, "cuerpo-invalido"],
    ["el cuerpo es null", { crudo: "null" }, 400, "cuerpo-invalido"],
    ["mensaje que no es texto", { cuerpo: { mensaje: 42 } }, 400, "mensaje-invalido"],
    ["sin mensaje", { cuerpo: {} }, 400, "mensaje-invalido"],
    ["mensaje demasiado largo", { cuerpo: { mensaje: "a".repeat(LIMITE_MENSAJE + 1) } }, 400, "mensaje-invalido"],
    ["acción desconocida", { cuerpo: { accion: "borrar-todo" } }, 400, "accion-invalida"],
    ["estado que no es objeto", { cuerpo: { estado: "hola", mensaje: "hola" } }, 400, "estado-invalido"],
    ["historial con roles al revés", { cuerpo: { estado: { historial: [{ role: "assistant", content: "x" }, { role: "user", content: "y" }] }, mensaje: "hola" } }, 400, "estado-invalido"],
    ["historial impar", { cuerpo: { estado: { historial: [{ role: "user", content: "x" }] }, mensaje: "hola" } }, 400, "estado-invalido"],
    ["chequeo con índice imposible", { cuerpo: { estado: { chequeo: { fase: "phq", indice: 99, phq: [], gad: [] } }, mensaje: "1" } }, 400, "estado-invalido"],
    ["chequeo con un puntaje de 7", { cuerpo: { estado: { chequeo: { fase: "gad", indice: 1, phq: [1, 1], gad: [7] } }, mensaje: "1" } }, 400, "estado-invalido"],
    ["diario con fecha mal escrita", { cuerpo: { estado: { diario: [{ fecha: "ayer", texto: "x" }] }, accion: "resumen" } }, 400, "estado-invalido"],
    ["enCrisis que no es sí/no", { cuerpo: { estado: { enCrisis: "no" }, mensaje: "hola" } }, 400, "estado-invalido"],
    ["cuerpo de más de 256 KB", { cuerpo: { mensaje: "hola", relleno: "x".repeat(LIMITE_CUERPO) } }, 413, "cuerpo-grande"],
    ["otro sitio (Origin ajeno)", { cuerpo: { mensaje: "hola" }, origen: "https://sitio-ajeno.example" }, 403, "origen"],
  ];
  for (const [nombre, c, codigoHttp, codigo] of casos) {
    test(`${nombre} → ${codigoHttp} ${codigo}`, async () => {
      const r = await pedir(c.cuerpo, { crudo: c.crudo, tipo: c.tipo === undefined ? "application/json" : c.tipo, origen: c.origen, ip: ipNueva() });
      assert.equal(r.status, codigoHttp);
      assert.match(r.headers.get("content-type"), /application\/json/);
      assert.equal(r.headers.get("access-control-allow-origin"), null, "no debe abrir CORS");
      const datos = await r.json();
      assert.equal(datos.error, codigo);
      assert.equal(datos.respuesta.texto, RESPUESTA_ERROR);
      assert.equal(datos.respuesta.candado, "error");
    });
  }
  test("GET → 405 con Allow: POST", async () => {
    const r = await pedir(null, { metodo: "GET", tipo: null, ip: ipNueva() });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get("allow"), "POST");
    assert.equal((await r.json()).respuesta.texto, RESPUESTA_ERROR);
  });
  test("mismo origen sí pasa", async () => {
    const { status } = await pedirJson({ mensaje: "diario: prueba de origen" }, { origen: "http://acompanante.test", ip: ipNueva() });
    assert.equal(status, 200);
  });
  test("ninguna petición inválida llamó al modelo", () => assert.equal(pendientes(), 0));
});

describe("Límite por hora", () => {
  test("40 mensajes por sesión; el 41 recibe 429 con 106/123; una crisis pasa igual", async () => {
    const ip = ipNueva();
    let estado = null;
    for (let i = 1; i <= 40; i++) {
      const { status, datos } = await pedirJson({ estado, mensaje: `diario 2026-10-01: nota ${i}` }, { ip });
      assert.equal(status, 200, `mensaje ${i}`);
      estado = datos.estado;
    }
    const pasado = await pedirJson({ estado, mensaje: "diario: una más" }, { ip });
    assert.equal(pasado.status, 429);
    assert.equal(pasado.datos.error, "limite");
    assert.equal(pasado.datos.respuesta.candado, "limite");
    assert.match(pasado.datos.respuesta.texto, /106/);
    assert.ok(pasado.cabeceras.get("retry-after"));
    const crisis = await pedirJson({ estado, mensaje: "ya no aguanto más" }, { ip });
    assert.equal(crisis.status, 200, "una crisis nunca se bloquea por el límite");
    assert.equal(crisis.datos.respuesta.candado, "crisis");
    // Otra sesión desde la misma IP sigue funcionando (la IP tiene su propio tope, 120).
    const otra = await pedirJson({ mensaje: "diario: otra sesión" }, { ip });
    assert.equal(otra.status, 200);
  });
  test("tope por IP (borrar la sesión no salta el límite)", async () => {
    process.env.LIMITE_IP_POR_HORA = "3";
    try {
      const ip = ipNueva();
      for (let i = 0; i < 3; i++) assert.equal((await pedirJson({ mensaje: "diario: x" }, { ip })).status, 200);
      const cuarto = await pedirJson({ mensaje: "diario: x" }, { ip });
      assert.equal(cuarto.status, 429);
      assert.match(cuarto.datos.detalle, /ip/);
      assert.equal((await pedirJson({ mensaje: "diario: x" }, { ip: ipNueva() })).status, 200, "otra IP no se afecta");
    } finally {
      delete process.env.LIMITE_IP_POR_HORA;
    }
  });
});

describe("El estado viaja con el navegador (el servidor no guarda nada)", () => {
  test("diario → diario → resumen literal con las dos notas y sus fechas", async () => {
    const ip = ipNueva();
    const uno = await pedirJson({ mensaje: "diario 2026-10-26: no quiso entrar a la tienda por el ruido" }, { ip });
    const dos = await pedirJson({ estado: uno.datos.estado, mensaje: "diario 2026-10-28: comió solo arroz blanco" }, { ip });
    assert.equal(dos.datos.estado.diario.length, 2);
    const resumen = await pedirJson({ estado: dos.datos.estado, accion: "resumen" }, { ip });
    assert.equal(resumen.status, 200);
    const r = resumen.datos.respuesta;
    assert.equal(r.origen, "literal"); // modo manual sin respuesta: la red de seguridad entrega las notas tal cual
    for (const t of ["2026-10-26", "no quiso entrar a la tienda por el ruido", "2026-10-28", "comió solo arroz blanco"]) assert.ok(r.texto.includes(t), `falta «${t}»`);
    assert.match(r.texto, /no es un diagn[oó]stico/);
    // Escribir «resumen» como mensaje da lo mismo.
    const porTexto = await pedirJson({ estado: dos.datos.estado, mensaje: "resumen" }, { ip });
    assert.equal(porTexto.datos.respuesta.texto, r.texto);
    // Sin la sesión, el servidor no recuerda nada.
    const sinEstado = await pedirJson({ accion: "resumen" }, { ip });
    assert.match(sinEstado.datos.respuesta.texto, /Todavía no tienes notas/);
  });
  test("chequeo guiado: la fase y el índice viajan en la sesión", async () => {
    const ip = ipNueva();
    const inicio = await pedirJson({ accion: "chequeo" }, { ip });
    assert.match(inicio.datos.respuesta.texto, /0 = nunca/);
    assert.equal(inicio.datos.estado.chequeo.fase, "phq");
    const paso = await pedirJson({ estado: inicio.datos.estado, mensaje: "2" }, { ip });
    assert.equal(paso.datos.estado.chequeo.indice, 1);
    const fin = await pedirJson({ estado: paso.datos.estado, mensaje: "salir" }, { ip });
    assert.equal(fin.datos.estado.chequeo, null);
    assert.equal(fin.datos.respuesta.uso.llamadas, 0);
  });
  test("fuentes: la lista de la biblioteca, sin modelo", async () => {
    const { status, datos } = await pedirJson({ accion: "fuentes" }, { ip: ipNueva() });
    assert.equal(status, 200);
    assert.ok(datos.respuesta.biblioteca.length >= 8, `solo ${datos.respuesta.biblioteca.length} documentos`);
    assert.match(datos.respuesta.texto, /Biblioteca de la Acompañante/);
    assert.equal(datos.respuesta.uso.llamadas, 0);
  });
});

describe("biblioteca.json (lo que viaja a Vercel)", () => {
  test("está al día con conocimiento\\biblioteca (si falla: npm run biblioteca)", { skip: !fs.existsSync(biblioteca.DIR_POR_DEFECTO) && "no está la carpeta" }, () => {
    assert.ok(fs.existsSync(biblioteca.JSON_POR_DEFECTO), "falta app\\biblioteca.json: corre npm run biblioteca");
    const json = JSON.parse(fs.readFileSync(biblioteca.JSON_POR_DEFECTO, "utf8"));
    const carpeta = biblioteca
      .leerCarpeta(biblioteca.DIR_POR_DEFECTO)
      .filter((a) => !a.error && biblioteca.documentoValido(a.contenido))
      .map((a) => ({ ruta: path.relative(biblioteca.DIR_POR_DEFECTO, a.ruta).split(path.sep).join("/"), contenido: a.contenido }));
    assert.deepEqual(json.archivos.map((a) => a.ruta), carpeta.map((a) => a.ruta), "cambió la lista de documentos: corre npm run biblioteca");
    for (let i = 0; i < carpeta.length; i++) assert.equal(json.archivos[i].contenido, carpeta[i].contenido, `cambió ${carpeta[i].ruta}: corre npm run biblioteca`);
  });
  test("leída desde el JSON da los mismos documentos, fragmentos y búsquedas", () => {
    const deCarpeta = biblioteca.recargar();
    const idsCarpeta = biblioteca.fuentes().map((f) => f.id);
    const busquedaCarpeta = JSON.stringify(biblioteca.buscar("la EPS me negó la cita con el neuropediatra", 6));
    process.env.BIBLIOTECA_JSON = biblioteca.JSON_POR_DEFECTO;
    try {
      const deJson = biblioteca.recargar();
      assert.equal(deJson.documentos, deCarpeta.documentos);
      assert.equal(deJson.fragmentos, deCarpeta.fragmentos);
      assert.deepEqual(biblioteca.fuentes().map((f) => f.id), idsCarpeta);
      assert.equal(JSON.stringify(biblioteca.buscar("la EPS me negó la cita con el neuropediatra", 6)), busquedaCarpeta);
    } finally {
      delete process.env.BIBLIOTECA_JSON;
      biblioteca.recargar();
    }
  });
});

describe("Guardia en la web (sin archivo: logs y webhook)", () => {
  test("en Vercel: [GUARDIA] en console.error, POST al webhook con hora, tipo y 80 caracteres, sin escribir alertas.log", async () => {
    const recibidos = [];
    const webhook = http.createServer((req, res) => {
      let b = "";
      req.on("data", (p) => (b += p));
      req.on("end", () => {
        recibidos.push({ metodo: req.method, tipo: req.headers["content-type"], cuerpo: JSON.parse(b) });
        res.writeHead(204);
        res.end();
      });
    });
    await new Promise((ok) => webhook.listen(0, "127.0.0.1", ok));
    const tamanoAntes = fs.existsSync(RUTA_ALERTAS_APP) ? fs.statSync(RUTA_ALERTAS_APP).size : -1;
    const guardado = { ALERTAS_LOG: process.env.ALERTAS_LOG, GUARDIA_SILENCIO: process.env.GUARDIA_SILENCIO };
    const lineas = [];
    const errorOriginal = console.error;
    console.error = (...a) => lineas.push(a.join(" "));
    process.env.VERCEL = "1";
    delete process.env.ALERTAS_LOG;
    delete process.env.GUARDIA_SILENCIO;
    process.env.GUARDIA_WEBHOOK = `http://127.0.0.1:${webhook.address().port}/aviso`;
    let datos;
    try {
      const largo = "ya no aguanto más, quisiera morirme. " + "Esto es un texto largo que no debe salir completo. ".repeat(5);
      ({ datos } = await pedirJson({ mensaje: largo }, { ip: ipNueva() }));
    } finally {
      console.error = errorOriginal;
      delete process.env.VERCEL;
      delete process.env.GUARDIA_WEBHOOK;
      process.env.ALERTAS_LOG = guardado.ALERTAS_LOG;
      process.env.GUARDIA_SILENCIO = guardado.GUARDIA_SILENCIO;
      await new Promise((ok) => webhook.close(ok));
    }
    assert.equal(datos.respuesta.candado, "crisis");
    assert.equal(recibidos.length, 1, "el webhook no recibió el aviso (o lo recibió dos veces)");
    assert.equal(recibidos[0].metodo, "POST");
    assert.match(recibidos[0].tipo, /application\/json/);
    assert.deepEqual(Object.keys(recibidos[0].cuerpo).sort(), ["extracto", "hora", "tipo"]);
    assert.equal(recibidos[0].cuerpo.tipo, "crisis");
    assert.ok(recibidos[0].cuerpo.extracto.length <= 80);
    assert.ok(!Number.isNaN(Date.parse(recibidos[0].cuerpo.hora)));
    const linea = lineas.find((l) => l.startsWith("[GUARDIA] {"));
    assert.ok(linea, `no salió la línea [GUARDIA] en console.error: ${lineas.join(" | ")}`);
    assert.equal(JSON.parse(linea.slice("[GUARDIA] ".length)).tipo, "crisis");
    const tamanoDespues = fs.existsSync(RUTA_ALERTAS_APP) ? fs.statSync(RUTA_ALERTAS_APP).size : -1;
    assert.equal(tamanoDespues, tamanoAntes, "en la web no debe escribir app\\alertas.log");
  });
  test("si el webhook no responde, la conversación sigue (fail-open)", async () => {
    const lineas = [];
    const errorOriginal = console.error;
    console.error = (...a) => lineas.push(a.join(" "));
    process.env.GUARDIA_WEBHOOK = "http://127.0.0.1:9/aviso"; // puerto cerrado
    let status, datos;
    try {
      ({ status, datos } = await pedirJson({ mensaje: "quisiera morirme" }, { ip: ipNueva() }));
    } finally {
      console.error = errorOriginal;
      delete process.env.GUARDIA_WEBHOOK;
    }
    assert.equal(status, 200);
    assert.equal(datos.respuesta.candado, "crisis");
    assert.ok(lineas.some((l) => /no pude avisar al webhook/.test(l)), lineas.join(" | "));
  });
});

// ------------------------------------------------------------------ gateway FALSO
// Un proceso aparte (sin modo manual) habla con un «AI Gateway» falso en 127.0.0.1.
// Verifica la forma exacta de la petición: endpoint, credencial, modelo, caché y esfuerzo.

const TEXTO_FALSO = "¡Hola! Qué bueno leerte. ¿Cómo estás hoy?";

async function conGatewayFalso(responder, envExtra, cabecerasPeticion) {
  const peticiones = [];
  const servidor = http.createServer((req, res) => {
    let b = "";
    req.on("data", (p) => (b += p));
    req.on("end", () => {
      const cuerpo = JSON.parse(b || "{}");
      peticiones.push({ ruta: req.url, cabeceras: req.headers, cuerpo });
      const [codigo, salida] = responder(cuerpo, peticiones.length);
      res.writeHead(codigo, { "content-type": "application/json" });
      res.end(JSON.stringify(salida));
    });
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const codigo = `
    const f = (await import("./api/chat.js")).default;
    const r = await f.fetch(new Request("http://acompanante.test/api/chat", { method: "POST", headers: ${JSON.stringify({ "content-type": "application/json", ...cabecerasPeticion })}, body: JSON.stringify({ mensaje: "hola" }) }));
    process.stdout.write("@@" + JSON.stringify({ status: r.status, datos: await r.json() }));
  `;
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE,
    AI_GATEWAY_BASE_URL: `http://127.0.0.1:${servidor.address().port}`,
    ALERTAS_LOG: path.join(TMP, "alertas-hijo.log"),
    GUARDIA_SILENCIO: "1",
    ...envExtra,
  };
  try {
    const salida = await new Promise((ok, mal) => {
      const hijo = spawn(process.execPath, ["--input-type=module", "-e", codigo], { cwd: APP, env });
      let out = "";
      let err = "";
      hijo.stdout.on("data", (d) => (out += d));
      hijo.stderr.on("data", (d) => (err += d));
      hijo.on("error", mal);
      hijo.on("close", () => {
        const i = out.indexOf("@@");
        if (i === -1) mal(new Error(`el proceso de prueba no respondió: ${err}`));
        else ok({ ...JSON.parse(out.slice(i + 2)), stderr: err });
      });
    });
    return { ...salida, peticiones };
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
}

// El gateway acepta la credencial en x-api-key o en Authorization: Bearer (el SDK 1.3 usa Bearer).
const credencial = (p) => p.cabeceras["x-api-key"] || String(p.cabeceras.authorization || "").replace(/^Bearer\s+/i, "") || null;

const respuestaOk = (cuerpo) => [200, { id: "msg_prueba", type: "message", role: "assistant", model: cuerpo.model, content: [{ type: "text", text: TEXTO_FALSO }], stop_reason: "end_turn", usage: { input_tokens: 12, output_tokens: 9, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }];

describe("Proveedor AI Gateway (gateway falso en 127.0.0.1, sin clave real)", () => {
  test("token OIDC de la cabecera x-vercel-oidc-token → POST /v1/messages con anthropic/claude-sonnet-5.5", async () => {
    const r = await conGatewayFalso(respuestaOk, {}, { "x-vercel-oidc-token": "token-oidc-de-prueba" });
    assert.equal(r.status, 200, r.stderr);
    assert.equal(r.peticiones.length, 1);
    const p = r.peticiones[0];
    assert.equal(p.ruta, "/v1/messages");
    assert.equal(credencial(p), "token-oidc-de-prueba");
    assert.equal(p.cuerpo.model, "anthropic/claude-sonnet-5.5");
    assert.equal(p.cuerpo.max_tokens, 1500);
    assert.equal(p.cuerpo.system[0].cache_control.type, "ephemeral");
    assert.equal(p.cuerpo.output_config.effort, "low");
    assert.equal(p.cuerpo.messages.at(-1).role, "user");
    assert.equal(r.datos.respuesta.texto, TEXTO_FALSO);
    assert.equal(r.datos.respuesta.uso.llamadas, 1);
    assert.equal(r.datos.respuesta.uso.input_tokens, 12);
    assert.equal(r.datos.meta.proveedor, "gateway");
    assert.equal(r.datos.estado.historial.length, 2);
  });
  test("AI_GATEWAY_API_KEY gana sobre el token OIDC; un 400 por output_config se reintenta sin él", async () => {
    const responder = (cuerpo) => (cuerpo.output_config ? [400, { type: "error", error: { type: "invalid_request_error", message: "output_config no soportado" } }] : respuestaOk(cuerpo));
    const r = await conGatewayFalso(responder, { AI_GATEWAY_API_KEY: "clave-gateway-de-prueba" }, { "x-vercel-oidc-token": "token-oidc-de-prueba" });
    assert.equal(r.status, 200, r.stderr);
    assert.equal(r.peticiones.length, 2);
    assert.ok(r.peticiones.every((p) => credencial(p) === "clave-gateway-de-prueba"), r.peticiones.map(credencial).join(", "));
    assert.equal(r.peticiones[1].cuerpo.output_config, undefined);
    assert.equal(r.datos.respuesta.texto, TEXTO_FALSO);
  });
  test("402 (sin crédito o presupuesto agotado) → RESPUESTA_ERROR y error «credito»", async () => {
    const r = await conGatewayFalso(() => [402, { type: "error", error: { type: "insufficient_funds", message: "sin crédito" } }], {}, { "x-vercel-oidc-token": "token-oidc-de-prueba" });
    assert.equal(r.status, 200);
    assert.equal(r.datos.respuesta.texto, RESPUESTA_ERROR);
    assert.equal(r.datos.respuesta.candado, "error");
    assert.equal(r.datos.respuesta.error, "credito");
    assert.equal(r.peticiones.length, 1, "un 402 no se reintenta");
  });
  test("401 (credencial rechazada) → RESPUESTA_ERROR y error «autenticacion»", async () => {
    const r = await conGatewayFalso(() => [401, { type: "error", error: { type: "authentication_error", message: "no" } }], {}, { "x-vercel-oidc-token": "token-vencido" });
    assert.equal(r.datos.respuesta.texto, RESPUESTA_ERROR);
    assert.equal(r.datos.respuesta.error, "autenticacion");
  });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});
