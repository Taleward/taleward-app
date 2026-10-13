package app.taleward;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Nimmt im Hintergrund als Vordergrunddienst (Typ "microphone") auf.
 * Die Aufnahme wird in Abschnitte von etwa 5 Minuten geteilt. Stürzt die App ab,
 * geht höchstens der letzte, noch offene Abschnitt verloren.
 */
public class RecorderService extends Service {

    public static final String ACTION_START = "app.taleward.START";
    public static final String ACTION_PAUSE = "app.taleward.PAUSE";
    public static final String ACTION_RESUME = "app.taleward.RESUME";
    public static final String EXTRA_SESSION = "sessionId";
    public static final String EXTRA_TITLE = "title";
    /** Beschriftungen der Benachrichtigung in der Sprache der App (Reihenfolge: läuft, pausiert, Pause, Weiter) */
    public static final String EXTRA_LABELS = "labels";

    static final String PREFS = "taleward_recorder";
    private static final String CHANNEL = "aufnahme";
    private static final int NOTIFICATION_ID = 4711;

    // AAC mono, 32 kHz, 48 kbit/s: gut für Spracherkennung, ca. 22 MB pro Stunde
    private static final int SAMPLE_RATE = 32000;
    private static final int BIT_RATE = 48000;
    private static final long SEGMENT_BYTES = 1_800_000L; // ≈ 5 Minuten

    static volatile RecorderService instance;
    static volatile String lastError;

