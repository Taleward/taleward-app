import { withSafeLinks } from './safeUrl';
import { deviceId } from './deviceId';
import { isSafePath } from './pathGuard';
import { isMusterUrl } from './muster';
import { campaignOfPath, cleanForCopy, copyable } from './readCopyRules';
import { hasCopy, keepOnlyCampaigns, markOffline, markOnline, offlineSince, readCopy, removeCopiesOf, removeCopiesOfCampaign, saveCopy } from './readCopy';
import { getLang, t, tk } from '../i18n';
import { APP_VERSION, currentConnection, getConnection, hasValidToken, serverKnowsAppVersion, updateConnection, type Connection } from './connections';
import type { InvitePreview, CharacterAnalysis,
  ApiError,
  Campaign,
  CampaignBilling,
  CampaignSettings,
  CampaignSettingsIn,
  CampaignSettingsLogEntry,
  Credit,
  CreditBooking,
  CreditWaitingJob,
  CampaignSummary,
  CampaignExport,
  ImportStatus,
  Character,
  Chronicle,
  WorldEntryIn,
  WorldEntryStatus,
  Entry,
  EntryInput,
  EntryType,
  Member,
  AuthProviderId,
  OidcExchange,
  GameSystem,
  Organization,
  ServerInfo,
  Usage,
  CampaignDocument,
  ChapterPlan,
  ChapterPlanInput,
  Link,
  DocumentText,
  DocumentKind,
  DatePoll,
  Comment,
  VoteAnswer,
  ProcessingStatus,
  Proposal,
  ProposalDecision,
  Recap, RecapPart,
  Correction,
  TranscriptSegment,
  UncertainTerms,
  Session,
  SessionSummary,
  Speaker,
  UploadCreated,
  User,
  Attendee,
  Visibility,
  VoiceProfile
} from './types';

export class ApiRequestError extends Error {
  status: number;
  code: string;
  /** Zusätzliche Angaben je Fehlercode (ab 0.4.7) */
  details?: Record<string, unknown>;
  constructor(status: number, err: ApiError) {
    super(err.message);
    this.status = status;
    this.code = err.code;
    this.details = err.details;
  }
}

/**
 * Fehler, für die die App eigene Sätze hat: immer in der Sprache der App, egal welche Sprache der Server spricht
 * (ältere Server, Proxys, Testserver).
 */
const OWN_MESSAGES: Record<string, string> = {
  too_many_requests: tk('Zu viele Versuche. Bitte warte ein paar Minuten.')
};

/** Meldung, falls der Server (z. B. ein Proxy davor) keinen {code, message}-Körper liefert. */
function fallbackMessage(status: number): string {
  if (status === 401) return t('Bitte melde dich erneut an.');
  if (status === 403) return t('Das darf nur die Spielleitung.');
  if (status === 404) return t('Nicht gefunden.');
  if (status === 409) return t('Das ist gerade nicht möglich.');
  if (status === 413) return t('Die Datei ist zu groß.');
  if (status === 429) return t('Zu viele Versuche. Bitte warte ein paar Minuten.');
  if (status >= 500) return t('Der Server hat einen Fehler gemeldet. Versuch es gleich noch einmal.');
  return t('Anfrage fehlgeschlagen ({status}).', { status });
}

interface RequestOptions {
  body?: unknown;
  raw?: BodyInit;
  form?: FormData;
  headers?: Record<string, string>;
}

/** Abbruch nach 30 s; ältere WebViews ohne AbortSignal.timeout warten wie bisher */
function requestTimeout(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30_000) : undefined;
}

