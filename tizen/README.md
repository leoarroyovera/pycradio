# Poesía y Cumbia Radio — app para Samsung TV (Tizen)

App de TV independiente de la web, pensada para el control remoto y una pantalla de 1920×1080.

- **Audio:** MP3 de Icecast (`/listen/poesia_y_cumbia_radio/radio.mp3`); si falla, HLS. Se reconecta sola.
- **Datos:** API `nowplaying` de AzuraCast cada 15 s (o justo al terminar la canción).
- **Control remoto:** ←/→ recorren el menú, OK activa, Volver cierra paneles o pregunta si salir.
  Teclas ▶︎/⏸/■ del control funcionan siempre.
- **Pide un tema / Contacto:** códigos QR para abrir en el teléfono (con control remoto no se puede escribir cómodo).
- **Modo ambiente:** a los 45 s sin tocar el control se esconde el menú; cada 2 min el contenido se corre unos píxeles.
- **Genius:** la app consulta la API de Genius en vivo (`js/genius.js`; el token es de solo lectura y va en ese archivo) y suma, siempre con fundido y sin romper nada si no hay red:
  fondo con la foto del artista en duotono, portada de respaldo, versiones/samples bajo el artista, sello de efemérides en el disco y el historial como collage de recortes.
  El menú trae **Créditos** (la funda gira y muestra la contratapa) y **Artista** (ficha tipo recorte de prensa; Volver u OK la cierran); el botón Créditos solo aparece si la canción tiene algo que mostrar (Artista siempre está; sin datos la ficha muestra solo el nombre).
  A los 2 min sin tocar el control entra el **standby** "Cartel de verso" (cualquier tecla lo cierra).
- Compatible con TVs desde 2017 (Tizen 3): ES5, sin frameworks, tipografías incluidas.

## Empaquetar e instalar

```powershell
.\build.ps1                      # crea dist\PoesiaYCumbia.wgt firmado con Profile-TV
.\build.ps1 -Install 192.168.1.50  # además lo instala y abre en la TV
```

En la TV: Apps → teclear `12345` → activar *Developer mode* con la IP de este PC → reiniciar la TV.
El certificado Samsung (Profile-TV) debe incluir el DUID de la TV.
Tras cambiar algo en `tizen/` hay que volver a empaquetar; para Android TV, copiar `tizen/` otra vez y recompilar el APK.

## Vista previa en el navegador

Abrir `index.html?preview` (sin sonido). Se suman `&standby=demo`, `&ficha=demo`, `&versiones=demo`, `&efemeride=demo[&cumple=1]` y `&genius=demo` para ver cada pieza con canciones de prueba (`&g=N` elige con cuál partir). Paneles: `?preview&panel=programas|equipo|pedidos|nosotros|contacto|exit`.
