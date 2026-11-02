// biblioteca.js · el «bibliotecario» v0.1 (búsqueda por palabras, sin modelo).
//
// Lee conocimiento\biblioteca\**\*.md. Cada documento empieza con una ficha
// entre líneas "---" (id, titulo, fuente, fecha, licencia, idioma, tema, cubre,
// aval, url, estado). Un documento sin ficha o sin id NO entra: solo responde
// lo que está curado. El cuerpo se parte por los encabezados "## " en
// fragmentos {id_fuente, titulo_fuente, seccion, texto}.
//
// La carpeta se puede cambiar con la variable BIBLIOTECA_DIR (útil en pruebas).
// En v0.2 la búsqueda léxica se reemplaza por embeddings abiertos.
//
// Piloto web (2026-11-02): en Vercel solo se sube app\, así que la carpeta
// conocimiento\biblioteca\ no existe allá. `npm run biblioteca` la copia a
// app\biblioteca.json (mismos archivos .md, tal cual) y, si la carpeta no está,
// se lee de ese archivo con el mismo código. Orden: BIBLIOTECA_JSON (fuerza el
// archivo) > BIBLIOTECA_DIR > carpeta por defecto si existe > app\biblioteca.json.
// Versión anterior: biblioteca.js.bak_2026-11-02_antes-web.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizar } from "./texto.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const DIR_POR_DEFECTO = path.resolve(AQUI, "..", "..", "conocimiento", "biblioteca");
export const JSON_POR_DEFECTO = path.resolve(AQUI, "..", "biblioteca.json");

// Estados de ficha que dejan un documento por fuera.
const ESTADOS_EXCLUIDOS = new Set(["retirado", "rechazado", "superado"]);
const MAX_CARACTERES_FRAGMENTO = 1200; // secciones más largas se parten en trozos
const MAX_POR_FUENTE = 2; // variedad: máximo 2 fragmentos de un mismo documento

// Palabras vacías en español (ya normalizadas: sin tildes). Incluye palabras
// que aparecen en casi toda pregunta de una cuidadora y no ayudan a buscar.
const PALABRAS_VACIAS = new Set(`
a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bien cada como con contra cual cuales
cuando cuanto cuantos de del desde donde dos e el ella ellas ello ellos en entre era eran es esa esas ese eso esos
esta estaba estan estar estas este esto estos estoy fue fueron ha hace hacer hacia han has hasta hay he la las le les
lo los mas me mi mia mio mis mucho muy nada ni no nos nosotras nosotros o os otra otras otro otros para pero poco por
porque puede pueden puedo que quien se sea ser si sido sin sobre son soy su sus tal tambien tan tanto te tenia tener
tengo ti tiene tienen todo todos tu tus un una unas uno unos usted ya yo
hija hijo hijas nieta nieto nina nino ninas mama abuela senora pasa debo deberia quiero saber hago favor hola gracias
`.split(/\s+/).filter(Boolean));

let cache = null; // { dir, docs, fragmentos, df, total }

// ---------- utilidades de texto ----------

// Raíz muy simple: quita el plural y deja como máximo 5 letras.
// "señales" -> "senal", "pediatra" -> "pedia", "tutela" -> "tutel", "eps" -> "eps".
function raiz(palabra) {
  let p = palabra;
  if (p.length > 4 && p.endsWith("es")) p = p.slice(0, -2);
  else if (p.length > 3 && p.endsWith("s")) p = p.slice(0, -1);
  return p.length > 5 ? p.slice(0, 5) : p;
}

// Texto -> lista de raíces útiles (sin palabras vacías).
export function tokenizar(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 2 && !PALABRAS_VACIAS.has(p))
    .map(raiz);
}

// Texto -> palabras normalizadas, CON palabras vacías (para buscar frases).
function palabrasPlanas(texto) {
  return normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

// Pares de palabras seguidas de la consulta ("tiene autismo", "cita negada"),
// sin contar los pares hechos solo de palabras vacías.
function paresDeConsulta(consulta) {
  const p = palabrasPlanas(consulta);
  const pares = [];
  for (let i = 0; i + 1 < p.length; i++) {
    if (PALABRAS_VACIAS.has(p[i]) && PALABRAS_VACIAS.has(p[i + 1])) continue;
    pares.push(` ${p[i]} ${p[i + 1]} `);
  }
  return [...new Set(pares)];
}

// ---------- lectura de documentos ----------

function listarMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const salida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...listarMarkdown(ruta));
    else if (entrada.isFile() && entrada.name.toLowerCase().endsWith(".md")) salida.push(ruta);
  }
  return salida.sort();
}

