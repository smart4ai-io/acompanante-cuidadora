// banco.js · corre el banco de precisión (CA10) con reglas, sin juez LLM (v0.1).
//
// Banco: proyectos\unicef-femtech-2026\pruebas\banco_precision.json (se puede
// cambiar con BANCO_PATH). Cada pregunta: { pregunta, tipo, fuentes_esperadas,
// no_debe_decir }. Reglas:
//   - tipo "no-se": la respuesta no trae citas y dice «no lo sé» (o equivalente).
//   - los demás: cita al menos una de fuentes_esperadas.
//   - todas: ningún patrón de no_debe_decir aparece.
// Resultado: % de aciertos en consola y en pruebas\resultados\AAAA-MM-DD_banco.json.
//
// Uso: npm run banco   (cuesta dinero: una llamada al modelo por pregunta)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { responder } from "./agente.js";
import { buscar } from "./biblioteca.js";
import { extraerCitas, FRASE_NO_SE, detectarCrisis, detectarMaltrato } from "./candados.js";
import { obtenerUsoTotal, costoEstimado, MODELO } from "./modelo.js";
import { normalizar } from "./texto.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PROYECTO = path.resolve(AQUI, "..", "..");
export const RUTA_BANCO = process.env.BANCO_PATH ? path.resolve(process.env.BANCO_PATH) : path.join(PROYECTO, "pruebas", "banco_precision.json");
const DIR_RESULTADOS = path.join(PROYECTO, "pruebas", "resultados");
// Temas críticos del spec (crisis, diagnóstico, ley): tipo "critico" del banco o tema de ruta legal.
const TEMAS_CRITICOS = /critico|crisis|diagn|ley|legal|maltrato|tutela|eps|ruta/;

export function leerBanco(ruta = RUTA_BANCO) {
  const datos = JSON.parse(fs.readFileSync(ruta, "utf8").replace(/^﻿/, ""));
  const lista = Array.isArray(datos) ? datos : datos.preguntas || datos.items || [];
  return lista.map((q, i) => ({
    id: q.id ?? `P${String(i + 1).padStart(3, "0")}`,
    pregunta: String(q.pregunta ?? q.texto ?? ""),
    tipo: String(q.tipo ?? "").trim(),
    tema: String(q.tema ?? ""),
    fuentes_esperadas: Array.isArray(q.fuentes_esperadas) ? q.fuentes_esperadas : [],
    no_debe_decir: Array.isArray(q.no_debe_decir) ? q.no_debe_decir : [],
  }));
}

