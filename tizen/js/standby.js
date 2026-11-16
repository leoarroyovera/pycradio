/*
 * Standby "Cartel de verso": cuando nadie toca la pantalla por un rato, el sitio se
 * vuelve un afiche serigrafiado de la canción al aire. Foto del artista en duotono
 * rojo/negro (Genius), un verso grande en IM Fell English y el título en Barlow.
 * Cualquier tecla, clic, toque o movimiento del mouse lo cierra.
 *
 * Mismo criterio que poptips.js y genius.js: ES5 sin dependencias, compartible con TV.
 * Necesita genius.js cargado antes.
 *
 * De dónde sale el verso, en orden:
 *   1. song.custom_fields.verso de AzuraCast (escrito a mano; líneas separadas por " / ")
 *   2. los fragmentos anotados en Genius (varios: rotan cada VERSO_CADA segundos)
 *   3. ninguno: el afiche queda con el título en grande
 * La imagen: foto del artista en Genius; si no hay, la carátula de AzuraCast; si no, solo tipografía.
 *
 * Uso:
 *   var sb = StandbyPYC.crear({ capa: elemento, minutos: 3, alDespertar: fn });
 *   sb.cancion(song, caratulaUrlONull);   // en cada cambio de canción
 *
 * Vista previa: ?standby=demo entra al standby a los 2 s y recorre las canciones de
 * prueba de genius.js cada 30 s (&g=3 parte en la cuarta). En el demo no se cierra solo
 * con el mouse: se sale con Escape. Con la radio real: ?standby=0.1 entra a los 6 s.
 */
