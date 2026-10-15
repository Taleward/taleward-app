import { locale, t } from '../i18n';
import { Fragment, useEffect, useState } from 'react';
import type { Recap } from '../api/types';
import { IconSpeaker } from './Icons';
import { Divider } from './Screen';
import { PartHeading } from './PartHeading';
import { partTitles, speechText } from '../review/parts';
import { ReadSettings, pageAttrs, useReadPrefs } from '../reading/ReadSettings';

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) : t('Entwurf');
}

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** playedAt: Spieltag – wichtiger als der Tag der Veröffentlichung */
export function RecapView({ recap, collapsible, playedAt }: { recap: Recap; collapsible?: boolean; playedAt?: string | null }) {
  const paragraphs = recap.text.split(/\n\s*\n/);
  const titles = partTitles(recap.parts, paragraphs.length, recap.title);
  const [open, setOpen] = useState(!collapsible);
  const [speaking, setSpeaking] = useState(false);
  const [prefs, setPrefs] = useReadPrefs();
  const [settings, setSettings] = useState(false);
  const settingsId = `lesen-${recap.sessionId}`;

  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel(); }, []);

  const speak = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(speechText(recap.title, recap.text, recap.parts));
    u.lang = locale();
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  const shown = open ? paragraphs : paragraphs.slice(0, 1);

  return (
    <article className="card reading-page" style={{ gap: 10 }} {...pageAttrs(prefs)}>
      <div className="overline">
        {t('Kapitel {n}', { n: recap.number })} · {playedAt ? t('Gespielt am {date}', { date: formatDate(playedAt) }) : formatDate(recap.publishedAt)}
      </div>
      <h2 style={{ fontSize: 21 }}>{recap.title}</h2>
      <Divider />
      <div className="recap" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {shown.map((p, i) => (
          <Fragment key={i}>
            {titles.has(i) && <PartHeading title={titles.get(i)!} />}
            <p>{p}</p>
          </Fragment>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
        {collapsible && paragraphs.length > 1 && (
          <button type="button" className="btn small outline" onClick={() => setOpen(!open)}>
            {open ? t('Weniger anzeigen') : t('Weiterlesen')}
          </button>
        )}
        {canSpeak && (
          <button type="button" className="btn small" onClick={speak}>
            <IconSpeaker /> {speaking ? t('Vorlesen stoppen') : t('Vorlesen')}
          </button>
        )}
        {/* Wie das „Aa“ in Lese-Apps: Schriftgröße und Seite nur für den Kapiteltext */}
        <button type="button" className="btn small ghost read-aa" aria-expanded={settings} aria-controls={settingsId}
          aria-label={t('Lesen anpassen')} onClick={() => setSettings(!settings)}>
          <span aria-hidden="true">Aa</span>
        </button>
      </div>
      {settings && <ReadSettings id={settingsId} prefs={prefs} onChange={setPrefs} />}
    </article>
  );
}

export function OpenThreads({ threads }: { threads: string[] }) {
  if (!threads.length) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2>{t('Offene Fäden')}</h2>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {threads.map((t) => <li key={t} className="thread">{t}</li>)}
      </ul>
    </section>
  );
}
