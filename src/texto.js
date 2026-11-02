// texto.js · utilidades de texto compartidas (sin dependencias).

// Pasa a minúsculas y quita tildes y diéresis (la ñ se vuelve n).
// Ejemplo: "Señales ÁNIMO" -> "senales animo".
export function normalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Corta un texto a n caracteres sin romper el programa si viene vacío o raro.
export function recortar(texto, n) {
  const t = String(texto ?? "");
  return t.length > n ? t.slice(0, n) : t;
}
