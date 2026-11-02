// conversacion_manual.js · corre una conversación completa de varios turnos por
// el agente en MODO MANUAL (sin API): repite desde el principio en cada corrida
// (las respuestas ya contestadas salen de la caché por hash) y se detiene en el
// primer turno que aún no tiene respuesta, dejándolo en pruebas\manual\pendientes\.
//
// Uso:  MODELO_MANUAL=<carpeta> node src/conversacion_manual.js <guion.json> [salida.json]
// guion.json: { "nombre": "...", "mensajes": ["hola", "..."] }
// Termina con «CONVERSACION COMPLETA» cuando todos los turnos tienen respuesta y
// escribe la transcripción en salida.json (por defecto pruebas\resultados\<nombre>_conversacion.json).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { responder, reiniciarSesion } from "./agente.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PROYECTO = path.resolve(AQUI, "..", "..");
const [rutaGuion, rutaSalidaArg] = process.argv.slice(2);
if (!rutaGuion) {
  console.error("Falta el guion: node src/conversacion_manual.js <guion.json>");
  process.exit(2);
}
if (!process.env.MODELO_MANUAL) {
  console.error("Este script solo corre en modo manual (MODELO_MANUAL=<carpeta>).");
  process.exit(2);
}
process.env.GUARDIA_SILENCIO = "1";

const guion = JSON.parse(fs.readFileSync(path.resolve(rutaGuion), "utf8").replace(/^﻿/, ""));
const nombre = guion.nombre || path.basename(rutaGuion, ".json");
const sesion = `conv-${nombre}`;
reiniciarSesion(sesion);

const transcripcion = [];
let completa = true;
for (let i = 0; i < guion.mensajes.length; i++) {
  const m = guion.mensajes[i];
  const r = await responder(sesion, m);
  transcripcion.push({ turno: i + 1, cuidadora: m, agente: r.texto, candado: r.candado, fuentes: r.fuentes_usadas, motivo: r.motivo_candado ?? null });
  console.log(`\n[${i + 1}] CUIDADORA: ${m}`);
  if (r.candado === "error") {
    console.log(`[${i + 1}] AGENTE: (pendiente de respuesta manual; ver pruebas\\manual\\pendientes\\)`);
    completa = false;
    break;
  }
  console.log(`[${i + 1}] AGENTE${r.candado ? ` {candado: ${r.candado}}` : ""}: ${r.texto}`);
}

if (completa) {
  const salida = rutaSalidaArg ? path.resolve(rutaSalidaArg) : path.join(PROYECTO, "pruebas", "resultados", `${nombre}_conversacion.json`);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify({ nombre, fecha: new Date().toISOString(), turnos: transcripcion }, null, 2), "utf8");
  console.log(`\nCONVERSACION COMPLETA · ${transcripcion.length} turnos · ${salida}`);
} else {
  console.log(`\nCONVERSACION INCOMPLETA · responde el turno pendiente y vuelve a correr.`);
}
