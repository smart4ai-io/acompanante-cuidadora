// generar_biblioteca.js · `npm run biblioteca`
// Copia los documentos válidos de ..\conocimiento\biblioteca\ (con ficha, con id y
// sin estado retirado/rechazado/superado) a app\biblioteca.json, tal cual, para
// que el despliegue en Vercel sea autocontenido (allá solo se sube app\).
// Hay que correrlo cada vez que cambie la biblioteca y ANTES de desplegar.
// La prueba «biblioteca.json al día» de pruebas\api.test.js avisa si se olvidó.

import fs from "node:fs";
import path from "node:path";
import { DIR_POR_DEFECTO, JSON_POR_DEFECTO, leerCarpeta, documentoValido } from "./biblioteca.js";

const dir = process.env.BIBLIOTECA_DIR ? path.resolve(process.env.BIBLIOTECA_DIR) : DIR_POR_DEFECTO;
if (!fs.existsSync(dir)) {
  console.error(`No encuentro la carpeta de la biblioteca: ${dir}`);
  process.exit(1);
}

const leidos = leerCarpeta(dir);
const fallidos = leidos.filter((a) => a.error);
const archivos = leidos
  .filter((a) => !a.error && documentoValido(a.contenido))
  .map((a) => ({ ruta: path.relative(dir, a.ruta).split(path.sep).join("/"), contenido: a.contenido }));

if (fallidos.length) {
  for (const f of fallidos) console.error(`No pude leer ${f.ruta}: ${f.error}`);
  process.exit(1);
}
if (!archivos.length) {
  console.error("La biblioteca no tiene documentos válidos; no escribo biblioteca.json.");
  process.exit(1);
}

const salida = { generado: new Date().toISOString(), origen: "conocimiento/biblioteca", documentos: archivos.length, archivos };
fs.writeFileSync(JSON_POR_DEFECTO, JSON.stringify(salida, null, 1) + "\n", "utf8");
const excluidos = leidos.length - archivos.length;
console.log(`biblioteca.json listo: ${archivos.length} documentos (${excluidos} excluidos) · ${(fs.statSync(JSON_POR_DEFECTO).size / 1024).toFixed(1)} KB · ${JSON_POR_DEFECTO}`);
