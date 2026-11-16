/*
 * Ficha del artista: al tocar el nombre del artista se abre un recorte de prensa con
 * su retrato en blanco y negro (Genius), una bio corta, sus redes y las otras canciones
 * suyas que suenan en la radio (búsqueda pública de pedidos de AzuraCast).
 *
 * ES5 sin dependencias, como los demás módulos de tizen/js. Necesita genius.js.
 * Todo se pide al abrir la ficha (no al cambiar de canción): es algo que pocos abren.
 *
 * Uso:
 *   var f = FichaPYC.crear({
 *       disparador: '.now-playing .track-artist',  // lo que se toca para abrirla
 *       pedidos: 'https://…/api/station/1/requests',
 *       alPedir: function () { … },                // botón "Pide un tema"
 *       alCambiar: function (hay) { … },           // avisa si la canción tiene ficha (para mostrar/ocultar el botón)
 *       siempre: true,                             // abre aunque no haya datos (solo el nombre); lo usa la TV
 *       tv: true,                                  // control remoto: sin disparador ni botones;
 *       padre: elemento                            //   se abre con f.abrir() y se dibuja dentro de padre
 *   });
 *   f.cancion(song);                               // en cada cambio de canción
 *
 * Vista previa: ?ficha=demo abre la ficha de una canción de prueba de genius.js
 * (&g=N para elegir cuál) y la cambia cada 20 s.
 */
