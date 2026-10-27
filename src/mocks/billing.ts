/*
 * Guthaben und Kampagnen-Einstellungen im Testmodus (Schnittstelle 0.4.25). Zum Ausprobieren in localStorage setzen
 * und neu laden:
 * - „taleward.mock.billing“ = credit (Standard) | pot | off
 * - „taleward.mock.creditBalance“ = Startguthaben in Cent (Standard 1240; 0 = leer, negativ = im Minus)
 * - „taleward.mock.creditWait“ = approval | empty | too_low | no_payer | pot – wartende Runden und Unterlagen
 *   zeigen diesen Grund (die Verarbeitung im Testmodus läuft trotzdem weiter)
 * - „taleward.mock.settingsLock“ = allowCloudSummary (o. ä.): vom Betreiber festgelegt
 * Gutschein zum Ausprobieren: TAVERNE-GUTSCHEIN (5 €, einmal).
 */
import { HttpResponse, http } from 'msw';
import type { Campaign, CampaignBilling, CampaignSettings, CampaignSettingsLogEntry, Credit, CreditBooking, CreditWait, CreditWaitingJob, Member, SettingField } from '../api/types';
import { campaigns } from './db';
import type { MockCampaign } from './db';

const setting = (key: string): string | null => { try { return localStorage.getItem(`taleward.mock.${key}`); } catch { return null; } };

export function billingMode(): 'credit' | 'pot' | 'off' {
  const m = setting('billing');
  return m === 'pot' || m === 'off' ? m : 'credit';
}

export function billingInfo(local: boolean) {
  if (!local || billingMode() === 'off') return null;
  return { mode: billingMode(), currency: 'EUR', topUpUrl: `${location.origin}/guthaben` };
}

const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const err = (status: number, code: string, message: string, details?: unknown) => HttpResponse.json({ code, message, ...(details ? { details } : {}) }, { status });

const own: Omit<Credit, 'balanceCents' | 'status'> = {
  id: 'cr-robin', kind: 'account', organizationId: null, organizationName: null,
  approvalThresholdCents: 200, sheetMaxPages: 20, sheetsPerPlayer: 3, canManage: true
};
const pot: Omit<Credit, 'balanceCents' | 'status'> = {
  id: 'cr-verein', kind: 'organization', organizationId: 'org-verein', organizationName: 'Rollenspielverein',
  approvalThresholdCents: 500, sheetMaxPages: 20, sheetsPerPlayer: 3, canManage: false
};
const start = Number(setting('creditBalance') ?? '1240');
const bookings: Record<string, CreditBooking[]> = {
  'cr-robin': [
    { id: 'bk-7', kind: 'usage', amountCents: -38, createdAt: daysAgo(2), usage: { jobKind: 'summarize', campaignId: 'c-grau', campaignTitle: 'Die Schatten von Grauwacht', sessionNumber: 12, documentTitle: null } },
    { id: 'bk-6', kind: 'usage', amountCents: -72, createdAt: daysAgo(2), usage: { jobKind: 'transcribe', campaignId: 'c-grau', campaignTitle: 'Die Schatten von Grauwacht', sessionNumber: 12, documentTitle: null } },
    { id: 'bk-5', kind: 'usage', amountCents: -12, createdAt: daysAgo(6), usage: { jobKind: 'document', campaignId: 'c-grau', campaignTitle: 'Die Schatten von Grauwacht', sessionNumber: null, documentTitle: 'Stadtplan Grauwacht' } },
    { id: 'bk-4', kind: 'credit', amountCents: 200, createdAt: daysAgo(9), reason: 'Danke fürs Testen' },
    { id: 'bk-3', kind: 'voucher', amountCents: 500, createdAt: daysAgo(12) },
    { id: 'bk-2', kind: 'usage', amountCents: -38, createdAt: daysAgo(13), usage: { jobKind: 'summarize', campaignId: 'c-grau', campaignTitle: 'Die Schatten von Grauwacht', sessionNumber: 11, documentTitle: null } },
    { id: 'bk-1', kind: 'payment', amountCents: start + 38 + 72 + 12 - 200 - 500 + 38, createdAt: daysAgo(20) }
  ],
  'cr-verein': [{ id: 'bv-1', kind: 'payment', amountCents: 5310, createdAt: daysAgo(4) }]
};
const balance = (id: string) => (bookings[id] ?? []).reduce((n, b) => n + b.amountCents, 0);
const status = (cents: number): Credit['status'] => (cents < 0 ? 'negative' : cents === 0 ? 'empty' : cents < 200 ? 'low' : 'good');

