import { VoiceProfileHint } from '../components/VoiceProfileHint';
import { currentConnection, currentConnectionId, p } from '../api/connections';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Campaign } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CharacterEditor } from '../characters/CharacterEditor';
import { CharacterPortrait } from '../characters/Portrait';
import { listCharacters, type StoredCharacter } from '../characters/store';
import { pushToCampaign, serverHasCharacters } from '../characters/sync';
import { CharacterForm } from '../components/CharacterForm';
import { Divider, ErrorBox, Screen, rememberCampaign } from '../components/Screen';
import { t, tn } from '../i18n';
import { RecordingConsent } from './Overview';

/**
 * Nach dem Beitritt als Spieler: 1. eigener Charakter, 2. Zustimmung zu Aufnahmen.
 * Beides lässt sich überspringen – die Kampagne ist nie gesperrt.
 */
export function WelcomePage() {
  const { campaignId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<unknown>(null);

  const load = () =>
    api.campaign(campaignId).then((c) => {
      rememberCampaign(c);
      setCampaign(c);
    }).catch(setError);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const me = campaign?.members.find((m) => m.userId === user?.id);
  const done = () => navigate(p(`/k/${campaignId}`), { replace: true });

  return (
    <Screen narrow nav={false} overline={t('Willkommen am Tisch')} title={campaign?.title ?? ' '} hero={{ campaign, large: true }}>
      <ErrorBox error={error} />
      {campaign?.description && <p className="muted" style={{ margin: 0 }}>{campaign.description}</p>}

      {campaign && me && (
        <>
          <div className="overline">{t('Schritt {n} von 2', { n: step })}</div>
          {step === 1 && (
            <section className="card">
              <h2>{t('Dein Charakter')}</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {t('Geht auch später auf der Übersicht.')}
              </p>
              {me.role === 'player' && !me.characterId && serverHasCharacters(currentConnection()) ? (
                <CharacterChoice campaign={campaign} memberId={me.id} initialName={me.characterName ?? ''}
                  onDone={() => { load(); setStep(2); }} onSkip={() => setStep(2)} />
              ) : (
                <CharacterForm
                  campaign={campaign}
                  member={me}
                  submitLabel={t('Speichern und weiter')}
                  onSaved={() => { load(); setStep(2); }}
                  secondary={{ label: t('Später'), onClick: () => setStep(2) }}
                />
              )}
            </section>
          )}
          {step === 2 && (
            <>
              <RecordingConsent campaign={campaign} onChanged={load} />
              <VoiceProfileHint />
              <Divider />
              <button type="button" className="btn" onClick={done}>{t('Zur Kampagne')}</button>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

/**
 * Willkommen auf Servern ab 0.4.7: Charakter aus der Sammlung mitbringen oder neu anlegen. Er landet zuerst in der
 * Sammlung und geht dann als Kopie an die Kampagne – samt mitgebrachter Welt als Vorschlag für die SL.
 */
function CharacterChoice({ campaign, memberId, initialName, onDone, onSkip }: {
  campaign: Campaign;
  memberId: string;
  initialName: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const ready = listCharacters().filter((c) => c.status === 'active');
  const [creating, setCreating] = useState(ready.length === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const bring = async (c: StoredCharacter) => {
    setBusy(c.id);
    setError(null);
    try {
      await pushToCampaign(c.id, { connId: currentConnectionId() ?? currentConnection().id, campaignId: campaign.id, campaignTitle: campaign.title, memberId });
      onDone();
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  };

  if (creating) {
    return (
      <>
        <ErrorBox error={error} />
        <CharacterEditor initialName={initialName} submitLabel={busy ? t('Speichern …') : t('Speichern und weiter')}
          onSaved={bring}
          secondary={ready.length ? { label: t('Aus meiner Sammlung wählen'), onClick: () => setCreating(false) } : { label: t('Später'), onClick: onSkip }} />
        <span className="muted small">{t('Der Charakter kommt in deine Sammlung „Meine Charaktere“ – so kannst du ihn auch in andere Kampagnen mitnehmen.')}</span>
      </>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="muted small" style={{ margin: 0 }}>{t('Wen bringst du mit?')}</p>
      {ready.map((c) => (
        <button key={c.id} type="button" className="card" disabled={!!busy} onClick={() => bring(c)}
          style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <CharacterPortrait id={c.id} name={c.name} portrait={c.portrait} meta={c.portraitMeta} size={56} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 'calc(18px * var(--ts))' }}>{c.name}</strong>
            <span className="muted small">
              {busy === c.id ? t('Schicke …') : [c.system, c.world.length ? tn(c.world.length, '{n} mitgebrachter Eintrag', '{n} mitgebrachte Einträge') : null].filter(Boolean).join(' · ') || t('Mit diesem Charakter spielen')}
            </span>
          </span>
        </button>
      ))}
      <ErrorBox error={error} />
      <button type="button" className="btn outline" disabled={!!busy} onClick={() => setCreating(true)}>{t('Neuer Charakter')}</button>
      <button type="button" className="btn ghost" disabled={!!busy} onClick={onSkip}>{t('Später')}</button>
    </div>
  );
}
