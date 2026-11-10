// guardia.js · aviso a la persona de guardia.
//
// - En el computador (chat de terminal y pruebas): escribe una línea JSON en
//   app\alertas.log (la ruta se cambia con ALERTAS_LOG; las pruebas lo usan).
// - En la web (Vercel, sin disco donde escribir): no hay archivo. La alerta sale
//   en console.error con el prefijo [GUARDIA] y queda en los logs del proyecto.
// - En los dos casos, si existe GUARDIA_WEBHOOK (una URL https), se hace un POST
//   con {hora, tipo, motivo}. Nada más.
// Privacidad (2026-11-10, auditoría H-06): la alerta NO guarda ni envía nada del mensaje
// (ni extracto, ni el mensaje completo, ni el identificador de la sesión): solo la hora, el tipo
// de alerta y el motivo (la etiqueta fija de la regla que saltó, p. ej. «quiero morir»).
// Así cumple lo que dice el chat: «queda una alerta sin tu nombre».
// Antes guardaba los primeros 80 caracteres (versión en git, commit 190a5b9).
// Fail-open: si algo falla (archivo, webhook), se registra el error y la
// conversación sigue igual.
// Versión anterior (solo archivo): guardia.js.bak_2026-11-02_antes-web.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOG_POR_DEFECTO = path.resolve(AQUI, "..", "alertas.log");
const ESPERA_WEBHOOK_MS = 3000;

// Envíos al webhook que siguen en vuelo. En una función de Vercel hay que
// esperarlos antes de responder (api\chat.js llama a esperarAvisos()), porque
// al terminar la respuesta la función puede congelarse.
const enVuelo = new Set();

export function rutaAlertas() {
  return process.env.ALERTAS_LOG ? path.resolve(process.env.ALERTAS_LOG) : LOG_POR_DEFECTO;
}

// En la web (Vercel) no se escribe archivo, salvo que ALERTAS_LOG lo pida a propósito.
function escribeArchivo() {
  return !process.env.VERCEL || Boolean(process.env.ALERTAS_LOG);
}

function urlWebhook() {
  const u = String(process.env.GUARDIA_WEBHOOK || "").trim();
  if (!u) return null;
  try {
    const url = new URL(u);
    // Solo https (o http a la propia máquina, para probar en local).
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return url.toString();
  } catch {
    /* URL mal escrita: se avisa abajo */
  }
  console.error("[GUARDIA] GUARDIA_WEBHOOK no es una URL https válida; no se envió el aviso");
  return null;
}

function enviarWebhook(url, linea) {
  const cuerpo = JSON.stringify({ hora: linea.hora, tipo: linea.tipo, motivo: linea.motivo });
  const envio = fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: cuerpo,
    signal: AbortSignal.timeout(ESPERA_WEBHOOK_MS),
  })
    .then((r) => {
      if (!r.ok) console.error(`[GUARDIA] el webhook respondió ${r.status}`);
    })
    .catch((e) => console.error(`[GUARDIA] no pude avisar al webhook: ${e.name === "TimeoutError" ? "tiempo agotado" : e.message}`))
    .finally(() => enVuelo.delete(envio));
  enVuelo.add(envio);
}

// Espera (como máximo ~3 s) a que salgan los avisos al webhook. Nunca falla.
export async function esperarAvisos() {
  if (!enVuelo.size) return;
  await Promise.allSettled([...enVuelo]);
}

// Recibe { sesion, tipo, texto, motivo } por compatibilidad, pero «sesion» y «texto» NO se guardan.
export function avisarGuardia({ tipo, motivo } = {}) {
  const linea = {
    hora: new Date().toISOString(),
    tipo: String(tipo ?? "alerta"),
    motivo: motivo ? String(motivo).slice(0, 120) : null,
  };
  if (escribeArchivo()) {
    try {
      fs.appendFileSync(rutaAlertas(), JSON.stringify(linea) + "\n", "utf8");
    } catch (e) {
      console.error(`[GUARDIA] no pude escribir el registro de alertas: ${e.message}`);
    }
  }
  if (!process.env.GUARDIA_SILENCIO) {
    // Una sola línea, fácil de buscar en los logs de Vercel con «[GUARDIA]».
    console.error(`[GUARDIA] ${JSON.stringify(linea)}`);
  }
  const url = urlWebhook();
  if (url) {
    try {
      enviarWebhook(url, linea);
    } catch (e) {
      console.error(`[GUARDIA] no pude preparar el aviso al webhook: ${e.message}`);
    }
  }
  return linea;
}
