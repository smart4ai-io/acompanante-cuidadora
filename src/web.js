// web.js · lógica de la función del piloto web. La usan api\chat.js (Vercel, formato
// Web estándar: export default { fetch }), src\servidor_local.js (npm run web) y
// pruebas\api.test.js. Sin estado: el navegador manda su sesión completa y recibe
// la sesión actualizada.
//
//   POST /api/chat   Content-Type: application/json
//   { "estado": {…} | null, "mensaje": "texto", "accion": "mensaje" | "chequeo" | "resumen" | "fuentes" }
//   200 -> { "estado": {…}, "respuesta": { texto, candado, fuentes_usadas, uso, fragmentos, … }, "meta": {…} }
//   4xx/5xx -> { "error": "<código>", "detalle": "…", "respuesta": { texto: RESPUESTA_ERROR, candado: "error", … } }
//
// Defensas: solo POST, solo JSON, cuerpo de 256 KB como máximo, tipos validados,
// mismo origen (sin CORS: un sitio ajeno no puede llamarla desde el navegador) y
// límite de mensajes por hora (src\limite.js). Un mensaje de crisis o maltrato
// pasa SIEMPRE, aunque se haya llegado al límite: no usa el modelo y no cuesta.

import { responderConEstado, chequeoConEstado, resumenConEstado, validarEstado, ErrorEstado } from "./agente.js";
import { fuentes, recargar } from "./biblioteca.js";
import { detectarCrisis, detectarMaltrato } from "./candados.js";
import { esperarAvisos } from "./guardia.js";
import { excedido, anotar } from "./limite.js";
import { fijarTokenOidc, proveedor } from "./modelo.js";
import { RESPUESTA_ERROR } from "./prompt.js";

export const LIMITE_CUERPO = 256 * 1024; // bytes
export const LIMITE_MENSAJE = 2000; // caracteres
const ACCIONES = new Set(["mensaje", "chequeo", "resumen", "fuentes"]);

export const RESPUESTA_LIMITE = `Por ahora llegamos al límite de mensajes de esta prueba. Intenta de nuevo en un rato.
Si es urgente: *Línea 106* o *123*.`;

// Aviso en los logs si la biblioteca no viajó (se olvidó `npm run biblioteca`).
const info = recargar();
if (!info.documentos) console.error("[biblioteca] VACÍA: falta app\\biblioteca.json (corre `npm run biblioteca` antes de desplegar)");

const CABECERAS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(cuerpo, estado = 200, extra = {}) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CABECERAS, ...extra } });
}

function error(codigo, estadoHttp, detalle, texto = RESPUESTA_ERROR, extra = {}) {
  return json({ error: codigo, detalle, respuesta: { texto, candado: codigo === "limite" ? "limite" : "error", fuentes_usadas: [], uso: { llamadas: 0 } } }, estadoHttp, extra);
}

// IP de quien escribe (Vercel pone la real en x-forwarded-for).
function ipDe(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}

