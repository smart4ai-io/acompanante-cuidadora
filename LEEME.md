# Acompañante de la cuidadora · v2 conversacional (prueba en el computador)

## Qué es
Una experta cálida en autismo infantil (con foco en niñas) y en el cuidado de quien cuida, para madres y abuelas en Colombia. **Conversa como una persona: saluda, escucha, pregunta, explica y acompaña; orienta y remite; nunca diagnostica.**
Desde la v2 (2026-11-02, spec «v2 · Experta conversacional») ya no responde «solo con la biblioteca»: usa la biblioteca como fuente preferida y la cita cuando la usa, y conversa con su conocimiento general sobre autismo, desarrollo, crianza y autocuidado.
Lo que **solo** dice con fuente de la biblioteca: datos de Colombia (leyes, EPS, tutela, ICBF, teléfonos, plazos) y cifras de instrumentos (PHQ, GAD, criterios); si no hay fuente para eso, dice «no lo sé con certeza» y remite.
Corre en la terminal del PC, con Claude (Sonnet 5.5) como modelo. WhatsApp viene después.

Cómo responde cada mensaje (siempre en este orden):
1. **Candado de crisis** (reglas fijas, sin IA): si hay riesgo de suicidio, da la Línea 106 y el 123 y avisa a la guardia.
2. **Candado de maltrato** (reglas fijas): da la línea 141 del ICBF y avisa a la guardia.
3. **Bibliotecario**: busca en `..\conocimiento\biblioteca\` los fragmentos que sirven.
4. **Modelo**: conversa como experta; cuando usa un fragmento, cita `[fuente: id]`.
5. **Filtro de diagnóstico**: si la respuesta suena a «sí/no tiene autismo», la bloquea y la rehace.
6. **Verificación de citas**: si cita una fuente que no existe, o da un dato de Colombia o una cifra de un instrumento sin fuente, responde «no lo sé; consúltalo con…». La charla y lo general pasan.

## Cómo correr el chat (5 minutos)
1. Abre PowerShell en esta carpeta: `Set-Location "C:\Users\PC\Documents\RAG Claude Cowork\Claude Cowork y Code\proyectos\unicef-femtech-2026\app"`
2. Escribe `npm run chat` y conversa.
3. Comandos: `/chequeo` (chequeo de bienestar PHQ-2 y GAD-2) · `/resumen` (resumen del diario para la consulta) · `/fuentes` (documentos de la biblioteca) · `/salir`.
4. Para anotar en el diario: `diario: hoy se tapó los oídos en la tienda` (o `diario 2026-10-28: ...`).

Qué esperar ver: la respuesta y, debajo, entre corchetes, las fuentes usadas y el candado si saltó.

## Cómo correr las pruebas
- `npm test`: corre todos los criterios de aceptación (CA1 a CA10 y CA13). Las pruebas de candados y búsqueda son gratis;
  las que usan el modelo cuestan centavos. Si no hay clave, se saltan solas.
- `$env:SIN_BANCO = "1"; npm test`: igual, pero sin el banco de precisión (lo más caro). Para volver a incluirlo: `Remove-Item Env:SIN_BANCO`.
- `npm run banco`: solo el banco de precisión. Deja el resultado en `..\pruebas\resultados\AAAA-MM-DD_banco.json`.

## Piloto web en Vercel (2026-11-02)
La misma Acompañante, en una página web con la pantalla tipo WhatsApp y el panel «Por dentro». El agente corre en el servidor (`api\chat.js`, que usa `src\web.js`); **el servidor no guarda conversaciones**: la sesión (historial, crisis, diario, chequeo) vive en el navegador de cada persona y viaja en cada mensaje.
- **Modelo:** Claude Sonnet 5.5 por **Vercel AI Gateway** (`anthropic/claude-sonnet-5.5`), con el mismo SDK de Anthropic apuntando a `https://ai-gateway.vercel.sh`. No hace falta clave de Anthropic.
- **Límite:** 40 mensajes por hora por sesión y 120 por IP (en memoria de cada instancia; el tope duro es el presupuesto del Gateway). Un mensaje de crisis o maltrato pasa siempre.

