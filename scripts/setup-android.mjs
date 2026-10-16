// Spielt die nativen Android-Teile (Hintergrundaufnahme) ins Capacitor-Projekt ein.
// Kann beliebig oft ausgeführt werden – vorhandene Einträge werden nicht doppelt angelegt.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const android = join(root, 'android');
if (!existsSync(android)) {
  console.error('Der Ordner "android" fehlt. Einmalig ausführen: npm run build:mock && npx cap add android');
  process.exit(1);
}

// Endgültige App-ID (nie mehr ändern): app.taleward – muss zu capacitor.config.ts passen
const APP_ID = 'app.taleward';
const gradlePath = join(android, 'app/build.gradle');
const gradle = readFileSync(gradlePath, 'utf8');
const idInGradle = gradle.match(/applicationId\s+"([^"]+)"/)?.[1];
if (idInGradle && idInGradle !== APP_ID) {
  console.error(
    `Das Android-Projekt wurde noch mit der alten App-ID "${idInGradle}" angelegt (neu: ${APP_ID}).\n` +
    'Einmalig neu anlegen:\n' +
    '  1. Ordner "android" löschen\n' +
    '  2. npm run build:mock\n' +
    '  3. npx cap add android\n' +
    '  4. diesen Befehl erneut ausführen\n' +
    'Auf dem Handy die alte Testfassung einmal deinstallieren – für Android ist das eine neue App.'
  );
  process.exit(1);
}

// Versionsnummer aus package.json: versionName = „0.9.0“, versionCode = 0*10000 + 9*100 + 0 = 900
// (muss bei jedem neuen APK steigen, sonst lässt Android kein Update über die alte Installation zu)
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const [maj, min, pat] = pkgVersion.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = maj * 10000 + min * 100 + pat;
const gradleNew = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${pkgVersion}"`);
if (gradleNew !== gradle) {
  writeFileSync(gradlePath, gradleNew);
  console.log(`App-Version ${pkgVersion} (versionCode ${versionCode})`);
}

// Signieren für Releases: Nur wenn TALEWARD_KEYSTORE gesetzt ist (GitHub-Ablauf android-release.yml),
// liest Gradle Schlüssel und Passwörter aus Umgebungsvariablen. Lokale Test-Builds bleiben unverändert.
{
  const gradleNow = readFileSync(gradlePath, 'utf8');
  if (!gradleNow.includes('TALEWARD_KEYSTORE')) {
    const signing = `
    // Taleward: Release-Signatur aus Umgebungsvariablen (nur im GitHub-Ablauf gesetzt)
    signingConfigs {
        release {
            if (System.getenv("TALEWARD_KEYSTORE")) {
                storeFile file(System.getenv("TALEWARD_KEYSTORE"))
                storePassword System.getenv("TALEWARD_KEYSTORE_PASSWORD")
                keyAlias System.getenv("TALEWARD_KEY_ALIAS")
                keyPassword System.getenv("TALEWARD_KEY_PASSWORD")
            }
        }
    }
`;
    let g = gradleNow.replace(/(\n\s*buildTypes\s*\{)/, `${signing}$1`);
    g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, `$1\n            if (System.getenv("TALEWARD_KEYSTORE")) signingConfig signingConfigs.release`);
    if (g !== gradleNow) {
      writeFileSync(gradlePath, g);
      console.log('Release-Signatur vorbereitet (greift nur mit TALEWARD_KEYSTORE)');
    }
  }
}

