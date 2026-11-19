package app.taleward;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Updates der APK-Fassung über den eigenen Server (nicht in der Play-Store-Fassung):
 * APK herunterladen, SHA-256 prüfen, System-Installationsdialog öffnen. Still installieren geht bei
 * Sideload nicht – ein Tipp auf „Installieren“ bleibt. Vor dem Dialog prüft die App selbst: Prüfsumme (Pflicht),
 * Paketname wie diese App und dieselben Signierzertifikate. Passt etwas nicht, wird die Datei gelöscht und der
 * Android-Dialog erscheint nicht.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String DIR = "updates";
    private static final String FILE = "taleward-update.apk";

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, FILE);
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject r = new JSObject();
        r.put("value", canInstall());
        call.resolve(r);
    }

    /** Einstellung „Unbekannte Apps installieren“ für Taleward öffnen */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** Heruntergeladene APK dem System zur Installation geben */
    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        if (!f.exists()) { call.reject("Keine heruntergeladene Fassung gefunden.", "no_download"); return; }
        if (!canInstall()) { JSObject r = new JSObject(); r.put("status", "needs_permission"); call.resolve(r); return; }
        String bad = verifyApk(f);
        if (bad != null) { f.delete(); call.reject(foreignMessage(), bad); return; }
        startInstall(f);
        JSObject r = new JSObject();
        r.put("status", "installing");
        call.resolve(r);
    }

    /** url, optional sha256 (hex) und sizeBytes; meldet „progress“ {loaded, total} */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        final String sha = call.getString("sha256");
        final Long size = call.getLong("sizeBytes");
        if (url == null) { call.reject("Download-Adresse fehlt.", "no_url"); return; }
        if (sha == null || !sha.matches("(?i)[0-9a-f]{64}")) { call.reject("Der Server nennt keine Prüfsumme für die Datei.", "no_checksum"); return; }
        if (!allowedUrl(url)) { call.reject("Die Adresse ist nicht sicher (nur https).", "insecure_url"); return; }
        call.setKeepAlive(true);
        new Thread(() -> {
            File f = apkFile();
            HttpURLConnection con = null;
            try {
                con = (HttpURLConnection) new URL(url).openConnection();
                con.setConnectTimeout(20000);
                con.setReadTimeout(60000);
                con.setInstanceFollowRedirects(true);
                int code = con.getResponseCode();
                if (code != 200) throw new Exception("HTTP " + code);
                long total = size != null ? size : con.getContentLengthLong();
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                long loaded = 0, lastReport = 0;
                try (InputStream in = con.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        md.update(buf, 0, n);
                        loaded += n;
                        if (loaded - lastReport > 256 * 1024) {
                            lastReport = loaded;
                            JSObject p = new JSObject();
                            p.put("loaded", loaded);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                {
                    StringBuilder hex = new StringBuilder();
                    for (byte b : md.digest()) hex.append(String.format("%02x", b));
                    if (!hex.toString().equalsIgnoreCase(sha)) {
                        f.delete();
                        call.reject("Die heruntergeladene Datei ist beschädigt (Prüfsumme stimmt nicht).", "checksum_mismatch");
                        call.setKeepAlive(false);
                        return;
                    }
                }
                String bad = verifyApk(f);
                if (bad != null) {
                    f.delete();
                    call.reject(foreignMessage(), bad);
                    call.setKeepAlive(false);
                    return;
                }
                JSObject r = new JSObject();
                if (!canInstall()) {
                    r.put("status", "needs_permission");
                } else {
                    startInstall(f);
                    r.put("status", "installing");
                }
                call.resolve(r);
            } catch (Exception e) {
                f.delete();
                call.reject("Download fehlgeschlagen: " + e.getMessage(), "download_failed");
            } finally {
                if (con != null) con.disconnect();
                call.setKeepAlive(false);
            }
        }).start();
    }

    private static String foreignMessage() {
        return "Diese Datei ist keine Taleward-Fassung mit unserer Signatur. Sie wurde gelöscht und nicht installiert.";
    }

    /** https immer, http nur im Heimnetz (wie die übrige App) */
    private static boolean allowedUrl(String url) {
        try {
            URL u = new URL(url);
            String p = u.getProtocol();
            if ("https".equalsIgnoreCase(p)) return true;
            if (!"http".equalsIgnoreCase(p)) return false;
            String h = u.getHost().toLowerCase(Locale.ROOT);
            if (h.startsWith("[")) h = h.substring(1, h.length() - 1);
            if (h.equals("localhost") || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".fritz.box")) return true;
            String[] q = h.split("\\.");
            if (q.length == 4 && h.matches("[0-9.]+")) {
                int a = Integer.parseInt(q[0]), b = Integer.parseInt(q[1]);
                return a == 10 || a == 127 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 169 && b == 254);
            }
            if (h.contains(":")) {
                if (h.equals("::1")) return true;
                String first = h.split(":")[0];
                int v = first.isEmpty() ? 0 : Integer.parseInt(first, 16);
                return (v & 0xfe00) == 0xfc00 || (v & 0xffc0) == 0xfe80;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Gehört die Datei zu dieser App? Paketname gleich und dieselben Signierzertifikate wie die laufende App.
     * Gibt null zurück, wenn alles passt, sonst einen Fehlercode.
     */
    private String verifyApk(File f) {
        try {
            Context ctx = getContext();
            PackageManager pm = ctx.getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo archive = pm.getPackageArchiveInfo(f.getAbsolutePath(), flags);
            if (archive == null) return "not_an_app";
            if (!ctx.getPackageName().equals(archive.packageName)) return "wrong_package";
            PackageInfo own = pm.getPackageInfo(ctx.getPackageName(), flags);
            Set<String> mine = signers(own);
            Set<String> theirs = signers(archive);
            if (mine.isEmpty() || theirs.isEmpty() || !mine.equals(theirs)) return "wrong_signature";
            return null;
        } catch (Exception e) {
            return "not_an_app";
        }
    }

    @SuppressWarnings("deprecation")
    private static Set<String> signers(PackageInfo info) throws Exception {
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= 28) {
            sigs = info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        } else {
            sigs = info.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) {
            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest(s.toByteArray())) hex.append(String.format("%02x", b));
            out.add(hex.toString());
        }
        return out;
    }

    private void startInstall(File f) {
        Context ctx = getContext();
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
    }
}
