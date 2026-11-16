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
 * El título es el de AzuraCast (Genius a veces confunde versiones: "Desesperada (English Version)").
 *
 * Entre verso y verso, una nota mucho más discreta, solo informativa, debajo del título:
 *   - efeméride ("Salió hace 31 años · 14 de septiembre de 1999", "¡Hoy cumple 30 años!")
 *   - créditos (compuesta por, producida por, álbum, sello, grabación)
 *   - otras canciones del artista en la radio (opts.pedidos, vía FichaPYC.otras)
 *   - Pop-Up Tips de la canción (custom_fields.tip1..3, los mismos de poptips.js)
 * Rotan junto con los versos (a cada cambio, el verso siguiente y la nota siguiente); si la
 * canción no tiene versos, rotan solas bajo el título. Lo que no exista simplemente no sale.
 *
 * Uso:
 *   var sb = StandbyPYC.crear({ capa: elemento, minutos: 3, alDespertar: fn, pedidos: urlRequests });
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

    // Título como lo escribe AzuraCast, sin extensión ni sufijos internos ni "(Remaster)"
    function limpiarTitulo(t) {
        return (t || '').replace(/\.(mp3|flac|wav|m4a|ogg)$/i, '').replace(/_pyc_\w+/g, '')
            .replace(/\s*\((?:remaster|remastered|lp version|radio edit|album version|single version)[^)]*\)/ig, '')
            .replace(/\s+-\s+(?:remaster|remastered|lp version|radio edit|album version|single version|\d{4} remaster).*$/i, '');
    }

    function unir(partes, sep) {
        var s = [], i;
        for (i = 0; i < partes.length; i++) { if (partes[i]) { s.push(partes[i]); } }
        return s.join(sep || ' · ');
    }

    function nombres(lista) {
        return lista && lista.length ? lista.slice(0, 3).join(', ') : null;
    }

    function mezclar(a) {
        var b = a.slice(0), i, j, t;
        for (i = b.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = b[i]; b[i] = b[j]; b[j] = t; }
        return b;
    }

    // Notas informativas de la canción, intercaladas por tipo: efeméride, crédito, radio
    function armarNotas(song, det, otras) {
        var efem = [], cred = [], radio = [], i;

        if (det && global.EfemeridePYC) {
            var e = global.EfemeridePYC.calcular(det, new Date(), false), cuando;
            if (e) {
                cuando = e.cumple ? '¡Hoy cumple ' + e.anios + ' años!'
                    : (e.anios === 0 ? 'Salió este año' : 'Salió hace ' + e.anios + ' ' + (e.anios === 1 ? 'año' : 'años'));
                efem.push({ et: 'Efeméride', texto: unir([cuando, det.fecha]) });
            }
        }

        if (det) {
            var a = unir([
                nombres(det.compositores) ? 'Compuesta por ' + nombres(det.compositores) : null,
                nombres(det.productores) ? 'Producida por ' + nombres(det.productores) : null
            ]);
            var b = unir([
                det.album ? 'Del álbum ' + det.album : null,
                nombres(det.arreglos) ? 'Arreglos de ' + nombres(det.arreglos) : null,
                nombres(det.sello) ? 'Sello ' + nombres(det.sello) : null,
                det.grabadaEn ? 'Grabada en ' + det.grabadaEn : null
            ]);
            if (a) { cred.push({ et: 'Créditos', texto: a }); }
            if (b) { cred.push({ et: 'Créditos', texto: b }); }
        }

        if (otras && otras.length) {
            var titulos = [], m = mezclar(otras);
            for (i = 0; i < Math.min(3, m.length); i++) { titulos.push(m[i].titulo); }
            radio.push({ et: 'También en la radio', texto: titulos.join(' · ') });
        }

        // Una de cada grupo por vuelta, para que no vengan tres créditos seguidos
        // (los Pop-Up Tips no van aquí: salen como globos, ver Standby.globos)
        var grupos = [efem, cred, radio], salida = [], hubo = true, k;
        while (hubo) {
            hubo = false;
            for (k = 0; k < grupos.length; k++) {
                if (grupos[k].length) { salida.push(grupos[k].shift()); hubo = true; }
            }
        }
        return salida;
    }

    // Arma las diapositivas: verso i + nota i (ambas listas giran si una es más corta)
    function armarSlides(versos, notas) {
        var n = Math.min(8, Math.max(versos.length, notas.length)), slides = [], i;
        for (i = 0; i < n; i++) {
            slides.push({
                verso: versos.length ? versos[i % versos.length] : null,
                nota: notas.length ? notas[i % notas.length] : null
            });
        }
        return slides;
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
        this.slides = [];
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
        this.nota = el('p', 'standby-nota', this.bloque);
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

        // Pop-Up Tips: los mismos globos de poptips.js, dibujados sobre el afiche y anclados
        // al logo, al reloj y al disco en miniatura
        this.song = null;
        this.pop = null;
        if (global.PopTips) {
            var capa = this.capa;
            var rel = function (sel, f) {
                var e = sel(), r = e && e.getBoundingClientRect();
                return r && r.width > 10 && r.height > 10 ? f(r) : null;
            };
            this.pop = global.PopTips.crear({
                contenedor: capa,
                margen: 24,
                anclas: [
                    function () { return rel(function () { return marca; }, function (r) { return { x: r.right + 8, y: r.top + r.height / 2, lado: 'der' }; }); },
                    function () { return rel(function () { return mini; }, function (r) { return { x: r.left + r.width * 0.3, y: r.top - 6, lado: 'arriba' }; }); },
                    function () { return rel(function () { return self.reloj; }, function (r) { return { x: r.left + r.width * 0.7, y: r.bottom + 4, lado: 'abajo' }; }); }
                ]
            });
        }

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
        // Los globos solo corren con el afiche puesto
        if (this.pop && this.activo && this.song) { this.pop.actualizar(this.song, transcurrido || 0, duracion || 0); }
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
        if (this.pop) { this.pop.limpiar(); }
    };

    // Datos de la canción nueva: se piden siempre (son las mismas llamadas que ya hizo el
    // fondo vivo y quedan en caché), así el afiche está listo cuando se active.
    Standby.prototype.cancion = function (song, caratula) {
        var self = this, turno = ++this.turno;
        if (!song) { return; }
        this.song = song;
        if (this.pop) { this.pop.limpiar(); }
        this.hayContenido = false;
        // Carátula del disco en miniatura: la de AzuraCast, si la canción tiene
        if (caratula) { this.miniArte.src = caratula; quitarClase(this.mini, 'sin-arte'); } else { ponerClase(this.mini, 'sin-arte'); }
        var manual = versoManual(song);
        // El título es siempre el de AzuraCast: Genius a veces trae otra versión de la canción
        var titulo = limpiarTitulo(song.title || song.text);
        var datos = { d: null, versos: [], det: null, otras: [] }, faltan = 2;

        function fin() {
            if (--faltan || turno !== self.turno) { return; }
            var foto = (datos.d && datos.d.fondo) || caratula || null;
            var versos = manual ? [manual] : datos.versos;
            self.mostrar(song.artist, titulo, foto, armarSlides(versos, armarNotas(song, datos.det, datos.otras)));
        }

        // Genius: foto, versos y detalle (créditos y fecha), en paralelo una vez hallada la canción
        global.GeniusPYC.buscar(song, function (d) {
            if (turno !== self.turno) { return; }
            datos.d = d;
            if (!d) { fin(); return; }
            var sub = manual ? 1 : 2;
            function sube() { if (--sub === 0) { fin(); } }
            global.GeniusPYC.detalle(d.id, function (det) { datos.det = det; sube(); });
            if (!manual) { global.GeniusPYC.versos(d.id, function (v) { datos.versos = v || []; sube(); }); }
        });

        // Otras canciones del artista en la radio
        if (this.opts.pedidos && global.FichaPYC && global.FichaPYC.otras) {
            global.FichaPYC.otras(this.opts.pedidos, song, function (o) { datos.otras = o || []; fin(); });
        } else {
            fin();
        }
    };

    Standby.prototype.mostrar = function (artista, titulo, foto, slides) {
        var self = this;
        this.hayContenido = !!foto || !!(slides && slides.length);
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
            self.slides = slides || [];
            self.iVerso = 0;
            texto(self.artista, artista);
            texto(self.titulo, titulo);
            self.ponerSlide();
            quitarClase(self.bloque, 'cambiando');
            self.programarVersos();
        }, FUNDIDO);
    };

    // Verso y nota de la diapositiva actual
    Standby.prototype.ponerSlide = function () {
        var s = this.slides[this.iVerso % Math.max(this.slides.length, 1)], v = s && s.verso, i, largo = 0;
        while (this.verso.firstChild) { this.verso.removeChild(this.verso.firstChild); }
        while (this.nota.firstChild) { this.nota.removeChild(this.nota.firstChild); }
        quitarClase(this.bloque, 'sin-verso');
        quitarClase(this.verso, 'largo');
        if (s && s.nota) {
            el('span', 'standby-nota-et', this.nota).textContent = s.nota.et;
            this.nota.appendChild(document.createTextNode(s.nota.texto));
        }
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
        if (this.slides.length < 2 || !this.activo) { return; }
        this.timerVerso = setInterval(function () {
            var n = self.slides.length;
            // Si el verso es el mismo (hay más notas que versos) solo cambia la nota
            var mismo = self.slides[self.iVerso % n].verso === self.slides[(self.iVerso + 1) % n].verso;
            if (!mismo) { ponerClase(self.verso, 'cambiando'); }
            ponerClase(self.nota, 'cambiando');
            setTimeout(function () {
                self.iVerso++;
                self.ponerSlide();
                quitarClase(self.verso, 'cambiando');
                quitarClase(self.nota, 'cambiando');
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
            Standby.prototype.cancion.call(self, {
                id: 'demo-' + s.artist + s.title, artist: s.artist, title: s.title,
                // Dato de prueba, para ver cómo se intercalan los Pop-Up Tips
                custom_fields: { tip1: 'Se grabó en una sola toma, a las cuatro de la mañana, con una guitarra prestada.' }
            }, null);
        }
        paso();
        // Entra cuando la canción tiene algo que mostrar y sale cuando no
        setInterval(function () {
            if (self.hayContenido && !self.activo) { self.activar(); }
            else if (!self.hayContenido && self.activo) { self.desactivar(); }
        }, 500);
        // Reloj de prueba para la barra de tiempo (la página real lo trae del servidor)
        // Corre a 8x entre globos y a velocidad real mientras hay uno en pantalla (como el demo
        // de poptips.js); la canción cambia al terminar el reloj, así ningún globo se corta.
        var t = 0, antes = new Date().getTime();
        setInterval(function () {
            var ahora = new Date().getTime();
            t += (ahora - antes) / 1000 * (self.pop && self.pop.actual ? 1 : 8);
            antes = ahora;
            if (t >= 240) { t = 0; paso(); }
            self.progreso(t, 240);
        }, 250);
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
