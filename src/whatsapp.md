# Cómo se conectará WhatsApp (después de v0.1)

> Hoy NO hay nada de WhatsApp construido. Esto es solo el plan del adaptador.

## La idea
El agente ya tiene una sola puerta: `responder(sesionId, texto, opciones)` en `src/agente.js`.
El chat de la terminal la usa hoy; WhatsApp la usará igual. No se toca el agente.

## El adaptador (un archivo nuevo, `src/whatsapp.js`)
1. Recibe el webhook de la API oficial de WhatsApp Business (Meta Cloud API).
2. Verifica la firma del webhook (HMAC) y descarta mensajes repetidos (idempotencia).
3. Convierte el teléfono en un identificador anónimo: `sesionId = sha256(sal + telefono)`.
   El número real nunca se guarda ni llega al agente.
4. Si es nota de voz: la transcribe y llama `responder(sesionId, texto, { esDiario: true })`
   cuando la cuidadora la marque como diario.
5. Llama `responder(sesionId, texto)` y envía `resultado.texto` de vuelta por la API.
6. Si `resultado.candado` es `crisis` o `maltrato`, el aviso a la guardia ya salió desde
   `src/guardia.js` (que en el piloto enviará un WhatsApp real a la persona de guardia).

## Lo que falta decidir antes de construirlo
- Número y cuenta de WhatsApp Business (Meta), plantillas aprobadas y costo por conversación.
- Dónde se aloja (servidor con HTTPS) y dónde se guardan las sesiones (hoy viven en memoria).
- Transcripción de voz con un modelo abierto (CA6) y consentimiento informado (Ley 1581).
- Pruebas CA11 (registro en 3 preguntas) y CA12 (guardia responde en menos de 15 minutos).
