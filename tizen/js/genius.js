/*
 * Genius — imágenes de la canción al aire, pedidas a la API de Genius en vivo.
 *
 * Un solo archivo para la web (index.html lo carga desde tizen/js/) y, más adelante,
 * para las apps de TV. ES5 sin dependencias, como poptips.js (Chromium 47).
 *
 * Al cambiar la canción busca en Genius (1-2 llamadas a /search, sin preflight CORS
 * porque el token va en la URL) y, cuando hay respuesta, hace aparecer con fundido:
 *   - la funda de respaldo: portada de Genius si AzuraCast no trae carátula;
 *   - el fondo vivo: foto del artista en duotono rojo/negro con semitono y grano.
 * Si no encuentra nada, no pasa nada: queda el sitio de siempre.
 *
 * El token es de solo lectura y queda visible en el código del sitio (decisión tomada:
 * si alguien lo abusa, se genera otro en genius.com/api-clients y se cambia aquí).
 * Las respuestas se guardan en localStorage para no repetir llamadas por canción.
 *
 * Uso:
 *   var g = GeniusPYC.crear({
 *       fondo: elemento,                // capa fija detrás del sitio
 *       funda: function () { return el } // la .sleeve actual (o null)
 *   });
 *   g.cancion(song, tieneCaratula);     // en cada cambio de canción (song de nowplaying)
 *
 * Vista previa: ?genius=demo recorre canciones de prueba cada 15 s (&g=3 parte en la
 * cuarta), fuerza la funda
 * de Genius aunque haya carátula y muestra una etiqueta con el resultado.
 */
