# Caparazón Contigo v1 · lo común de las piezas de «Recursos»

> 2026-11-08 · Nace con `asi-soy-yo.html`. Se copia **idéntico** a cada pieza nueva; si cambia, sube a v2 y se copia a todas.

## Qué trae
- **Tokens de color** (pasteles menta, lavanda, rosa, arena + tonos profundos AA) y **tema claro/oscuro** (sigue al sistema; el botón de la luna lo fija).
- **Color de acción: morado** (`--principal` #6B3FA0, blanco encima 7,38:1; oscuro #C9B2F5; modo suave #5E4A85 / #C3B6DD). Nunca verde para la acción (guía de lenguaje, regla 8; cambio del 2026-11-10).
- **Modo sensorial bajo**, en pantalla «Modo suave»: colores apagados, sin degradados, sin sombras, sin movimiento. También se apaga todo movimiento con «reducir movimiento» del celular.
- **Cabecera** con «Modo suave», tema y el sello «Prototipo · datos de ejemplo».
- **Barra fija** «Pausa · Calma · Necesito ayuda · Salir». Calma = respiración 4-6 s. Necesito ayuda = tarjeta grande para mostrar; en vistas de adulto muestra 123, 106 y 141 («ante un posible maltrato a una niña, niño o adolescente») **escritos y como enlaces `tel:`** (desde 2026-11-10, auditoría H-08: la página no llama sola; la persona toca el número). La parte infantil («Por favor, quédate cerca y háblame despacio») no lleva números. Salir = va al inicio del sitio (fuera del sitio, «puedes cerrar»); si la página se abrió con `?desde=chat`, el botón dice «Volver al chat» y lleva a `/#chat` (`Contigo.desdeChat()`, auditoría H-07).
- **Cabecera hasta 479 px:** solo «Contigo» (sin « · Recursos»), para que «Modo suave» y el tema quepan sin ensanchar la página (auditoría H-03, 2026-11-10).
- **Voz** opcional (`Contigo.voz`): solo con un toque; si no hay voz en español, los botones con `data-voz` se esconden.
- **Baúl** (`Contigo.baul`): localStorage con claves `contigo.*`, todo en try/catch.
- **Puerta de adulto** (`Contigo.puertaAdulto`): mantener presionado 3 s (también con teclado).
- **Doble toque** (`Contigo.dobleToque`) para lo que no tiene reversa.
- **Enlace con estado en el #** (`Contigo.enlace`) y **QR propio** (`Contigo.qr.svg`), sin librerías ni red.
- `Contigo.copiar` (con plan B), `Contigo.anunciar` (lector de pantalla), `Contigo.esc` (escapar HTML).
- Reglas fijas: letra ≥ 17 px, botones ≥ 44 px, contraste AA, desde 320 px, sin sonido al cargar.

## Cómo se copia a una pieza nueva
1. Copia de `asi-soy-yo.html`, tal cual, los bloques marcados `CARAPAZON CONTIGO v1`:
   - CSS: de `/* === CARAPAZON CONTIGO v1 === */` a `/* === FIN CARAPAZON CONTIGO v1 === */` (dentro de `<style>`).
   - JS: el mismo par de marcas dentro del primer `<script>` (va en el `<head>`).
   - HTML: `<!-- === CARAPAZON CONTIGO v1 · HTML (arriba) -->` y `(abajo)`; y del `<svg>` de dibujos, los símbolos `i-*`.
   - La etiqueta `<meta http-equiv="Content-Security-Policy" …>` y el `<link>` de Poppins.
2. El contenido de la pieza va dentro de `<main id="principal">`.
3. Al final, en el script de la pieza: `Contigo.iniciar({ vistaAdulto: true|false, textoEscuchar: () => '…' })`.
   En vistas de niña o adolescente usa `vistaAdulto: false` (la tarjeta de ayuda no muestra los números).
4. Agrega la página a `pruebas/recursos.test.js` y corre `node --test pruebas/recursos.test.js`.

## Claves en el celular (localStorage)
| Clave | Quién la escribe | Qué guarda |
|---|---|---|
| `contigo.ajustes` | caparazón | `{ tema: 'claro'\|'oscuro', suave: true\|false }` |
| `contigo.perfil` | «Así soy yo» (la leen todas) | `{ v:1, apodo, tarjetas: { calma, desborda, avisa, encanta, comunica, crisis: { opciones:[ids], nota } } }` |
| `contigo.asi-soy-yo` | «Así soy yo» | `{ tarjeta, esencial }` (para retomar a medias) |
| `contigo.asi-estoy` | «Así estoy, esto necesito» (solo la vista adulto escribe) | configuración del adulto: tarjetas visibles, modo 3 o 12, palabras cambiadas, voz y sonido |
| — | «El vaso» | no guarda nada propio (solo usa `contigo.ajustes`) |
| `contigo.plan-de-tormenta` | «Plan de tormenta» | `{ v, plan: { apodo, bloques: { senales, ayuda, evitar, avisar } }, paso, listo }` · enlace `#t1.` |
| `contigo.ruta-eps` | «Guía de la ruta en la EPS» | `{ v, hechos: [ids marcados], paso }` |
| `contigo.mi-dia` | «Mi día» (solo vista adulto) | `{ v, momento, pasos[], palabras{}, modo }` · enlace `#d1.` |
| `contigo.sus-ciclos` | «Sus ciclos, su ritmo» (vista adulto) | `{ v:1, dias: { "AAAA-MM-DD": { s, d, n, a, c } } }` · máx. 500 días · sin enlace # |
| `contigo.mi-perfil` | Perfil sensorial de la cuidadora (index, dentro del chat) | 5 respuestas cortas + fecha de la energía; viaja resumido con cada mensaje, el servidor no lo guarda |
| `contigo.calma` | «Mi rincón de calma» (solo vista adulto) | `{ v, piel, opciones[], sirven[] }` · enlace `#k1.` (lista de ideas) |
| `contigo.cuentos` | «Lo que va a pasar» (solo vista adulto) | `{ v:1, apodo, historias: { <id>: { quitadas, textos, ayudas } } }` · enlace `#h1.` |

| `acompanante-cuidadora-web-v2` | el chat (index) | la conversación, la sesión del agente, la bitácora y el registro de alertas |
| `acompanante-cuidadora-demo` · `acompanante-cuidadora-avisos` | el chat (index) | modo demostración · recursos que pidió que le avisemos |

«Borrar todo lo de este celular» quita **todas** las claves del sitio: las que empiezan por `contigo.` (también los ajustes) y por `acompanante-cuidadora` (la conversación del chat). Lista en `Contigo.PREFIJOS_SITIO` (2026-11-10, auditoría H-04). Si una pieza nueva guarda algo, que empiece por `contigo.`.
Nunca se guarda nombre, documento, EPS ni diagnóstico: esos campos no existen.

## Formato del # (enlace sin servidor)
- `#<pieza>.<base64url>` · Ej.: `…/recursos/asi-soy-yo.html#a1.AARMdW5h…`. `a1` = «Así soy yo», versión 1.
- Bytes de `a1`: `[banderas: 0 o 1=ejemplo] [largo + apodo UTF-8] ×6 tarjetas: [opciones en 6 bits] [largo + nota UTF-8]`.
- El orden de tarjetas y opciones **es** el formato: no se reordena; si cambia, la pieza pasa a `a2`.
- El # no llega al servidor, pero el enlace queda en el chat de WhatsApp: por eso el consentimiento antes de compartir.
- Un enlace dañado muestra «Este enlace llegó incompleto» (nunca revienta).
