package app.taleward;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.util.List;

@CapacitorPlugin(
    name = "BackgroundRecorder",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class BackgroundRecorderPlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED
            || (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") == PermissionState.PROMPT)) {
            requestPermissionForAliases(new String[] { "microphone", "notifications" }, call, "afterPermissions");
            return;
        }
        doStart(call);
    }

    @PermissionCallback
    private void afterPermissions(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Kein Zugriff aufs Mikrofon. Erlaube ihn in den App-Einstellungen.", "NotAllowedError");
            return;
        }
        doStart(call);
    }

    private void doStart(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null) {
            call.reject("sessionId fehlt");
            return;
        }
        if (RecorderService.instance != null) {
            call.reject("Es läuft bereits eine Aufnahme.");
            return;
        }
        Context ctx = getContext();
        Intent intent = new Intent(ctx, RecorderService.class)
            .setAction(RecorderService.ACTION_START)
            .putExtra(RecorderService.EXTRA_SESSION, sessionId)
            .putExtra(RecorderService.EXTRA_TITLE, call.getString("title", "Taleward"));
        JSArray labels = call.getArray("labels");
        if (labels != null && labels.length() == 4) {
            String[] l = new String[4];
            for (int i = 0; i < 4; i++) l[i] = labels.optString(i);
            intent.putExtra(RecorderService.EXTRA_LABELS, l);
        }
        RecorderService.lastError = null;
        ContextCompat.startForegroundService(ctx, intent);

        // Warten, bis der Dienst läuft oder einen Fehler meldet
        final long deadline = System.currentTimeMillis() + 5000;
        Runnable check = new Runnable() {
            @Override
            public void run() {
                if (RecorderService.instance != null) {
                    call.resolve(status());
                } else if (RecorderService.lastError != null) {
                    call.reject(RecorderService.lastError);
                } else if (System.currentTimeMillis() > deadline) {
                    call.reject("Die Aufnahme ist nicht gestartet.");
                } else {
                    main.postDelayed(this, 100);
                }
            }
        };
        main.post(check);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        main.post(() -> {
            RecorderService s = RecorderService.instance;
            if (s != null) s.pauseRecording();
            call.resolve(status());
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        main.post(() -> {
            RecorderService s = RecorderService.instance;
            if (s != null) s.resumeRecording();
            call.resolve(status());
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            RecorderService s = RecorderService.instance;
            if (s == null) {
                call.resolve(status());
                return;
            }
            s.stopRecording();
            call.resolve(status());
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        main.post(() -> call.resolve(status()));
    }

    @PluginMethod
    public void discard(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null) {
            call.reject("sessionId fehlt");
            return;
        }
        RecorderService s = RecorderService.instance;
        if (s != null && sessionId.equals(s.getSessionId())) {
            call.reject("Die Aufnahme läuft noch.");
            return;
        }
        deleteRecursive(RecorderService.recordingDir(getContext(), sessionId));
        SharedPreferences p = RecorderService.prefs(getContext());
        if (sessionId.equals(p.getString("sessionId", null))) p.edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject r = new JSObject();
        r.put("value", pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        // Play-Store-Fassung ohne diese Berechtigung: gleich die Liste in den Akku-Einstellungen öffnen
        boolean mayAsk = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            == PackageManager.PERMISSION_GRANTED;
        if (!mayAsk) {
            getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            call.resolve();
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(i);
        } catch (Exception e) {
            // Rückfall: allgemeine Akku-Einstellungen öffnen
            getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
        call.resolve();
    }

    /** Aktueller Zustand: laufend, pausiert, beendet-aber-nicht-hochgeladen oder leer. */
    private JSObject status() {
        JSObject r = new JSObject();
        RecorderService s = RecorderService.instance;
        if (s != null) {
            r.put("state", s.isPaused() ? "paused" : "recording");
            r.put("sessionId", s.getSessionId());
            r.put("title", s.getTitle());
            r.put("elapsedMs", s.elapsedMs());
            r.put("level", s.level());
            r.put("quietMs", s.quietMs());
            r.put("files", new JSArray());
            return r;
        }
        SharedPreferences p = RecorderService.prefs(getContext());
        String sessionId = p.getString("sessionId", null);
        if (sessionId != null) {
            List<File> files = RecorderService.validSegments(RecorderService.recordingDir(getContext(), sessionId));
            if (!files.isEmpty()) {
                JSArray arr = new JSArray();
                for (File f : files) {
                    JSObject o = new JSObject();
                    o.put("path", f.getAbsolutePath());
                    o.put("sizeBytes", f.length());
                    arr.put(o);
                }
                r.put("state", "stopped");
                r.put("sessionId", sessionId);
                r.put("title", p.getString("title", null));
                r.put("elapsedMs", p.getLong("accumulatedMs", 0));
                r.put("files", arr);
                if (RecorderService.lastError != null) r.put("error", RecorderService.lastError);
                return r;
            }
        }
        r.put("state", "idle");
        r.put("elapsedMs", 0);
        r.put("files", new JSArray());
        return r;
    }

    private static void deleteRecursive(File f) {
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteRecursive(c);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
