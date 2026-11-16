/*
 * Contraportada: al tocar el disco (o la funda) la funda gira y muestra la "contratapa
 * del LP" con los créditos de la canción: álbum, lanzamiento, compositores, productores,
 * arreglos, sello y lugar de grabación. Otro toque la vuelve a girar.
 *
 * Solo muestra lo que existe, sin rellenos ni avisos. Si la canción no tiene ningún dato,
 * la contratapa no se activa: no hay pestaña ni se gira (y en la TV se oculta el botón).
 *
 * ES5 sin dependencias, como poptips.js / genius.js / standby.js. Necesita genius.js.
 * Los créditos se piden al cambiar de canción (la búsqueda ya está en caché por el
 * fondo vivo; suma una llamada a /songs/:id), así el giro es instantáneo.
 *
 * Uso:
 *   var cp = ContraportadaPYC.crear({
 *       funda: function () { return el },      // la .sleeve actual
 *       disparador: '.now-playing .record-set', // selector de lo que se toca para girar (web)
 *       alCambiar: function (hay) { … }         // avisa si hay créditos (TV: mostrar/ocultar botón)
 *   });
 *   cp.cancion(song);                          // en cada cambio de canción
 *   cp.voltear();                              // gira (la TV lo llama desde el menú)
 *
 * Vista previa: ?contraportada=demo deja la funda girada y recorre las canciones de
 * prueba de genius.js cada 15 s (&g=N para partir en otra; combina con ?genius=demo).
 */
