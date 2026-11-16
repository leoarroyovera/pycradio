/*
 * Pop-Up Tips — burbujas de datos curiosos sobre la canción al aire, al estilo
 * "Pop-Up Video" de MTV en los 90.
 *
 * Un solo archivo para la web (index.html lo carga desde tizen/js/) y para las
 * apps de TV (Tizen y Android TV, que empaqueta tizen/). Por eso es ES5 sin
 * dependencias: tiene que correr en Chromium 47 (Tizen 3, 2017).
 *
 * Los tips vienen de AzuraCast: song.custom_fields.tip1..tip3 en la API
 * nowplaying (se generan con PoesiaYCumbiaAzuracast/pop_tips).
 *
 * Uso:
 *   var pt = PopTips.crear({
 *       contenedor: elemento,          // capa donde se dibujan (position: absolute/fixed)
 *       anclas: [fn, fn, fn],          // cada fn() devuelve {x, y, lado} en coords del
 *                                      // contenedor, o null si no aplica. lado = hacia
 *                                      // dónde sale la burbuja desde la punta de la cola:
 *                                      // 'arriba' | 'abajo' | 'izq' | 'der'
 *       margen: 16,                    // distancia mínima a los bordes del contenedor
 *       margenSup: fn | número         // opcional: borde superior (p. ej. bajo una barra fija)
 *   });
 *   pt.actualizar(song, elapsed, duration);   // en cada tic (1 s) y en cada consulta
 *   pt.limpiar();
 *
 * Vista previa: ?poptips=demo en la URL corre una canción ficticia a 10x.
 */