(function (global) {
    'use strict';

    var TOKEN = 'tqOYO94WRYKj1G6N9_UG2Gld50VcUEu92yqVTYLI8Hf-J7wxFKXn-aqZz5f7hZgl';
    var API = 'https://api.genius.com';
    var CACHE_OK = 14 * 86400000;     // ms que vale una respuesta encontrada
    var CACHE_NADA = 2 * 86400000;    // y una "no está en Genius"
    var VERSION_CACHE = 'g4:';

    // Correcciones a mano: song.id de AzuraCast -> id de Genius, o null si no está.
    // (Se arman probando con PoesiaYCumbiaAzuracast/genius/genius.py.)
    var CORRECCIONES = {};

    var DEMO = [
        { artist: 'Joaquín Sabina', title: '19 Dias y 500 Noches' },
        { artist: 'Sandy & Papo', title: 'El Alacrán' },
        { artist: 'La Ley', title: 'Más Allá' },
        { artist: 'Julieta Venegas', title: 'Lento' },
        { artist: 'Zucchero', title: 'Vuelo' },                 // no está: no debe mostrar nada
        { artist: 'Javiera Parra y Los Imposibles', title: 'Maldita Primavera' },
        { artist: 'Mario Guerrero', title: 'Dime Que Sí, Dime Que No' },
        { artist: 'Coolio', title: "Gangsta's Paradise (feat. L.V.) (LP Version)" }
    ];

    // --- Coincidencia (misma lógica que genius.py) ---------------------------------

    function norm(s) {
        s = (s || '').toLowerCase();
        if (s.normalize) { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
        return s.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    }

    function tituloLimpio(t) {
        return (t || '')
            .replace(/\.(mp3|flac|wav|m4a|ogg)$/i, '')
            .replace(/_pyc_\w+/g, '')
            .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
            .replace(/\s+-\s+.*$|\s+(ft|feat)\.?\s.*$/i, '')
            .replace(/^\s+|\s+$/g, '');
    }

    function artistas(a) {
        var partes = (a || '').split(/,| feat\.?| ft\.?| & | y | x |\/|;/i), salida = [], i;
        for (i = 0; i < partes.length; i++) {
            if (partes[i].replace(/\s/g, '')) { salida.push(partes[i].replace(/^\s+|\s+$/g, '')); }
        }
        return salida.length ? salida : [a || ''];
    }

    // Parecido 0..1: Dice sobre bigramas, y que uno contenga al otro también vale
    function parecido(a, b) {
        a = norm(a); b = norm(b);
        if (!a || !b) { return 0; }
        if (a === b) { return 1; }
        var corto = a.length < b.length ? a : b, largo = corto === a ? b : a;
        var base = 0, bigA = {}, n = 0, comunes = 0, i, k;
        for (i = 0; i < a.length - 1; i++) { k = a.substr(i, 2); bigA[k] = (bigA[k] || 0) + 1; n++; }
        for (i = 0; i < b.length - 1; i++) {
            k = b.substr(i, 2);
            if (bigA[k]) { bigA[k]--; comunes++; }
            n++;
        }
        base = n ? 2 * comunes / n : 0;
        if (corto.length >= 4 && largo.indexOf(corto) !== -1) { base = Math.max(base, 0.9); }
        return base;
    }

    function esBasura(s) {
        var artista = s.primary_artist ? s.primary_artist.name : '';
        return /^genius/i.test(artista) ||
            /traducci|translation|romaniz|tradu[cç][aã]o|übersetzung|\btracklist\b/i.test(s.title + ' ' + artista);
    }

    function puntuar(song, s) {
        var t = parecido(tituloLimpio(song.title), tituloLimpio(s.title));
        var nombres = [s.primary_artist.name], i, j, a = 0, mias = artistas(song.artist);
        for (i = 0; i < (s.featured_artists || []).length; i++) { nombres.push(s.featured_artists[i].name); }
        nombres = nombres.concat(artistas(s.artist_names || ''));
        for (i = 0; i < mias.length; i++) {
            for (j = 0; j < nombres.length; j++) { a = Math.max(a, parecido(mias[i], nombres[j])); }
        }
        return { t: t, a: a, total: 0.6 * t + 0.4 * a };
    }

    // --- Red y caché ----------------------------------------------------------------

    function pedir(ruta, ok, mal) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API + ruta + (ruta.indexOf('?') === -1 ? '?' : '&') + 'access_token=' + TOKEN);
        xhr.timeout = 15000;
        xhr.onload = function () {
            if (xhr.status !== 200) { mal(xhr.status); return; }
            try { ok(JSON.parse(xhr.responseText).response); } catch (e) { mal('json'); }
        };
        xhr.onerror = xhr.ontimeout = function () { mal('red'); };
        xhr.send();
    }

    function leerCache(clave) {
        try {
            var v = JSON.parse(global.localStorage.getItem(VERSION_CACHE + clave));
            if (v && Date.now() - v.t < (v.d ? CACHE_OK : CACHE_NADA)) { return v; }
        } catch (e) { /* sin localStorage: se consulta siempre */ }
        return null;
    }

    function guardarCache(clave, datos) {
        try { global.localStorage.setItem(VERSION_CACHE + clave, JSON.stringify({ t: Date.now(), d: datos })); } catch (e) { /* lleno o bloqueado */ }
    }

    function imagen(url) {
        return url && !/default_(avatar|cover)|\/images\/default/.test(url) ? url : null;
    }

    // Ancho/alto según el nombre del archivo de Genius (…1000x338x1.jpg); 0 si no se sabe
    function proporcion(url) {
        var m = /\.(\d+)x(\d+)x\d+\.\w+$/.exec(url || '');
        return m ? +m[1] / +m[2] : 0;
    }

    // Las cabeceras muy apaisadas (1000x165, 1000x338) son banners o logos: estiradas a
    // pantalla completa se ven mal. Para el fondo sirven solo si son cercanas a 16:9.
    function fotoDeFondo(artista) {
        var cabecera = imagen(artista.header_image_url), retrato = imagen(artista.image_url);
        var r = proporcion(cabecera);
        if (cabecera && r && r <= 2.1) { return cabecera; }
        return retrato || cabecera;
    }

    // Lo que usa el sitio, a partir de un resultado de /search o /songs
    function resumir(s, p) {
        var portada = imagen(s.song_art_image_url);
        var foto = fotoDeFondo(s.primary_artist);
        return {
            id: s.id,
            artistaId: s.primary_artist.id,
            titulo: s.title,
            artista: s.artist_names || s.primary_artist.name,
            url: s.url,
            confianza: p ? Math.round(p.total * 100) / 100 : 1,
            portada: portada,
            // Retrato cuadrado del artista (collage, ficha); puede ser un logo si no hay foto
            retrato: imagen(s.primary_artist.image_url),
            // Para el fondo, la foto del artista; si Genius no tiene, la cabecera de la canción
            fondo: foto || imagen(s.header_image_url) || null
        };
    }

    function buscar(song, listo) {
        var clave = song.id || norm(song.artist + ' ' + song.title);
        var guardado = leerCache(clave);
        if (guardado) { listo(guardado.d, true); return; }

        if (CORRECCIONES.hasOwnProperty(song.id)) {
            if (CORRECCIONES[song.id] === null) { guardarCache(clave, null); listo(null); return; }
            pedir('/songs/' + CORRECCIONES[song.id], function (r) {
                var d = resumir(r.song, null);
                guardarCache(clave, d); listo(d);
            }, function () { listo(null); });
            return;
        }

        var titulo = tituloLimpio(song.title);
        var consultas = [artistas(song.artist)[0] + ' ' + titulo, titulo];
        var mejor = null, mejorP = null;

        function siguiente() {
            if (!consultas.length) { terminar(); return; }
            pedir('/search?q=' + encodeURIComponent(consultas.shift()), function (r) {
                var hits = r.hits || [], i, s, p;
                for (i = 0; i < hits.length; i++) {
                    s = hits[i].result;
                    if (hits[i].type !== 'song' || esBasura(s)) { continue; }
                    p = puntuar(song, s);
                    if (!mejorP || p.total > mejorP.total) { mejor = s; mejorP = p; }
                }
                // Si la primera búsqueda ya dio una coincidencia segura, no hace falta la segunda
                if (esSegura(mejorP)) { terminar(); } else { siguiente(); }
            }, function () { listo(null); });    // error de red: no se guarda, se reintenta otra vez
        }

        function terminar() {
            var d = esSegura(mejorP) ? resumir(mejor, mejorP) : null;
            guardarCache(clave, d);
            listo(d);
        }

        siguiente();
    }

    // En vivo solo se aceptan coincidencias seguras: mejor nada que la foto de otro
    function esSegura(p) {
        return !!p && p.t >= 0.85 && p.a >= 0.7;
    }

    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
        'septiembre', 'octubre', 'noviembre', 'diciembre'];

    // "1999-09-14" -> "14 de septiembre de 1999"; con solo año o mes, lo que haya
    function fechaLarga(s) {
        var c = s.release_date_components || {}, m;
        if (s.release_date) {
            m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.release_date);
            if (m) { c = { year: +m[1], month: +m[2], day: +m[3] }; }
        }
        if (!c.year) { return null; }
        if (!c.month) { return String(c.year); }
        return (c.day ? c.day + ' de ' : '') + MESES[c.month - 1] + ' de ' + c.year;
    }

    function nombres(lista) {
        var salida = [], i;
        for (i = 0; i < (lista || []).length; i++) { salida.push(lista[i].name); }
        return salida;
    }

    function anioDe(s) {
        var c = s.release_date_components || {}, m;
        if (c.year) { return c.year; }
        m = /(\d{4})/.exec(s.release_date || s.release_date_for_display || '');
        return m ? +m[1] : null;
    }

    // Etiquetas de las relaciones de Genius entre canciones, en la voz de la ficha
    var RELACIONES = {
        cover_of: 'versión de', remix_of: 'remix de', live_version_of: 'en vivo de',
        samples: 'samplea', interpolates: 'interpola',
        covered_by: 'versionada por', sampled_in: 'sampleada en', interpolated_by: 'interpolada en',
        remixed_by: 'remixada por'
    };

    // [{tipo, etiqueta, total, canciones:[{titulo, artista, anio}]}] con hasta 3 canciones cada una
    function versionesDe(s) {
        var rels = s.song_relationships || [], salida = [], i, j, r, x, lista, m;
        for (i = 0; i < rels.length; i++) {
            r = rels[i];
            if (!RELACIONES[r.relationship_type] || !r.songs || !r.songs.length) { continue; }
            lista = [];
            for (j = 0; j < Math.min(3, r.songs.length); j++) {
                x = r.songs[j];
                m = /(\d{4})/.exec(x.release_date_for_display || '');
                lista.push({ titulo: x.title, artista: x.primary_artist ? x.primary_artist.name : '', anio: m ? +m[1] : null });
            }
            salida.push({ tipo: r.relationship_type, etiqueta: RELACIONES[r.relationship_type], total: r.songs.length, canciones: lista });
        }
        return salida;
    }

    // Créditos para la contraportada (una llamada a /songs/:id, en caché como lo demás)
    function detalle(geniusId, listo) {
        var clave = 'd' + geniusId, guardado = leerCache(clave);
        if (guardado) { listo(guardado.d); return; }
        pedir('/songs/' + geniusId + '?text_format=plain', function (r) {
            var s = r.song, album = s.album || {}, otros = {}, sello = [], i, p;
            var SELLO = ['Label', 'Phonographic Copyright ℗', 'Copyright ©', 'Distributor'];
            for (i = 0; i < (s.custom_performances || []).length; i++) {
                p = s.custom_performances[i];
                otros[p.label] = nombres(p.artists);
            }
            for (i = 0; i < SELLO.length && !sello.length; i++) { sello = otros[SELLO[i]] || []; }
            var d = {
                compositores: nombres(s.writer_artists),
                productores: nombres(s.producer_artists),
                album: album.name || null,
                fecha: fechaLarga(s),
                fechaIso: s.release_date || null,
                anio: anioDe(s),
                versiones: versionesDe(s),
                sello: sello,
                grabadaEn: s.recording_location || null,
                arreglos: otros.Arranger || otros['Arranged By'] || [],
                url: s.url
            };
            guardarCache(clave, d);
            listo(d);
        }, function () { listo(null); });
    }

    // Imagen del artista para el collage del historial: retrato de Genius o null
    function retrato(song, listo) {
        buscar(song, function (d) { listo(d && d.retrato ? d.retrato : null); });
    }

    // Bio corta: el primer párrafo, cortado en una oración antes de ~MAX caracteres
    function bioCorta(txt, max) {
        txt = (txt || '').replace(/^\s+|\s+$/g, '');
        if (!txt || txt === '?') { return null; }
        var parrafo = txt.split(/\n\s*\n|\n/)[0];
        if (parrafo.length <= max) { return parrafo; }
        var corte = parrafo.slice(0, max), punto = corte.lastIndexOf('. ');
        return punto > max * 0.4 ? corte.slice(0, punto + 1) : corte.replace(/\s+\S*$/, '') + '…';
    }

    // Perfil del artista para la ficha (una llamada a /artists/:id, en caché)
    function artista(artistaId, listo) {
        var clave = 'a' + artistaId, guardado = leerCache(clave);
        if (guardado) { listo(guardado.d); return; }
        pedir('/artists/' + artistaId + '?text_format=plain', function (r) {
            var a = r.artist, redes = [];
            if (a.instagram_name) { redes.push({ red: 'Instagram', usuario: '@' + a.instagram_name, url: 'https://instagram.com/' + a.instagram_name }); }
            if (a.twitter_name) { redes.push({ red: 'X', usuario: '@' + a.twitter_name, url: 'https://x.com/' + a.twitter_name }); }
            if (a.facebook_name) { redes.push({ red: 'Facebook', usuario: a.facebook_name, url: 'https://facebook.com/' + a.facebook_name }); }
            var d = {
                nombre: a.name,
                foto: imagen(a.image_url),
                bio: bioCorta(a.description && a.description.plain, 520),
                otrosNombres: (a.alternate_names || []).slice(0, 3),
                redes: redes,
                url: a.url
            };
            guardarCache(clave, d);
            listo(d);
        }, function () { listo(null); });
    }

    // Versos para el standby: los fragmentos de letra que tienen anotación en Genius
    // (la API no entrega la letra completa). Devuelve [] si no hay; cada verso es un
    // arreglo de líneas. Los más votados primero.
    function versos(geniusId, listo) {
        var clave = 'v' + geniusId, guardado = leerCache(clave);
        if (guardado) { listo(guardado.d || []); return; }
        pedir('/referents?song_id=' + geniusId + '&text_format=plain&per_page=50', function (r) {
            var refs = r.referents || [], salida = [], vistos = {}, i, frag, lineas, votos;
            for (i = 0; i < refs.length; i++) {
                frag = (refs[i].fragment || '').replace(/^\s+|\s+$/g, '');
                // "[Coro]", "[Intro: X]" o muy cortos/largos no sirven como verso
                if (!frag || frag.charAt(0) === '[' || frag.length < 15 || frag.length > 140 || vistos[frag]) { continue; }
                vistos[frag] = true;
                lineas = frag.split(/\s*\n\s*/);
                votos = refs[i].annotations && refs[i].annotations[0] ? refs[i].annotations[0].votes_total || 0 : 0;
                salida.push({ lineas: lineas, votos: votos });
            }
            salida.sort(function (a, b) { return b.votos - a.votos; });
            for (i = 0; i < salida.length; i++) { salida[i] = salida[i].lineas; }
            salida = salida.slice(0, 6);
            // Se guarda aunque esté vacío: "no tiene versos" también vale 14 días
            try { global.localStorage.setItem(VERSION_CACHE + clave, JSON.stringify({ t: Date.now(), d: salida.length ? salida : 0 })); } catch (e) { /* sin localStorage */ }
            listo(salida);
        }, function () { listo([]); });
    }

    // --- Dibujo ---------------------------------------------------------------------

    function precargar(url, ok, mal) {
        var img = new Image();
        img.onload = function () { ok(img); };
        img.onerror = mal || function () {};
        img.src = url;
    }

    function Instancia(opts) {
        this.fondo = opts.fondo;
        this.funda = opts.funda;
        this.forzarFunda = false;
        this.turno = 0;
        this.capas = [];
        this.capaActiva = 0;
        this.fundaImg = null;
        this.alResultado = opts.alResultado || null;
        if (this.fondo) {
            for (var i = 0; i < 2; i++) {
                var c = document.createElement('div');
                c.className = 'genius-fondo-capa';
                this.fondo.appendChild(c);
                this.capas.push(c);
            }
        }
    }

    Instancia.prototype.cancion = function (song, tieneCaratula) {
        var self = this, turno = ++this.turno;
        if (!song) { this.quitarFunda(); this.mostrarFondo(null); return; }
        this.quitarFunda();
        if (this.alResultado) { this.alResultado('buscando', song, null); }
        buscar(song, function (d) {
            if (turno !== self.turno) { return; }    // ya cambió la canción
            if (self.alResultado) { self.alResultado(d ? 'ok' : 'nada', song, d); }
            self.mostrarFondo(d && d.fondo);
            if (d && d.portada && (!tieneCaratula || self.forzarFunda)) {
                self.ponerFunda(d.portada, turno);
            }
        });
    };

    Instancia.prototype.mostrarFondo = function (url) {
        var self = this;
        if (!this.fondo) { return; }
        if (!url) { this.fondo.className = this.fondo.className.replace(/\s*visible/g, ''); return; }
        precargar(url, function () {
            var nueva = self.capas[1 - self.capaActiva], vieja = self.capas[self.capaActiva];
            nueva.style.backgroundImage = 'url("' + url + '")';
            nueva.className = 'genius-fondo-capa activa';
            vieja.className = 'genius-fondo-capa';
            self.capaActiva = 1 - self.capaActiva;
            if (!/\bvisible\b/.test(self.fondo.className)) { self.fondo.className += ' visible'; }
        });
    };

    Instancia.prototype.ponerFunda = function (url, turno) {
        var self = this;
        precargar(url, function () {
            var sleeve = self.funda && self.funda();
            if (!sleeve || turno !== self.turno) { return; }
            self.quitarFunda();
            var img = document.createElement('img');
            img.className = 'genius-funda';
            img.alt = '';
            img.src = url;
            sleeve.appendChild(img);
            self.fundaImg = img;
            // Un cuadro después, para que el navegador anime la opacidad
            setTimeout(function () { img.className += ' cargada'; }, 30);
        });
    };

    Instancia.prototype.quitarFunda = function () {
        if (this.fundaImg && this.fundaImg.parentNode) { this.fundaImg.parentNode.removeChild(this.fundaImg); }
        this.fundaImg = null;
    };

    Instancia.prototype.iniciarDemo = function () {
        var self = this;
        var desde = /[?&]g=(\d+)/.exec(global.location.search);
        var i = desde ? +desde[1] : 0;
        var etiqueta = document.createElement('div');
        etiqueta.className = 'genius-demo';
        document.body.appendChild(etiqueta);
        this.demo = true;
        this.forzarFunda = true;
        this.alResultado = function (estado, song, d) {
            etiqueta.textContent = 'GENIUS DEMO · ' + (
                estado === 'buscando' ? 'buscando ' + song.artist + ' — ' + song.title + '…' :
                estado === 'ok' ? '✔ ' + d.artista + ' — ' + d.titulo + ' (' + d.confianza.toFixed(2) + ')' +
                    (d.portada ? '' : ' · sin portada') + (d.fondo ? '' : ' · sin foto') :
                '✘ ' + song.artist + ' — ' + song.title + ': no está en Genius');
        };
        function paso() {
            var s = DEMO[i++ % DEMO.length];
            Instancia.prototype.cancion.call(self, { id: 'demo-' + norm(s.artist + s.title), artist: s.artist, title: s.title }, true);
        }
        paso();
        setInterval(paso, 15000);
    };

    global.GeniusPYC = {
        crear: function (opts) {
            var g = new Instancia(opts);
            if (/[?&]genius=demo\b/.test(global.location ? global.location.search : '')) {
                g.iniciarDemo();
                g.cancion = function () {};    // en demo manda la lista de prueba, no la radio
            }
            return g;
        },
        buscar: buscar,
        versos: versos,
        detalle: detalle,
        retrato: retrato,
        artista: artista,
        artistas: artistas,
        parecido: parecido,
        DEMO: DEMO
    };
})(this);
