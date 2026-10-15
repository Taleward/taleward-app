/**
 * Welcher Dienst steckt hinter einem Link? Nur an der Adresse erkannt, ohne Abruf.
 * Ohne Laufzeit-Importe, damit es sich testen lässt (scripts/tests/link-kind.test.mjs).
 *
 * brand: eines der Markenzeichen in brandPaths.ts; sonst nur die Art (kind) mit einem allgemeinen Zeichen.
 */
export type BrandId =
  | 'discord' | 'teamspeak' | 'mumble' | 'zoom' | 'googlemeet' | 'whatsapp' | 'signal' | 'telegram'
  | 'youtube' | 'twitch' | 'spotify'
  | 'googledocs' | 'googledrive' | 'dropbox' | 'nextcloud' | 'obsidian' | 'notion'
  | 'roll20' | 'foundry';

export type LinkKind = 'chat' | 'video' | 'music' | 'docs' | 'table' | 'web';

export interface LinkInfo {
  kind: LinkKind;
  brand: BrandId | null;
}

/** Hostname (ohne www.) → Dienst. Ein Eintrag gilt für den Namen selbst und alle Unternamen (z. B. us02web.zoom.us). */
const HOSTS: [string, LinkKind, BrandId | null][] = [
  ['discord.com', 'chat', 'discord'], ['discord.gg', 'chat', 'discord'], ['discordapp.com', 'chat', 'discord'],
  ['teamspeak.com', 'chat', 'teamspeak'], ['mumble.info', 'chat', 'mumble'],
  ['zoom.us', 'chat', 'zoom'], ['meet.google.com', 'chat', 'googlemeet'],
  ['whatsapp.com', 'chat', 'whatsapp'], ['wa.me', 'chat', 'whatsapp'],
  ['signal.group', 'chat', 'signal'], ['signal.me', 'chat', 'signal'], ['signal.org', 'chat', 'signal'],
  ['t.me', 'chat', 'telegram'], ['telegram.me', 'chat', 'telegram'], ['telegram.org', 'chat', 'telegram'],
  ['teams.microsoft.com', 'chat', null], ['teams.live.com', 'chat', null], ['element.io', 'chat', null], ['matrix.to', 'chat', null],
  ['youtube.com', 'video', 'youtube'], ['youtu.be', 'video', 'youtube'], ['twitch.tv', 'video', 'twitch'], ['vimeo.com', 'video', null],
  ['spotify.com', 'music', 'spotify'], ['spotify.link', 'music', 'spotify'],
  ['tabletopaudio.com', 'music', null], ['syrinscape.com', 'music', null], ['soundcloud.com', 'music', null],
  ['docs.google.com', 'docs', 'googledocs'], ['drive.google.com', 'docs', 'googledrive'],
  ['dropbox.com', 'docs', 'dropbox'], ['db.tt', 'docs', 'dropbox'],
  ['nextcloud.com', 'docs', 'nextcloud'], ['obsidian.md', 'docs', 'obsidian'], ['notion.so', 'docs', 'notion'], ['notion.site', 'docs', 'notion'],
  ['onedrive.live.com', 'docs', null], ['1drv.ms', 'docs', null], ['sharepoint.com', 'docs', null],
  ['worldanvil.com', 'docs', null], ['homebrewery.naturalcrit.com', 'docs', null],
  ['roll20.net', 'table', 'roll20'], ['foundryvtt.com', 'table', 'foundry'],
  ['forge-vtt.com', 'table', null], ['owlbear.rodeo', 'table', null], ['dndbeyond.com', 'table', null],
  ['inkarnate.com', 'table', null], ['dungeonscrawl.com', 'table', null], ['app.dungeonscrawl.com', 'table', null]
];

export function linkInfo(url: string): LinkInfo {
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase().replace(/^www\./, '');
    path = u.pathname.toLowerCase();
  } catch {
    return { kind: 'web', brand: null };
  }
  for (const [h, kind, brand] of HOSTS) {
    if (host === h || host.endsWith('.' + h)) return { kind, brand };
  }
  // Markenzeichen nur für feste Adressen der Anbieter: Ein selbst gewählter Name wie „nextcloud.verein.de“ könnte auch
  // eine fremde Seite sein und bekommt deshalb nur das allgemeine Zeichen
  if (/\.(pdf|docx?|odt|txt|md)$/.test(path)) return { kind: 'docs', brand: null };
  if (/\.(mp3|ogg|wav|flac)$/.test(path)) return { kind: 'music', brand: null };
  return { kind: 'web', brand: null };
}
