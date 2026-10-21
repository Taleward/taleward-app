<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/marke/taleward-lockup-inverse.svg">
    <img src="docs/marke/taleward-lockup.svg" alt="Taleward" width="280">
  </picture>
</p>

<p align="center"><em>Eure Geschichte, gut verwahrt.</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-17313B" alt="License: AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/API-0.4.5-9E2A3A" alt="API 0.4.5">
  <img src="https://img.shields.io/badge/Android%20%7C%20Web-App-3D6A48" alt="Android | Web">
</p>

# Taleward – App

**Taleward** nimmt Pen-&-Paper-Runden auf und macht daraus Recaps und eine Kampagnenbibel – mit Spoilerschutz,
Einwilligung jeder Person am Tisch und euren Daten auf eurem eigenen Server.

Dieses Repository enthält die **App** (Android und Web). Dazu gehören:

| Repository | Inhalt |
|---|---|
| [taleward-app](https://github.com/Taleward/taleward-app) | App für Spielleitung und Spielende (dieses Repository) |
| [taleward-server](https://github.com/Taleward/taleward-server) | Server: Konten, Kampagnen, Verarbeitung, Verwaltung |
| [taleward-worker](https://github.com/Taleward/taleward-worker) | Worker: Transkription und Zusammenfassung auf eigener Hardware |

*English summary at the end.*

---

## Was die App kann

- **Aufnehmen** am Tisch – auch bei ausgeschaltetem Bildschirm (Android) – oder fertige Aufnahmen bzw. Spuren pro Person
  (z. B. aus Discord) hochladen. Aufgenommen wird nur, wenn alle Anwesenden zugestimmt haben, auch Gäste vor Ort.
- **Stimmen zuordnen** mit Hörproben; ein freiwilliges Stimmprofil erkennt Personen automatisch.
- **Recap und Vorschläge prüfen:** Die Spielleitung liest, korrigiert und veröffentlicht; Vorschläge für die Bibel
  übernimmt sie einzeln oder gesammelt.
- **Chronik und Kampagnenbibel** mit öffentlichem und geheimem Teil je Eintrag und Sichtbarkeit pro Person
  („Wer weiß was“).
- **Miteinander:** Kommentare (auch privat an die Spielleitung), Terminabstimmung, Charakterseiten, Einladungen per
  Link und QR-Code.
- **Mehrere Server in einer App**, Anmeldung mit Benutzername oder – wenn der Server es anbietet – mit Google,
  Discord, Apple oder Microsoft.
- **Deutsch und Englisch**, helles und dunkles Thema.

## Schnell ausprobieren (Testmodus)

Der Testmodus bringt einen eingebauten Testserver mit Beispieldaten mit – kein echter Server nötig.

```bash
npm install
npm run dev:mock
```

Dann <http://localhost:5173> öffnen (am besten in der Handy-Ansicht der Entwicklerwerkzeuge), `/api/v1` bestätigen und
mit beliebigem Namen und Passwort anmelden. Weitere Test-Server im Testmodus:

- `https://nachbarverein.test/einladung/SALZ-2026` unter „Einladung annehmen“ – ein zweiter Server mit Registrierung
- `https://muster.taleward.invalid` – Musterkampagne „Die leisen Wasser“ (Sprache nach der App), Anmeldung als `anja`
  (Spielleitung), `lea`, `tom` oder `sina` mit beliebigem Passwort. Dieselbe Kampagne gibt es in der richtigen App unter
  „Ohne Server ausprobieren“.

## Entwickeln

Voraussetzungen: Node.js 22, für Android zusätzlich Android Studio (mit JDK 21).

| Befehl | Zweck |
|---|---|
| `npm run dev` / `npm run dev:mock` | Entwicklungsserver gegen einen echten Server bzw. im Testmodus |
| `npm run build` | App bauen (echter Server) |
| `npm run build:web` | Web-Fassung für den Unterpfad `/app/` |
| `npm run android` / `npm run android:mock` | Android-Projekt einrichten und in Android Studio öffnen |
| `npm run android:store` | Android für den Play Store: ohne eigenen Updater, ohne Bitte um Ausnahme von der Akku-Optimierung |
| `npm run i18n:check` | Prüft, ob alle Texte übersetzt sind |
| `npm run screenshots` | Aufnahmen der Demo für Website und Store (siehe `scripts/screenshots.mjs`) |

`scripts/setup-android.mjs` richtet das Android-Projekt nach `npx cap add android` ein: nativer Aufnahmedienst und
Updater (`native-android/`), Berechtigungen, App-Symbol, Startbildschirm, Versionsnummer aus `package.json`,
Release-Signatur. Der Ordner `android/` wird dabei erzeugt und gehört nicht ins Repository.

Die Serveradresse gibt man in der App ein oder übernimmt sie per Einladungslink; `VITE_API_BASE` in `.env` ist nur
ein Vorschlag beim ersten Start (siehe `.env.example`).

## Aufbau

```
src/
  api/          Schnittstelle: Client, Typen, Verbindungen zu mehreren Servern, Upload in Teilen
  auth/         Anmeldung, Anmeldung mit Diensten (PKCE über den Systembrowser)
  pages/        Bildschirme
  components/   Bausteine (Dialoge, Karten, Auswahl, Scanner …)
  covers/       Titelbilder
  i18n/         Übersetzungen (Schlüssel = deutscher Text)
  mocks/        Testserver für den Testmodus
  recorder/     Aufnahme im Browser und Anbindung an den nativen Dienst
  update/       Updater der APK-Fassung
native-android/ Aufnahmedienst, Updater und Ressourcen für Android
docs/           Schnittstelle (OpenAPI) und Anleitung für Releases
```

## Schnittstelle und Versionen

Die Schnittstelle zum Server steht in [`docs/session-chronik-api.yaml`](docs/session-chronik-api.yaml) (OpenAPI 3.1).
Der Server meldet seine Version unter `GET /info`; die App unterstützt Server ab einer festen Untergrenze und blendet
Funktionen, die ein älterer Server noch nicht kann, nur für diesen Server aus.

Releases: siehe [`docs/RELEASE.md`](docs/RELEASE.md). Jedes Release enthält die signierte APK und die Web-Fassung;
Taleward-Server holen beides von hier und verteilen es selbst.

## Übersetzungen

Texte stehen im Code auf Deutsch in `t('…')`; `src/i18n/en.ts` enthält die englischen Fassungen. Eine weitere Sprache
kommt als eigene Datei dazu und wird in `src/i18n/index.tsx` eingetragen. Fehlende Einträge fallen auf Deutsch zurück.

## Datenschutz

- Aufnahmen, Transkripte und Inhalte liegen auf dem Server des Vereins oder der Gruppe, nicht bei uns.
- Aufgenommen wird nur mit Zustimmung aller Anwesenden; der Wortlaut nennt Frist und ggf. Cloud-Dienste.
- Geheimes (Bibel, Notizen der Spielleitung) liefert der Server an Spielende gar nicht erst aus.
- Keine Werbung, keine Statistikdienste, keine eingebetteten Fremdinhalte.

## Mitmachen

Fehler und Ideen gern als Issue. Für Pull Requests gilt: Beiträge können nur übernommen werden, wenn sie unter der
AGPL-3.0 **und** zu weiteren Lizenzbedingungen des Rechteinhabers genutzt werden dürfen (Contributor License
Agreement, siehe `NOTICE.md`). Vor einem Pull Request bitte `npm run i18n:check` und `npx tsc -b` ausführen.

## Lizenz und Marke

Code: [AGPL-3.0-only](LICENSE). Name, Zeichen und Wortmarke „Taleward“ (beim DPMA angemeldet) sind ausgenommen; Schriften stehen unter der
SIL Open Font License. Einzelheiten in [`NOTICE.md`](NOTICE.md).

---

## English summary

Taleward records tabletop role-playing sessions and turns them into recaps and a campaign bible – with spoiler
protection, consent from everyone at the table, and your data on your own server. This repository contains the
**app** (Android and web); see [taleward-server](https://github.com/Taleward/taleward-server) and
[taleward-worker](https://github.com/Taleward/taleward-worker) for the other parts.

Try it without a server: `npm install && npm run dev:mock`, open <http://localhost:5173>, confirm `/api/v1` and sign in
with any name and password. The interface is German and English. Licence: AGPL-3.0-only; the Taleward name and logo
are excluded (see `NOTICE.md`).