(function (global) {
    'use strict';

    var ETIQUETAS = ['¿Sabías que…?', 'Dato curioso', 'Ojo al dato'];
    var INICIO = 0.15;        // primer tip desde el 15 % de la canción
    var FIN = 0.80;           // y el último debe terminar antes del 80 %
    var DURACION_MIN = 90;    // en jingles y cortinas no hay burbujas
    var COLCHON_FINAL = 12;   // ni en los últimos 12 s
    var VISIBLE_MIN = 4;      // si quedan menos segundos de la ventana, se salta

    // Segundos en pantalla: tiempo cómodo de lectura a distancia, con tope
    function tiempoLectura(texto) {
        return Math.min(14, 7 + texto.length * 0.06);
    }

    // Número pseudoaleatorio estable por canción (0..1), para que el reparto
    // no sea siempre idéntico pero sí el mismo en la web y en la tele.
    function azar(semilla) {
        var h = 2166136261;
        for (var i = 0; i < semilla.length; i++) {
            h ^= semilla.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return (h % 1000) / 1000;
    }

    function tipsDe(song) {
        var cf = (song && song.custom_fields) || {};
        var lista = [];
        for (var i = 1; i <= 3; i++) {
            var t = cf['tip' + i];
            if (t && String(t).replace(/\s+/g, '')) { lista.push(String(t)); }
        }
        return lista;
    }

    // Calendario de la canción: [{texto, desde, hasta, ancla}]
    function planificar(song, duracion) {
        var tips = tipsDe(song);
        if (!tips.length || !duracion || duracion < DURACION_MIN) { return []; }
        var desde = duracion * INICIO;
        var hasta = Math.min(duracion * FIN, duracion - COLCHON_FINAL);
        var tramo = (hasta - desde) / tips.length;
        var plan = [];
        var giro = Math.floor(azar(String(song.id || song.text)) * 3);
        for (var i = 0; i < tips.length; i++) {
            var dura = tiempoLectura(tips[i]);
            if (tramo < dura) { break; }  // canción demasiado corta para tantos
            var holgura = tramo - dura;
            var inicio = desde + i * tramo + holgura * (0.15 + 0.5 * azar(song.id + ':' + i));
            plan.push({ texto: tips[i], desde: inicio, hasta: inicio + dura, ancla: (giro + i) % 3, n: i });
        }
        return plan;
    }

    function crearEl(tag, clase, texto) {
        var el = document.createElement(tag);
        el.className = clase;
        if (texto) { el.textContent = texto; }
        return el;
    }

    function setTransformOrigin(el, valor) {
        el.style.webkitTransformOrigin = valor;
        el.style.transformOrigin = valor;
    }

    function Instancia(opts) {
        this.cont = opts.contenedor;
        this.anclas = opts.anclas || [];
        this.margen = opts.margen || 16;
        this.margenSup = opts.margenSup;
        this.id = null;
        this.plan = [];
        this.actual = null;   // {item, el}
        this.mostrados = {};
        this.demo = false;

        // Región viva única (fuera de la vista) para lectores de pantalla
        this.vivo = crearEl('div', 'poptips-sr');
        this.vivo.setAttribute('role', 'status');
        this.vivo.setAttribute('aria-live', 'polite');
        this.vivo.setAttribute('aria-atomic', 'true');
        this.cont.appendChild(this.vivo);
    }

    Instancia.prototype.actualizar = function (song, elapsed, duration, desdeDemo) {
        if (this.demo && !desdeDemo) { return; }
        if (!song) { this.limpiar(); return; }
        var id = String(song.id || song.text || '');
        var firma = id + '|' + tipsDe(song).join('|') + '|' + duration;
        if (firma !== this.id) {
            var cambioCancion = !this.id || this.id.split('|')[0] !== id;
            this.id = firma;
            this.plan = planificar(song, duration);
            if (cambioCancion) {
                this.mostrados = {};
                this.cerrar(true);
            }
        }
        this.tic(elapsed || 0);
    };

    Instancia.prototype.tic = function (t) {
        var visible = null;
        for (var i = 0; i < this.plan.length; i++) {
            var p = this.plan[i];
            if (t >= p.desde && t < p.hasta) { visible = p; break; }
        }
        if (this.actual && this.actual.item !== visible) { this.cerrar(); }
        if (visible && !this.actual && !this.mostrados[visible.n] && visible.hasta - t >= VISIBLE_MIN) {
            this.mostrados[visible.n] = true;
            this.abrir(visible);
        }
    };

    Instancia.prototype.ancla = function (preferida) {
        for (var k = 0; k < this.anclas.length; k++) {
            var fn = this.anclas[(preferida + k) % this.anclas.length];
            var a = fn && fn();
            if (a) { return a; }
        }
        return null;
    };

    Instancia.prototype.abrir = function (item) {
        var a = this.ancla(item.ancla);
        if (!a) { return; }

        var el = crearEl('div', 'poptip poptip-' + a.lado + ' poptip-c' + (item.n % 3));
        el.setAttribute('aria-hidden', 'true');
        var chip = crearEl('span', 'poptip-chip');
        chip.appendChild(crearEl('b', 'poptip-marca', 'PYC'));
        chip.appendChild(document.createTextNode(' ' + ETIQUETAS[item.n % ETIQUETAS.length]));
        el.appendChild(chip);
        el.appendChild(crearEl('p', 'poptip-texto', item.texto));
        el.appendChild(crearEl('span', 'poptip-cola'));
        this.cont.appendChild(el);

        // Posición: la punta de la cola en (x, y); la burbuja sale hacia "lado"
        var w = el.offsetWidth, h = el.offsetHeight;
        var cw = this.cont.offsetWidth || 1920, ch = this.cont.offsetHeight || 1080;
        var sep = 34;  // largo de la cola (40 px menos el borde)
        var x, y;
        if (a.lado === 'der') { x = a.x + sep; y = a.y - h * 0.35; }
        else if (a.lado === 'izq') { x = a.x - sep - w; y = a.y - h * 0.35; }
        else if (a.lado === 'abajo') { x = a.x - w * 0.3; y = a.y + sep; }
        else { x = a.x - w * 0.3; y = a.y - sep - h; }
        var m = this.margen;
        var x2 = Math.max(m, Math.min(cw - w - m, x));
        var sup = typeof this.margenSup === 'function' ? this.margenSup() : (this.margenSup || m);
        var y2 = Math.max(sup, Math.min(ch - h - m, y));
        el.style.left = Math.round(x2) + 'px';
        el.style.top = Math.round(y2) + 'px';

        // La cola sigue apuntando al ancla aunque la burbuja se haya corrido
        var cola = el.lastChild;
        if (a.lado === 'arriba' || a.lado === 'abajo') {
            cola.style.left = Math.round(Math.max(18, Math.min(w - 56, a.x - x2 - 18))) + 'px';
        } else {
            cola.style.top = Math.round(Math.max(18, Math.min(h - 56, a.y - y2 - 18))) + 'px';
        }
        setTransformOrigin(el, Math.round(a.x - x2) + 'px ' + Math.round(a.y - y2) + 'px');

        var cls = el.className;
        el.offsetWidth;  // fuerza el estilo inicial antes de animar
        el.className = cls + ' poptip-in';
        this.vivo.textContent = ETIQUETAS[item.n % ETIQUETAS.length] + ' ' + item.texto;
        this.actual = { item: item, el: el };
    };

    Instancia.prototype.cerrar = function (inmediato) {
        if (!this.actual) { return; }
        var el = this.actual.el;
        this.actual = null;
        if (inmediato) { if (el.parentNode) { el.parentNode.removeChild(el); } return; }
        el.className = el.className.replace(' poptip-in', '') + ' poptip-out';
        setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 400);
    };

    Instancia.prototype.limpiar = function (desdeDemo) {
        if (this.demo && !desdeDemo) { return; }
        this.cerrar(true);
        this.id = null;
        this.plan = [];
        this.mostrados = {};
    };

    // Canción ficticia a 10x para revisar ritmo y diseño sin esperar
    Instancia.prototype.iniciarDemo = function () {
        var self = this;
        var song = {
            id: 'demo', text: 'Demo',
            custom_fields: {
                tip1: 'Se grabó en una sola toma a las 4 de la mañana, con el baterista resfriado y una guitarra prestada.',
                tip2: 'Vendió más de 2 millones de copias en Latinoamérica el primer año.',
                tip3: 'El coro lo cantan las tías del productor, que estaban de visita en el estudio.'
            }
        };
        // Corre a 10x entre burbujas y a velocidad real mientras hay una en pantalla
        var duracion = 240, t = 0, antes = Date.now();
        self.demo = true;
        setInterval(function () {
            var ahora = Date.now();
            t += (ahora - antes) / 1000 * (self.actual ? 1 : 10);
            antes = ahora;
            if (t > duracion) { t = 0; self.limpiar(true); }
            self.actualizar(song, t, duracion, true);
        }, 100);
    };

    global.PopTips = {
        crear: function (opts) {
            var pt = new Instancia(opts);
            if (/[?&]poptips=demo\b/.test(global.location ? global.location.search : '')) {
                pt.iniciarDemo();
            }
            return pt;
        },
        planificar: planificar
    };
})(this);