// Un patrón de no_debe_decir es una frase en lenguaje natural: se busca como
// frase completa (palabras enteras), sin mayúsculas ni tildes. Así "toma" no
// coincide dentro de "síntomas" ni "192" dentro de "1923".
export function aparece(patron, texto) {
  const frase = normalizar(patron).trim().replace(/\s+/g, " ");
  if (!frase) return false;
  const escapada = frase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escapada}(?=$|[^a-z0-9])`).test(normalizar(texto));
}

export function evaluar(q, r) {
  const citas = extraerCitas(r.texto);
  const prohibidos = q.no_debe_decir.filter((p) => aparece(p, r.texto));
  let ok;
  let motivo = null;
  if (normalizar(q.tipo) === "no-se") {
    // Decisión de Santiago (2026-11-02): al negarse, el agente puede citar la
    // ficha que lo respalda (p. ej. «qué no hace el agente»); las citas ya pasaron
    // la verificación de existencia en el agente. Lo que se exige es el «no lo sé».
    ok = FRASE_NO_SE.test(r.texto);
    if (!ok) motivo = "no dice «no lo sé»";
  } else {
    ok = q.fuentes_esperadas.some((id) => r.fuentes_usadas.includes(id));
    if (!ok) motivo = `no cita ninguna esperada (${q.fuentes_esperadas.join(", ")}); citó: ${r.fuentes_usadas.join(", ") || "nada"}; candado: ${r.candado}`;
  }
  if (prohibidos.length) {
    ok = false;
    motivo = `dijo lo prohibido: ${prohibidos.join(" | ")}`;
  }
  return { ok, motivo, prohibidos };
}

// Cobertura del bibliotecario (sin modelo, gratis): ¿la búsqueda trae al menos
// una fuente esperada entre los 6 fragmentos? Si no la trae, el modelo no puede citarla.
// Las preguntas que atiende un candado (crisis, maltrato) no pasan por la búsqueda.
export function coberturaBusqueda(preguntas = leerBanco()) {
  const conFuente = preguntas.filter(
    (q) => normalizar(q.tipo) !== "no-se" && q.fuentes_esperadas.length && !detectarCrisis(q.pregunta).detectado && !detectarMaltrato(q.pregunta).detectado,
  );
  const fallos = [];
  for (const q of conFuente) {
    const ids = new Set(buscar(q.pregunta, 6).map((f) => f.id_fuente));
    if (!q.fuentes_esperadas.some((id) => ids.has(id))) fallos.push({ id: q.id, pregunta: q.pregunta, esperadas: q.fuentes_esperadas, trajo: [...ids] });
  }
  return { total: conFuente.length, aciertos: conFuente.length - fallos.length, porcentaje: conFuente.length ? (100 * (conFuente.length - fallos.length)) / conFuente.length : 0, fallos };
}

async function enParalelo(items, n, fn) {
  const salida = new Array(items.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      salida[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return salida;
}

export async function correrBanco({ ruta = RUTA_BANCO, concurrencia = 4, escribir = true } = {}) {
  const preguntas = leerBanco(ruta);
  const usoAntes = obtenerUsoTotal();
  const marca = Date.now();
  const filas = await enParalelo(preguntas, concurrencia, async (q, i) => {
    const r = await responder(`banco-${marca}-${i}`, q.pregunta);
    const e = evaluar(q, r);
    return { id: q.id, tipo: q.tipo, tema: q.tema, pregunta: q.pregunta, ok: e.ok, motivo: e.motivo, candado: r.candado, fuentes_usadas: r.fuentes_usadas, esperadas: q.fuentes_esperadas, respuesta: r.texto };
  });
  const usoDespues = obtenerUsoTotal();
  const uso = {};
  for (const k of Object.keys(usoDespues)) uso[k] = usoDespues[k] - (usoAntes[k] || 0);
  const aciertos = filas.filter((f) => f.ok).length;
  const invencionesCriticas = filas.filter((f) => !f.ok && f.motivo && f.motivo.startsWith("dijo lo prohibido") && TEMAS_CRITICOS.test(normalizar(`${f.tipo} ${f.tema}`)));
  const resumen = {
    fecha: new Date().toISOString(),
    modelo: MODELO,
    banco: ruta,
    total: filas.length,
    aciertos,
    porcentaje: filas.length ? Math.round((1000 * aciertos) / filas.length) / 10 : 0,
    invenciones_criticas: invencionesCriticas.length,
    uso,
    costo_estimado_usd: Math.round(costoEstimado(uso) * 10000) / 10000,
    filas,
  };
  if (escribir) {
    fs.mkdirSync(DIR_RESULTADOS, { recursive: true });
    const dia = new Date().toLocaleDateString("sv-SE");
    let destino = path.join(DIR_RESULTADOS, `${dia}_banco.json`);
    if (fs.existsSync(destino)) destino = path.join(DIR_RESULTADOS, `${dia}_banco_corrida-${marca}.json`);
    fs.writeFileSync(destino, JSON.stringify(resumen, null, 2), "utf8");
    resumen.archivo = destino;
  }
  return resumen;
}

// Ejecución directa: npm run banco
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.env.GUARDIA_SILENCIO = "1";
  const r = await correrBanco();
  for (const f of r.filas.filter((x) => !x.ok)) console.log(`✗ ${f.id} [${f.tipo}] ${f.motivo}`);
  console.log(`\nBanco: ${r.aciertos}/${r.total} = ${r.porcentaje} % · invenciones críticas: ${r.invenciones_criticas}`);
  console.log(`Tokens: entrada ${r.uso.input_tokens} · salida ${r.uso.output_tokens} · caché escrita ${r.uso.cache_creation_input_tokens} · caché leída ${r.uso.cache_read_input_tokens} · costo ≈ US$${r.costo_estimado_usd}`);
  console.log(`Resultado: ${r.archivo}`);
}
