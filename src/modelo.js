// modelo.js · ÚNICO archivo que conoce el SDK del modelo (para CA6: cambiar de
// modelo, por ejemplo a uno de pesos abiertos, es reescribir solo este archivo
// manteniendo la interfaz completar({system, mensajes}) -> {texto, stop_reason, uso}).
//
// Tres proveedores (2026-11-02, piloto web):
//   · manual    -> MODELO_MANUAL=<carpeta>. Sin API ni clave (ver abajo). Gana siempre.
//   · gateway   -> Vercel AI Gateway con su endpoint compatible con la API de Anthropic
//                  (https://ai-gateway.vercel.sh) y el mismo SDK @anthropic-ai/sdk.
//                  Credencial: AI_GATEWAY_API_KEY o, en Vercel, el token OIDC que llega
//                  en la cabecera x-vercel-oidc-token de cada petición (api\chat.js lo
//                  pasa con fijarTokenOidc) o VERCEL_OIDC_TOKEN (local, `vercel env pull`).
//                  Modelo por defecto: anthropic/claude-sonnet-5.5 (id de /v1/models).
//   · anthropic -> API de Anthropic directa con SMART_ROUTER_ANTHROPIC_KEY
//                  (nunca ANTHROPIC_API_KEY). Modelo por defecto: claude-sonnet-5-5.
// Selección: PROVEEDOR=gateway|anthropic la fuerza; si no, gateway cuando hay
// credencial de gateway (o se corre dentro de Vercel), anthropic si hay
// SMART_ROUTER_ANTHROPIC_KEY. MODELO=<id> cambia el modelo (en gateway, con el
// formato proveedor/modelo de https://ai-gateway.vercel.sh/v1/models).
// Versión anterior (solo Anthropic + manual): modelo.js.bak_2026-11-02_antes-web.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUTA_ENV = path.resolve(AQUI, "..", ".env.local");

// Carga .env.local una sola vez (Node 24 trae process.loadEnvFile). En Vercel no
// existe (lo excluye .vercelignore): las variables vienen del proyecto.
if (fs.existsSync(RUTA_ENV)) {
  try {
    process.loadEnvFile(RUTA_ENV);
  } catch (e) {
    console.error(`[modelo] no pude leer .env.local: ${e.message}`);
  }
}

// AI_GATEWAY_BASE_URL existe solo para las pruebas (un gateway falso en la propia
// máquina); en el piloto no se define y se usa la dirección oficial.
const URL_GATEWAY = process.env.AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh";
const MODELO_ANTHROPIC = "claude-sonnet-5-5";
const MODELO_GATEWAY = "anthropic/claude-sonnet-5.5";
const MAX_TOKENS = 1500;
// En la web nadie debe esperar minutos: 30 s por intento y un solo reintento del SDK.
const TIEMPO_MAXIMO_MS = 30000;
const REINTENTOS = 1;

// Modo manual (sin API, sin clave): MODELO_MANUAL=<carpeta>. Cada llamada busca
// su respuesta en <carpeta>\<hash>.json ({texto}); si no está, deja el turno
// completo en <carpeta>\pendientes\<hash>.json y falla con "manual-pendiente".
// Alguien (Claude con el plan Max) responde los pendientes y se vuelve a correr.
const MANUAL = process.env.MODELO_MANUAL ? path.resolve(process.env.MODELO_MANUAL) : null;

// Token OIDC de la petición en curso (Vercel lo manda en la cabecera
// x-vercel-oidc-token; dura 2 h y se renueva). Todas las peticiones traen un
// token válido del mismo proyecto, así que guardar el último basta.
let tokenOidc = null;
export function fijarTokenOidc(token) {
  if (typeof token === "string" && token.trim()) tokenOidc = token.trim();
}

// Qué proveedor se usa AHORA (se decide en cada llamada: en Vercel el token
// OIDC llega con la primera petición, no al cargar el archivo).
export function proveedor() {
  if (MANUAL) return "manual";
  const forzado = String(process.env.PROVEEDOR || "").trim().toLowerCase();
  if (forzado === "gateway" || forzado === "anthropic") return forzado;
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || tokenOidc || process.env.VERCEL) return "gateway";
  if (process.env.SMART_ROUTER_ANTHROPIC_KEY) return "anthropic";
  return "ninguno";
}

function modeloDe(p) {
  if (process.env.MODELO) return process.env.MODELO;
  return p === "gateway" ? MODELO_GATEWAY : MODELO_ANTHROPIC;
}

