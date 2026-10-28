import type { SVGProps } from 'react';

/*
 * Linienicons nach Markenhandbuch: 24 px, Strich 1,75, runde Enden, Farbe = Schriftfarbe.
 * Formen von Lucide (lucide-static 1.48.0, ISC-Lizenz, siehe NOTICE.md) – dieselben Zeichen wie auf der Website
 * (Name in Klammern). Eigene Zeichnungen: Schlüsselloch (nur SL) und SL-Schirm.
 * Fester Wortschatz: Schlüsselloch = nur SL, offenes Auge = öffentlich, Bändchen = Kapitel,
 * Mikrofon = Aufnahme, Buch = Bibel, Kalender = Termin, Sprechblase = Kommentar, Schirm = SL-Schirm.
 */
const base = (size = 24): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
});

/** Übersicht der Kampagne (house) */
export const IconShield = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
/** Aufnahme (mic) */
export const IconMic = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M12 19v3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><rect x="9" y="2" width="6" height="13" rx="3" /></svg>
);
/** Bändchen = Kapitel (bookmark, Chronik) */
export const IconScroll = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" /></svg>
);
/** Bibel (book-open) */
export const IconBook = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M12 5v16" /><path d="M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z" /></svg>
);
/** Schlüsselloch = nur SL (eigene Zeichnung) */
export const IconLock = ({ size = 16 }: { size?: number }) => (
  <svg {...base(size)}><circle cx="12" cy="9" r="3.5" /><path d="M10.5 12 9.5 20h5l-1-8" /></svg>
);
/** Offenes Auge = öffentlich (eye) */
export const IconEye = ({ size = 16 }: { size?: number }) => (
  <svg {...base(size)}><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>
);
/** Termin (calendar) */
export const IconCalendar = ({ size = 20 }: { size?: number }) => (
  <svg {...base(size)}><path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /></svg>
);
/** Kommentar (message-square) */
export const IconChat = ({ size = 20 }: { size?: number }) => (
  <svg {...base(size)}><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" /></svg>
);
/** Hinweis (info) */
export const IconInfo = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
);
/** Abspielen (play, gefüllt, damit es auf kleinen Knöpfen trägt) */
export const IconPlay = ({ size = 18 }: { size?: number }) => (
  <svg {...base(size)} fill="currentColor"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>
);
/** Vorlesen (volume-2) */
export const IconSpeaker = ({ size = 18 }: { size?: number }) => (
  <svg {...base(size)}><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></svg>
);
/** Zurück (chevron-left) */
export const IconBack = ({ size = 24 }: { size?: number }) => (
  <svg {...base(size)}><path d="m15 18-6-6 6-6" /></svg>
);
/** Stimmt / erledigt (check) */
export const IconCheck = ({ size = 14 }: { size?: number }) => (
  <svg {...base(size)}><path d="M20 6 9 17l-5-5" /></svg>
);
/** Einfügen aus der Zwischenablage (clipboard-paste) */
export const IconPaste = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M11 14h10" /><path d="M16 4h2a2 2 0 0 1 2 2v1.344" /><path d="m17 18 4-4-4-4" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113" /><rect x="8" y="2" width="8" height="4" rx="1" /></svg>
);
/** QR-Code scannen (scan-line) */
export const IconScan = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></svg>
);
/** SL-Schirm: dreiteiliger, aufgestellter Schirm (eigene Zeichnung) */
export const IconScreen = ({ size = 18 }: { size?: number }) => (
  <svg {...base(size)}><path d="M3 6.5 8 4.5v14l-5 2z" /><path d="M8 4.5l8 2v14l-8-2z" /><path d="M16 6.5l5-2v14l-5 2z" /></svg>
);
/** Absenden, z. B. Korrektur-Hinweis (arrow-up) */
export const IconSend = ({ size = 18 }: { size?: number }) => (
  <svg {...base(size)}><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
);
/** Suchen (search) */
export const IconSearch = ({ size = 18 }: { size?: number }) => (
  <svg {...base(size)}><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
);

/** Zeilen in Listen (Lucide-Formen: mail, wallet, mic, download, info, trash-2, log-out, globe, moon, bell, play, plus, server, image, pencil) */
export const IconMail = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
);
export const IconWallet = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
);
export const IconDownload = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg>
);
export const IconTrash = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);
export const IconLogOut = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>
);
export const IconGlobe = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
);
export const IconMoon = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg>
);
export const IconBell = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>
);
export const IconPlus = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
);
export const IconServer = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><rect width="20" height="8" x="2" y="2" rx="2" /><rect width="20" height="8" x="2" y="14" rx="2" /><path d="M6 6h.01" /><path d="M6 18h.01" /></svg>
);
export const IconImage = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /></svg>
);
export const IconPencil = ({ size = 20 }: { size?: number }) => (
  <svg {...base(size)}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg>
);
export const IconRoute = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
);
export const IconUser = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
);
export const IconLink = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
);
export const IconExpand = ({ size = 20 }: { size?: number }) => (
  <svg {...base(size)}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
);