// Mismo origen: si el navegador manda Origin, su host debe ser el de esta página.
function origenPermitido(request) {
  const origen = request.headers.get("origin");
  if (!origen) return true; // curl o la misma página en algunos navegadores
  try {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}

// ¿El mensaje dispara un candado fijo? (pasa aunque se haya llegado al límite)
function esUrgente(estado, mensaje) {
  if (typeof mensaje !== "string" || !mensaje.trim()) return false;
  const c = estado && estado.chequeo;
  const enItem9 = Boolean(c && c.fase === "phq" && c.indice === 8);
  return detectarCrisis(mensaje, { enItemPHQ9: enItem9 }).detectado || detectarMaltrato(mensaje).detectado;
}

function listaFuentes() {
  const docs = fuentes();
  const lineas = docs.map((f) => `- ${f.id} · ${f.titulo || ""} · estado: ${f.estado || "?"} · aval: ${f.aval || "?"}`);
  return {
    texto: `Biblioteca de la Acompañante (${docs.length} documentos):\n${lineas.join("\n")}`,
    candado: null,
    fuentes_usadas: [],
    uso: { llamadas: 0 },
    biblioteca: docs.map((f) => ({ id: f.id, titulo: f.titulo || "", estado: f.estado || "", aval: f.aval || "" })),
  };
}

async function leerCuerpo(request) {
  const largo = Number(request.headers.get("content-length") || 0);
  if (largo > LIMITE_CUERPO) return { error: error("cuerpo-grande", 413, `máximo ${LIMITE_CUERPO} bytes`) };
  const texto = await request.text();
  if (Buffer.byteLength(texto, "utf8") > LIMITE_CUERPO) return { error: error("cuerpo-grande", 413, `máximo ${LIMITE_CUERPO} bytes`) };
  try {
    return { cuerpo: JSON.parse(texto) };
  } catch {
    return { error: error("json-invalido", 400, "el cuerpo no es JSON") };
  }
}

export async function manejar(request) {
  try {
    if (request.method !== "POST") return error("metodo", 405, "solo POST", RESPUESTA_ERROR, { allow: "POST" });
    if (!origenPermitido(request)) return error("origen", 403, "origen no permitido");
    const tipo = String(request.headers.get("content-type") || "").toLowerCase();
    if (!tipo.startsWith("application/json")) return error("tipo-de-contenido", 415, "usa Content-Type: application/json");

    const { cuerpo, error: fallo } = await leerCuerpo(request);
    if (fallo) return fallo;
    if (cuerpo === null || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return error("cuerpo-invalido", 400, "el cuerpo debe ser un objeto JSON");

    const accion = cuerpo.accion === undefined ? "mensaje" : cuerpo.accion;
    if (typeof accion !== "string" || !ACCIONES.has(accion)) return error("accion-invalida", 400, "accion: mensaje, chequeo, resumen o fuentes");
    const mensaje = cuerpo.mensaje;
    if (accion === "mensaje") {
      if (typeof mensaje !== "string") return error("mensaje-invalido", 400, "mensaje debe ser texto");
      if (mensaje.length > LIMITE_MENSAJE) return error("mensaje-invalido", 400, `mensaje de máximo ${LIMITE_MENSAJE} caracteres`);
    }

    // La sesión se valida aquí una vez (la vuelven a validar las funciones del agente, que es barato).
    let estado;
    try {
      estado = validarEstado(cuerpo.estado);
    } catch (e) {
      if (e instanceof ErrorEstado) return error("estado-invalido", 400, e.message);
      throw e;
    }

    if (accion === "fuentes") return json({ estado, respuesta: listaFuentes(), meta: { proveedor: proveedor() } });

    // Límite por hora (la sesión nueva trae un id recién creado: cuenta desde cero, por eso existe el de IP).
    const quien = { sesion: estado.id, ip: ipDe(request) };
    const pasado = excedido(quien);
    if (pasado && !(accion === "mensaje" && esUrgente(estado, mensaje))) {
      console.error(`[limite] ${pasado} · sesión ${estado.id}`);
      return error("limite", 429, `límite por ${pasado}`, RESPUESTA_LIMITE, { "retry-after": "600" });
    }
    anotar(quien);

    // En Vercel, el token OIDC para AI Gateway llega en esta cabecera.
    fijarTokenOidc(request.headers.get("x-vercel-oidc-token"));

    let r;
    if (accion === "chequeo") r = chequeoConEstado(estado);
    else if (accion === "resumen") r = await resumenConEstado(estado);
    else r = await responderConEstado(estado, mensaje);

    await esperarAvisos(); // que el aviso al webhook de la guardia salga antes de terminar
    return json({ estado: r.estado, respuesta: r.respuesta, meta: { proveedor: proveedor() } });
  } catch (e) {
    console.error(`[api] error interno: ${e && e.message ? e.message : e}`);
    await esperarAvisos();
    return error("interno", 500, "error interno");
  }
}