// Benachrichtigungen: regelmäßige Prüfung im Hintergrund (WorkManager)
{
  const g = readFileSync(gradlePath, 'utf8');
  if (!g.includes('androidx.work:work-runtime')) {
    const withWork = g.replace(/(\ndependencies\s*\{)/, `$1\n    implementation "androidx.work:work-runtime:2.10.0"`);
    if (withWork !== g) {
      writeFileSync(gradlePath, withWork);
      console.log('WorkManager für Benachrichtigungen eingetragen');
    }
  }
}

// Play-Store-Fassung (npm run android:store setzt --store): ohne Updater, ohne Bitte um Ausnahme von der
// Akku-Optimierung. Der Store verbietet Selbst-Aktualisierung und lässt diese Berechtigung nur in Ausnahmen zu.
const STORE = process.argv.includes('--store');
const STORE_SKIP = ['AppUpdaterPlugin.java'];

const javaDir = join(android, 'app/src/main/java/app/taleward');
mkdirSync(javaDir, { recursive: true });
for (const f of readdirSync(join(root, 'native-android')).filter((f) => f.endsWith('.java'))) {
  if (STORE && STORE_SKIP.includes(f)) {
    rmSync(join(javaDir, f), { force: true });
    console.log('Store-Fassung, ausgelassen:', f);
    continue;
  }
  let code = readFileSync(join(root, 'native-android', f), 'utf8');
  if (STORE && f === 'MainActivity.java') code = code.replace(/^\s*registerPlugin\(AppUpdaterPlugin\.class\);\n/m, '');
  writeFileSync(join(javaDir, f), code);
  console.log('kopiert:', f);
}

// Reste aus der Zeit vor der Umbenennung entfernen
const oldDir = join(android, 'app/src/main/java/de/rollenspielverein');
if (existsSync(oldDir)) {
  rmSync(oldDir, { recursive: true, force: true });
  console.log('alte Quellen (de.rollenspielverein…) entfernt');
}

const manifestPath = join(android, 'app/src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');

const permissions = [
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA', // QR-Code einer Einladung scannen
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  ...(STORE ? [] : ['android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'])
];
for (const p of permissions) {
  if (!manifest.includes(`"${p}"`)) {
    manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
    console.log('Berechtigung ergänzt:', p);
  }
}

// Updater nur in der APK-Fassung (Play Store verbietet Selbst-Aktualisierung)
const INSTALL_PERM = '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />';
if (!STORE && !manifest.includes('REQUEST_INSTALL_PACKAGES')) {
  manifest = manifest.replace('</manifest>', `    ${INSTALL_PERM}\n</manifest>`);
  console.log('Berechtigung ergänzt: REQUEST_INSTALL_PACKAGES (APK-Fassung mit Updater)');
}
if (STORE && manifest.includes('REQUEST_INSTALL_PACKAGES')) {
  manifest = manifest.replace(/\s*<uses-permission android:name="android\.permission\.REQUEST_INSTALL_PACKAGES" \/>/, '');
  console.log('Store-Fassung: REQUEST_INSTALL_PACKAGES entfernt');
}
if (STORE && manifest.includes('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS')) {
  manifest = manifest.replace(/\s*<uses-permission android:name="android\.permission\.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" \/>/, '');
  console.log('Store-Fassung: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS entfernt');
}

// App-Adresse taleward://… (Einladungen öffnen die App direkt)
if (!manifest.includes('android:scheme="taleward"')) {
  manifest = manifest.replace(
    /(<activity[^>]*android:name="\.MainActivity"[\s\S]*?)(<\/activity>)/,
    `$1    <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="taleward" />\n            </intent-filter>\n        $2`
  );
  console.log('App-Adresse taleward:// eingetragen');
}

// Rückweg der Anmeldung als App Link (ab Schnittstelle 0.4.13): https://app.taleward.org/auth/app öffnet nur diese App,
// weil Android die Zuordnung über https://app.taleward.org/.well-known/assetlinks.json prüft (public/.well-known)
if (!manifest.includes('android:host="app.taleward.org"')) {
  manifest = manifest.replace(
    /(<activity[^>]*android:name="\.MainActivity"[\s\S]*?)(<\/activity>)/,
    `$1    <intent-filter android:autoVerify="true">\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="https" android:host="app.taleward.org" android:pathPrefix="/auth/app" />\n            </intent-filter>\n        $2`
  );
  console.log('App Link https://app.taleward.org/auth/app eingetragen');
}

// Keine Sicherung der App-Daten: Anmeldungen (Tokens) sollen nicht in Geräte- oder Cloud-Sicherungen landen
if (/android:allowBackup="true"/.test(manifest)) {
  manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"');
} else if (!manifest.includes('android:allowBackup=')) {
  manifest = manifest.replace('<application', '<application\n        android:allowBackup="false"');
}
if (!manifest.includes('android:dataExtractionRules=')) {
  manifest = manifest.replace('<application', '<application\n        android:dataExtractionRules="@xml/taleward_data_rules"');
}
console.log('Sicherung der App-Daten ausgeschaltet');

if (!manifest.includes('.RecorderService')) {
  manifest = manifest.replace(
    '</application>',
    `    <service\n            android:name=".RecorderService"\n            android:exported="false"\n            android:foregroundServiceType="microphone" />\n    </application>`
  );
  console.log('Aufnahmedienst im Manifest eingetragen');
}

writeFileSync(manifestPath, manifest);

// App-Symbol (adaptiv: Zeichen auf tinte, Monochrom ab Android 13) – erzeugt aus den Markendateien
const resSrc = join(root, 'native-android/res');
for (const dir of readdirSync(resSrc)) {
  const target = join(android, 'app/src/main/res', dir);
  mkdirSync(target, { recursive: true });
  for (const f of readdirSync(join(resSrc, dir))) copyFileSync(join(resSrc, dir, f), join(target, f));
}
console.log('App-Symbol eingespielt');

// Angezeigter App-Name: Capacitor schreibt ihn nur beim Anlegen, deshalb hier nachziehen
const APP_NAME = 'Taleward';
const stringsPath = join(android, 'app/src/main/res/values/strings.xml');
if (existsSync(stringsPath)) {
  let strings = readFileSync(stringsPath, 'utf8');
  const before = strings;
  strings = strings
    .replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${APP_NAME}$2`)
    .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${APP_NAME}$2`);
  if (strings !== before) {
    writeFileSync(stringsPath, strings);
    console.log(`App-Name auf „${APP_NAME}“ gesetzt`);
  }
}

// Startbildschirm in tinte statt Capacitor-Standardbild (Markenhandbuch)
const colorsPath = join(android, 'app/src/main/res/values/taleward_colors.xml');
writeFileSync(colorsPath, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="taleward_tinte">#17313B</color>\n</resources>\n');
const stylesPath = join(android, 'app/src/main/res/values/styles.xml');
if (existsSync(stylesPath)) {
  let styles = readFileSync(stylesPath, 'utf8');
  if (styles.includes('@drawable/splash')) {
    styles = styles.replace('<item name="android:background">@drawable/splash</item>', '<item name="android:background">@color/taleward_tinte</item>');
    writeFileSync(stylesPath, styles);
    console.log('Startbildschirm auf tinte umgestellt');
  }
  // Statusleiste bis Android 14 in tinte (ab Android 15 liegt die App darunter, das Thema wirkt dort nicht).
  // Als Thema statt im Code: die Farb-Aufrufe für die Statusleiste sind seit Android 15 eingestellt.
  styles = readFileSync(stylesPath, 'utf8');
  if (!styles.includes('android:statusBarColor')) {
    styles = styles.replace(
      /(<style name="AppTheme\.NoActionBar"[^>]*>)/,
      '$1\n        <item name="android:statusBarColor">@color/taleward_tinte</item>'
    );
    if (styles.includes('android:statusBarColor')) {
      writeFileSync(stylesPath, styles);
      console.log('Statusleiste auf tinte gesetzt');
    }
  }
}
console.log('Android-Einrichtung fertig.');
