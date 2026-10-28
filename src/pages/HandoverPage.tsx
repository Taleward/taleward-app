import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { currentConnection, p } from '../api/connections';
import { isDeletedMember, type Campaign } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { confirmDialog } from '../components/confirm';
import { InviteBox } from '../components/InviteBox';
import { ErrorBox, Screen, rememberCampaign } from '../components/Screen';
import { t } from '../i18n';

/**
 * Spielleitung übergeben (Schnittstelle 0.4.5, keine eigenen Aufrufe): erst die neue SL ernennen, dann – wenn gewünscht –
 * selbst zum Spieler werden. Danach wählt die bisherige SL ihren Charakter (Willkommen-Seite).
 */
export function HandoverPage() {
  const { campaignId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [pick, setPick] = useState('');
  const [stepDown, setStepDown] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [halfDone, setHalfDone] = useState(false);

  useEffect(() => {
    api.campaign(campaignId).then((c) => { rememberCampaign(c); setCampaign(c); }).catch(setError);
  }, [campaignId]);

  const me = campaign?.members.find((m) => m.userId === user?.id);
  const players = campaign?.members.filter((m) => m.role === 'player' && !isDeletedMember(m)) ?? [];
  const target = players.find((m) => m.id === pick);
  const coGms = campaign?.members.filter((m) => m.role === 'gm' && m.id !== me?.id && !isDeletedMember(m)) ?? [];

  /** Es leitet schon jemand mit: nur noch selbst abgeben */
  const onlyStepDown = async () => {
    if (!campaign) return;
    const q = t('Spielleitung abgeben? „{title}“ auf „{server}“: Ab sofort siehst du nur noch, was Spieler sehen. {name} leitet weiter.', { title: campaign.title, server: currentConnection().name, name: coGms.map((m) => m.displayName).join(', ') });
    if (!(await confirmDialog(q, { confirmLabel: t('Abgeben'), danger: true }))) return;
    setBusy(true);
    setError(null);
    try {
      await stepDownNow();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const stepDownNow = async () => {
    if (!campaign || !me) return;
    await api.updateMember(campaign.id, me.id, { role: 'player' });
    // Ab jetzt filtert der Server anders: frisch laden und den Charakter wählen lassen
    navigate(p(`/k/${campaign.id}/willkommen`), { replace: true });
  };

  const handOver = async () => {
    if (!campaign || !me || !target) return;
    const q = stepDown
      ? t('Spielleitung an {name} übergeben? „{title}“ auf „{server}“: {name} sieht ab sofort alles, du nur noch, was Spieler sehen.', { name: target.displayName, title: campaign.title, server: currentConnection().name })
      : t('{name} zusätzlich zur Spielleitung machen? „{title}“ auf „{server}“: {name} sieht ab sofort alles, auch Geheimes.', { name: target.displayName, title: campaign.title, server: currentConnection().name });
    if (!(await confirmDialog(q, { confirmLabel: stepDown ? t('Übergeben') : t('Zur Spielleitung machen'), danger: stepDown }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMember(campaign.id, target.id, { role: 'gm' });
    } catch (e) {
      setError(e);
      setBusy(false);
      return;
    }
    if (!stepDown) {
      navigate(p(`/k/${campaign.id}`), { replace: true });
      return;
    }
    try {
      await stepDownNow();
    } catch (e) {
      // Harmlos: Die Kampagne hat jetzt zwei Spielleitungen. Abgeben lässt sich wiederholen.
      setHalfDone(true);
      setError(e);
      setBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      await stepDownNow();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Screen narrow back overline={campaign?.title ?? ' '} title={t('Spielleitung übergeben')}>
      <ErrorBox error={error} />
      {campaign && me && me.role !== 'gm' && <div className="empty">{t('Das kann nur die Spielleitung.')}</div>}

      {campaign && me?.role === 'gm' && halfDone && (
        <section className="card warn">
          <strong>{t('{name} leitet jetzt mit', { name: target?.displayName ?? '' })}</strong>
          <span className="small">{t('Dich selbst zum Spieler zu machen hat nicht geklappt. Bis dahin leitet ihr beide. Versuch es gleich noch einmal.')}</span>
          <button type="button" className="btn" disabled={busy} onClick={retry}>{t('Jetzt zum Spieler werden')}</button>
        </section>
      )}

      {campaign && me?.role === 'gm' && !halfDone && coGms.length > 0 && (
        <section className="card">
          <strong>{t('{name} leitet schon mit', { name: coGms.map((m) => m.displayName).join(', ') })}</strong>
          <span className="muted small">{t('Du kannst abgeben und als Spieler weitermachen.')}</span>
          <button type="button" className="btn outline" disabled={busy} onClick={onlyStepDown}>{t('Ich spiele ab jetzt als Spieler')}</button>
        </section>
      )}

      {campaign && me?.role === 'gm' && !halfDone && (
        <>
          <section className="card">
            <h2>{t('Wer leitet ab jetzt?')}</h2>
            {players.length === 0 ? (
              <>
                <span className="muted small">{t('Die neue Spielleitung muss erst in der Kampagne sein. Lade sie zuerst ein.')}</span>
                <InviteBox campaignId={campaign.id} campaignTitle={campaign.title} />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {players.map((m) => (
                    <label key={m.id} className="check" style={{ minHeight: 48 }}>
                      <input type="radio" name="new-gm" checked={pick === m.id} onChange={() => setPick(m.id)} />
                      <span>{m.displayName}{m.characterName ? <span className="muted"> · {m.characterName}</span> : null}</span>
                    </label>
                  ))}
                </div>
                <span className="muted small">{t('Jemand Neues? Erst einladen, dann taucht die Person hier auf.')}</span>
              </>
            )}
          </section>

          {players.length > 0 && (
            <section className="card">
              <label className="check">
                <input type="checkbox" checked={stepDown} onChange={(e) => setStepDown(e.target.checked)} />
                <span>{t('Ich spiele danach als Spieler weiter')}</span>
              </label>
              <span className="muted small" style={{ marginLeft: 28 }}>
                {stepDown
                  ? t('Danach wählst du deinen Charakter.')
                  : t('Sonst leitet ihr zu zweit.')}
              </span>
            </section>
          )}

          {players.length > 0 && stepDown && (
            <div className="card warn">
              <strong>{t('Ab dann siehst du nur noch, was Spieler sehen')}</strong>
              <span className="small">
                {t('Weg sind dann Geheimes, SL-Notizen, Vorschläge, Abschriften, Unterlagen, Kosten und Hinweise.')}
              </span>
            </div>
          )}

          {players.length > 0 && !target && <span className="muted small">{t('Wähle oben, wer die Spielleitung bekommt.')}</span>}
          {players.length > 0 && (
            <button type="button" className={stepDown ? 'btn danger' : 'btn'} disabled={busy || !target} onClick={handOver}>
              {target
                ? (stepDown ? t('An {name} übergeben', { name: target.displayName }) : t('{name} zur Spielleitung machen', { name: target.displayName }))
                : t('Übergeben')}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}