    private MediaRecorder recorder;
    private File dir;
    private File pendingNext;
    private int segmentIndex;
    private String sessionId;
    private String title;
    private String[] labels = { "Aufnahme läuft", "Aufnahme pausiert", "Pausieren", "Fortsetzen" };
    private boolean paused;
    private long accumulatedMs;
    private long runningSince;
    private PowerManager.WakeLock wakeLock;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_START.equals(action)) {
            if (recorder == null) {
                sessionId = intent.getStringExtra(EXTRA_SESSION);
                title = intent.getStringExtra(EXTRA_TITLE);
                String[] l = intent.getStringArrayExtra(EXTRA_LABELS);
                if (l != null && l.length == 4) labels = l;
            }
            // Muss innerhalb weniger Sekunden nach startForegroundService passieren
            goForeground();
            if (recorder == null) {
                try {
                    begin();
                    instance = this;
                } catch (Exception e) {
                    lastError = "Aufnahme konnte nicht gestartet werden: " + e.getMessage();
                    shutdown();
                }
            }
        } else if (ACTION_PAUSE.equals(action)) {
            if (recorder != null) pauseRecording();
            else stopSelf();
        } else if (ACTION_RESUME.equals(action)) {
            if (recorder != null) resumeRecording();
            else stopSelf();
        }
        return START_NOT_STICKY;
    }

    // ---------------------------------------------------------------- Aufnahme

    private void begin() throws IOException {
        lastError = null;
        dir = recordingDir(this, sessionId);
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        SharedPreferences p = prefs(this);
        // Gleiche Session nach Absturz neu gestartet: an vorhandene Abschnitte anhängen
        accumulatedMs = sessionId.equals(p.getString("sessionId", null)) ? p.getLong("accumulatedMs", 0) : 0;
        segmentIndex = listSegments(dir).size();
        recorder = createRecorder(nextFile());
        recorder.start();
        paused = false;
        runningSince = SystemClock.elapsedRealtime();
        acquireWakeLock();
        saveState("recording");
        updateNotification();
    }

    private MediaRecorder createRecorder(File file) throws IOException {
        MediaRecorder r = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
        // Für Spracherkennung abgestimmt: keine starke Rauschunterdrückung
        r.setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION);
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        r.setAudioChannels(1);
        r.setAudioSamplingRate(SAMPLE_RATE);
        r.setAudioEncodingBitRate(BIT_RATE);
        r.setMaxFileSize(SEGMENT_BYTES);
        r.setOutputFile(file.getAbsolutePath());
        r.setOnInfoListener(this::onInfo);
        r.setOnErrorListener((mr, what, extra) -> {
            lastError = "Aufnahmefehler (" + what + "/" + extra + ")";
            restartAfterFailure();
        });
        r.prepare();
        return r;
    }

    private File nextFile() {
        return new File(dir, String.format(Locale.ROOT, "teil-%03d.m4a", segmentIndex++));
    }

    private void onInfo(MediaRecorder mr, int what, int extra) {
        if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_APPROACHING && Build.VERSION.SDK_INT >= 26) {
            try {
                pendingNext = nextFile();
                mr.setNextOutputFile(pendingNext);
            } catch (IOException e) {
                pendingNext = null; // Rückfall: Neustart bei MAX_FILESIZE_REACHED
            }
        } else if (what == MediaRecorder.MEDIA_RECORDER_INFO_NEXT_OUTPUT_FILE_STARTED) {
            pendingNext = null;
            // Lange Runden: Wachhalten bei jedem Abschnitt verlängern, statt nach 8 h ab Start zu enden
            acquireWakeLock();
            saveState(paused ? "paused" : "recording");
        } else if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) {
            restartAfterFailure();
        }
    }

    /** Neuer Abschnitt mit kurzer Lücke, falls der nahtlose Wechsel nicht geklappt hat. */
    private void restartAfterFailure() {
        if (recorder == null) return;
        try {
            recorder.reset();
        } catch (RuntimeException ignored) {
        }
        recorder.release();
        recorder = null;
        try {
            recorder = createRecorder(nextFile());
            recorder.start();
            if (paused) recorder.pause();
            else acquireWakeLock();
        } catch (Exception e) {
            lastError = "Aufnahme wurde unterbrochen: " + e.getMessage();
            if (!paused) accumulatedMs += SystemClock.elapsedRealtime() - runningSince;
            saveState("stopped");
            shutdown();
        }
    }

    synchronized void pauseRecording() {
        if (recorder == null || paused) return;
        recorder.pause();
        accumulatedMs += SystemClock.elapsedRealtime() - runningSince;
        paused = true;
        saveState("paused");
        updateNotification();
    }

    synchronized void resumeRecording() {
        if (recorder == null || !paused) return;
        recorder.resume();
        runningSince = SystemClock.elapsedRealtime();
        paused = false;
        acquireWakeLock();
        saveState("recording");
        updateNotification();
    }

    /** Beendet die Aufnahme und liefert die fertigen Abschnitte in Reihenfolge. */
    synchronized List<File> stopRecording() {
        if (recorder != null) {
            try {
                if (paused) recorder.resume();
                recorder.stop();
            } catch (RuntimeException ignored) {
                // stop() wirft, wenn im letzten Abschnitt noch keine Daten sind
            }
            recorder.release();
            recorder = null;
        }
        if (!paused) accumulatedMs += SystemClock.elapsedRealtime() - runningSince;
        paused = false;
        saveState("stopped");
        shutdown();
        return validSegments(dir);
    }

    boolean isPaused() {
        return paused;
    }

    String getSessionId() {
        return sessionId;
    }

    String getTitle() {
        return title;
    }

    long elapsedMs() {
        return accumulatedMs + (paused || recorder == null ? 0 : SystemClock.elapsedRealtime() - runningSince);
    }

    File getDir() {
        return dir;
    }

    private void shutdown() {
        instance = null;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (recorder != null) {
            // Dienst wird vom System beendet: offenen Abschnitt noch sauber abschließen
            try {
                recorder.stop();
            } catch (RuntimeException ignored) {
            }
            recorder.release();
            recorder = null;
            if (!paused) accumulatedMs += SystemClock.elapsedRealtime() - runningSince;
            saveState("stopped");
        }
        instance = null;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Taleward:Aufnahme");
            wakeLock.setReferenceCounted(false);
        }
        wakeLock.acquire(8 * 60 * 60 * 1000L);
    }

    private void saveState(String state) {
        prefs(this).edit()
            .putString("sessionId", sessionId)
            .putString("title", title)
            .putString("state", state)
            .putLong("accumulatedMs", accumulatedMs)
            .apply();
    }

    // ---------------------------------------------------------------- Benachrichtigung

    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Aufnahme", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Zeigt an, dass eine Session aufgenommen wird");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openPi = PendingIntent.getActivity(this, 0, open, flags);
        Intent toggle = new Intent(this, RecorderService.class).setAction(paused ? ACTION_RESUME : ACTION_PAUSE);
        PendingIntent togglePi = PendingIntent.getService(this, 1, toggle, flags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(paused ? labels[1] : labels[0])
            .setContentText(title != null ? title : "Taleward")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openPi)
            .addAction(0, paused ? labels[3] : labels[2], togglePi);
        if (paused || recorder == null) {
            b.setShowWhen(false);
        } else {
            b.setUsesChronometer(true).setWhen(System.currentTimeMillis() - elapsedMs());
        }
        if (Build.VERSION.SDK_INT >= 31) {
            b.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return b.build();
    }

    // ---------------------------------------------------------------- Dateien

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static File recordingDir(Context c, String sessionId) {
        return new File(new File(c.getFilesDir(), "recordings"), sessionId.replaceAll("[^A-Za-z0-9_-]", "_"));
    }

    static List<File> listSegments(File dir) {
        File[] all = dir != null ? dir.listFiles((d, name) -> name.startsWith("teil-") && name.endsWith(".m4a")) : null;
        List<File> list = new ArrayList<>();
        if (all == null) return list;
        Arrays.sort(all, (a, b) -> a.getName().compareTo(b.getName()));
        list.addAll(Arrays.asList(all));
        return list;
    }

    /** Nur vollständig abgeschlossene Abschnitte; kaputte (nach Absturz) werden gelöscht. */
    static List<File> validSegments(File dir) {
        List<File> ok = new ArrayList<>();
        for (File f : listSegments(dir)) {
            if (f.length() > 0 && hasMoovBox(f)) ok.add(f);
            else //noinspection ResultOfMethodCallIgnored
                f.delete();
        }
        return ok;
    }

    /** Eine MP4-Datei ist nur mit "moov"-Block abspielbar – der fehlt, wenn die Aufnahme abbrach. */
    static boolean hasMoovBox(File f) {
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            long pos = 0;
            long len = raf.length();
            byte[] type = new byte[4];
            while (pos + 8 <= len) {
                raf.seek(pos);
                long size = raf.readInt() & 0xFFFFFFFFL;
                raf.readFully(type);
                if (size == 1) size = raf.readLong();
                else if (size == 0) size = len - pos;
                if (new String(type, "US-ASCII").equals("moov")) return true;
                if (size < 8) return false;
                pos += size;
            }
        } catch (IOException ignored) {
        }
        return false;
    }
}
