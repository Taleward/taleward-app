import {
  siDiscord, siDropbox, siFoundryvirtualtabletop, siGoogledocs, siGoogledrive, siGooglemeet, siMumble, siNextcloud,
  siNotion, siObsidian, siRoll20, siSignal, siSpotify, siTeamspeak, siTelegram, siTwitch, siWhatsapp, siYoutube, siZoom
} from 'simple-icons';
import type { BrandId } from './linkKind';

/*
 * Markenzeichen für Links, einfarbig in der Schriftfarbe gezeigt.
 * Formen aus dem Paket simple-icons (CC0 1.0, siehe NOTICE.md). Die Marken gehören ihren Inhabern; Taleward nutzt sie nur,
 * um zu zeigen, wohin ein Link führt. Formen nicht verändern.
 */
export const BRAND_PATHS: Record<BrandId, { title: string; path: string }> = {
  discord: siDiscord, teamspeak: siTeamspeak, mumble: siMumble, zoom: siZoom, googlemeet: siGooglemeet,
  whatsapp: siWhatsapp, signal: siSignal, telegram: siTelegram, youtube: siYoutube, twitch: siTwitch,
  spotify: siSpotify, googledocs: siGoogledocs, googledrive: siGoogledrive, dropbox: siDropbox,
  nextcloud: siNextcloud, obsidian: siObsidian, notion: siNotion, roll20: siRoll20, foundry: siFoundryvirtualtabletop
};