const waiting: Record<string, CreditWaitingJob[]> = {
  'cr-robin': [{
    jobId: 'job-grau-13', jobKind: 'summarize', campaignId: 'c-grau', campaignTitle: 'Die Schatten von Grauwacht',
    sessionId: 's-c-grau-13', sessionNumber: 13, documentId: null, documentTitle: null, analysisId: null,
    estimateCents: 260, reason: 'approval', createdAt: daysAgo(0.1)
  }],
  'cr-verein': []
};
let voucherUsed = false;

function visibleCredits(): Credit[] {
  const list = [own, ...(billingMode() === 'pot' ? [pot] : [])];
  return list.map((c) => {
    const b = balance(c.id);
    return { ...c, balanceCents: b, status: status(b), waitingCount: waiting[c.id]?.length ?? 0 };
  });
}

/** CreditWait für wartende Runden und Unterlagen (nur SL), nach „taleward.mock.creditWait“ */
export function mockCreditWait(gm: boolean, kind: 'session' | 'document', id: string): CreditWait | null {
  if (!gm || billingMode() === 'off') return null;
  const r = setting('creditWait');
  if (!r) return null;
  const mine = r !== 'pot' && r !== 'no_payer';
  return { reason: r, estimateCents: mine ? (kind === 'session' ? 260 : 18) : null, creditId: mine ? own.id : null, jobId: mine ? `job-${id}` : null };
}

/** Kosten einer Auswertung im Dialog der SL */
export const mockAnalysisCost = (gm: boolean) => (gm && billingMode() !== 'off' ? 35 : null);

// ---------------- Kampagnen-Einstellungen

interface SettingsRecord { version: number; updatedAt: string; updatedByMemberId: string | null; log: CampaignSettingsLogEntry[] }
const records: Record<string, SettingsRecord> = {};
const FIELDS: SettingField[] = ['allowCloudSummary', 'allowExternalTranscription', 'allowCharacterAnalysis'];

function record(c: MockCampaign): SettingsRecord {
  return (records[c.id] ??= { version: 1, updatedAt: daysAgo(30), updatedByMemberId: null, log: [] });
}
const lockField = () => setting('settingsLock') as SettingField | null;

export function settingsOf(c: MockCampaign, gm: boolean): CampaignSettings {
  const r = record(c);
  const locked = lockField();
  return {
    version: r.version,
    allowCloudSummary: !!c.allowCloudSummary,
    allowExternalTranscription: !!c.allowExternalTranscription,
    allowCharacterAnalysis: !!c.allowCharacterAnalysis,
    characterSheetLimits: { maxSheets: own.sheetsPerPlayer, maxPages: own.sheetMaxPages },
    locks: locked && FIELDS.includes(locked) ? [{ field: locked, value: !!c[locked], reason: 'operator' }] : [],
    updatedAt: r.updatedAt,
    ...(gm ? { updatedByMemberId: r.updatedByMemberId } : {})
  };
}

/** Vorher/Nachher vergleichen und protokollieren (auch für PATCH /campaigns/{id}) */
export function snapshot(c: MockCampaign): Record<SettingField, boolean> {
  return { allowCloudSummary: !!c.allowCloudSummary, allowExternalTranscription: !!c.allowExternalTranscription, allowCharacterAnalysis: !!c.allowCharacterAnalysis };
}
export function recordChange(c: MockCampaign, before: Record<SettingField, boolean>, byMemberId: string | null): void {
  const r = record(c);
  const after = snapshot(c);
  const changed = FIELDS.filter((f) => before[f] !== after[f]);
  if (!changed.length) return;
  r.version += 1;
  r.updatedAt = new Date().toISOString();
  r.updatedByMemberId = byMemberId;
  for (const f of changed) r.log.unshift({ at: r.updatedAt, field: f, oldValue: before[f], newValue: after[f], version: r.version, byMemberId, byOperator: false });
}

/** Zusätze für Campaign (Fassung, wer zahlt) */
export function campaignExtras(c: MockCampaign, me: Member | undefined): Pick<Campaign, 'settingsVersion' | 'billing'> {
  const extras: Pick<Campaign, 'settingsVersion' | 'billing'> = { settingsVersion: record(c).version };
  if (me?.role === 'gm' && billingMode() !== 'off') extras.billing = payerOf(c, me);
  return extras;
}

