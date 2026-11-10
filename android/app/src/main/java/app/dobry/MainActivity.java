package app.dobry;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android asks about frames inside a page too, and Capacitor would open any frame from
        // another site in the browser. Only the page itself decides where Dobry goes; frames load
        // in place, as they do on iPhone.
        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (!request.isForMainFrame()) return false;
                    return super.shouldOverrideUrlLoading(view, request);
                }
            }
        );
    }
}
