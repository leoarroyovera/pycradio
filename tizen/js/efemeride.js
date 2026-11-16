/*
 * Efemérides: un sello de correo pegado en la esquina del disco con la edad de la canción
 * ("Salió hace 31 años") y, el día exacto de su aniversario, "¡Hoy cumple 30 años!".
 * La fecha viene de Genius (release_date).
 *
 * ES5 sin dependencias, compartido con la TV. Necesita genius.js (usa su caché de detalle).
 *
 * Uso:
 *   var e = EfemeridePYC.crear({ contenedor: function () { return recordSet } });
 *   e.cancion(song);                 // en cada cambio de canción
 *
 * Vista previa: ?efemeride=demo recorre las canciones de prueba cada 12 s; con &cumple=1
 * fuerza el aspecto de aniversario.
 */
(function (global) {
    'use strict';

    var MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    var SVG = 'http://www.w3.org/2000/svg';

    function el(tag, clase, padre, texto) {
        var e = document.createElement(tag);
        if (clase) { e.className = clase; }
        if (texto) { e.textContent = texto; }
        if (padre) { padre.appendChild(e); }
        return e;
    }

    function svg(tag, attrs, padre) {
        var e = document.createElementNS(SVG, tag), k;
        for (k in attrs) { if (attrs.hasOwnProperty(k)) { e.setAttribute(k, attrs[k]); } }
        if (padre) { padre.appendChild(e); }
        return e;
    }

    // { anios, cumple, anio, dia, mes } a partir de "YYYY-MM-DD" o solo el año; null si no sirve
    function calcular(det, hoy, forzarCumple) {
        var anio = det && det.anio, m, mes = null, dia = null, anios, cumple = false;
        if (!anio) { return null; }
        m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(det.fechaIso || '');
        if (m) { anio = +m[1]; mes = +m[2]; dia = +m[3]; }
        anios = hoy.getFullYear() - anio;
        if (dia) {
            cumple = hoy.getMonth() + 1 === mes && hoy.getDate() === dia;
            // Todavía no llegó su cumpleaños este año
            if (!cumple && (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia))) { anios--; }
        }
        if (forzarCumple) { cumple = true; }
        if (anios < 0 || (anios === 0 && !cumple)) { return null; }
        return { anios: anios, cumple: cumple, anio: anio, mes: mes, dia: dia };
    }

    function Efemeride(opts) {
        this.contenedor = opts.contenedor;
        this.turno = 0;
        this.forzarCumple = false;
        this.sello = null;
    }

    Efemeride.prototype.quitar = function () {
        if (this.sello && this.sello.parentNode) { this.sello.parentNode.removeChild(this.sello); }
        this.sello = null;
    };

    Efemeride.prototype.cancion = function (song) {
        var self = this, turno = ++this.turno;
        this.quitar();
        if (!song) { return; }
        global.GeniusPYC.buscar(song, function (d) {
            if (turno !== self.turno || !d) { return; }
            global.GeniusPYC.detalle(d.id, function (det) {
                if (turno !== self.turno) { return; }
                var e = calcular(det, new Date(), self.forzarCumple);
                if (e) { self.dibujar(e); }
            });
        });
    };

    Efemeride.prototype.dibujar = function (e) {
        var c = this.contenedor();
        if (!c) { return; }
        this.quitar();
        var sello = el('div', 'sello' + (e.cumple ? ' sello-cumple' : ''), c);
        var texto = e.cumple ? '¡Hoy cumple ' + e.anios + ' años!' : (e.anios === 0 ? 'Salió este año' : 'Salió hace ' + e.anios + ' ' + (e.anios === 1 ? 'año' : 'años'));
        sello.setAttribute('role', 'img');
        sello.setAttribute('aria-label', texto);
        var marco = el('div', 'sello-marco', sello);
        el('span', 'sello-sup', marco, e.cumple ? '¡Hoy cumple!' : (e.anios === 0 ? 'Salió' : 'Salió hace'));
        el('span', 'sello-num', marco, e.anios === 0 ? '¡Nuevo!' : String(e.anios));
        el('span', 'sello-inf', marco, e.anios === 0 ? 'este año' : (e.anios === 1 ? 'año' : 'años'));
        el('span', 'sello-anio', marco, String(e.anio));

        // Matasellos: círculo con la fecha cruzando la esquina del sello y tres ondas hacia afuera
        // (sobre el disco, no sobre el texto del sello). Cada trazo se dibuja dos veces: un
        // halo claro y encima la tinta, para que se lea tanto sobre papel como sobre fondo oscuro.
        var m = svg('svg', { 'class': 'sello-matasellos', viewBox: '0 0 150 70', 'aria-hidden': 'true' }, sello);
        function trazo(tag, attrs, grosor) {
            var h = {}, k;
            for (k in attrs) { if (attrs.hasOwnProperty(k)) { h[k] = attrs[k]; } }
            h['class'] = 'halo'; h['stroke-width'] = grosor + 4; h.fill = 'none';
            svg(tag, h, m);
            attrs['class'] = 'tinta'; attrs['stroke-width'] = grosor; attrs.fill = 'none';
            svg(tag, attrs, m);
        }
        trazo('circle', { cx: 116, cy: 35, r: 30 }, 3);
        trazo('circle', { cx: 116, cy: 35, r: 24 }, 1.4);
        var t1 = svg('text', { x: 116, y: 32, 'text-anchor': 'middle', 'font-size': 12 }, m);
        t1.textContent = e.dia ? e.dia + ' ' + MESES[e.mes - 1] : 'PYC';
        var t2 = svg('text', { x: 116, y: 47, 'text-anchor': 'middle', 'font-size': 13 }, m);
        t2.textContent = String(e.anio);
        for (var i = 0; i < 3; i++) {
            trazo('path', { d: 'M6 ' + (20 + i * 15) + ' q 9 -7 18 0 t 18 0 t 18 0 t 18 0', 'stroke-linecap': 'round' }, 3);
        }
        var self = this;
        this.sello = sello;
        setTimeout(function () { if (self.sello === sello) { sello.className += ' sello-puesto'; } }, 30);
    };

    global.EfemeridePYC = {
        crear: function (opts) {
            var ef = new Efemeride(opts);
            var qs = global.location ? global.location.search : '';
            if (/[?&]efemeride=demo\b/.test(qs)) {
                var lista = global.GeniusPYC.DEMO, desde = /[?&]g=(\d+)/.exec(qs);
                var i = desde ? +desde[1] : 0, cancionReal = ef.cancion;
                ef.forzarCumple = /[?&]cumple=1\b/.test(qs);
                ef.cancion = function () {};
                var paso = function () {
                    var s = lista[i++ % lista.length];
                    cancionReal.call(ef, { id: 'demo-' + s.artist + s.title, artist: s.artist, title: s.title });
                };
                setTimeout(paso, 1500);
                setInterval(paso, 12000);
            }
            return ef;
        },
        calcular: calcular
    };
})(this);
