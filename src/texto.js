// texto.js · utilidades de texto compartidas (sin dependencias).

// Pasa a minúsculas y quita tildes y diéresis (la ñ se vuelve n).
// Ejemplo: "Señales ÁNIMO" -> "senales animo".
export function normalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// 2026-11-10 (auditoría H-01) · Normaliza la ortografía frecuente de un mensaje escrito
// rápido en el celular, ANTES de buscar señales de riesgo. Sobre normalizar() además:
// - letras repetidas 3 o más veces quedan en una («morirrrr» -> «morir»);
// - «k» antes de e / i se vuelve «qu» («me kiero morir» -> «me quiero morir», «ke» -> «que»);
// - «q» o «k» sueltas -> «que»; «xq» / «pq» -> «porque».
// La «h» que falta («acer») se cubre en cada regla con «h?». No cambia nada más (precisión).
export function normalizarEscritura(texto) {
  return normalizar(texto)
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/\b(x|p) ?q\b/g, "porque")
    .replace(/k(?=[ei])/g, "qu")
    .replace(/\b[qk]\b/g, "que");
}

// Corta un texto a n caracteres sin romper el programa si viene vacío o raro.
export function recortar(texto, n) {
  const t = String(texto ?? "");
  return t.length > n ? t.slice(0, n) : t;
}