**Antes de desplegar (siempre):**
1. `npm run biblioteca` → copia `..\conocimiento\biblioteca\` a `biblioteca.json` (lo único de la biblioteca que viaja a Vercel). Si cambias la biblioteca y lo olvidas, la prueba de la web falla con «corre npm run biblioteca».
2. `$env:SIN_BANCO = "1"; $env:MODELO_MANUAL = "C:\Users\PC\Documents\RAG Claude Cowork\Claude Cowork y Code\proyectos\unicef-femtech-2026\pruebas\manual"; npm test` → todo en verde.
3. `node --test pruebas/api.test.js` → pruebas de la web (gratis siempre: fuerzan el modo manual y usan un gateway falso en el propio computador).

**Probar en el computador, sin Vercel y sin gastar:** `$env:MODELO_MANUAL = "C:\Users\PC\Documents\RAG Claude Cowork\Claude Cowork y Code\proyectos\unicef-femtech-2026\pruebas\manual"; npm run web` y abre http://127.0.0.1:3000 (candados, diario, chequeo y fuentes funcionan; lo que necesita el modelo responde con el mensaje de error o con la red de seguridad).

**Desplegar (lo hace el hilo principal con el visto bueno de Santiago; reglas en `proyectos\Smart-Vercel\00_CENTRO_DE_CONTROL_VERCEL.md`):**
1. Desde esta carpeta (`app\`): `npx vercel` → crea el proyecto en el equipo `santi-1455s-projects` y deja un **preview** (URL protegida con login de Vercel). Nada de `--prod` sin la palabra «publica».
2. El `.vercelignore` es una lista blanca: solo suben `api\`, `public\`, `src\`, `package.json`, `package-lock.json`, `vercel.json` y `biblioteca.json`; nunca `.env*`, `pruebas\`, respaldos ni logs.
3. Producción: `npx vercel --prod` (solo con «publica»).

**Variables de entorno (solo nombres; los valores nunca en el chat ni en archivos):**
| Nombre | ¿Hace falta? | Para qué |
|---|---|---|
| (ninguna) | — | En Vercel el Gateway se autentica solo con el token OIDC del proyecto (cabecera `x-vercel-oidc-token`). |
| `AI_GATEWAY_API_KEY` | Opcional | Si se prefiere una clave del Gateway con presupuesto propio (como el proyecto `copiloto`). Si existe, gana sobre el OIDC. |
| `GUARDIA_WEBHOOK` | Opcional | URL https que recibe un POST con `{hora, tipo, motivo}` en cada aviso a la guardia (desde 2026-11-10 sin texto del mensaje). |
| `MODELO` | Opcional | Cambia el modelo. En el Gateway, con el formato `proveedor/modelo` de https://ai-gateway.vercel.sh/v1/models (por ejemplo `anthropic/claude-haiku-5.5`). |
| `LIMITE_POR_HORA` · `LIMITE_IP_POR_HORA` | Opcional | Cambian los límites (40 y 120). |
| `PROVEEDOR` | Opcional | `gateway` o `anthropic` para forzar el proveedor. |

**Cómo se ve la guardia en los logs:** en Vercel → proyecto → *Logs*, busca `[GUARDIA]`. Cada aviso es una línea como `[GUARDIA] {"hora":"…","tipo":"crisis","motivo":"quiero morir"}` (desde 2026-11-10, auditoría H-06: sin extracto del mensaje ni identificador de sesión; el motivo es la etiqueta fija de la regla). Los tipos: `crisis`, `maltrato`, `pide-persona`, `bienestar-alto`, `rechazo-del-modelo`. Cada llamada al modelo deja además una línea `[uso]` con tokens y costo estimado (sin texto de la conversación); el costo real está en el panel de AI Gateway.

**Cambiar el modelo:** variable `MODELO` en el proyecto de Vercel (por ejemplo `anthropic/claude-haiku-5.5`, más barato) y volver a desplegar. El código del modelo vive solo en `src\modelo.js`.

**Qué verificar en el primer despliegue (no se pudo probar sin Vercel):** que el preview responda «hola» con el modelo (no con el mensaje de error), que en *Logs* aparezca la línea `[uso] gateway anthropic/claude-sonnet-5.5`, que la petición aparezca en AI Gateway → *Logs*, y que «ya no aguanto más» deje la línea `[GUARDIA]`. Si sale el error `autenticacion`, revisar en Ajustes → *Security* que «Secure backend access with OIDC federation» esté activo, o poner `AI_GATEWAY_API_KEY`.

## Qué cuesta (precios de lista de Sonnet 5.5: US$2 por millón de tokens de entrada, US$10 por millón de salida)
- Una pregunta en el chat: alrededor de US$0,01.
- `npm test` completo (con el banco de 30 preguntas): alrededor de US$0,30 a US$0,50.
- Los candados, el chequeo de bienestar y el diario no cuestan nada (no llaman al modelo).

## Dónde está cada cosa
- `src\agente.js` el corazón · `src\candados.js` reglas fijas · `src\biblioteca.js` el bibliotecario
- `src\prompt.js` instrucciones y respuestas fijas · `src\modelo.js` el único archivo que habla con Claude
- `src\chat.js` chat de prueba · `src\banco.js` banco de precisión · `src\guardia.js` aviso a la guardia
- `pruebas\ca.test.js` las pruebas · `alertas.log` registro de alertas (solo hora, tipo y motivo)
- Piloto web: `api\chat.js` (función de Vercel) · `src\web.js` (su lógica) · `src\limite.js` (límite por hora) · `public\index.html` (la página) · `src\servidor_local.js` (`npm run web`) · `src\generar_biblioteca.js` (`npm run biblioteca` → `biblioteca.json`) · `vercel.json` · `.vercelignore` · `pruebas\api.test.js`
- La clave va en `.env.local` como `SMART_ROUTER_ANTHROPIC_KEY` (nunca en el chat). El modelo se cambia con `MODELO=`.

## Qué NO hace todavía
- No está en WhatsApp ni recibe notas de voz (ver `src\whatsapp.md`).
- La guardia no recibe un aviso real: solo queda en `alertas.log` y en la pantalla (en la web: en los logs de Vercel y, si se configura, en `GUARDIA_WEBHOOK`).
- Las conversaciones se borran al cerrar el programa (viven en memoria). En la web viven en el navegador de cada persona.
- La búsqueda es por palabras; la búsqueda por significado (embeddings abiertos) es de v0.2.
- No se ha probado con un modelo de pesos abiertos (CA6) ni con cuidadoras reales (CA11, CA12).
- Las preguntas del chequeo y los textos de crisis y maltrato fueron revisados y aprobados por la terapeuta (2026-11-08).
