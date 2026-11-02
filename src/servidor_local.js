// servidor_local.js · `npm run web`: prueba del piloto web en el computador, sin Vercel.
// Sirve public\ en http://127.0.0.1:3000 y monta api\chat.js en /api/chat (la misma
// función que corre en Vercel). Solo escucha en la propia máquina.
// Para probar sin gastar: $env:MODELO_MANUAL = "<carpeta>"; npm run web
// Puerto: variable PORT (por defecto 3000).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import funcion from "../api/chat.js";
import { LIMITE_CUERPO } from "./web.js";
import { proveedor, MODELO } from "./modelo.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.resolve(AQUI, "..", "public");
const PUERTO = Number(process.env.PORT) || 3000;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

// Lee el cuerpo con tope (un poco más que el límite de la función, para que ella responda 413).
function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    const partes = [];
    let total = 0;
    req.on("data", (p) => {
      total += p.length;
      if (total > LIMITE_CUERPO * 2) {
        rechazar(new Error("cuerpo demasiado grande"));
        req.destroy();
        return;
      }
      partes.push(p);
    });
    req.on("end", () => resolver(Buffer.concat(partes)));
    req.on("error", rechazar);
  });
}

async function api(req, res) {
  let cuerpo;
  try {
    cuerpo = req.method === "GET" || req.method === "HEAD" ? undefined : await leerCuerpo(req);
  } catch {
    res.writeHead(413, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "cuerpo-grande" }));
    return;
  }
  const cabeceras = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") cabeceras.set(k, v);
  const peticion = new Request(`http://${req.headers.host || `127.0.0.1:${PUERTO}`}${req.url}`, { method: req.method, headers: cabeceras, body: cuerpo });
  const respuesta = await funcion.fetch(peticion);
  const salida = {};
  respuesta.headers.forEach((v, k) => (salida[k] = v));
  res.writeHead(respuesta.status, salida);
  res.end(Buffer.from(await respuesta.arrayBuffer()));
}

function estatico(req, res) {
  const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const archivo = path.resolve(PUBLICO, "." + (ruta === "/" ? "/index.html" : ruta));
  // Nada fuera de public\ (evita ../../).
  if (!archivo.startsWith(PUBLICO + path.sep) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
    return;
  }
  res.writeHead(200, { "content-type": TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(archivo).pipe(res);
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/chat" || req.url.startsWith("/api/chat?")) await api(req, res);
    else if (req.method === "GET" || req.method === "HEAD") estatico(req, res);
    else {
      res.writeHead(405, { allow: "GET" });
      res.end();
    }
  } catch (e) {
    console.error(`[servidor] ${e.message}`);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Error interno");
  }
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`Piloto web local: http://127.0.0.1:${PUERTO}  (modelo: ${proveedor()} · ${proveedor() === "manual" ? "sin API" : MODELO})`);
  console.log("Ctrl+C para detener.");
});