(function (global) {
    'use strict';

    var GIRO = 700;            // ms del giro completo (coincide con el CSS)
    var MAX_NOMBRES = 4;

    function el(tag, clase, padre, texto) {
        var e = document.createElement(tag);
        if (clase) { e.className = clase; }
        if (texto) { e.textContent = texto; }
        if (padre) { padre.appendChild(e); }
        return e;
    }

    function tiene(e, c) { return new RegExp('\\b' + c + '\\b').test(e.className); }
    function poner(e, c) { if (!tiene(e, c)) { e.className += ' ' + c; } }
    function quitar(e, c) { e.className = e.className.replace(new RegExp('\\s*\\b' + c + '\\b', 'g'), ''); }

    // ["A", "B", "C"] -> "A, B y C"; con más de MAX_NOMBRES se muestran los primeros
    function lista(nombres) {
        if (!nombres || !nombres.length) { return null; }
        nombres = nombres.slice(0, MAX_NOMBRES);
        if (nombres.length === 1) { return nombres[0]; }
        return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
    }

    function limpiarTitulo(t) {
        return (t || '').replace(/\.(mp3|flac|wav|m4a|ogg)$/i, '').replace(/_pyc_\w+/g, '');
    }

    // Las filas que existen: [[rótulo, texto]]
    function filasDe(d) {
        var det = d.detalle || {};
        var todas = [
            ['Del álbum', det.album || d.album],
            ['Lanzamiento', det.fecha],
            ['Compuesta por', lista(det.compositores)],
            ['Producida por', lista(det.productores)],
            ['Arreglos', lista(det.arreglos)],
            ['Sello', lista(det.sello)],
            ['Grabada en', det.grabadaEn]
        ], salida = [], i;
        for (i = 0; i < todas.length; i++) { if (todas[i][1]) { salida.push(todas[i]); } }
        return salida;
    }

    function Contraportada(opts) {
        var self = this;
        this.opts = opts;
        this.funda = opts.funda;
        this.turno = 0;
        this.girando = false;
        this.disponible = false;
        this.datos = null;       // { artista, titulo, album, detalle }

        function disparo(e) {
            var t = e.target;
            if (!t || !t.closest || !t.closest(opts.disparador)) { return; }
            if (e.type === 'keydown' && e.keyCode !== 13 && e.keyCode !== 32) { return; }
            if (e.type === 'keydown') { e.preventDefault(); }
            self.voltear();
        }
        // En la TV no hay disparador: el botón "Créditos" del menú llama a voltear()
        if (opts.disparador) {
            document.addEventListener('click', disparo);
            document.addEventListener('keydown', disparo);
        }
    }

    // La cara trasera vive dentro de la .sleeve; si Angular la recreó, se vuelve a crear
    Contraportada.prototype.cara = function () {
        var sleeve = this.funda && this.funda();
        if (!sleeve || !this.disponible) { return null; }
        var cara = sleeve.querySelector('.contraportada');
        if (!cara) {
            cara = el('div', 'contraportada', sleeve);
            cara.setAttribute('aria-hidden', 'true');
            this.dibujar(cara);
        }
        if (!sleeve.querySelector('.cp-pestana')) {
            el('span', 'cp-pestana', sleeve, tiene(sleeve, 'cp-volteada') ? 'Portada ↻' : 'Créditos ↻');
        }
        return cara;
    };

    // Activa o desactiva la contratapa: pestaña, cursor y atributos del disco
    Contraportada.prototype.marcar = function (hay) {
        var sleeve = this.funda && this.funda();
        var disco = sleeve ? sleeve.parentNode : null;
        this.disponible = hay;
        if (sleeve) {
            if (!hay) {
                quitar(sleeve, 'cp-volteada');
                var viejo = sleeve.querySelector('.contraportada'), pest = sleeve.querySelector('.cp-pestana');
                if (viejo) { sleeve.removeChild(viejo); }
                if (pest) { sleeve.removeChild(pest); }
            }
        }
        if (disco && this.opts.disparador) {
            if (hay) {
                poner(disco, 'cp-tiene');
                disco.setAttribute('role', 'button');
                disco.setAttribute('tabindex', '0');
                disco.setAttribute('title', 'Ver los créditos');
            } else {
                quitar(disco, 'cp-tiene');
                disco.removeAttribute('role');
                disco.removeAttribute('tabindex');
                disco.removeAttribute('title');
            }
        }
        if (this.opts.alCambiar) { this.opts.alCambiar(hay); }
    };

    Contraportada.prototype.voltear = function () {
        var self = this, sleeve = this.funda && this.funda();
        if (!sleeve || this.girando || !this.disponible) { return; }
        var cara = this.cara();
        if (!cara) { return; }
        this.girando = true;
        poner(sleeve, 'cp-girando');
        // A mitad del giro (la funda está de canto) se cambia de cara
        setTimeout(function () {
            var volteada = !tiene(sleeve, 'cp-volteada');
            if (volteada) { poner(sleeve, 'cp-volteada'); } else { quitar(sleeve, 'cp-volteada'); }
            cara.setAttribute('aria-hidden', volteada ? 'false' : 'true');
            var pestana = sleeve.querySelector('.cp-pestana');
            if (pestana) { pestana.textContent = volteada ? 'Portada ↻' : 'Créditos ↻'; }
        }, GIRO / 2);
        setTimeout(function () { quitar(sleeve, 'cp-girando'); self.girando = false; }, GIRO);
    };

    Contraportada.prototype.cancion = function (song) {
        var self = this, turno = ++this.turno;
        // Canción nueva: la funda vuelve a mostrar la portada, sin animación, y sin créditos
        // hasta saber si los hay
        if (!this.demo) { this.marcar(false); }
        this.datos = null;
        if (!song) { return; }
        var datos = { artista: song.artist, titulo: limpiarTitulo(song.title), album: song.album || null, detalle: null };

        function terminar() {
            if (turno !== self.turno) { return; }
            self.datos = datos;
            var hay = filasDe(datos).length > 0;
            if (self.demo) { self.marcar(false); }
            self.marcar(hay);
            if (hay) {
                self.redibujar();
                var sleeve = self.funda && self.funda();
                if (self.demo && sleeve) {
                    self.cara();
                    poner(sleeve, 'cp-volteada');
                    sleeve.querySelector('.cp-pestana').textContent = 'Portada ↻';
                }
            }
        }

        global.GeniusPYC.buscar(song, function (d) {
            if (turno !== self.turno) { return; }
            if (!d) { terminar(); return; }
            datos.titulo = d.titulo;
            global.GeniusPYC.detalle(d.id, function (det) {
                datos.detalle = det;
                terminar();
            });
        });
    };

    Contraportada.prototype.redibujar = function () {
        var cara = this.cara();
        if (cara) { this.dibujar(cara); }
    };

    Contraportada.prototype.dibujar = function (cara) {
        var d = this.datos;
        while (cara.firstChild) { cara.removeChild(cara.firstChild); }
        if (!d) { return; }

        var cabecera = el('div', 'cp-cabecera', cara);
        el('p', 'cp-artista', cabecera, d.artista);
        el('p', 'cp-titulo', cabecera, d.titulo);

        var filas = filasDe(d);
        var dl = el('dl', 'cp-creditos', cara), i, fila;
        for (i = 0; i < filas.length; i++) {
            fila = el('div', 'cp-fila', dl);
            el('dt', '', fila, filas[i][0]);
            el('dd', '', fila, filas[i][1]);
        }
        // Con 6 o más filas la letra se achica para que quepan todas en la funda
        if (filas.length >= 6) { dl.className += ' cp-muchas'; }
    };

    Contraportada.prototype.iniciarDemo = function () {
        var self = this, listaDemo = global.GeniusPYC.DEMO;
        var desde = /[?&]g=(\d+)/.exec(global.location.search);
        var i = desde ? +desde[1] : 0;
        this.demo = true;
        function paso() {
            var s = listaDemo[i++ % listaDemo.length];
            Contraportada.prototype.cancion.call(self, { id: 'demo-' + s.artist + s.title, artist: s.artist, title: s.title });
        }
        // Espera a que Angular dibuje la funda
        var intentos = 0, espera = setInterval(function () {
            var sleeve = self.funda && self.funda();
            if (!sleeve && ++intentos < 40) { return; }
            clearInterval(espera);
            paso();
            setInterval(paso, 15000);
        }, 250);
    };

    global.ContraportadaPYC = {
        crear: function (opts) {
            var cp = new Contraportada(opts);
            if (/[?&]contraportada=demo\b/.test(global.location ? global.location.search : '')) {
                cp.iniciarDemo();
                cp.cancion = function () {};
            }
            return cp;
        },
        lista: lista
    };
})(this);
