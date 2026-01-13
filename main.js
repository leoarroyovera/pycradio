var videoPlayer = document.getElementById('videoPlayer');
var channel = 'https://studio.loovacast.com/hls/poesiaycumbia/live.m3u8';
//var channel = 'https://a11.asurahosting.com/hls/poesia_y_cumbia_radio/live.m3u8';

function loadChannel(index) {
    if (Hls.isSupported()) {
        console.log('HLS.js is supported');
        var hls = new Hls();
        hls.loadSource(channel);
        hls.attachMedia(videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            console.log('HLS manifest parsed');
            videoPlayer.play();
        });
        hls.on(Hls.Events.ERROR, function(event, data) {
            console.error('HLS.js error:', data);
        });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('Native HLS support detected');
        videoPlayer.src = channel;
        videoPlayer.addEventListener('loadedmetadata', function() {
            console.log('Video metadata loaded');
            videoPlayer.play();
        });
        videoPlayer.addEventListener('error', function(event) {
            console.error('Video player error:', event);
        });
    } else {
        console.error('HLS is not supported in this browser.');
        alert('HLS is not supported in this browser. Please use a compatible browser.');
    }
}

