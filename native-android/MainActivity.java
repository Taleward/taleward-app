package app.taleward;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundRecorderPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(NotifierPlugin.class);
        registerPlugin(TextScalePlugin.class);
        // Randlos auch unter Android 14 und älter (ab 15 ist es Pflicht); die Abstände zu Status- und Gestenleiste
        // setzt Capacitor (SystemBars) bzw. die App über env(safe-area-inset-*)
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