(function (global) {
    'use strict';

    var VERSO_CADA = 22;          // s entre versos cuando la canción tiene varios
    var FUNDIDO = 1200;           // ms del fundido del texto (coincide con el CSS)
    var MOVIMIENTO_MIN = 24;      // px de mouse para despertar (ignora temblores)

    function el(tag, clase, padre) {
        var e = document.createElement(tag);
        e.className = clase;
        if (padre) { padre.appendChild(e); }
        return e;
    }

    function texto(e, t) { e.textContent = t || ''; }

    function versoManual(song) {
        var v = song && song.custom_fields && song.custom_fields.verso;
        v = v ? String(v).replace(/^\s+|\s+$/g, '') : '';
        return v ? v.split(/\s*(?:\/|\n)\s*/) : null;
    }

    function quitarClase(e, c) { e.className = e.className.replace(new RegExp('\\s*\\b' + c + '\\b', 'g'), ''); }
    function ponerClase(e, c) { if (!new RegExp('\\b' + c + '\\b').test(e.className)) { e.className += ' ' + c; } }

    function Standby(opts) {
        var self = this;
        this.capa = opts.capa;
        this.opts = opts;
        this.espera = (opts.minutos || 3) * 60000;
        this.activo = false;
        this.turno = 0;
        this.versos = [];
        this.iVerso = 0;
        this.capaFoto = 0;
        this.timerVerso = null;
        this.timerInactivo = null;
        this.hayContenido = false;   // sin foto ni verso no hay afiche: sigue la pantalla normal

        // Estructura del afiche
        var img = el('div', 'standby-imagen', this.capa);
        this.fotos = [el('div', 'standby-foto', img), el('div', 'standby-foto', img)];
        el('div', 'standby-trama', this.capa);
        var marca = el('div', 'standby-marca', this.capa);
        var logo = el('img', 'standby-logo', marca);
        logo.src = opts.logo || 'images/logo.png';
        logo.alt = 'Poesía y Cumbia Radio';
        this.reloj = el('div', 'standby-reloj', this.capa);
        this.bloque = el('div', 'standby-bloque', this.capa);
        this.verso = el('blockquote', 'standby-verso', this.bloque);
        this.artista = el('p', 'standby-artista', this.bloque);
        this.titulo = el('p', 'standby-titulo', this.bloque);
        this.pista = el('p', 'standby-pista', this.capa);
        texto(this.pista, 'Toca cualquier tecla para volver');

        // Disco y barra de tiempo, en miniatura (abajo a la derecha)
        var mini = el('div', 'standby-mini', this.capa);
        this.mini = mini;
        var disco = el('div', 'standby-mini-disco', mini);
        el('span', 'standby-mini-sello', disco);
        this.miniArte = el('img', 'standby-mini-arte', mini);
        this.miniArte.alt = '';
        var tiempo = el('div', 'standby-mini-tiempo', mini);
        this.tActual = el('span', 'standby-t', tiempo, '0:00');
        var barra = el('div', 'standby-barra', tiempo);
        this.relleno = el('i', 'standby-relleno', barra);
        this.tTotal = el('span', 'standby-t', tiempo, '0:00');

        // Despertar
        var ultimo = null;
        function actividad(e) {
            if (e.type === 'mousemove') {
                if (ultimo && Math.abs(e.clientX - ultimo.x) + Math.abs(e.clientY - ultimo.y) < MOVIMIENTO_MIN) { return; }
                if (!ultimo) { ultimo = { x: e.clientX, y: e.clientY }; return; }
                ultimo = { x: e.clientX, y: e.clientY };
            }
            if (self.activo) {
                if (self.demo && !(e.type === 'keydown' && e.keyCode === 27)) { return; }
                // El clic o tecla que despierta no debe además activar algo debajo
                if (e.type !== 'mousemove' && e.type !== 'scroll') { e.preventDefault(); e.stopPropagation(); }
                self.desactivar();
                if (self.opts.alDespertar) { self.opts.alDespertar(); }
            }
            self.reprogramar();
        }
        var eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];
        for (var i = 0; i < eventos.length; i++) {
            document.addEventListener(eventos[i], actividad, { capture: true, passive: eventos[i] === 'mousemove' || eventos[i] === 'scroll' || eventos[i] === 'wheel' });
        }
        this.reprogramar();
        setInterval(function () { self.ponerHora(); }, 15000);
        this.ponerHora();
    }

    Standby.prototype.reprogramar = function () {
        var self = this;
        clearTimeout(this.timerInactivo);
        if (this.demo) { return; }
        this.timerInactivo = setTimeout(function () { self.activar(); }, this.espera);
    };

    Standby.prototype.ponerHora = function () {
        var d = new Date(), m = d.getMinutes();
        texto(this.reloj, 'En vivo · ' + d.getHours() + ':' + (m < 10 ? '0' : '') + m);
    };

    function minutos(seg) {
        seg = Math.max(0, Math.floor(seg || 0));
        var s = seg % 60;
        return Math.floor(seg / 60) + ':' + (s < 10 ? '0' : '') + s;
    }

    // Tiempo de la canción al aire (lo llama la página cada segundo)
    Standby.prototype.progreso = function (transcurrido, duracion) {
        if (!duracion) { ponerClase(this.mini, 'sin-tiempo'); return; }
        quitarClase(this.mini, 'sin-tiempo');
        transcurrido = Math.min(transcurrido || 0, duracion);
        texto(this.tActual, minutos(transcurrido));
        texto(this.tTotal, minutos(duracion));
        this.relleno.style.width = (transcurrido / duracion * 100).toFixed(1) + '%';
    };

    Standby.prototype.activar = function () {
        if (this.activo) { return; }
        // Sin imagen ni verso no hay nada que mostrar: se sigue como siempre y se reintenta luego
        if (!this.hayContenido) { this.reprogramar(); return; }
        this.activo = true;
        ponerClase(this.capa, 'activo');
        ponerClase(document.body, 'standby-on');
        quitarClase(this.pista, 'oculta');
        var pista = this.pista;
        setTimeout(function () { ponerClase(pista, 'oculta'); }, 5000);
        this.programarVersos();
    };

    Standby.prototype.desactivar = function () {
        if (!this.activo) { return; }
        this.activo = false;
        quitarClase(this.capa, 'activo');
        quitarClase(document.body, 'standby-on');
        clearInterval(this.timerVerso);
    };

    // Datos de la canción nueva: se piden siempre (son las mismas llamadas que ya hizo el
    // fondo vivo y quedan en caché), así el afiche está listo cuando se active.
    Standby.prototype.cancion = function (song, caratula) {
        var self = this, turno = ++this.turno;
        if (!song) { return; }
        this.hayContenido = false;
        // Carátula del disco en miniatura: la de AzuraCast, si la canción tiene
        if (caratula) { this.miniArte.src = caratula; quitarClase(this.mini, 'sin-arte'); } else { ponerClase(this.mini, 'sin-arte'); }
        var manual = versoManual(song);
        global.GeniusPYC.buscar(song, function (d) {
            if (turno !== self.turno) { return; }
            var foto = (d && d.fondo) || caratula || null;
            // Con coincidencia en Genius se usa su título: viene sin "(LP Version)", "_pyc_short", etc.
            var titulo = d ? d.titulo : (song.title || '').replace(/\.(mp3|flac|wav|m4a|ogg)$/i, '').replace(/_pyc_\w+/g, '');
            function listo(versos) {
                if (turno !== self.turno) { return; }
                self.mostrar(song.artist, titulo, foto, manual ? [manual] : versos);
            }
            if (!manual && d) { global.GeniusPYC.versos(d.id, listo); } else { listo([]); }
        });
    };

    Standby.prototype.mostrar = function (artista, titulo, foto, versos) {
        var self = this;
        this.hayContenido = !!foto || !!(versos && versos.length);
        if (!this.hayContenido) {
            // Canción sin foto ni verso: si el afiche estaba puesto, se vuelve a la pantalla normal
            if (this.activo) { this.desactivar(); }
            this.reprogramar();
            return;
        }
        // Foto: fundido cruzado entre dos capas, solo cuando la nueva ya cargó
        if (foto) {
            var img = new Image();
            img.onload = function () {
                var nueva = self.fotos[1 - self.capaFoto], vieja = self.fotos[self.capaFoto];
                nueva.style.backgroundImage = 'url("' + foto + '")';
                ponerClase(nueva, 'activa');
                quitarClase(vieja, 'activa');
                self.capaFoto = 1 - self.capaFoto;
                quitarClase(self.capa, 'sin-foto');
            };
            img.src = foto;
        } else {
            quitarClase(this.fotos[0], 'activa');
            quitarClase(this.fotos[1], 'activa');
            ponerClase(this.capa, 'sin-foto');
        }

        // Texto: se desvanece, cambia y vuelve
        ponerClase(this.bloque, 'cambiando');
        setTimeout(function () {
            self.versos = versos || [];
            self.iVerso = 0;
            texto(self.artista, artista);
            texto(self.titulo, titulo);
            self.ponerVerso();
            quitarClase(self.bloque, 'cambiando');
            self.programarVersos();
        }, FUNDIDO);
    };

    Standby.prototype.ponerVerso = function () {
        var v = this.versos[this.iVerso % Math.max(this.versos.length, 1)], i, largo = 0;
        while (this.verso.firstChild) { this.verso.removeChild(this.verso.firstChild); }
        quitarClase(this.bloque, 'sin-verso');
        quitarClase(this.verso, 'largo');
        if (!v) { ponerClase(this.bloque, 'sin-verso'); return; }
        for (i = 0; i < v.length; i++) {
            el('span', 'standby-linea', this.verso).textContent = v[i];
            largo += v[i].length;
        }
        if (largo > 80) { ponerClase(this.verso, 'largo'); }
    };

    Standby.prototype.programarVersos = function () {
        var self = this;
        clearInterval(this.timerVerso);
        if (this.versos.length < 2 || !this.activo) { return; }
        this.timerVerso = setInterval(function () {
            ponerClase(self.verso, 'cambiando');
            setTimeout(function () {
                self.iVerso++;
                self.ponerVerso();
                quitarClase(self.verso, 'cambiando');
            }, FUNDIDO);
        }, VERSO_CADA * 1000);
    };

    Standby.prototype.iniciarDemo = function () {
        var self = this, lista = global.GeniusPYC.DEMO;
        var desde = /[?&]g=(\d+)/.exec(global.location.search);
        var i = desde ? +desde[1] : 0;
        this.demo = true;
        clearTimeout(this.timerInactivo);
        function paso() {
            var s = lista[i++ % lista.length];
            Standby.prototype.cancion.call(self, { id: 'demo-' + s.artist + s.title, artist: s.artist, title: s.title }, null);
        }
        paso();
        // Entra cuando la canción tiene algo que mostrar y sale cuando no
        setInterval(function () {
            if (self.hayContenido && !self.activo) { self.activar(); }
            else if (!self.hayContenido && self.activo) { self.desactivar(); }
        }, 500);
        // Reloj de prueba para la barra de tiempo (la página real lo trae del servidor)
        var t = 20;
        setInterval(function () { t = (t + 1) % 240; self.progreso(t, 240); }, 1000);
        setInterval(paso, 30000);
    };

    global.StandbyPYC = {
        crear: function (opts) {
            // ?standby=0.5 cambia la espera (en minutos) para probar con la radio real
            var espera = /[?&]standby=(\d+(?:\.\d+)?)\b/.exec(global.location ? global.location.search : '');
            if (espera) { opts.minutos = +espera[1]; }
            var sb = new Standby(opts);
            if (/[?&]standby=demo\b/.test(global.location ? global.location.search : '')) {
                sb.iniciarDemo();
                sb.cancion = function () {};    // en demo manda la lista de prueba
            }
            return sb;
        }
    };
})(this);