async function requestOn<T>(conn: Connection, method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  // Pfade nur aus Teilen nach dem Muster der Schnittstelle (0.4.14)
  if (!isSafePath(path)) throw new ApiRequestError(0, { code: 'invalid_id', message: t('Ungültige Kennung. Die Daten passen nicht zu diesem Server.') });
  // Der Server antwortet mit message in dieser Sprache
  const headers: Record<string, string> = { 'Accept-Language': getLang(), ...opts.headers };
  // Eigene Version nur an Server schicken, die den Header kennen (CORS) – ab Schnittstelle 0.3.9
  if (serverKnowsAppVersion(conn)) headers['X-Taleward-App'] = APP_VERSION;
  // Das Token gehört genau zu diesem Server und geht nirgendwo anders hin
  const token = hasValidToken(conn) ? conn.token : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.raw !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/octet-stream';

  // Lesekopie für unterwegs: nur Lesewege aus readCopyRules, nur mit Anmeldung, nie für die Musterkampagne
  const copyUser = method === 'GET' && token && conn.user?.id && conn.id !== '_probe' && !isMusterUrl(conn.baseUrl) && copyable(path)
    ? conn.user.id : null;
  // Nur speichern, solange dieselbe Anmeldung noch besteht (nicht nach Abmelden oder Entfernen des Servers)
  const stillSignedIn = () => !!token && getConnection(conn.id)?.token === token;

  let res: Response;
  try {
    res = await fetch(conn.baseUrl + path, {
      method,
      headers,
      // Bei FormData setzt der Browser den Content-Type mit Boundary selbst
      body: opts.form ?? opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      // Nie aus einem Zwischenspeicher antworten: Proxys, CDNs oder die WebView könnten sonst veraltete Listen
      // liefern (z. B. neue Kampagne fehlt nach dem Anlegen)
      cache: 'no-store',
      // Antwortet der Server gar nicht, nicht endlos warten: nach 30 s wie „nicht erreichbar“ behandeln.
      // POST (Hochladen, Abschließen, Neu schreiben …) darf länger dauern und bekommt keine Grenze.
      signal: method === 'POST' || opts.form || opts.raw !== undefined ? undefined : requestTimeout()
    });
  } catch {
    if (copyUser) {
      const copy = await readCopy(conn.id, copyUser, path).catch(() => null);
      if (copy) {
        markOffline(conn.id, copy.savedAt);
        return copy.data as T;
      }
    }
    throw new ApiRequestError(0, {
      code: 'network',
      message: method === 'GET'
        ? t('Server nicht erreichbar. Prüfe WLAN und die Serveradresse.')
        : t('„{name}“ ist gerade nicht erreichbar. Ändern geht erst wieder, wenn der Server erreichbar ist.', { name: conn.name })
    });
  }
  if (conn.id !== '_probe') markOnline(conn.id);

  if (!res.ok) {
    let err: ApiError = { code: 'http_' + res.status, message: fallbackMessage(res.status) };
    try {
      const parsed = await res.json();
      if (parsed && typeof parsed.message === 'string') {
        err = { code: String(parsed.code ?? err.code), message: parsed.message, ...(parsed.details && typeof parsed.details === 'object' ? { details: parsed.details } : {}) };
      }
    } catch {
      /* kein JSON-Fehlerkörper */
    }
    if (OWN_MESSAGES[err.code]) err = { ...err, message: t(OWN_MESSAGES[err.code]) };
    // 401 = Anmeldung ungültig oder abgelaufen (not_authenticated, token_invalid):
    // Token verwerfen und zum Login. Beim Login selbst heißt 401 nur "falsches Passwort".
    // 426: Diese App ist für den Server zu alt – Kampagnen dieses Servers sperren, bis aktualisiert wird
    if (res.status === 426 && conn.id !== '_probe') updateConnection(conn.id, { appOutdated: true });
    if (res.status === 401 && token && !path.startsWith('/auth/')) {
      updateConnection(conn.id, { token: null, expiresAt: null });
      // Anmeldung ungültig: auch die Lesekopie dieses Servers gehört niemandem mehr
      removeCopiesOf(conn.id).catch(() => undefined);
    }
    // Nicht (mehr) sichtbar: die Kampagne selbst → alles zu ihr verwerfen, sonst nur diesen Weg (z. B. Kapitel zurückgezogen)
    if (copyUser && (res.status === 404 || res.status === 403)) {
      const campaign = /^\/campaigns\/[^/?]+$/.test(path.split('?')[0]) ? campaignOfPath(path, null) : null;
      (campaign ? removeCopiesOfCampaign(conn.id, campaign) : saveCopy(conn.id, copyUser, path, null)).catch(() => undefined);
    }
    // Neue Nutzungsbedingungen: die App zeigt den Weg zum Zustimmen, egal wo es passiert
    if (res.status === 403 && err.code === 'terms_required' && conn.id !== '_probe' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taleward:terms-required', { detail: conn.id }));
    }
    throw new ApiRequestError(res.status, err);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('Content-Type') ?? '';
  if (!type.includes('application/json')) return res.blob() as Promise<T>;
  const data = await res.json();
  if (copyUser && stillSignedIn()) {
    saveCopy(conn.id, copyUser, path, cleanForCopy(path, data, copyUser), campaignOfPath(path, data), stillSignedIn).catch(() => undefined);
    // Kampagnen, die nicht mehr in der Liste stehen (verlassen, entfernt, gelöscht): ihre Kopie verwerfen
    if (path === '/campaigns' && Array.isArray(data)) {
      keepOnlyCampaigns(conn.id, data.map((c: { id?: unknown }) => String(c?.id ?? ''))).catch(() => undefined);
    }
  }
  return data as T;
}

/**
 * Lesekopie ergänzen: veröffentlichte Kapitel, die noch nicht auf dem Gerät liegen, leise nachladen (eins nach dem
 * anderen, höchstens 60 Abrufe je Aufruf). Nur wenn der Server gerade erreichbar ist.
 */
export async function fillReadCopy(conn: Connection, sessionIds: string[]): Promise<void> {
  const userId = conn.user?.id;
  const token = conn.token;
  if (!userId || !hasValidToken(conn) || isMusterUrl(conn.baseUrl) || offlineSince(conn.id)) return;
  // Vor jedem Abruf: dieselbe Anmeldung besteht noch (sonst nach dem Abmelden aufhören)
  const current = () => {
    const c = getConnection(conn.id);
    return c && c.token === token && c.user?.id === userId && hasValidToken(c) ? c : null;
  };
  let fetched = 0;
  for (const id of sessionIds) {
    if (fetched >= 60 || offlineSince(conn.id)) return;
    const missing = [`/sessions/${id}`, `/sessions/${id}/recap`, `/sessions/${id}/comments`];
    for (const path of missing) {
      if (await hasCopy(conn.id, userId, path).catch(() => true)) continue;
      const c = current();
      if (!c) return;
      fetched++;
      await requestOn(c, 'GET', path).catch(() => undefined);
    }
  }
}

/** Ist das ein Fehler mit diesem code (z. B. 'audio_gone')? */
export function isApiError(e: unknown, code?: string): e is ApiRequestError {
  return e instanceof ApiRequestError && (code === undefined || e.code === code);
}

/** Alle Endpunkte, gebunden an eine Verbindung */
function makeApi(conn: () => Connection) {
  const request = <T,>(method: string, path: string, opts?: RequestOptions) => requestOn<T>(conn(), method, path, opts);
  return {
  login: (username: string, password: string) =>
    request<{ accessToken: string; expiresAt: string; user: User }>('POST', '/auth/login', { body: { username, password, deviceId: deviceId() } }),
  me: () => request<User>('GET', '/me'),
  info: () => request<ServerInfo>('GET', '/info').then(withSafeLinks),
  /** acceptTerms und termsVersion ab 0.4.22, wenn der Server Nutzungsbedingungen meldet */
  register: (data: ({ username: string; displayName: string; password: string; acceptPrivacy: true; ageConfirmed: true }
    | { registrationToken: string; displayName: string; acceptPrivacy: true; ageConfirmed: true })
    & { inviteCode?: string; registrationCode?: string; acceptTerms?: true; termsVersion?: number }) =>
    request<{ accessToken: string; expiresAt: string; user: User }>('POST', '/auth/register', { body: data }),
  /** Neuer Fassung der Nutzungsbedingungen zustimmen (ab 0.4.22) */
  acceptTerms: (version: number) => request<User>('PUT', '/me/terms', { body: { accept: true, version } }),
  /** SL-Freigabe anfragen (ab 0.4.23): 202 pending, 200 schon erledigt; 409 email_unverified / gm_request_closed */
  requestGm: () => request<User>('POST', '/me/gm-request'),
  exportMe: () => request<Blob>('GET', '/me/export'),
  /** Konten mit Passwort: { password }, ohne Passwort: { confirmUsername } */
  deleteMe: (confirm: { password: string } | { confirmUsername: string }) => request<void>('DELETE', '/me', { body: confirm }),
  // Anmeldung (ab 0.4.0)
  passwordReset: (login: string) => request<void>('POST', '/auth/password-reset', { body: { login } }),
  oidcExchange: (ticket: string, verifier: string) => request<OidcExchange>('POST', '/auth/oidc/exchange', { body: { ticket, verifier, deviceId: deviceId() } }),
  setEmail: (email: string) => request<void>('PUT', '/me/email', { body: { email } }),
  deleteEmail: () => request<void>('DELETE', '/me/email'),
  setPassword: (newPassword: string, currentPassword?: string) =>
    request<void>('PUT', '/me/password', { body: currentPassword ? { currentPassword, newPassword } : { newPassword } }),
  linkProvider: (provider: AuthProviderId) => request<{ linkToken: string }>('POST', `/me/providers/${provider}/link`),
  unlinkProvider: (provider: AuthProviderId) => request<void>('DELETE', `/me/providers/${provider}`),
  organizations: () => request<Organization[]>('GET', '/organizations'),
  usage: (campaignId: string, month?: string) =>
    request<Usage>('GET', `/campaigns/${campaignId}/usage${month ? `?month=${month}` : ''}`),

  voiceProfile: () => request<VoiceProfile>('GET', '/me/voice-profile'),
  createVoiceProfile: (audio: Blob, fileName: string, learnFromSessions: boolean) => {
    const form = new FormData();
    form.append('audio', audio, fileName);
    form.append('consent', 'true');
    form.append('learnFromSessions', String(learnFromSessions));
    return request<VoiceProfile>('POST', '/me/voice-profile', { form });
  },
  updateVoiceProfile: (learnFromSessions: boolean) =>
    request<VoiceProfile>('PATCH', '/me/voice-profile', { body: { learnFromSessions } }),
  deleteVoiceProfile: () => request<void>('DELETE', '/me/voice-profile'),

  campaigns: () => request<CampaignSummary[]>('GET', '/campaigns'),
  campaign: (id: string) => request<Campaign>('GET', `/campaigns/${id}`),
  createCampaign: (
    title: string,
    description = '',
    language?: 'de' | 'en',
    system?: GameSystem | null,
    systemName?: string | null,
    /** Einstellungen gleich beim Anlegen (ab 0.4.25, nur an solche Server schicken) */
    settings?: CampaignSettingsIn
  ) => request<Campaign>('POST', '/campaigns', { body: { title, description, language, system, systemName, ...(settings ? { settings } : {}) } }),
  // Kampagnen-Einstellungen an einem Ort (ab 0.4.25)
  campaignSettings: (campaignId: string) => request<CampaignSettings>('GET', `/campaigns/${campaignId}/settings`),
  updateCampaignSettings: (campaignId: string, version: number, change: CampaignSettingsIn) =>
    request<CampaignSettings>('PATCH', `/campaigns/${campaignId}/settings`, { body: { ...change, version } }),
  campaignSettingsLog: (campaignId: string) => request<CampaignSettingsLogEntry[]>('GET', `/campaigns/${campaignId}/settings/log`),
  // Guthaben (ab 0.4.25) – bezahlt wird nie in der App
  credits: () => request<Credit[]>('GET', '/credits'),
  creditBookings: (creditId: string, before?: string) =>
    request<CreditBooking[]>('GET', `/credits/${creditId}/bookings?limit=30${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  creditWaiting: (creditId: string) => request<CreditWaitingJob[]>('GET', `/credits/${creditId}/waiting`),
  approveCreditJob: (creditId: string, jobId: string) => request<void>('POST', `/credits/${creditId}/waiting/${jobId}/approve`),
  updateCreditSettings: (creditId: string, change: { approvalThresholdCents?: number; sheetMaxPages?: number; sheetsPerPlayer?: number }) =>
    request<Credit>('PATCH', `/credits/${creditId}/settings`, { body: change }),
  redeemVoucher: (creditId: string, code: string) =>
    request<{ amountCents: number; credit: Credit }>('POST', `/credits/${creditId}/vouchers`, { body: { code } }),
  offerPayment: (campaignId: string, memberId: string | null) =>
    request<CampaignBilling>('POST', `/campaigns/${campaignId}/payer/offer`, { body: { memberId } }),
  acceptPayment: (campaignId: string) => request<CampaignBilling>('POST', `/campaigns/${campaignId}/payer/accept`),
  /** Beitreten – ab 0.4.7 optional mit einem Charakter aus der Sammlung */
  joinCampaign: (code: string, characterName?: string, character?: Character | null) =>
    request<Campaign>('POST', '/campaigns/join', { body: { code, characterName, ...(character ? { character } : {}) } }),
  /** Eigenen Charakter setzen/aktualisieren (ab 0.4.7) */
  putMyCharacter: (campaignId: string, character: Character) =>
    request<Member>('PUT', `/campaigns/${campaignId}/members/me/character`, { body: character }),
  /** Charakter lösen, z. B. für einen Charakterwechsel (ab 0.4.7) */
  releaseMyCharacter: (campaignId: string) => request<void>('DELETE', `/campaigns/${campaignId}/members/me/character`),
  /** Mitgebrachte Welt einreichen bzw. Stand abfragen (ab 0.4.7) */
  submitWorld: (campaignId: string, entries: WorldEntryIn[]) =>
    request<{ entries: WorldEntryStatus[] }>('POST', `/campaigns/${campaignId}/members/me/world`, { body: { entries } }),
  myWorld: (campaignId: string) => request<{ entries: WorldEntryStatus[] }>('GET', `/campaigns/${campaignId}/members/me/world`),
  /** Chronik des eigenen Charakters als Abschrift (ab 0.4.7) */
  myChronicle: (campaignId: string) => request<Chronicle>('GET', `/campaigns/${campaignId}/members/me/chronicle`),
  /** Vorschläge aus mitgebrachter Welt (nur SL, ab 0.4.7) */
  characterProposals: (campaignId: string) => request<Proposal[]>('GET', `/campaigns/${campaignId}/character-proposals`),
  // Auswertung von Charakterbögen und Hintergründen (ab 0.4.18)
  characterAnalyses: (campaignId: string) => request<CharacterAnalysis[]>('GET', `/campaigns/${campaignId}/character-analyses`),
  requestBackstoryAnalysis: (campaignId: string) => request<CharacterAnalysis>('POST', `/campaigns/${campaignId}/members/me/backstory-analysis`),
  decideCharacterAnalysis: (analysisId: string, approve: boolean) => request<CharacterAnalysis>('POST', `/character-analyses/${analysisId}/decision`, { body: { approve } }),
  /** Hinweis an die SL erledigen (ab 0.4.7) */
  dismissGmNotice: (campaignId: string, noticeId: string) => request<void>('DELETE', `/campaigns/${campaignId}/gm-notices/${noticeId}`),
  updateCampaign: (
    campaignId: string,
    change: {
      title?: string;
      description?: string;
      worldInfo?: string;
      language?: 'de' | 'en';
      coverPreset?: string | null;
      /** true = abschließen, false = wieder aufnehmen (ab 0.4.5) */
      archived?: boolean;
      system?: GameSystem | null;
      systemName?: string | null;
      allowExternalTranscription?: boolean;
      allowCloudSummary?: boolean;
      /** Auswertung von Charakterbögen und Hintergründen erlauben (nur SL, ab 0.4.18) */
      allowCharacterAnalysis?: boolean;
      /** Namenshilfe ganz ersetzen (nur SL, ab 0.4.6) */
      hotwords?: string[];
      /** Links der Kampagne ganz ersetzen (nur SL, ab 0.4.13) */
      links?: Link[];
    }
  ) =>
    request<Campaign>('PATCH', `/campaigns/${campaignId}`, { body: change }),
  updateMember: (
    campaignId: string,
    memberId: string,
    change: { characterName?: string; characterSummary?: string; characterBackstory?: string; role?: 'gm' | 'player' }
  ) =>
    request<Member>('PATCH', `/campaigns/${campaignId}/members/${memberId}`, { body: change }),
  coverImage: (campaignId: string) => request<Blob>('GET', `/campaigns/${campaignId}/cover-image`),
  uploadCoverImage: (campaignId: string, image: Blob) =>
    request<Campaign>('PUT', `/campaigns/${campaignId}/cover-image`, { raw: image, headers: { 'Content-Type': image.type || 'image/jpeg' } }),
  /** Kampagne endgültig löschen – confirmTitle muss dem Titel entsprechen (ab 0.4.5) */
  deleteCampaign: (campaignId: string, confirmTitle: string) =>
    request<void>('DELETE', `/campaigns/${campaignId}`, { body: { confirmTitle } }),
  /** Mitglied entfernen (SL) oder selbst verlassen (eigene memberId) (ab 0.4.5) */
  removeMember: (campaignId: string, memberId: string) => request<void>('DELETE', `/campaigns/${campaignId}/members/${memberId}`),
  /** Unveröffentlichtes Kapitel verwerfen, samt Aufnahme (ab 0.4.5) */
  deleteSession: (sessionId: string) => request<void>('DELETE', `/sessions/${sessionId}`),
  deleteCoverImage: (campaignId: string) => request<void>('DELETE', `/campaigns/${campaignId}/cover-image`),
  markSeen: (campaignId: string, area: 'chronicle' | 'bible') =>
    request<void>('POST', `/campaigns/${campaignId}/seen`, { body: { area } }),
  markSessionSeen: (sessionId: string) => request<void>('POST', `/sessions/${sessionId}/seen`),

  portrait: (campaignId: string, memberId: string, size: 'thumb' | 'full') =>
    request<Blob>('GET', `/campaigns/${campaignId}/members/${memberId}/portrait?size=${size}`),
  /** crop: quadratischer Ausschnitt für den Kreis in Pixeln des hochgeladenen Bildes (ab 0.3.6) */
  uploadPortrait: (campaignId: string, memberId: string, image: Blob, crop?: { x: number; y: number; size: number }) =>
    request<Member>('PUT', `/campaigns/${campaignId}/members/${memberId}/portrait${crop ? `?cropX=${crop.x}&cropY=${crop.y}&cropSize=${crop.size}` : ''}`, {
      raw: image,
      headers: { 'Content-Type': image.type || 'image/jpeg' }
    }),
  deletePortrait: (campaignId: string, memberId: string) =>
    request<void>('DELETE', `/campaigns/${campaignId}/members/${memberId}/portrait`),

  setRecordingConsent: (campaignId: string, granted: boolean) =>
    request<Member>('PUT', `/campaigns/${campaignId}/recording-consent`, { body: { granted } }),
  createInvite: (campaignId: string) =>
    request<{ code: string; expiresAt: string }>('POST', `/campaigns/${campaignId}/invites`),

  // Kampagnen-Umzug (ab 0.4.8)
  setMoveConsent: (campaignId: string, granted: boolean) =>
    request<Member>('PUT', `/campaigns/${campaignId}/members/me/move-consent`, { body: { granted } }),
  startExport: (campaignId: string) => request<CampaignExport>('POST', `/campaigns/${campaignId}/exports`),
  exportStatus: (campaignId: string, exportId: string) =>
    request<CampaignExport>('GET', `/campaigns/${campaignId}/exports/${exportId}`),
  startImport: (fileName: string, sizeBytes: number) =>
    request<{ importId: string; chunkSizeBytes: number; chunkCount: number }>('POST', '/imports', { body: { fileName, sizeBytes } }),
  putImportChunk: (importId: string, index: number, data: Blob, sha256?: string) =>
    request<void>('PUT', `/imports/${importId}/chunks/${index}`, { raw: data, headers: sha256 ? { 'X-Chunk-SHA256': sha256 } : undefined }),
  importStatus: (importId: string) => request<ImportStatus>('GET', `/imports/${importId}`),
  completeImport: (importId: string) => request<ImportStatus>('POST', `/imports/${importId}/complete`),
  seatInvite: (campaignId: string, memberId: string) =>
    request<{ code: string; expiresAt: string; memberId: string }>('POST', `/campaigns/${campaignId}/members/${memberId}/invite`),
  takeSeat: (campaignId: string, memberId: string) =>
    request<Campaign>('POST', `/campaigns/${campaignId}/members/${memberId}/take`),
  releaseSeat: (campaignId: string, memberId: string) =>
    request<Member>('POST', `/campaigns/${campaignId}/members/${memberId}/release`),

  // Die Schnittstelle legt keine Reihenfolge fest (Server liefern aufsteigend); die App rechnet mit „neueste zuerst“
  sessions: (campaignId: string) =>
    request<SessionSummary[]>('GET', `/campaigns/${campaignId}/sessions`).then((list) => [...list].sort((a, b) => b.number - a.number)),
  session: (id: string) => request<Session>('GET', `/sessions/${id}`),
  createSession: (campaignId: string, playedAt: string, attendees: Attendee[], title?: string) =>
    request<Session>('POST', `/campaigns/${campaignId}/sessions`, { body: { playedAt, attendees, title } }),
  status: (sessionId: string) => request<ProcessingStatus>('GET', `/sessions/${sessionId}/status`),
  retry: (sessionId: string) => request<ProcessingStatus>('POST', `/sessions/${sessionId}/retry`),
  /** Kapitel aus der vorhandenen Abschrift neu schreiben (ab 0.4.10, nur in awaiting_review) */
  resummarize: (sessionId: string) => request<ProcessingStatus>('POST', `/sessions/${sessionId}/resummarize`),

  startUpload: (
    sessionId: string,
    source: 'table' | 'discord',
    files: { fileName: string; sizeBytes: number; mimeType: string; trackMemberId?: string }[]
  ) => request<UploadCreated>('POST', `/sessions/${sessionId}/uploads`, { body: { source, files } }),
  putChunk: (uploadId: string, fileId: string, index: number, data: Blob, sha256?: string) =>
    request<void>('PUT', `/uploads/${uploadId}/files/${fileId}/chunks/${index}`, {
      raw: data,
      headers: sha256 ? { 'X-Chunk-SHA256': sha256 } : undefined
    }),
  uploadState: (uploadId: string) =>
    request<{ files: { fileId: string; missingChunks: number[] }[] }>('GET', `/uploads/${uploadId}`),
  completeUpload: (uploadId: string) => request<ProcessingStatus>('POST', `/uploads/${uploadId}/complete`),

  speakers: (sessionId: string) => request<Speaker[]>('GET', `/sessions/${sessionId}/speakers`),
  /** guestName (ab 0.4.7): Stimme als Gast benennen; memberId und guestName schließen sich aus */
  assignSpeakers: (sessionId: string, mapping: { speakerId: string; memberId: string | null; guestName?: string | null }[]) =>
    request<ProcessingStatus>('PUT', `/sessions/${sessionId}/speakers`, { body: mapping }),
  /** index (ab 0.4.21): Hörprobe zu Speaker.samples[index]; ohne index die zu sampleText */
  speakerSample: (sessionId: string, speakerId: string, index?: number) =>
    request<Blob>('GET', `/sessions/${sessionId}/speakers/${speakerId}/sample${index === undefined ? '' : `?index=${Math.trunc(index)}`}`),

  proposals: (sessionId: string) => request<Proposal[]>('GET', `/sessions/${sessionId}/proposals`),
  decide: (
    proposalId: string,
    change: { decision?: ProposalDecision; title?: string; detail?: string; gmNotes?: string; visibility?: Visibility; hiddenFromMemberIds?: string[]; mergeIntoEntryId?: string | null; holderMemberId?: string | null; holderCleared?: boolean }
  ) => request<Proposal>('PATCH', `/proposals/${proposalId}`, { body: change }),

  // Terminabstimmung
  datePoll: (campaignId: string) => request<DatePoll>('GET', `/campaigns/${campaignId}/date-poll`),
  createDatePoll: (campaignId: string, note?: string) =>
    request<DatePoll>('POST', `/campaigns/${campaignId}/date-poll`, { body: { note } }),
  addDateOption: (pollId: string, startsAt: string) =>
    request<DatePoll>('POST', `/date-polls/${pollId}/options`, { body: { startsAt } }),
  removeDateOption: (pollId: string, optionId: string) =>
    request<DatePoll>('DELETE', `/date-polls/${pollId}/options/${optionId}`),
  vote: (pollId: string, optionId: string, answer: VoteAnswer) =>
    request<DatePoll>('PUT', `/date-polls/${pollId}/options/${optionId}/vote`, { body: { answer } }),
  closeDatePoll: (pollId: string, optionId: string) =>
    request<DatePoll>('POST', `/date-polls/${pollId}/close`, { body: { optionId } }),
  cancelDatePoll: (pollId: string) => request<void>('DELETE', `/date-polls/${pollId}`),

  // Kommentare pro Kapitel
  comments: (sessionId: string) => request<Comment[]>('GET', `/sessions/${sessionId}/comments`),
  /** Mehrere Empfänger erst ab 0.4.26; ältere Server bekommen nur den ersten */
  addComment: (sessionId: string, text: string, recipients: string[], multi: boolean) =>
    request<Comment>('POST', `/sessions/${sessionId}/comments`, {
      body: multi ? { text, recipientMemberIds: recipients } : { text, recipientMemberId: recipients[0] ?? null }
    }),
  editComment: (commentId: string, text: string) =>
    request<Comment>('PATCH', `/comments/${commentId}`, { body: { text } }),
  deleteComment: (commentId: string) => request<void>('DELETE', `/comments/${commentId}`),

  // SL-Unterlagen
  documents: (campaignId: string) => request<CampaignDocument[]>('GET', `/campaigns/${campaignId}/documents`),
  uploadDocument: (campaignId: string, file: File, kind: DocumentKind, title: string) => {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('kind', kind);
    form.append('title', title);
    return request<CampaignDocument>('POST', `/campaigns/${campaignId}/documents`, { form });
  },
  document: (documentId: string) => request<CampaignDocument>('GET', `/documents/${documentId}`),
  documentProposals: (documentId: string) => request<Proposal[]>('GET', `/documents/${documentId}/proposals`),
  applyDocument: (documentId: string, applyWorldInfo: boolean) =>
    request<CampaignDocument>('POST', `/documents/${documentId}/apply`, { body: { applyWorldInfo } }),
  retryDocument: (documentId: string) => request<CampaignDocument>('POST', `/documents/${documentId}/retry`),
  // Nachlesen am Tisch (ab 0.4.12, nur SL)
  documentText: (documentId: string) => request<DocumentText>('GET', `/documents/${documentId}/text`),
  documentFile: (documentId: string) => request<Blob>('GET', `/documents/${documentId}/file`),
  // Kapitelpläne (ab 0.4.12, nur SL)
  plans: (campaignId: string) => request<ChapterPlan[]>('GET', `/campaigns/${campaignId}/plans`),
  plan: (planId: string) => request<ChapterPlan>('GET', `/plans/${planId}`),
  createPlan: (campaignId: string, input: ChapterPlanInput) => request<ChapterPlan>('POST', `/campaigns/${campaignId}/plans`, { body: input }),
  updatePlan: (planId: string, change: ChapterPlanInput & { ifUpdatedAt?: string | null }) =>
    request<ChapterPlan>('PATCH', `/plans/${planId}`, { body: change }),
  deletePlan: (planId: string) => request<void>('DELETE', `/plans/${planId}`),
  deleteDocument: (documentId: string) => request<void>('DELETE', `/documents/${documentId}`),

  recap: (sessionId: string) => request<Recap>('GET', `/sessions/${sessionId}/recap`),
  updateRecap: (sessionId: string, change: { title?: string; text?: string; openThreads?: string[]; parts?: RecapPart[] }) =>
    request<Recap>('PUT', `/sessions/${sessionId}/recap`, { body: change }),
  /** Kapitel per Hinweis korrigieren lassen (ab 0.4.15, nur SL) – Ergebnis kommt als Entwurf in Recap.revision */
  requestRevision: (sessionId: string, note: string, baseText: string) =>
    request<Recap>('POST', `/sessions/${sessionId}/recap/revision`, { body: { note, baseText } }),
  /** Korrektur-Entwurf als Ganzes übernehmen oder verwerfen (ab 0.4.15) */
  decideRevision: (sessionId: string, accept: boolean) =>
    request<Recap>('POST', `/sessions/${sessionId}/recap/revision/decision`, { body: { accept } }),
  /** Transkript (nur SL) – z. B. für „Im Transkript zeigen“ bei Belegstellen */
  transcript: (sessionId: string) => request<TranscriptSegment[]>('GET', `/sessions/${sessionId}/transcript`),
  /** Unsicher erkannte Namen (nur SL, ab 0.4.6) */
  uncertainTerms: (sessionId: string) => request<UncertainTerms>('GET', `/sessions/${sessionId}/uncertain-terms`),
  /**
   * Schreibweisen korrigieren (nur SL, ab 0.4.6). Ohne retranscribe kommt der geänderte Recap zurück,
   * mit retranscribe der neue Verarbeitungsstatus (erneute Transkription läuft).
   */
  corrections: async (sessionId: string, corrections: Correction[], retranscribe = false) => {
    const r = await request<Recap | ProcessingStatus>('POST', `/sessions/${sessionId}/corrections`, { body: { corrections, retranscribe } });
    return 'state' in r ? { status: r } : { recap: r };
  },
  publish: (sessionId: string) => request<Session>('POST', `/sessions/${sessionId}/publish`),
  gmNote: (sessionId: string) => request<{ text: string; updatedAt: string }>('GET', `/sessions/${sessionId}/gm-note`),
  saveGmNote: (sessionId: string, text: string) => request<void>('PUT', `/sessions/${sessionId}/gm-note`, { body: { text } }),

  entries: (campaignId: string, type?: EntryType, q?: string) => {
    const p = new URLSearchParams();
    if (type) p.set('type', type);
    if (q) p.set('q', q);
    const qs = p.toString();
    return request<Entry[]>('GET', `/campaigns/${campaignId}/entries${qs ? '?' + qs : ''}`);
  },
  updateEntry: (entryId: string, change: Partial<EntryInput>) =>
    request<Entry>('PATCH', `/entries/${entryId}`, { body: change }),
  deleteEntry: (entryId: string) => request<void>('DELETE', `/entries/${entryId}`),
  // Figuren ausgetretener Spieler (ab 0.4.9, nur SL)
  entryToNpc: (entryId: string) => request<Entry>('POST', `/entries/${entryId}/to-npc`),
  assignEntry: (entryId: string, memberId: string) => request<Entry>('POST', `/entries/${entryId}/assign`, { body: { memberId } }),
  createEntry: (campaignId: string, input: EntryInput) =>
    request<Entry>('POST', `/campaigns/${campaignId}/entries`, { body: input })
  };
}

/** Endpunkte des aktuell geöffneten Servers (aus der Adresse /v/<id>/…) */
export const api = makeApi(currentConnection);

/** Endpunkte eines bestimmten Servers, z. B. für die Kampagnenliste über alle Server */
export function apiFor(conn: Connection) {
  return makeApi(() => conn);
}

/**
 * Vorschau einer Einladung ohne Anmeldung (ab Schnittstelle 0.4.10): Kampagnentitel vor dem Beitritt.
 * null, wenn der Server sie nicht kennt (älter) oder nicht erreichbar ist – dann geht es ohne Titel weiter.
 * Ein ungültiger Code (404 invite_invalid) wird als Fehler weitergegeben.
 */
export async function fetchInvitePreview(baseUrl: string, code: string): Promise<InvitePreview | null> {
  try {
    return await requestOn<InvitePreview>({ id: '_probe', baseUrl, name: '', operator: null, apiVersion: null, token: null, expiresAt: null, user: null }, 'GET', `/invites/${encodeURIComponent(code)}`);
  } catch (e) {
    if (isApiError(e, 'invite_invalid')) throw e;
    return null;
  }
}

/** Öffentliche Info eines Servers, ohne Verbindung (vor dem Anmelden) */
export function fetchServerInfo(baseUrl: string): Promise<ServerInfo> {
  return requestOn<ServerInfo>({ id: '_probe', baseUrl, name: '', operator: null, apiVersion: null, token: null, expiresAt: null, user: null }, 'GET', '/info').then(withSafeLinks);
}
