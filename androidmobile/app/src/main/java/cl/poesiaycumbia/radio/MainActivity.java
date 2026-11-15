package cl.poesiaycumbia.radio;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Envoltorio móvil del sitio https://poesiaycumbia.cl en un WebView.
 * Siempre carga la versión publicada, así que se actualiza sin recompilar la app.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://poesiaycumbia.cl/";
    private static final String OFFLINE_HTML =
            "<html><body style='background:#000;color:#eee;font-family:sans-serif;"
            + "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"
            + "text-align:center'><div><h2>Sin conexión</h2>"
            + "<p>Revisa tu internet y vuelve a abrir la app.</p>"
            + "<p><a style='color:#e8b04a' href='" + HOME + "'>Reintentar</a></p></div></body></html>";

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        setContentView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String host = req.getUrl().getHost();
                if (host != null && (host.endsWith("poesiaycumbia.cl")
                        || host.endsWith("poesiaycumbia.duckdns.org"))) {
                    return false;
                }
                // Instagram, Spotify, YouTube, etc. se abren fuera de la app
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    v.loadDataWithBaseURL(HOME, OFFLINE_HTML, "text/html", "utf-8", null);
                }
            }
        });

        if (state != null) {
            web.restoreState(state);
        } else {
            web.loadUrl(HOME);
        }

        // Sigue sonando con la pantalla apagada o en segundo plano
        startService(new Intent(this, KeepAliveService.class));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (isFinishing()) {
            stopService(new Intent(this, KeepAliveService.class));
            web.loadUrl("about:blank");
            web.destroy();
        }
        super.onDestroy();
    }
}
