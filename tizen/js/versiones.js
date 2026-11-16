/*
 * Árbol de versiones: bajo el título, una línea genealógica dibujada a brocha con lo que
 * Genius sabe de la canción: de quién es versión ("Versión de «Overkill» — Men at Work
 * (1983)"), qué samplea y qué artistas la versionaron o la sampleaon.
 *
 * ES5 sin dependencias, compartido con la TV. Necesita genius.js (usa su caché: son los
 * mismos datos que la contraportada, no suma llamadas).
 *
 * Uso:
 *   var v = VersionesPYC.crear({ contenedor: function () { return el } });
 *   v.cancion(song);                 // en cada cambio de canción
 *
 * Vista previa: ?versiones=demo recorre las canciones de prueba de genius.js cada 12 s
 * (&g=N para partir en otra).
 */
(function (global) {
    'use strict';

    var MAX_FILAS = 2;
    // Orden de importancia: de dónde viene la canción manda sobre a dónde fue
    var ORDEN = ['cover_of', 'remix_of', 'live_version_of', 'samples', 'interpolates',
        'covered_by', 'sampled_in', 'interpolated_by', 'remixed_by'];
    var SVG = 'http://www.w3.org/2000/svg';

    function el(tag, clase, padre, texto) {
        var e = document.createElement(tag);
        if (clase) { e.className = clase; }
        if (texto) { e.textContent = texto; }
        if (padre) { padre.appendChild(e); }
        return e;
    }

    // Pincelada irregular, con su largo dibujándose al aparecer (vía CSS)
    function trazo(padre) {
        var svg = document.createElementNS(SVG, 'svg');
        svg.setAttribute('class', 'vs-trazo');
        svg.setAttribute('viewBox', '0 0 64 14');
        svg.setAttribute('aria-hidden', 'true');
        var p = document.createElementNS(SVG, 'path');
        p.setAttribute('d', 'M3 8 C 11 3, 19 12, 30 7 S 50 4, 61 7');
        p.setAttribute('pathLength', '100');
        svg.appendChild(p);
        padre.appendChild(svg);
    }

    function unicos(lista) {
        var vistos = {}, salida = [], i;
        for (i = 0; i < lista.length; i++) {
            if (lista[i] && !vistos[lista[i]]) { vistos[lista[i]] = true; salida.push(lista[i]); }
        }
        return salida;
    }

    function cancion(c) {
        return '«' + c.titulo + '»' + (c.artista ? ' — ' + c.artista : '') + (c.anio ? ' (' + c.anio + ')' : '');
    }

    // "A, B y C". No se agrega "y N más": no hay dónde ver el resto
    function nombres(lista) {
        var n = unicos(lista);
        return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n[0];
    }

    // Una fila de texto por tipo de relación
    function texto(rel) {
        var c = rel.canciones, i, art = [];
        switch (rel.tipo) {
            case 'cover_of': case 'remix_of': case 'live_version_of': case 'samples': case 'interpolates':
            case 'sampled_in': case 'interpolated_by':
                return cancion(c[0]);
            default:     // covered_by, remixed_by: basta con los artistas
                for (i = 0; i < c.length; i++) { art.push(c[i].artista); }
                return nombres(art);
        }
    }

    function Versiones(opts) {
        this.contenedor = opts.contenedor;
        this.turno = 0;
    }

    Versiones.prototype.limpiar = function () {
        var c = this.contenedor();
        if (!c) { return; }
        while (c.firstChild) { c.removeChild(c.firstChild); }
        c.className = c.className.replace(/\s*\bvs-visible\b/g, '');
    };

    Versiones.prototype.cancion = function (song) {
        var self = this, turno = ++this.turno;
        this.limpiar();
        if (!song) { return; }
        global.GeniusPYC.buscar(song, function (d) {
            if (turno !== self.turno || !d) { return; }
            global.GeniusPYC.detalle(d.id, function (det) {
                if (turno !== self.turno || !det || !det.versiones || !det.versiones.length) { return; }
                self.dibujar(det.versiones);
            });
        });
    };

    Versiones.prototype.dibujar = function (versiones) {
        var c = this.contenedor(), i, j, rel, fila, filas = 0, porTipo = {};
        if (!c) { return; }
        for (i = 0; i < versiones.length; i++) { porTipo[versiones[i].tipo] = versiones[i]; }
        for (i = 0; i < ORDEN.length && filas < MAX_FILAS; i++) {
            rel = porTipo[ORDEN[i]];
            if (!rel) { continue; }
            fila = el('p', 'vs-fila', c);
            fila.style.animationDelay = (filas * 0.35) + 's';
            trazo(fila);
            el('span', 'vs-etiqueta', fila, rel.etiqueta);
            el('span', 'vs-texto', fila, texto(rel));
            filas++;
        }
        if (!filas) { return; }
        // Un cuadro después, para que el navegador anime la entrada
        setTimeout(function () { if (c.className.indexOf('vs-visible') === -1) { c.className += ' vs-visible'; } }, 30);
    };

    global.VersionesPYC = {
        crear: function (opts) {
            var v = new Versiones(opts);
            if (/[?&]versiones=demo\b/.test(global.location ? global.location.search : '')) {
                var lista = global.GeniusPYC.DEMO, desde = /[?&]g=(\d+)/.exec(global.location.search);
                var i = desde ? +desde[1] : 0;
                var cancionReal = v.cancion;
                v.cancion = function () {};
                var paso = function () {
                    var s = lista[i++ % lista.length];
                    cancionReal.call(v, { id: 'demo-' + s.artist + s.title, artist: s.artist, title: s.title });
                };
                setTimeout(paso, 1500);
                setInterval(paso, 12000);
            }
            return v;
        }
    };
})(this);