// Parte la ficha YAML línea a línea (solo "clave: valor"; las listas con "- x"
// debajo de una clave se unen con comas). No usa un parser YAML a propósito.
export function parsearFicha(contenido) {
  const texto = String(contenido ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!texto.startsWith("---\n")) return { ficha: null, cuerpo: texto };
  const fin = texto.indexOf("\n---", 4);
  if (fin === -1) return { ficha: null, cuerpo: texto };
  const ficha = {};
  let ultimaClave = null;
  for (const linea of texto.slice(4, fin).split("\n")) {
    const lista = linea.match(/^\s*-\s+(.*)$/);
    if (lista && ultimaClave) {
      ficha[ultimaClave] = [ficha[ultimaClave], limpiarValor(lista[1])].filter(Boolean).join(", ");
      continue;
    }
    const m = linea.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    ultimaClave = m[1].trim().toLowerCase();
    ficha[ultimaClave] = limpiarValor(m[2]);
  }
  const cuerpo = texto.slice(fin + 4).replace(/^[^\n]*\n/, "");
  return { ficha, cuerpo };
}

function limpiarValor(v) {
  let s = String(v ?? "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1).split(",").map((x) => limpiarValor(x)).join(", ");
  return s.trim();
}

// Cuerpo -> fragmentos por "## ". Lo que va antes del primer "## " queda como
// sección "Introducción" (si tiene contenido). Secciones largas se parten por párrafos.
function partirEnFragmentos(ficha, cuerpo) {
  const secciones = [];
  let actual = { seccion: "Introducción", lineas: [] };
  for (const linea of cuerpo.split("\n")) {
    const enc = linea.match(/^##\s+(.+?)\s*#*\s*$/);
    if (enc && !linea.startsWith("###")) {
      secciones.push(actual);
      actual = { seccion: enc[1].trim(), lineas: [] };
    } else if (!/^#\s+/.test(linea)) {
      actual.lineas.push(linea);
    }
  }
  secciones.push(actual);

  const fragmentos = [];
  for (const s of secciones) {
    const texto = s.lineas.join("\n").trim();
    if (!texto) continue;
    const trozos = partirLargo(texto);
    trozos.forEach((t, i) => {
      fragmentos.push({
        id_fuente: ficha.id,
        titulo_fuente: ficha.titulo || ficha.id,
        seccion: trozos.length > 1 ? `${s.seccion} (parte ${i + 1})` : s.seccion,
        texto: t,
      });
    });
  }
  return fragmentos;
}

function partirLargo(texto) {
  if (texto.length <= MAX_CARACTERES_FRAGMENTO) return [texto];
  const trozos = [];
  let actual = "";
  for (const parrafo of texto.split(/\n\s*\n/)) {
    if (actual && (actual + "\n\n" + parrafo).length > MAX_CARACTERES_FRAGMENTO) {
      trozos.push(actual);
      actual = parrafo;
    } else {
      actual = actual ? actual + "\n\n" + parrafo : parrafo;
    }
  }
  if (actual) trozos.push(actual);
  // Un párrafo único gigante se corta en pedazos fijos para no mandar textos enormes.
  return trozos.flatMap((t) => {
    if (t.length <= MAX_CARACTERES_FRAGMENTO * 1.5) return [t];
    const piezas = [];
    for (let i = 0; i < t.length; i += MAX_CARACTERES_FRAGMENTO) piezas.push(t.slice(i, i + MAX_CARACTERES_FRAGMENTO));
    return piezas;
  });
}

// ---------- carga e índice ----------

// Documento que entraría a la biblioteca (misma regla en la carpeta y en el JSON).
export function documentoValido(contenido) {
  const { ficha } = parsearFicha(contenido);
  return Boolean(ficha && ficha.id && !ESTADOS_EXCLUIDOS.has(normalizar(ficha.estado)));
}

// Lee los .md de una carpeta: [{ruta, contenido}] o {ruta, error} si no se pudo leer.
export function leerCarpeta(dir) {
  return listarMarkdown(dir).map((ruta) => {
    try {
      return { ruta, contenido: fs.readFileSync(ruta, "utf8") };
    } catch (e) {
      return { ruta, error: e.code || e.message };
    }
  });
}

// De dónde sale la biblioteca: {dir (para mostrar), archivos: [{ruta, contenido}]}.
function leerOrigen() {
  const desdeJson = (ruta) => {
    try {
      const datos = JSON.parse(fs.readFileSync(ruta, "utf8").replace(/^﻿/, ""));
      const archivos = Array.isArray(datos.archivos) ? datos.archivos.filter((a) => a && typeof a.ruta === "string" && typeof a.contenido === "string") : [];
      return { dir: ruta, archivos };
    } catch (e) {
      console.error(`[biblioteca] no pude leer ${path.basename(ruta)}: ${e.code || e.message}`);
      return { dir: ruta, archivos: [] };
    }
  };
  if (process.env.BIBLIOTECA_JSON) return desdeJson(path.resolve(process.env.BIBLIOTECA_JSON));
  if (process.env.BIBLIOTECA_DIR) {
    const dir = path.resolve(process.env.BIBLIOTECA_DIR);
    return { dir, archivos: leerCarpeta(dir) };
  }
  if (fs.existsSync(DIR_POR_DEFECTO)) return { dir: DIR_POR_DEFECTO, archivos: leerCarpeta(DIR_POR_DEFECTO) };
  if (fs.existsSync(JSON_POR_DEFECTO)) return desdeJson(JSON_POR_DEFECTO);
  return { dir: DIR_POR_DEFECTO, archivos: [] };
}

function cargar() {
  const { dir, archivos } = leerOrigen();
  const docs = [];
  const fragmentos = [];
  const excluidos = [];
  for (const { ruta, contenido, error } of archivos) {
    if (error) {
      excluidos.push({ ruta, motivo: `no se pudo leer: ${error}` });
      continue;
    }
    const { ficha, cuerpo } = parsearFicha(contenido);
    if (!ficha || !ficha.id) {
      excluidos.push({ ruta, motivo: "sin ficha o sin id" });
      continue;
    }
    if (ESTADOS_EXCLUIDOS.has(normalizar(ficha.estado))) {
      excluidos.push({ ruta, motivo: `estado ${ficha.estado}` });
      continue;
    }
    const frags = partirEnFragmentos(ficha, cuerpo);
    docs.push({ ...ficha, ruta, n_fragmentos: frags.length });
    fragmentos.push(...frags);
  }

  // Índice: tokens de cada fragmento (texto, sección y metadatos del documento).
  const metaPorId = new Map(docs.map((d) => [d.id, new Set(tokenizar(`${d.titulo || ""} ${d.cubre || ""} ${d.tema || ""}`))]));
  const df = new Map();
  for (const f of fragmentos) {
    const tf = new Map();
    for (const t of tokenizar(f.texto)) tf.set(t, (tf.get(t) || 0) + 1);
    f._tf = tf;
    f._meta = metaPorId.get(f.id_fuente) || new Set();
    f._seccion = new Set(tokenizar(f.seccion));
    f._plano = ` ${palabrasPlanas(`${f.seccion} ${f.texto}`).join(" ")} `;
    const todos = new Set([...tf.keys(), ...f._meta, ...f._seccion]);
    for (const t of todos) df.set(t, (df.get(t) || 0) + 1);
  }
  cache = { dir, docs, fragmentos, df, total: fragmentos.length, excluidos };
  return cache;
}

function indice() {
  return cache || cargar();
}

// ---------- API pública ----------

// Vuelve a leer la carpeta (por ejemplo, después de agregar documentos).
export function recargar() {
  cache = null;
  const c = indice();
  return { dir: c.dir, documentos: c.docs.length, fragmentos: c.total, excluidos: c.excluidos };
}

// Lista de fichas de la biblioteca (sin el texto).
export function fuentes() {
  return indice().docs.map((d) => ({ ...d }));
}

// Busca los k fragmentos más útiles para la consulta. Devuelve [] si no hay nada.
export function buscar(consulta, k = 6) {
  const { fragmentos, df, total } = indice();
  if (!total) return [];
  const consultaTokens = [...new Set(tokenizar(consulta))];
  if (!consultaTokens.length) return [];
  const pares = paresDeConsulta(consulta);

  const puntuados = [];
  for (const f of fragmentos) {
    let puntaje = 0;
    // Bonus de frase: la sección o el texto contienen dos palabras seguidas de la consulta.
    for (const par of pares) if (f._plano.includes(par)) puntaje += 2;
    for (const t of consultaTokens) {
      const idf = Math.log(1 + total / ((df.get(t) || 0) + 0.5));
      const tf = f._tf.get(t) || 0;
      let peso = tf > 0 ? 1 + Math.log(tf) : 0;
      if (f._meta.has(t)) peso += 1.5; // la palabra está en "cubre" o en el título
      if (f._seccion.has(t)) peso += 1.0; // la palabra está en el nombre de la sección
      puntaje += idf * peso;
    }
    if (puntaje > 0) puntuados.push({ f, puntaje });
  }
  puntuados.sort((a, b) => b.puntaje - a.puntaje);
  if (!puntuados.length) return [];

  // Se descartan los que quedan muy por debajo del mejor (ruido) y se limita por documento.
  const corte = puntuados[0].puntaje * 0.25;
  const porFuente = new Map();
  const salida = [];
  for (const { f, puntaje } of puntuados) {
    if (puntaje < corte) break;
    const n = porFuente.get(f.id_fuente) || 0;
    if (n >= MAX_POR_FUENTE) continue;
    porFuente.set(f.id_fuente, n + 1);
    salida.push({
      id_fuente: f.id_fuente,
      titulo_fuente: f.titulo_fuente,
      seccion: f.seccion,
      texto: f.texto,
      puntaje: Math.round(puntaje * 100) / 100,
    });
    if (salida.length >= k) break;
  }
  return salida;
}