(function (global) {
    'use strict';

    var MAX_CANCIONES = 12;

    function el(tag, clase, padre, texto) {
        var e = document.createElement(tag);
        if (clase) { e.className = clase; }
        if (texto) { e.textContent = texto; }
        if (padre) { padre.appendChild(e); }
        return e;
    }

    function vaciar(e) { while (e.firstChild) { e.removeChild(e.firstChild); } }

    function limpiarTitulo(t) {
        return (t || '').replace(/\.(mp3|flac|wav|m4a|ogg)$/i, '').replace(/_pyc_\w+/g, '')
            .replace(/\s*\((?:remaster|remastered|lp version|radio edit|album version|single version)[^)]*\)/ig, '')
            .replace(/\s+-\s+(?:remaster|remastered|lp version|radio edit|album version|single version|\d{4} remaster).*$/i, '');
    }

    function getJSON(url, ok, mal) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.timeout = 15000;
        xhr.onload = function () {
            if (xhr.status !== 200) { mal(); return; }
            try { ok(JSON.parse(xhr.responseText)); } catch (e) { mal(); }
        };
        xhr.onerror = xhr.ontimeout = mal;
        xhr.send();
    }

    function Ficha(opts) {
        var self = this;
        this.opts = opts;
        this.song = null;
        this.turno = 0;
        this.abierta = false;
        this.disponible = false;
        this.datos = null;

        // Estructura: fondo oscuro + recorte de papel
        this.capa = el('div', 'ficha-capa' + (opts.tv ? ' ficha-tv' : ''), opts.padre || document.body);
        this.capa.setAttribute('aria-hidden', 'true');
        this.recorte = el('article', 'ficha', this.capa);
        this.recorte.setAttribute('role', 'dialog');
        this.recorte.setAttribute('aria-modal', 'true');
        this.recorte.setAttribute('aria-label', 'Ficha del artista');
        this.cerrarBtn = el('button', 'ficha-cerrar', this.recorte, '×');
        this.cerrarBtn.setAttribute('aria-label', 'Cerrar la ficha');
        this.cuerpo = el('div', 'ficha-cuerpo', this.recorte);

        this.capa.addEventListener('click', function (e) {
            if (e.target === self.capa || e.target === self.cerrarBtn) { self.cerrar(); }
        });
        document.addEventListener('keydown', function (e) {
            if (self.abierta && e.keyCode === 27) { self.cerrar(); }
        });
        function disparo(e) {
            var t = e.target;
            if (!t || !t.closest || !t.closest(opts.disparador)) { return; }
            if (e.type === 'keydown' && e.keyCode !== 13 && e.keyCode !== 32) { return; }
            e.preventDefault();
            self.abrir();
        }
        if (opts.disparador) {
            document.addEventListener('click', disparo);
            document.addEventListener('keydown', disparo);
        }
    }

    // Se prepara al cambiar la canción (perfil de Genius + otras canciones del artista en la
    // radio) para saber si hay algo que mostrar: sin datos no hay ficha, queda la pantalla base.
    Ficha.prototype.cancion = function (song) {
        this.song = song;
        // En la TV (siempre) el botón no se oculta: sin datos, la ficha muestra solo el nombre
        this.datos = this.opts.siempre && song ? { nombre: global.GeniusPYC.artistas(song.artist)[0], perfil: null, canciones: [] } : null;
        this.marcar(false);
        if (this.abierta) { this.cerrar(); }
        if (song) { this.preparar(song, null); }
    };

    // Avisa si hay ficha disponible; en la web activa el nombre del artista como botón
    Ficha.prototype.marcar = function (hay) {
        this.disponible = hay;
        var e = this.opts.disparador ? document.querySelector(this.opts.disparador) : null;
        if (e) {
            if (hay) {
                e.setAttribute('role', 'button');
                e.setAttribute('tabindex', '0');
                e.setAttribute('title', 'Ver la ficha del artista');
                if (e.className.indexOf('ficha-si') === -1) { e.className += ' ficha-si'; }
            } else {
                e.removeAttribute('role');
                e.removeAttribute('tabindex');
                e.removeAttribute('title');
                e.className = e.className.replace(/\s*\bficha-si\b/g, '');
            }
        }
        if (this.opts.alCambiar) { this.opts.alCambiar(hay); }
    };

    Ficha.prototype.preparar = function (song, listoCb) {
        var self = this, turno = ++this.turno, pendientes = 2;
        var principal = global.GeniusPYC.artistas(song.artist)[0];
        var datos = { nombre: principal, perfil: null, canciones: [] };

        function listo() {
            if (--pendientes) { return; }
            if (turno !== self.turno) { return; }
            var p = datos.perfil;
            self.datos = datos;
            self.marcar(!!((p && (p.foto || p.bio || p.redes.length)) || datos.canciones.length));
            if (listoCb) { listoCb(); }
        }

        global.GeniusPYC.buscar(song, function (d) {
            if (!d || !d.artistaId) { listo(); return; }
            global.GeniusPYC.artista(d.artistaId, function (a) {
                datos.perfil = a;
                if (a) { datos.nombre = a.nombre; }
                listo();
            });
        });

        // Otras canciones del mismo artista en la radio: la búsqueda de AzuraCast también encuentra
        // por título o álbum, así que se filtra por parecido del nombre del artista
        var actual = limpiarTitulo(song.title);
        getJSON(this.opts.pedidos + '?rowCount=200&searchPhrase=' + encodeURIComponent(principal), function (r) {
            var filas = r.rows || r || [], salida = [], i, s, partes, j, parecido, titulo, repetida;
            for (i = 0; i < filas.length; i++) {
                s = filas[i].song;
                if (!s) { continue; }
                partes = global.GeniusPYC.artistas(s.artist);
                parecido = 0;
                for (j = 0; j < partes.length; j++) { parecido = Math.max(parecido, global.GeniusPYC.parecido(partes[j], principal)); }
                if (parecido < 0.8) { continue; }
                titulo = limpiarTitulo(s.title);
                // Fuera la que está sonando y los duplicados, también los con un error de tipeo
                repetida = global.GeniusPYC.parecido(actual, titulo) >= 0.88;
                for (j = 0; j < salida.length && !repetida; j++) {
                    repetida = global.GeniusPYC.parecido(salida[j].titulo, titulo) >= 0.88;
                }
                if (!repetida) { salida.push({ titulo: titulo }); }
            }
            salida.sort(function (a, b) { return a.titulo.localeCompare(b.titulo); });
            datos.canciones = salida;
            listo();
        }, listo);
    };

    Ficha.prototype.cerrar = function () {
        if (!this.abierta) { return; }
        this.abierta = false;
        this.capa.className = 'ficha-capa' + (this.opts.tv ? ' ficha-tv' : '');
        this.capa.setAttribute('aria-hidden', 'true');
        if (this.antes && this.antes.focus) { this.antes.focus(); }
    };

    Ficha.prototype.abrir = function () {
        if ((!this.disponible && !this.opts.siempre) || !this.datos) { return; }
        this.antes = document.activeElement;
        this.abierta = true;
        this.dibujar(this.datos);
        this.capa.className = 'ficha-capa abierta' + (this.opts.tv ? ' ficha-tv' : '');
        this.capa.setAttribute('aria-hidden', 'false');
        this.recorte.scrollTop = 0;
        this.cerrarBtn.focus();
    };

    // Solo se dibuja lo que hay: sin foto no hay retrato, sin bio no hay bio, sin otras
    // canciones no hay lista. Nada de avisos de "no hay información".
    Ficha.prototype.dibujar = function (datos) {
        var self = this, c = this.cuerpo, p = datos.perfil, i;
        vaciar(c);
        c.className = 'ficha-cuerpo' + (p && p.foto ? '' : ' sin-retrato');

        if (p && p.foto) {
            var retrato = el('figure', 'ficha-retrato', c);
            var img = el('img', '', retrato);
            img.alt = 'Retrato de ' + datos.nombre;
            img.src = p.foto;
        }

        var texto = el('div', 'ficha-texto', c);
        el('p', 'ficha-antetitulo', texto, 'Perfil · Poesía y Cumbia');
        el('h2', 'ficha-nombre', texto, datos.nombre);
        if (p && p.otrosNombres.length) {
            el('p', 'ficha-alias', texto, 'También: ' + p.otrosNombres.join(' · '));
        }
        if (p && p.bio) {
            // A dos columnas solo si es larga: con 2-3 líneas las columnas quedan cojas
            el('p', 'ficha-bio' + (p.bio.length > 320 ? ' larga' : ''), texto, p.bio);
        }
        if (p && p.redes.length) {
            var redes = el('p', 'ficha-redes', texto);
            for (i = 0; i < p.redes.length; i++) {
                var a = el('a', '', redes, p.redes[i].red + ' ' + p.redes[i].usuario);
                a.href = p.redes[i].url;
                a.target = '_blank';
                a.rel = 'noopener';
            }
        }

        if (datos.canciones.length) {
            var radio = el('section', 'ficha-radio', c);
            el('h3', 'ficha-radio-titulo', radio, 'También en Poesía y Cumbia Radio');
            var ol = el('ol', 'ficha-canciones', radio);
            for (i = 0; i < Math.min(datos.canciones.length, MAX_CANCIONES); i++) {
                el('li', '', ol, datos.canciones[i].titulo);
            }
            if (this.opts.alPedir && !this.opts.tv) {
                var pedir = el('button', 'ficha-pedir', radio, 'Pide una de estas →');
                pedir.addEventListener('click', function () { self.cerrar(); self.opts.alPedir(); });
            }
        }

        // En la TV, un recordatorio de cómo salir; en la web no hay pie
        if (this.opts.tv) {
            el('p', 'ficha-pie', c, 'Volver para cerrar');
        }
    };

    global.FichaPYC = {
        crear: function (opts) {
            var f = new Ficha(opts);
            if (/[?&]ficha=demo\b/.test(global.location ? global.location.search : '')) {
                var lista = global.GeniusPYC.DEMO, desde = /[?&]g=(\d+)/.exec(global.location.search);
                var i = desde ? +desde[1] : 0;
                f.cancion = function () {};
                var paso = function () {
                    var s = lista[i++ % lista.length];
                    f.cerrar();
                    f.song = { id: 'demo-' + s.artist + s.title, artist: s.artist, title: s.title };
                    f.preparar(f.song, function () { f.abrir(); });
                };
                setTimeout(paso, 1500);
                setInterval(paso, 20000);
            }
            return f;
        }
    };
})(this);
