/*
 * Poesía y Cumbia Radio — app para Samsung TV (Tizen)
 *
 * JavaScript ES5 sin frameworks, para que corra desde los televisores de 2017
 * (Tizen 3, Chromium 47). Partes:
 *   1. Escenario: escala el lienzo de 1920×1080 a la pantalla real.
 *   2. Reproductor: MP3 de Icecast (más compatible y en sincronía con la API);
 *      si falla, HLS (hls.js o nativo). Pausar = cortar, y al volver se
 *      retoma en vivo.
 *   3. "Lo que suena": consulta la API de AzuraCast y pinta disco, ficha,
 *      siguiente e historial.
 *   4. Control remoto: foco por capas (menú, panel, confirmación de salida),
 *      teclas multimedia y Volver.
 *   5. Modo ambiente: sin tocar el control, se esconde el menú y el contenido
 *      se desplaza un poco para no marcar la pantalla.
 */
(function () {
    'use strict';

    var BASE = 'https://poesiaycumbia.duckdns.org';
    var STATION = 'poesia_y_cumbia_radio';
    var API_URL = BASE + '/api/nowplaying/' + STATION;
    var SOURCES = [
        { type: 'mp3', url: BASE + '/listen/' + STATION + '/radio.mp3' },
        { type: 'hls', url: BASE + '/hls/' + STATION + '/live.m3u8' }
    ];

    var POLL_MS = 15000;
    var AMBIENT_MS = 45000;
    var STALL_MS = 15000;

    var KEY = {
        LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
        BACK: 10009, ESC: 27, BACKSPACE: 8,
        PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413
    };

    var body = document.body;
    var $ = function (id) { return document.getElementById(id); };

    function hasClass(el, c) { return (' ' + el.className + ' ').indexOf(' ' + c + ' ') > -1; }
    function setClass(el, c, on) {
        if (on && !hasClass(el, c)) {
            el.className = (el.className ? el.className + ' ' : '') + c;
        } else if (!on && hasClass(el, c)) {
            el.className = (' ' + el.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
        }
    }
    function text(id, value) { $(id).textContent = value || ''; }

    /* ======================================================================
       1. Escenario
       ====================================================================== */

    var stage = $('stage');

    function fitStage() {
        var w = window.innerWidth || document.documentElement.clientWidth || 1920;
        var h = window.innerHeight || document.documentElement.clientHeight || 1080;
        var scale = Math.min(w / 1920, h / 1080);
        var x = Math.round((w - 1920 * scale) / 2);
        var y = Math.round((h - 1080 * scale) / 2);
        var t = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
        stage.style.webkitTransform = t;
        stage.style.transform = t;
    }

    window.addEventListener('resize', fitStage);
    fitStage();

    /* ======================================================================
       2. Reproductor
       ====================================================================== */

    var audio = $('audio');
    var hls = null;
    var sourceIndex = 0;
    var wantPlaying = false;     // lo que pidió la persona
    var stallTimer = null;
    var retryTimer = null;
    var failures = 0;

    function setPlayingUI(playing) {
        setClass(body, 'is-playing', playing);
        text('play-label', playing ? 'Pausar' : (wantPlaying ? 'Conectando…' : 'Escuchar'));
    }

    function clearTimers() {
        clearTimeout(stallTimer);
        clearTimeout(retryTimer);
        stallTimer = retryTimer = null;
    }

    function teardown() {
        if (hls) {
            try { hls.destroy(); } catch (e) {}
            hls = null;
        }
        audio.pause();
        audio.removeAttribute('src');
        try { audio.load(); } catch (e) {}
    }

    function startSource() {
        var src = SOURCES[sourceIndex];
        teardown();
        clearTimers();
        setPlayingUI(false);

        // Si en STALL_MS no empieza a sonar, se prueba la otra fuente
        stallTimer = setTimeout(function () { fail('sin respuesta'); }, STALL_MS);

        if (src.type === 'mp3') {
            // El parámetro evita que la TV reutilice un búfer viejo: siempre en vivo
            audio.src = src.url + '?t=' + Date.now();
            playAudio();
        } else if (window.Hls && Hls.isSupported()) {
            hls = new Hls({ liveSyncDurationCount: 3 });
            hls.on(Hls.Events.ERROR, function (event, data) {
                if (data && data.fatal) { fail('HLS ' + data.details); }
            });
            hls.on(Hls.Events.MANIFEST_PARSED, playAudio);
            hls.loadSource(src.url);
            hls.attachMedia(audio);
        } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
            audio.src = src.url;
            playAudio();
        } else {
            fail('HLS no soportado');
        }
    }

    function playAudio() {
        var p = audio.play();
        if (p && p.catch) {
            p.catch(function (e) { console.warn('play()', e); });
        }
    }

    function fail(reason) {
        console.warn('Fuente ' + SOURCES[sourceIndex].type + ' falló:', reason);
        if (!wantPlaying) { return; }
        teardown();
        clearTimers();
        failures++;
        sourceIndex = (sourceIndex + 1) % SOURCES.length;

        if (failures < SOURCES.length) {
            startSource();
            return;
        }
        // Las dos fuentes fallaron: se reintenta solo, cada vez con más calma
        var wait = Math.min(60, 5 * Math.pow(2, failures - SOURCES.length));
        setPlayingUI(false);
        toast('Se cortó la señal. Reintentando en ' + wait + ' s…', wait * 1000);
        retryTimer = setTimeout(startSource, wait * 1000);
    }

    audio.addEventListener('playing', function () {
        clearTimers();
        failures = 0;
        setPlayingUI(true);
        hideToast();
    });

    audio.addEventListener('waiting', function () {
        if (!wantPlaying) { return; }
        clearTimeout(stallTimer);
        stallTimer = setTimeout(function () { fail('búfer vacío'); }, STALL_MS);
    });

    audio.addEventListener('error', function () {
        // Al soltar la fuente (teardown) también puede llegar un error: se ignora
        if (wantPlaying && !hls && audio.getAttribute('src')) {
            fail('error de audio ' + (audio.error ? audio.error.code : ''));
        }
    });

    audio.addEventListener('ended', function () {
        // En un stream en vivo "ended" es un corte
        if (wantPlaying) { fail('fin del stream'); }
    });

    function play() {
        wantPlaying = true;
        failures = 0;
        sourceIndex = 0;
        startSource();
        setPlayingUI(false);
    }

    function stop() {
        wantPlaying = false;
        clearTimers();
        teardown();
        setPlayingUI(false);
        hideToast();
    }

    function togglePlay() {
        if (wantPlaying) { stop(); } else { play(); }
    }

    // Al salir al menú de la TV o cambiar de app, se corta; al volver se retoma en vivo
    var resumeOnShow = false;
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            resumeOnShow = wantPlaying;
            stop();
        } else if (resumeOnShow) {
            resumeOnShow = false;
            play();
        }
    });

    /* ======================================================================
       3. Lo que suena
       ====================================================================== */

    var current = null;          // datos de now_playing
    var currentId = null;
    var songClock = null;        // { elapsed, duration, at }
    var pollTimer = null;
    var firstData = false;

    function cleanTitle(t) { return (t || '').replace(/\.(mp3|flac|wav|m4a|ogg)$/i, ''); }

    // AzuraCast entrega la carátula genérica de la estación cuando la canción no
    // tiene propia: su URL termina en el ID, sin "-<timestamp>.jpg"
    function isDefaultArt(url) { return !url || !/-\d+\.\w+$/.test(url); }

    function formatTime(s) {
        s = Math.max(0, Math.floor(s || 0));
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function timeAgo(playedAt) {
        if (!playedAt) { return ''; }
        var min = Math.max(0, Math.round((Date.now() / 1000 - playedAt) / 60));
        if (min < 1) { return 'recién'; }
        if (min < 60) { return 'hace ' + min + ' min'; }
        return 'hace ' + Math.floor(min / 60) + ' h';
    }

    function preload(urls, done) {
        var pending = urls.length;
        if (!pending) { done(); return; }
        var finish = function () { if (--pending === 0) { done(); } };
        for (var i = 0; i < urls.length; i++) {
            var img = new Image();
            img.onload = img.onerror = finish;
            img.src = urls[i];
        }
        // Que una carátula lenta no congele el cambio de canción
        setTimeout(function () { if (pending > 0) { pending = 1; finish(); } }, 4000);
    }

    function fetchNowPlaying() {
        clearTimeout(pollTimer);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API_URL + '?_=' + Date.now(), true);
        xhr.timeout = 10000;
        xhr.onload = function () {
            var data = null;
            if (xhr.status >= 200 && xhr.status < 300) {
                try { data = JSON.parse(xhr.responseText); } catch (e) {}
            }
            if (data) { onData(data); }
            schedulePoll(data);
        };
        xhr.onerror = xhr.ontimeout = function () { schedulePoll(null); };
        xhr.send();
    }

    // Consulta cada POLL_MS, o justo cuando debería terminar la canción
    function schedulePoll(data) {
        var wait = POLL_MS;
        if (data && data.now_playing && data.now_playing.remaining > 0) {
            wait = Math.min(POLL_MS, (data.now_playing.remaining + 2) * 1000);
        }
        pollTimer = setTimeout(fetchNowPlaying, wait);
    }

    function onData(data) {
        var np = data.now_playing;
        if (!np || !np.song) { return; }

        var id = np.sh_id + ':' + np.song.id;
        songClock = { elapsed: np.elapsed || 0, duration: np.duration || 0, at: Date.now() };
        renderNext(data.playing_next);
        renderHistory(data.song_history || []);

        if (id === currentId) { return; }

        var first = currentId === null;
        currentId = id;
        current = np;

        var urls = [];
        if (!isDefaultArt(np.song.art)) { urls.push(np.song.art); }

        if (first) {
            preload(urls, function () { renderNow(np); reveal(); });
        } else {
            // Cambio de canción: la funda sale, se carga la nueva y entra
            setClass(stage, 'changing', true);
            preload(urls, function () {
                setTimeout(function () {
                    renderNow(np);
                    setClass(stage, 'changing', false);
                }, 600);
            });
        }
    }

    function renderNow(np) {
        var song = np.song;
        var title = cleanTitle(song.title) || cleanTitle(song.text);
        var hasArt = !isDefaultArt(song.art);

        text('program', np.playlist ? 'En el aire · ' + np.playlist : 'En el aire');
        text('title', title);
        text('artist', song.artist);
        text('plain-artist', song.artist);
        text('plain-title', title);

        var art = $('art');
        if (hasArt) {
            art.onerror = function () { setClass(stage, 'has-art', false); };
            art.src = song.art;
        }
        setClass(stage, 'has-art', hasArt);
        tickProgress();
    }

    function renderNext(next) {
        var ok = next && next.song;
        setClass(stage, 'has-next', !!ok);
        if (!ok) { return; }
        text('next-title', cleanTitle(next.song.title));
        text('next-artist', next.song.artist);
        var hasArt = !isDefaultArt(next.song.art);
        setClass(stage, 'has-next-art', hasArt);
        if (hasArt && $('next-art').getAttribute('src') !== next.song.art) {
            $('next-art').src = next.song.art;
        }
    }

    function renderHistory(items) {
        var list = $('history-list');
        var html = '';
        // Se excluyen las noticias y los jingles cortos: no son "canciones"
        var shown = 0;
        for (var i = 0; i < items.length && shown < 4; i++) {
            var it = items[i];
            if (!it.song || (it.duration && it.duration < 90)) { continue; }
            shown++;
            var art = isDefaultArt(it.song.art)
                ? '<span class="history-art history-plain"></span>'
                : '<img class="history-art" src="' + esc(it.song.art) + '" alt="" onerror="this.style.visibility=\'hidden\'">';
            html += '<li class="history-item">' + art +
                '<span class="history-text">' +
                '<span class="history-title">' + esc(cleanTitle(it.song.title)) + '</span>' +
                '<span class="history-artist">' + esc(it.song.artist) + '</span>' +
                '<span class="history-time">' + timeAgo(it.played_at) + '</span>' +
                '</span></li>';
        }
        if (list.innerHTML !== html) { list.innerHTML = html; }
        $('history').style.visibility = shown ? 'visible' : 'hidden';
    }

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function tickProgress() {
        if (!songClock || !songClock.duration) {
            setClass(stage, 'has-duration', false);
            return;
        }
        var elapsed = Math.min(songClock.duration, songClock.elapsed + (Date.now() - songClock.at) / 1000);
        setClass(stage, 'has-duration', true);
        text('elapsed', formatTime(elapsed));
        text('duration', formatTime(songClock.duration));
        $('progress-fill').style.width = (elapsed / songClock.duration * 100).toFixed(2) + '%';
    }

    /* Figura del programa según el horario (igual que la web) */
    function programImage() {
        var now = new Date();
        var day = now.getDay();
        var hour = now.getHours();
        if (hour >= 17 && hour < 21) { return 'tu_tarde_bkn'; }
        if (day >= 0 && day <= 4 && (hour >= 21 || hour < 5)) { return 'noche_de_cucharitas'; }
        if ((day === 5 || day === 6) && (hour >= 21 || hour < 5)) { return 'dance_y_vacile'; }
        if (hour >= 5 && hour < 9) { return 'levantate_papito'; }
        if (hour >= 9 && hour < 17) { return 'antologia'; }
        return 'default';
    }

    var figure = $('program-figure');
    var currentFigure = null;

    function updateFigure() {
        var name = programImage();
        if (name === currentFigure) { return; }
        var first = currentFigure === null;
        currentFigure = name;
        var src = 'images/programas/' + name + '.png';
        figure.onerror = function () { figure.onerror = null; figure.src = 'images/programas/default.png'; };
        if (first) { figure.src = src; return; }
        setClass(figure, 'swap', true);
        setTimeout(function () { figure.src = src; setClass(figure, 'swap', false); }, 1000);
    }

    function updateClock() {
        var d = new Date();
        var h = d.getHours();
        var m = d.getMinutes();
        text('clock', (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m);
    }

    setInterval(function () {
        tickProgress();
        updateClock();
    }, 1000);
    setInterval(updateFigure, 60000);

    /* ======================================================================
       4. Control remoto
       ====================================================================== */

    var openPanel = null;
    var exitOpen = false;
    var focusIndex = { main: 0, panel: 0, exit: 0 };
    var focused = null;

    function layerEl() {
        if (exitOpen) { return $('exit'); }
        if (openPanel) { return openPanel; }
        return $('dock');
    }

    function layerName() { return exitOpen ? 'exit' : (openPanel ? 'panel' : 'main'); }

    function focusables() {
        var nodes = layerEl().querySelectorAll('[data-focus]');
        var list = [];
        for (var i = 0; i < nodes.length; i++) { list.push(nodes[i]); }
        return list;
    }

    function focusAt(i) {
        var list = focusables();
        if (!list.length) { return; }
        i = Math.max(0, Math.min(list.length - 1, i));
        focusIndex[layerName()] = i;
        if (focused) { setClass(focused, 'is-focused', false); }
        focused = list[i];
        setClass(focused, 'is-focused', true);
    }

    function move(delta) { focusAt(focusIndex[layerName()] + delta); }

    function activate(el) {
        if (!el) { return; }
        var action = el.getAttribute('data-action') || '';
        if (action === 'toggle') { togglePlay(); }
        else if (action.indexOf('panel:') === 0) { showPanel(action.slice(6)); }
        else if (action === 'close') { closePanel(); }
        else if (action === 'stay') { closeExit(); }
        else if (action === 'quit') { quit(); }
    }

    function showPanel(name) {
        openPanel = $('panel-' + name);
        setClass(openPanel, 'open', true);
        focusIndex.panel = 0;
        focusAt(0);
    }

    function closePanel() {
        if (!openPanel) { return; }
        setClass(openPanel, 'open', false);
        openPanel = null;
        focusAt(focusIndex.main);
    }

    function showExit() {
        exitOpen = true;
        setClass($('exit'), 'open', true);
        focusAt(0);  // "Seguir escuchando" por defecto
    }

    function closeExit() {
        exitOpen = false;
        setClass($('exit'), 'open', false);
        focusAt(focusIndex[layerName()]);
    }

    function quit() {
        stop();
        if (window.AndroidTV) { window.AndroidTV.quit(); return; }
        try {
            tizen.application.getCurrentApplication().exit();
        } catch (e) {
            window.close();
        }
    }

    function back() {
        if (exitOpen) { closeExit(); }
        else if (openPanel) { closePanel(); }
        else { showExit(); }
    }

    // Teclas multimedia del control (sin registrarlas la TV no las entrega)
    try {
        var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop'];
        for (var k = 0; k < keys.length; k++) {
            try { tizen.tvinputdevice.registerKey(keys[k]); } catch (e) {}
        }
    } catch (e) {}

    document.addEventListener('keydown', function (e) {
        var code = e.keyCode;
        var wasAmbient = hasClass(body, 'ambient');
        wake();

        switch (code) {
            case KEY.PLAY_PAUSE: togglePlay(); break;
            case KEY.PLAY: if (!wantPlaying) { play(); } break;
            case KEY.PAUSE:
            case KEY.STOP: if (wantPlaying) { stop(); } break;
            case KEY.BACK:
            case KEY.ESC:
            case KEY.BACKSPACE:
                if (wasAmbient) { break; }
                back();
                break;
            default:
                // En modo ambiente, la primera tecla solo despierta la pantalla
                if (wasAmbient) { break; }
                if (code === KEY.LEFT || code === KEY.UP) { move(-1); }
                else if (code === KEY.RIGHT || code === KEY.DOWN) { move(1); }
                else if (code === KEY.ENTER) { activate(focused); }
                else { return; }
        }
        e.preventDefault();
    });

    // Con mouse (control con puntero) también se puede usar
    stage.addEventListener('click', function (e) {
        var el = e.target;
        while (el && el !== stage && !el.hasAttribute('data-focus')) { el = el.parentNode; }
        if (el && el !== stage) { activate(el); }
    });

    /* ======================================================================
       5. Modo ambiente
       ====================================================================== */

    var ambientTimer = null;
    var drift = $('drift');
    var driftStep = 0;

    function wake() {
        setClass(body, 'ambient', false);
        clearTimeout(ambientTimer);
        ambientTimer = setTimeout(function () {
            if (!openPanel && !exitOpen) { setClass(body, 'ambient', true); }
        }, AMBIENT_MS);
    }

    // Cada 2 minutos el contenido se corre unos píxeles (contra el quemado de pantalla)
    var DRIFT = [[0, 0], [14, -10], [-10, 12], [8, 16], [-14, -8], [0, 10]];
    setInterval(function () {
        driftStep = (driftStep + 1) % DRIFT.length;
        var t = 'translate(' + DRIFT[driftStep][0] + 'px,' + DRIFT[driftStep][1] + 'px)';
        drift.style.webkitTransform = t;
        drift.style.transform = t;
    }, 120000);

    /* ======================================================================
       Avisos y arranque
       ====================================================================== */

    var toastTimer = null;

    function toast(msg, ms) {
        var el = $('toast');
        el.textContent = msg;
        setClass(el, 'visible', true);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, ms || 5000);
    }

    function hideToast() { setClass($('toast'), 'visible', false); }

    function reveal() {
        if (firstData) { return; }
        firstData = true;
        setClass(body, 'is-loading', false);
        focusAt(0);
        wake();
    }

    updateClock();
    updateFigure();
    fetchNowPlaying();
    // Vista previa en el navegador: index.html?preview[&panel=programas|equipo|...|exit]
    var qs = window.location.search;
    var preview = /[?&]preview\b/.test(qs);
    if (preview) {
        setClass(body, 'preview', true);
    } else {
        // Una radio en la tele se prende sonando
        play();
    }
    // Si la API tarda, igual se muestra la pantalla
    setTimeout(function () {
        reveal();
        var m = /[?&]panel=(\w+)/.exec(qs);
        if (m && m[1] === 'exit') { showExit(); }
        else if (m) { showPanel(m[1]); }
    }, preview ? 3000 : 6000);
})();
