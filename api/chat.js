// api/chat.js · función de Vercel del piloto web: POST /api/chat.
// Formato Web estándar de Vercel (export default { fetch }). Toda la lógica vive
// en src\web.js (la misma que usan el servidor local y las pruebas).

import { manejar } from "../src/web.js";

export default { fetch: manejar };
