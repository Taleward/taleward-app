# App veröffentlichen

Die Server holen neue Fassungen täglich aus den GitHub-Releases von `Taleward/taleward-app` und verteilen sie
selbst. Die App fragt nie GitHub, sondern nur ihre Server. Zwei Abläufe hängen an jedes Release:

- `web-release.yml` → `taleward-web-<version>.zip` (Web-Fassung für `/app/`)
- `android-release.yml` → `taleward-<version>.apk` (signiert, APK-Fassung mit Updater)

## Einmalig: Signierschlüssel anlegen und als Secrets hinterlegen

1. Schlüssel erzeugen (PowerShell, `keytool` liegt bei Android Studio):
   ```
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore taleward-release.jks -alias taleward -keyalg RSA -keysize 4096 -validity 10000
   ```
   Den Pfad zu Android Studio ggf. anpassen. Zwei starke Passwörter vergeben (Schlüsseldatei und Schlüssel –
   gern dasselbe).
2. **Sichern:** `taleward-release.jks` und die Passwörter an zwei getrennten Orten aufbewahren (Passwortmanager +
   USB-Stick). Ohne diesen Schlüssel lässt Android keine Updates mehr über die installierte App zu – jede spätere
   Fassung (APK und Play Store) muss mit **demselben** Schlüssel signiert sein. Nie ins Repository legen.
3. Für GitHub in Text umwandeln (PowerShell, im Ordner der Datei):
   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("taleward-release.jks")) | Set-Content keystore.b64
   ```
4. GitHub → Repository `taleward-app` → Settings → Secrets and variables → Actions → „New repository secret“:
   - `TALEWARD_KEYSTORE_BASE64` – Inhalt von `keystore.b64` (danach die Datei `keystore.b64` löschen)
   - `TALEWARD_KEYSTORE_PASSWORD` – Passwort der Schlüsseldatei
   - `TALEWARD_KEY_ALIAS` – `taleward`
   - `TALEWARD_KEY_PASSWORD` – Passwort des Schlüssels

## Jede neue Fassung

1. `package.json` → `version` erhöhen (z. B. 0.10.0 → 0.11.0; in `package-lock.json` an beiden Stellen mit), per
   Patch oder direkt.
2. Eine Datei `release.md` ins Hauptverzeichnis legen – nur der Text „Was ist neu“, kurz (landet als `releaseNotes`
   in der App). Der Ablauf `fassung-veroeffentlichen.yml` legt daraus das Release an (Tag `v<version>`, Titel
   „Taleward <version>“), entfernt `release.md` wieder, baut Web-Fassung und signierte APK und hängt sie an.
   Gibt es das Release schon, bricht er ab – dann zuerst die Version erhöhen.
3. Die Server holen beides innerhalb eines Tages – automatisch oder nach Freigabe in der Verwaltung → Updates.

Von Hand geht es weiterhin: GitHub → Releases → „Draft a new release“, Tag `v<version>` (muss zur Version passen),
Titel „Taleward <version>“, Text „Was ist neu“ → „Publish release“. Dann bauen `web-release.yml` und
`android-release.yml` die Dateien.

Ohne Release geht es auch: Unter Actions → „Android-APK“ → „Run workflow“ entsteht eine signierte APK als Artefakt
zum Herunterladen (zum Testen, wird nicht verteilt).

## Play-Store-Fassung (später)

`npm run android:store` baut ohne Updater und ohne die Berechtigung REQUEST_INSTALL_PACKAGES (Play verbietet
Selbst-Aktualisierung). Gleicher Schlüssel, gleiche App-ID `app.taleward`.
