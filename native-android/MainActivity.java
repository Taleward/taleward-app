package app.taleward;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundRecorderPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(NotifierPlugin.class);
        registerPlugin(TextScalePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
