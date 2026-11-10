// chat.js · chat de prueba en la terminal (npm run chat).
// Comandos: /salir · /chequeo · /resumen · /fuentes
// Para anotar en el diario: escribe «diario: lo que observaste» (o «diario 2026-10-28: ...»).

import readline from "node:readline/promises";
import { stdin as entrada, stdout as salida } from "node:process";
import { responder, chequeoBienestar, resumenConsulta } from "./agente.js";
import { fuentes, recargar } from "./biblioteca.js";
import { hayClave, MODELO, obtenerUsoTotal, costoEstimado } from "./modelo.js";

const SESION = "terminal";

function mostrar(r) {
  console.log(`\n${r.texto}\n`);
  const pie = [];
  if (r.fuentes_usadas && r.fuentes_usadas.length) pie.push(`fuentes: ${r.fuentes_usadas.join(", ")}`);
  if (r.candado) pie.push(`candado: ${r.candado}`);
  if (r.uso && r.uso.llamadas) pie.push(`tokens: ${r.uso.input_tokens + r.uso.cache_read_input_tokens + r.uso.cache_creation_input_tokens} entrada / ${r.uso.output_tokens} salida`);
  if (pie.length) console.log(`   [${pie.join(" · ")}]\n`);
}

const info = recargar();
console.log("Contigo · chat de prueba en la terminal (aquí no se exige el perfil sensorial; en la web sí)");
console.log(`Modelo: ${MODELO} · biblioteca: ${info.documentos} documentos, ${info.fragmentos} fragmentos`);
if (!hayClave()) console.log("AVISO: falta SMART_ROUTER_ANTHROPIC_KEY en app\\.env.local; solo funcionarán los candados y el chequeo.");
console.log("Comandos: /chequeo · /resumen · /fuentes · /salir · para el diario escribe «diario: ...»\n");

const rl = readline.createInterface({ input: entrada, output: salida });
rl.setPrompt("tú > ");
rl.prompt();
try {
  // Se lee línea por línea (funciona escribiendo a mano y también con texto pegado o enviado por tubería).
  for await (const linea of rl) {
    const t = linea.trim();
    if (!t) {
      rl.prompt();
      continue;
    }
    if (t === "/salir") break;
    try {
      if (t === "/chequeo") mostrar(chequeoBienestar(SESION));
      else if (t === "/resumen") mostrar(await resumenConsulta(SESION));
      else if (t === "/fuentes") {
        const lista = fuentes();
        if (!lista.length) console.log("\n(La biblioteca está vacía.)\n");
        for (const f of lista) console.log(`- ${f.id} · ${f.titulo || ""} · ${f.fuente || ""} · aval: ${f.aval || "?"}`);
        console.log("");
      } else mostrar(await responder(SESION, t));
    } catch (e) {
      console.error(`\n[error] ${e.message}\n`);
    }
    rl.prompt();
  }
} finally {
  rl.close();
  const u = obtenerUsoTotal();
  if (u.llamadas) console.log(`\nLlamadas al modelo: ${u.llamadas} · costo estimado ≈ US$${costoEstimado(u).toFixed(4)}`);
  console.log("Hasta pronto.");
}
