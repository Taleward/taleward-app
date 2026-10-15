package app.taleward;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Schriftgröße des Handys (Einstellungen → Anzeige → Schriftgröße) an die App weitergeben.
 * Die WebView vergrößert sonst nur längere Textblöcke und lässt Knöpfe und Überschriften klein; deshalb hier
 * Textzoom 100 % und die Oberfläche skaliert selbst alle Schriften gleichmäßig (src/display/textScale.ts).
 */
@CapacitorPlugin(name = "TextScale")
public class TextScalePlugin extends Plugin {

    @Override
    public void load() {
        getBridge().executeOnMainThread(() -> getBridge().getWebView().getSettings().setTextZoom(100));
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("scale", (double) getContext().getResources().getConfiguration().fontScale);
        call.resolve(result);
    }
}
