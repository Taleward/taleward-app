import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CharacterStatus } from '../api/types';
import { CharacterEditor } from '../characters/CharacterEditor';
import { STATUS_FILTER_LABEL, STATUS_LABEL } from '../characters/labels';
import { CharacterPortrait } from '../characters/Portrait';
import { listCharacters, onCharactersChanged, STATUS_ORDER } from '../characters/store';
import { linkOutdated } from '../characters/sync';
import { ErrorBox, Screen } from '../components/Screen';
import { backupFile, restoreBackup, saveOrShare } from '../characters/backup';
import { t, tn } from '../i18n';

/**
 * „Meine Charaktere“: die eigene Sammlung, unabhängig von Server und Kampagne. Ein Charakter kann in mehreren
 * Kampagnen mitspielen und bleibt erhalten, wenn eine Kampagne endet.
 */
export function CharactersPage() {
  const navigate = useNavigate();
  const [list, setList] = useState(listCharacters);
  const [filter, setFilter] = useState<CharacterStatus | 'all'>('active');
  const [creating, setCreating] = useState(false);
  const [backupError, setBackupError] = useState<unknown>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const save = async () => {
    setBackupError(null);
    try { await saveOrShare(await backupFile(), t('Meine Charaktere')); } catch (e) { setBackupError(e); }
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    setBackupError(null);
    setRestored(null);
    try {
      // Eine Sicherung mit Bildern ist selten größer als ein paar MB
      if (file.size > 30 * 1024 * 1024) throw new Error(t('Die Datei ist zu groß (höchstens {n} MB).', { n: 30 }));
      const r = await restoreBackup(await file.text());
      setRestored(t('Zurückgeholt: {a} neu, {u} aktualisiert, {s} schon aktuell.', { a: r.added, u: r.updated, s: r.unchanged }));
    } catch (e) {
      setBackupError(e);
    }
  };
  useEffect(() => {
    const refresh = () => setList(listCharacters());
    window.addEventListener('session-chronik:connections', refresh);
    const off = onCharactersChanged(refresh);
    return () => { off(); window.removeEventListener('session-chronik:connections', refresh); };
  }, []);

  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, list.filter((c) => c.status === s).length])) as Record<CharacterStatus, number>;
  const showFilter = counts.retired + counts.deceased > 0;
  const shown = list.filter((c) => !showFilter || filter === 'all' || c.status === filter);

  return (
    <Screen nav={false} backTo={{ to: '/', label: t('Kampagnen') }} overline={t('Nur in dieser App')} title={t('Meine Charaktere')}>
      {creating ? (
        <section className="card">
          <h2>{t('Neuer Charakter')}</h2>
          <CharacterEditor submitLabel={t('Anlegen')}
            onSaved={(c) => navigate(`/charaktere/${c.id}`, { replace: true })}
            secondary={{ label: t('Abbrechen'), onClick: () => setCreating(false) }} />
        </section>
      ) : (
        <>
          {list.length === 0 && (
            <div className="empty">
              {t('Hier sammelst du deine Charaktere und nimmst sie in jede Kampagne mit.')}
            </div>
          )}
          {showFilter && (
            <div className="segmented" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }} role="group" aria-label={t('Anzeigen')}>
              {(['active', 'retired', 'deceased', 'all'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
                  {s === 'all' ? t('Alle ({n})', { n: list.length }) : t(STATUS_FILTER_LABEL[s])}
                </button>
              ))}
            </div>
          )}
          <div className="grid-cards">
            {shown.map((c) => {
              const outdated = c.links.some((l) => linkOutdated(c, l));
              return (
                <Link key={c.id} to={`/charaktere/${c.id}`} className="card">
                  <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                    <CharacterPortrait id={c.id} name={c.name} portrait={c.portrait} meta={c.portraitMeta} size={64} faded={c.status !== 'active'} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <h2 style={{ fontSize: 'calc(19px * var(--ts))' }}>{c.name}</h2>
                      <span className="muted small">
                        {[c.nickname && t('„{q}“', { q: c.nickname }), c.system, c.status !== 'active' && t(STATUS_LABEL[c.status])].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </div>
                  {c.summary && <span className="small" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.summary}</span>}
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="muted small">
                      {c.links.length
                        ? tn(c.links.length, 'Spielt in {n} Kampagne', 'Spielt in {n} Kampagnen')
                        : t('Noch in keiner Kampagne')}
                      {c.world.length ? ' · ' + tn(c.world.length, '{n} mitgebrachter Eintrag', '{n} mitgebrachte Einträge') : ''}
                    </span>
                    {outdated && <span className="pill seal">{t('Neuer Stand')}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
          <button type="button" className="btn" onClick={() => setCreating(true)}>{t('Neuer Charakter')}</button>
          <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
            {t('Die Sammlung liegt nur auf diesem Gerät. Private Notizen gehen nie an eine Kampagne.')}
          </p>
          {/* Sicherung: Handy weg oder App gelöscht – dann ist die Datei der einzige Rückweg */}
          <details className="card" open={list.length === 0 || undefined}>
            <summary style={{ fontWeight: 700 }}>{t('Sammlung sichern')}</summary>
            <p className="small" style={{ margin: '8px 0' }}>
              {t('Sichere sie ab und zu als Datei, auf einem neuen Gerät holst du sie damit zurück. Die Datei enthält deine privaten Notizen.')}{' '}
              <span className="muted">{t('Gibt es einen Charakter schon, gewinnt der neuere Stand.')}</span>
            </p>
            <ErrorBox error={backupError} />
            {restored && <span className="small" role="status">{restored}</span>}
            <div className="row wrap" style={{ gap: 8 }}>
              {list.length > 0 && <button type="button" className="btn small outline" onClick={save}>{t('Als Datei sichern')}</button>}
              <label className="btn small outline">
                {t('Aus Datei zurückholen')}
                <input type="file" accept=".json,application/json" onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ''; }}
                  style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} />
              </label>
            </div>
          </details>
        </>
      )}
    </Screen>
  );
}
