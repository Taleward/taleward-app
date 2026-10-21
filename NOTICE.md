# Hinweise zu Lizenz, Marke und Fremdbestandteilen

## Code

Taleward – App (dieses Repository) steht unter der **GNU Affero General Public License v3.0 only**
(SPDX: `AGPL-3.0-only`), siehe `LICENSE`.

Copyright (C) 2026 Tinkerworks (Benjamin)

Wer eine veränderte Fassung betreibt oder Nutzern über ein Netzwerk anbietet, muss ihnen den Quellcode
dieser Fassung zugänglich machen (AGPL §13). Die App verlinkt ihren Quellcode unter „Konten und Server“.

## Name und Zeichen

„Taleward“ ist beim Deutschen Patent- und Markenamt als Wortmarke angemeldet (Aktenzeichen 302026258979.0).

Name „Taleward“, das Taleward-Zeichen, die Wortmarke und das App-Symbol (`src/assets/taleward/logos`,
`native-android/res`, `public/icons`, `docs/marke`) sind **nicht** Teil der AGPL-Lizenz. Sie dürfen nicht für eigene, veränderte Fassungen
verwendet werden, die nicht vom Rechteinhaber stammen. Wer einen Fork verbreitet, gibt ihm einen eigenen
Namen und eigene Zeichen. Erlaubt bleibt, sachlich auf Taleward hinzuweisen, etwa „beruht auf Taleward“.

## Schriften

Alegreya und Alegreya Sans (Huerta Tipográfica), SIL Open Font License 1.1 – über die Pakete
`@fontsource/alegreya` und `@fontsource/alegreya-sans` sowie `src/assets/taleward/fonts/OFL.txt`.

## Icons

Die Linienicons in `src/components/Icons.tsx` übernehmen Formen von Lucide (https://lucide.dev, lucide-static
1.48.0), ISC-Lizenz:

> Copyright (c) 2026 Lucide Icons and Contributors
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby
> granted, provided that the above copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING
> ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL,
> DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
> WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE
> USE OR PERFORMANCE OF THIS SOFTWARE.

Die allgemeinen Zeichen vor Links in `src/links/LinkIcon.tsx` (headphones, file-text, map, music, globe) stammen
ebenfalls aus Lucide 1.48.0 (ISC-Lizenz, siehe oben).

Die Markenzeichen vor Links (`src/links/brandPaths.ts`) stammen aus dem Paket `simple-icons` (https://simpleicons.org,
Version 16.35.0), freigegeben unter CC0 1.0. Die Marken selbst gehören ihren jeweiligen Inhabern (Discord, TeamSpeak, Mumble,
Zoom, Google Meet, WhatsApp, Signal, Telegram, YouTube, Twitch, Spotify, Google Docs, Google Drive, Dropbox, Nextcloud,
Obsidian, Notion, Roll20, Foundry Virtual Tabletop). Taleward zeigt sie nur, um kenntlich zu machen, wohin ein Link
führt; es besteht keine Verbindung zu diesen Unternehmen.

Die Zeichen auf den Knöpfen „Mit … anmelden“ sind die offiziellen Zeichen der Anbieter: Google aus dem Paket
„Sign in with Google“ (`src/assets/providers/google.svg`, ohne den Knopfrahmen), Microsoft „MS-SymbolLockup“
(`src/assets/providers/microsoft.svg`), Discord aus `simple-icons` (siehe oben). Sie gehören Google LLC, Microsoft
Corporation und Discord Inc. und werden nur für die Anmeldung mit dem jeweiligen Dienst gezeigt.

Die Formen von calendar, check, chevron-left, info, search und arrow-up stammen aus dem Projekt Feather:

> The MIT License (MIT) (for the icons listed above)
>
> Copyright (c) 2013-present Cole Bemis
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

Schlüsselloch und SL-Schirm sind eigene Zeichnungen.

## Bibliotheken

Alle eingebundenen Pakete stehen unter mit der AGPL verträglichen Lizenzen (u. a. MIT, Apache-2.0, ISC),
die vollständige Liste liefert `npx license-checker --summary`.

## Beiträge

Beiträge von außen nur mit Zustimmung, dass sie unter AGPL-3.0 **und** zu weiteren Lizenzbedingungen des
Rechteinhabers genutzt werden dürfen (Contributor License Agreement). So bleibt eine spätere
Zweitlizenz (z. B. für die gehostete Fassung) möglich.
