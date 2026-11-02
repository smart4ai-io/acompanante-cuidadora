// limite.js · límite simple de mensajes por hora, en memoria (piloto web).
//
// Dos contadores con ventana deslizante de 1 hora:
//   · por sesión (id que guarda el navegador): LIMITE_POR_HORA, 40 por defecto.
//   · por IP (por si alguien borra la sesión para saltarse el límite): LIMITE_IP_POR_HORA, 120.
// Es «mejor esfuerzo»: vive en la memoria de cada instancia de la función, así que
// si Vercel abre varias instancias el conteo se reparte. El tope duro del gasto es
// el presupuesto de AI Gateway (US$35/mes en el equipo).

const VENTANA_MS = 60 * 60 * 1000;
const MAX_CLAVES = 5000; // para que la memoria no crezca sin fin
const marcas = new Map(); // clave -> [milisegundos de cada mensaje]

function entero(valor, porDefecto) {
  const n = Number.parseInt(String(valor ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

export function limites() {
  return { sesion: entero(process.env.LIMITE_POR_HORA, 40), ip: entero(process.env.LIMITE_IP_POR_HORA, 120) };
}

function vigentes(clave, ahora) {
  const lista = (marcas.get(clave) || []).filter((t) => ahora - t < VENTANA_MS);
  if (lista.length) marcas.set(clave, lista);
  else marcas.delete(clave);
  return lista;
}

// ¿Se pasó alguno de los límites? No cuenta nada (para eso está anotar()).
export function excedido({ sesion, ip }, ahora = Date.now()) {
  const l = limites();
  if (sesion && vigentes(`s:${sesion}`, ahora).length >= l.sesion) return "sesion";
  if (ip && vigentes(`i:${ip}`, ahora).length >= l.ip) return "ip";
  return null;
}

export function anotar({ sesion, ip }, ahora = Date.now()) {
  if (marcas.size > MAX_CLAVES) {
    for (const clave of [...marcas.keys()]) vigentes(clave, ahora);
    // Si sigue lleno, se suelta lo más viejo (el Map guarda el orden de llegada).
    while (marcas.size > MAX_CLAVES) marcas.delete(marcas.keys().next().value);
  }
  for (const clave of [sesion && `s:${sesion}`, ip && `i:${ip}`]) {
    if (!clave) continue;
    const lista = vigentes(clave, ahora);
    lista.push(ahora);
    marcas.set(clave, lista);
  }
}

// Solo para las pruebas.
export function reiniciarLimites() {
  marcas.clear();
}
