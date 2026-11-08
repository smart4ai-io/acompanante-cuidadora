# Caparazón Contigo v1 · lo común de las piezas de «Recursos»

> 2026-11-08 · Nace con `asi-soy-yo.html`. Se copia **idéntico** a cada pieza nueva; si cambia, sube a v2 y se copia a todas.

## Qué trae
- **Tokens de color** del manual de Somos Extraordinarios (menta, lavanda, rosa, arena + tonos profundos AA) y **tema claro/oscuro** (sigue al sistema; el botón de la luna lo fija).
- **Modo sensorial bajo**, en pantalla «Modo suave»: colores apagados, sin degradados, sin sombras, sin movimiento. También se apaga todo movimiento con «reducir movimiento» del celular.
- **Cabecera** con «Modo suave», tema y el sello «Prototipo · datos de ejemplo».
- **Barra fija** «Pausa · Calma · Necesito ayuda · Salir». Calma = respiración 4-6 s. Necesito ayuda = tarjeta grande para mostrar; en vistas de adulto muestra 123, 106 y 141 **escritos** (no llama ni envía). Salir = va al inicio del sitio (fuera del sitio, «puedes cerrar»).
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
   En vistas de niña usa `vistaAdulto: false` (la tarjeta de ayuda no muestra los números).
4. Agrega la página a `pruebas/recursos.test.js` y corre `node --test pruebas/recursos.test.js`.

## Claves en el celular (localStorage)
| Clave | Quién la escribe | Qué guarda |
|---|---|---|
| `contigo.ajustes` | caparazón | `{ tema: 'claro'\|'oscuro', suave: true\|false }` |
| `contigo.perfil` | «Así soy yo» (la leen todas) | `{ v:1, apodo, tarjetas: { calma, desborda, avisa, encanta, comunica, crisis: { opciones:[ids], nota } } }` |
| `contigo.asi-soy-yo` | «Así soy yo» | `{ tarjeta, esencial }` (para retomar a medias) |
| `contigo.asi-estoy` | «Así estoy, esto necesito» (solo la vista adulto escribe) | configuración del adulto: tarjetas visibles, modo 3 o 12, palabras cambiadas, voz y sonido |
| — | «El vaso» | no guarda nada propio (solo usa `contigo.ajustes`) |

«Borrar todo lo de este celular» quita **todas** las claves `contigo.*` (también los ajustes).
Nunca se guarda nombre, documento, EPS ni diagnóstico: esos campos no existen.

## Formato del # (enlace sin servidor)
- `#<pieza>.<base64url>` · Ej.: `…/recursos/asi-soy-yo.html#a1.AARMdW5h…`. `a1` = «Así soy yo», versión 1.
- Bytes de `a1`: `[banderas: 0 o 1=ejemplo] [largo + apodo UTF-8] ×6 tarjetas: [opciones en 6 bits] [largo + nota UTF-8]`.
- El orden de tarjetas y opciones **es** el formato: no se reordena; si cambia, la pieza pasa a `a2`.
- El # no llega al servidor, pero el enlace queda en el chat de WhatsApp: por eso el consentimiento antes de compartir.
- Un enlace dañado muestra «Este enlace llegó incompleto» (nunca revienta).
