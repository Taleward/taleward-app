import type { ServerInfo } from './api/types';
import { t } from './i18n';

/*
 * Einwilligungstexte an einer Stelle, damit App-Zustimmung und Vor-Ort-Bestätigung identisch formuliert sind.
 * Sie nennen, wie lange das Audio auf dem Server bleibt (je nach Einstellung des Servers, Schnittstelle 0.4.4)
 * und ob die Aufnahme für die Transkription an einen Cloud-Dienst geht.
 */

export interface ConsentContext {
  /** aus ServerInfo.audioRetention; fehlt bei älteren Servern → sofort nach der Transkription gelöscht */
  retention?: ServerInfo['audioRetention'];
  /** Anbieter der Cloud-Transkription, wenn die Kampagne sie erlaubt (z. B. „Mistral“) */
  cloudProvider?: string | null;
  /** Anbieter der Cloud-Zusammenfassung, wenn die Kampagne sie erlaubt (Schnittstelle 0.4.11) */
  summaryProvider?: string | null;
}

export function retentionSentence(ctx: ConsentContext): string {
  const r = ctx.retention;
  if (r?.mode === 'until_release') {
    return t('Die Aufnahme wird auf eurem Server in Text umgewandelt. Zur Prüfung des Kapitels bleibt sie dort, bis die Spielleitung das Kapitel freigibt, höchstens {days} Tage, und wird dann gelöscht.', { days: r.maxDays ?? 7 });
  }
  return t('Die Aufnahme wird auf eurem Server in Text umgewandelt und danach gelöscht.');
}

function cloudSentence(ctx: ConsentContext): string {
  return ctx.cloudProvider
    ? ' ' + t('Für die Transkription kann die Aufnahme an {provider} übermittelt werden.', { provider: ctx.cloudProvider })
    : '';
}

function summarySentence(ctx: ConsentContext): string {
  return ctx.summaryProvider
    ? ' ' + t('Die Zusammenfassung schreibt {provider}; dorthin geht nur Text, keine Aufnahme.', { provider: ctx.summaryProvider })
    : '';
}

export const CONSENT_STANDING = (campaignTitle: string, ctx: ConsentContext = {}) =>
  t('Ich bin damit einverstanden, dass die Runden der Kampagne „{title}“ aufgenommen werden, solange ich dabei bin.', { title: campaignTitle }) +
  ' ' + retentionSentence(ctx) + cloudSentence(ctx) + summarySentence(ctx) + ' ' +
  t('Aus dem Text entstehen Zusammenfassungen, die alle Mitglieder der Kampagne lesen können. Ich kann diese Zustimmung jederzeit in der App widerrufen. Sie gilt dann ab sofort nicht mehr für künftige Aufnahmen; bereits veröffentlichte Zusammenfassungen bleiben bestehen.');

export const CONSENT_ON_SITE = (campaignTitle: string, ctx: ConsentContext = {}) =>
  t('Ich bin damit einverstanden, dass die heutige Runde der Kampagne „{title}“ aufgenommen wird.', { title: campaignTitle }) +
  ' ' + retentionSentence(ctx) + cloudSentence(ctx) + summarySentence(ctx) + ' ' +
  t('Aus dem Text entsteht eine Zusammenfassung, die alle Mitglieder der Kampagne lesen können.');

/** Kurzfassung über dem einklappbaren Wortlaut */
export const CONSENT_SUMMARY = (ctx: ConsentContext = {}) =>
  ctx.retention?.mode === 'until_release'
    ? t('Die Runde wird aufgenommen und in Text umgewandelt; die Aufnahme wird spätestens nach {days} Tagen gelöscht. Du kannst jederzeit widerrufen.', { days: ctx.retention.maxDays ?? 7 })
    : t('Die Runde wird aufgenommen, in Text umgewandelt und die Aufnahme danach gelöscht. Du kannst jederzeit widerrufen.');