const payers: Record<string, { payer: string | null; offered: string | null }> = {};
function payerOf(c: MockCampaign, me: Member): CampaignBilling {
  if (billingMode() === 'pot') return { paidBy: 'organization', payerMemberId: null, isMe: false, offeredToMemberId: null };
  const firstGm = c.members.find((m) => m.role === 'gm' && m.userId && !m.leftAt);
  const p = (payers[c.id] ??= { payer: setting('creditWait') === 'no_payer' ? null : firstGm?.id ?? null, offered: null });
  if (!p.payer) return { paidBy: 'nobody', payerMemberId: null, isMe: false, offeredToMemberId: null };
  return { paidBy: 'gm', payerMemberId: p.payer, isMe: p.payer === me.id, offeredToMemberId: p.offered };
}

export function billingHandlers(B: string, deps: {
  myMember: (c: MockCampaign) => Member | undefined;
  terms: () => boolean;
}) {
  const off = () => billingMode() === 'off';
  const notFound = () => err(404, 'not_found', 'Nicht gefunden.');
  const credit = (id: string) => visibleCredits().find((c) => c.id === id);
  const gmCampaign = (id: string) => {
    const c = campaigns.find((x) => x.id === id);
    const m = c && deps.myMember(c);
    return c && m?.role === 'gm' ? { c, m } : null;
  };
  return [
    http.get(`${B}/credits`, () => (off() ? notFound() : HttpResponse.json(visibleCredits()))),
    http.get(`${B}/credits/:cid/bookings`, ({ params, request }) => {
      if (off() || !credit(String(params.cid))) return notFound();
      const url = new URL(request.url);
      const limit = Math.min(100, Number(url.searchParams.get('limit')) || 50);
      const before = url.searchParams.get('before');
      const list = bookings[String(params.cid)] ?? [];
      const from = before ? list.findIndex((b) => b.id === before) + 1 : 0;
      return HttpResponse.json(list.slice(from, from + limit));
    }),
    http.get(`${B}/credits/:cid/waiting`, ({ params }) => {
      if (off() || !credit(String(params.cid))) return notFound();
      return HttpResponse.json(waiting[String(params.cid)] ?? []);
    }),
    http.post(`${B}/credits/:cid/waiting/:jid/approve`, ({ params }) => {
      const cr = credit(String(params.cid));
      if (off() || !cr) return notFound();
      if (!cr.canManage) return err(403, 'second_factor_required', 'Das geht beim Guthaben der Organisation nur auf der Seite des Servers, mit zweitem Faktor.');
      const list = waiting[cr.id] ?? [];
      const job = list.find((j) => j.jobId === params.jid);
      if (String(params.jid).startsWith('job-') && !job) return new HttpResponse(null, { status: 204 }); // Grund aus „creditWait“
      if (!job || job.reason !== 'approval') return err(409, 'wrong_state', 'Dieser Auftrag wartet nicht auf eine Freigabe.');
      waiting[cr.id] = list.filter((j) => j !== job);
      bookings[cr.id].unshift({ id: 'bk-' + crypto.randomUUID().slice(0, 6), kind: 'usage', amountCents: -job.estimateCents, createdAt: new Date().toISOString(), usage: { jobKind: job.jobKind, campaignId: job.campaignId, campaignTitle: job.campaignTitle, sessionNumber: job.sessionNumber, documentTitle: job.documentTitle } });
      return new HttpResponse(null, { status: 204 });
    }),
    http.patch(`${B}/credits/:cid/settings`, async ({ params, request }) => {
      const cr = credit(String(params.cid));
      if (off() || !cr) return notFound();
      if (!cr.canManage) return err(403, 'second_factor_required', 'Das geht beim Guthaben der Organisation nur auf der Seite des Servers, mit zweitem Faktor.');
      const body = (await request.json()) as Partial<Pick<Credit, 'approvalThresholdCents' | 'sheetMaxPages' | 'sheetsPerPlayer'>>;
      const clamp = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);
      const a = clamp(body.approvalThresholdCents, 0, 100000), p = clamp(body.sheetMaxPages, 1, 2000), s = clamp(body.sheetsPerPlayer, 0, 50);
      if (a !== undefined) own.approvalThresholdCents = a;
      if (p !== undefined) own.sheetMaxPages = p;
      if (s !== undefined) own.sheetsPerPlayer = s;
      return HttpResponse.json(credit(own.id));
    }),
    http.post(`${B}/credits/:cid/vouchers`, async ({ params, request }) => {
      const cr = credit(String(params.cid));
      if (off() || !cr) return notFound();
      if (!cr.canManage) return err(403, 'second_factor_required', 'Das geht beim Guthaben der Organisation nur auf der Seite des Servers, mit zweitem Faktor.');
      const { code } = (await request.json()) as { code?: string };
      const norm = (code ?? '').toUpperCase().replace(/[\s-]/g, '');
      if (norm !== 'TAVERNEGUTSCHEIN' || voucherUsed) return err(400, 'voucher_invalid', 'Dieser Gutschein gilt nicht (mehr). Prüf den Code oder frag, wer ihn dir gegeben hat.');
      voucherUsed = true;
      bookings[cr.id].unshift({ id: 'bk-' + crypto.randomUUID().slice(0, 6), kind: 'voucher', amountCents: 500, createdAt: new Date().toISOString() });
      return HttpResponse.json({ amountCents: 500, credit: credit(cr.id) });
    }),
    http.post(`${B}/campaigns/:id/payer/offer`, async ({ params, request }) => {
      const g = gmCampaign(String(params.id));
      if (off() || billingMode() === 'pot' || !g) return notFound();
      const b = payerOf(g.c, g.m);
      if (!b.isMe) return notFound();
      const { memberId } = (await request.json()) as { memberId: string | null };
      if (memberId !== null && !g.c.members.some((m) => m.id === memberId && m.role === 'gm' && m.userId && !m.leftAt && m.id !== g.m.id)) {
        return err(400, 'invalid_member', 'An diese Person kann die Zahlung nicht gehen. Sie muss Spielleitung der Kampagne sein.');
      }
      payers[g.c.id].offered = memberId;
      return HttpResponse.json(payerOf(g.c, g.m));
    }),
    http.post(`${B}/campaigns/:id/payer/accept`, ({ params }) => {
      const g = gmCampaign(String(params.id));
      if (off() || billingMode() === 'pot' || !g) return notFound();
      const p = payers[g.c.id] ?? { payer: null, offered: null };
      if (p.payer && p.offered !== g.m.id) return err(409, 'wrong_state', 'Dir hat niemand die Zahlung angeboten.');
      payers[g.c.id] = { payer: g.m.id, offered: null };
      return HttpResponse.json(payerOf(g.c, g.m));
    }),
    http.get(`${B}/campaigns/:id/settings`, ({ params }) => {
      const c = campaigns.find((x) => x.id === params.id);
      const m = c && deps.myMember(c);
      if (!c || !m) return notFound();
      return HttpResponse.json(settingsOf(c, m.role === 'gm'));
    }),
    http.patch(`${B}/campaigns/:id/settings`, async ({ params, request }) => {
      const g = gmCampaign(String(params.id));
      if (!g) return notFound();
      const body = (await request.json()) as Partial<Record<SettingField, boolean>> & { version?: number };
      if (body.version !== record(g.c).version) return err(409, 'settings_conflict', 'Inzwischen hat jemand die Einstellungen geändert.', { current: settingsOf(g.c, true) });
      const locked = lockField();
      if (locked && typeof body[locked] === 'boolean' && body[locked] !== !!g.c[locked]) return err(400, 'setting_locked', 'Das hat der Betreiber des Servers festgelegt.', { field: locked });
      if (FIELDS.some((f) => body[f] === true) && !deps.terms()) return err(403, 'terms_required', 'Bitte stimme zuerst den neuen Nutzungsbedingungen zu.');
      const before = snapshot(g.c);
      for (const f of FIELDS) if (typeof body[f] === 'boolean') g.c[f] = body[f];
      recordChange(g.c, before, g.m.id);
      return HttpResponse.json(settingsOf(g.c, true));
    }),
    http.get(`${B}/campaigns/:id/settings/log`, ({ params }) => {
      const g = gmCampaign(String(params.id));
      if (!g) return notFound();
      return HttpResponse.json(record(g.c).log.slice(0, 100));
    })
  ];
}

/** Testmodus: eine andere SL ändert die Einstellungen (zum Ausprobieren von settings_conflict) */
export function bumpSettingsVersion(campaignId: string): void {
  const c = campaigns.find((x) => x.id === campaignId);
  if (c) record(c).version += 1;
}