// Modelo con el que arranca el proceso (para mostrarlo en el chat y las pruebas).
export const MODELO = modeloDe(proveedor());

// Error propio para que el resto del programa no dependa del SDK.
export class ErrorModelo extends Error {
  constructor(tipo, mensaje) {
    super(mensaje);
    this.tipo = tipo; // "sin-clave" | "autenticacion" | "credito" | "limite" | "conexion" | "api" | "manual-pendiente"
  }
}

// Contador de uso de toda la corrida (para reportar tokens y costo).
const usoTotal = { llamadas: 0, input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
export function obtenerUsoTotal() {
  return { ...usoTotal };
}

// Credencial del gateway: la clave gana sobre el token OIDC (igual que en el gateway).
function credencialGateway() {
  return process.env.AI_GATEWAY_API_KEY || tokenOidc || process.env.VERCEL_OIDC_TOKEN || null;
}

export function hayClave() {
  const p = proveedor();
  if (p === "manual") return true;
  if (p === "gateway") return Boolean(credencialGateway());
  if (p === "anthropic") return Boolean(process.env.SMART_ROUTER_ANTHROPIC_KEY);
  return false;
}

function completarManual(system, mensajes) {
  const hash = crypto.createHash("sha256").update(JSON.stringify({ system, mensajes })).digest("hex").slice(0, 16);
  const rutaRespuesta = path.join(MANUAL, `${hash}.json`);
  const uso = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  if (fs.existsSync(rutaRespuesta)) {
    const r = JSON.parse(fs.readFileSync(rutaRespuesta, "utf8").replace(/^﻿/, ""));
    usoTotal.llamadas += 1;
    return { texto: String(r.texto ?? "").trim(), stop_reason: r.stop_reason || "end_turn", uso };
  }
  const dirPendientes = path.join(MANUAL, "pendientes");
  fs.mkdirSync(dirPendientes, { recursive: true });
  fs.writeFileSync(path.join(dirPendientes, `${hash}.json`), JSON.stringify({ hash, system, mensajes }, null, 2), "utf8");
  throw new ErrorModelo("manual-pendiente", `Turno pendiente de respuesta manual: ${hash}`);
}

// Un cliente por credencial (el token OIDC rota cada ~90 min: se crea uno nuevo).
let cliente = null;
let firmaCliente = null;
function obtenerCliente(p) {
  let opciones;
  if (p === "gateway") {
    const credencial = credencialGateway();
    if (!credencial) throw new ErrorModelo("sin-clave", "Falta AI_GATEWAY_API_KEY o el token OIDC de Vercel");
    opciones = { apiKey: credencial, baseURL: URL_GATEWAY };
  } else if (p === "anthropic") {
    if (!process.env.SMART_ROUTER_ANTHROPIC_KEY) throw new ErrorModelo("sin-clave", "Falta SMART_ROUTER_ANTHROPIC_KEY en app\\.env.local");
    // baseURL explícita: así el SDK no toma ANTHROPIC_BASE_URL del entorno.
    opciones = { apiKey: process.env.SMART_ROUTER_ANTHROPIC_KEY, baseURL: "https://api.anthropic.com" };
  } else {
    throw new ErrorModelo("sin-clave", "No hay proveedor de modelo: falta MODELO_MANUAL, credencial del gateway o SMART_ROUTER_ANTHROPIC_KEY");
  }
  const firma = crypto.createHash("sha256").update(`${p}|${opciones.baseURL}|${opciones.apiKey}`).digest("hex");
  if (!cliente || firma !== firmaCliente) {
    // apiKey explícita y authToken en null: así el SDK nunca toma ANTHROPIC_API_KEY
    // ni ANTHROPIC_AUTH_TOKEN del entorno.
    cliente = new Anthropic({ ...opciones, authToken: null, timeout: TIEMPO_MAXIMO_MS, maxRetries: REINTENTOS });
    firmaCliente = firma;
  }
  return cliente;
}

// Si el modelo no acepta mensajes de sistema a mitad de conversación, se
// convierten en un recordatorio dentro del último turno del usuario.
function sinMensajesDeSistema(mensajes) {
  const salida = [];
  for (const m of mensajes) {
    if (m.role === "system") {
      const previo = salida[salida.length - 1];
      const nota = `\n\n<instruccion_del_sistema>\n${m.content}\n</instruccion_del_sistema>`;
      if (previo && previo.role === "user") previo.content = `${previo.content}${nota}`;
      else salida.push({ role: "user", content: nota.trim() });
    } else {
      salida.push({ ...m });
    }
  }
  return salida;
}

async function llamar(p, system, mensajes, conEsfuerzo) {
  const cuerpo = {
    model: modeloDe(p),
    max_tokens: MAX_TOKENS,
    // El system es fijo: se marca para caché (más barato en llamadas seguidas).
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: mensajes,
  };
  if (conEsfuerzo) cuerpo.output_config = { effort: "low" };
  return obtenerCliente(p).messages.create(cuerpo);
}

// completar({system, mensajes}) -> {texto, stop_reason, uso}
// mensajes: [{role: "user"|"assistant"|"system", content: string}]
export async function completar({ system, mensajes }) {
  const p = proveedor();
  if (p === "manual") return completarManual(system, mensajes);
  let respuesta;
  try {
    try {
      respuesta = await llamar(p, system, mensajes, true);
    } catch (error) {
      // Un 400 puede venir de un mensaje de sistema a mitad de conversación o de
      // un parámetro que el proveedor no acepta (output_config en el gateway, sin
      // verificar en vivo). Se reintenta UNA vez con la petición más simple.
      if (error instanceof Anthropic.BadRequestError) {
        console.error(`[modelo] 400 del proveedor ${p}; reintento sin mensajes de sistema intermedios ni output_config`);
        respuesta = await llamar(p, system, sinMensajesDeSistema(mensajes), false);
      } else {
        throw error;
      }
    }
  } catch (error) {
    // Cadena de errores, del más específico al más general. Nunca se imprime la credencial.
    if (error instanceof ErrorModelo) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new ErrorModelo("autenticacion", `El proveedor ${p} rechazó la credencial (${error.status}).`);
    }
    if (error instanceof Anthropic.RateLimitError) throw new ErrorModelo("limite", "Límite de uso de la API alcanzado; intenta en un rato.");
    if (error instanceof Anthropic.APIConnectionError) throw new ErrorModelo("conexion", "No hay conexión con la API.");
    // 402 del gateway: sin créditos o presupuesto agotado.
    if (error instanceof Anthropic.APIError && error.status === 402) throw new ErrorModelo("credito", "El gateway no tiene crédito o se agotó el presupuesto (402).");
    if (error instanceof Anthropic.APIError) throw new ErrorModelo("api", `La API respondió con error ${error.status ?? "?"}.`);
    throw new ErrorModelo("api", `Error inesperado: ${error.message}`);
  }

  const u = respuesta.usage || {};
  const uso = {
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
    cache_read_input_tokens: u.cache_read_input_tokens || 0,
  };
  usoTotal.llamadas += 1;
  for (const k of Object.keys(uso)) usoTotal[k] += uso[k];
  // Una línea por llamada en los logs (sin texto de la conversación): tokens y costo
  // estimado. El gateway no devuelve el costo en la respuesta de /v1/messages; el
  // costo real se ve en el panel de AI Gateway (Logs / Usage).
  if (process.env.VERCEL || process.env.REGISTRO_USO) {
    console.log(`[uso] ${p} ${modeloDe(p)} · entrada ${uso.input_tokens} · caché leída ${uso.cache_read_input_tokens} · caché escrita ${uso.cache_creation_input_tokens} · salida ${uso.output_tokens} · ≈US$${costoEstimado(uso).toFixed(5)}`);
  }

  // Rechazo por seguridad: no se lee el contenido.
  if (respuesta.stop_reason === "refusal") {
    return { texto: "", stop_reason: "refusal", uso };
  }
  const texto = (respuesta.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { texto, stop_reason: respuesta.stop_reason, uso };
}

// Costo estimado en dólares con precios de lista de Sonnet 5.5
// (US$2 por millón de tokens de entrada y US$10 por millón de salida;
// escritura de caché 1,25x y lectura 0,1x del precio de entrada).
// El catálogo del gateway (consultado el 2026-11-02) cobra la lectura de caché
// a US$0,10 por millón (0,05x): esta estimación queda un poco por encima.
export function costoEstimado(uso) {
  const entrada = 2 / 1e6;
  const salida = 10 / 1e6;
  return (
    (uso.input_tokens || 0) * entrada +
    (uso.cache_creation_input_tokens || 0) * entrada * 1.25 +
    (uso.cache_read_input_tokens || 0) * entrada * 0.1 +
    (uso.output_tokens || 0) * salida
  );
}
