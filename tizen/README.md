# Poesía y Cumbia Radio — app para Samsung TV (Tizen)

App de TV independiente de la web, pensada para el control remoto y una pantalla de 1920×1080.

- **Audio:** MP3 de Icecast (`/listen/poesia_y_cumbia_radio/radio.mp3`); si falla, HLS. Se reconecta sola.
- **Datos:** API `nowplaying` de AzuraCast cada 15 s (o justo al terminar la canción).
- **Control remoto:** ←/→ recorren el menú, OK activa, Volver cierra paneles o pregunta si salir.
  Teclas ▶︎/⏸/■ del control funcionan siempre.
- **Pide un tema / Contacto:** códigos QR para abrir en el teléfono (con control remoto no se puede escribir cómodo).
- **Modo ambiente:** a los 45 s sin tocar el control se esconde el menú; cada 2 min el contenido se corre unos píxeles.
- Compatible con TVs desde 2017 (Tizen 3): ES5, sin frameworks, tipografías incluidas.

## Empaquetar e instalar

```powershell
.\build.ps1                      # crea dist\PoesiaYCumbia.wgt firmado con Profile-TV
.\build.ps1 -Install 192.168.1.50  # además lo instala y abre en la TV
```

En la TV: Apps → teclear `12345` → activar *Developer mode* con la IP de este PC → reiniciar la TV.
El certificado Samsung (Profile-TV) debe incluir el DUID de la TV.

## Vista previa en el navegador

Abrir `index.html?preview` (sin sonido). Paneles: `?preview&panel=programas|equipo|pedidos|nosotros|contacto|exit`.
