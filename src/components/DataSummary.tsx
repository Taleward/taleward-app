import { apiAtLeast, currentConnection } from '../api/connections';
import { isMusterUrl } from '../api/muster';
import type { Campaign, ServerInfo } from '../api/types';
import { retentionSentence } from '../consent';
import { t } from '../i18n';
import { cloudUse } from './CloudNotice';

/**
 * „Was mit deinen Daten passiert“: alle Einstellungen der Runde, die Spielerinnen betreffen, an einem Ort und nur
 * lesend (Idee Sicherheits-Chat 13.10., Stufe 1). Quelle der Wahrheit ist der Server: Kampagne und ServerInfo.
 * Ändern kann es nur die SL unter „Kampagne verwalten“.
 */
export function DataSummary({ campaign, info, gm }: { campaign: Campaign; info: ServerInfo | null; gm: boolean }) {
  const cloud = cloudUse(info, campaign);
  const rows: { title: string; text: string }[] = [
    {
      title: t('Aufnahmen'),
      // Ohne Angaben des Servers (z. B. ohne Netz) nichts zur Aufbewahrung behaupten (Sicherheit A17)
      text: t('Aufgenommen wird nur, wenn alle am Tisch selbst zugestimmt haben.') + ' ' + (info
        ? retentionSentence({ retention: info.audioRetention })
        : t('Wie lange die Aufnahme auf dem Server bleibt, steht hier, sobald der Server erreichbar ist.'))
    },
    {
      title: t('Abschrift'),
      text: !info && campaign.allowExternalTranscription
        ? t('Für diese Kampagne ist die Cloud erlaubt, die Abschrift entsteht also möglicherweise dort.')
        : !cloud.transcription
        ? t('Die Abschrift entsteht ohne Cloud, auf eurem Server oder einem Worker der Runde.')
        : cloud.transcription.primary
          ? t('Die Abschrift entsteht über {provider}. Dafür geht die Aufnahme dorthin.', { provider: cloud.transcription.provider })
          : t('Die Abschrift entsteht ohne Cloud. Nur wenn 24 Stunden lang kein Worker erreichbar ist, nutzt der Server als Ausweichlösung {provider}.', { provider: cloud.transcription.provider })
    },
    {
      title: t('Kapitel'),
      text: !info && campaign.allowCloudSummary
        ? t('Für diese Kampagne ist die Cloud erlaubt, Kapitel und Vorschläge entstehen also möglicherweise dort. Dorthin geht nur Text, keine Aufnahme.')
        : cloud.summary
        ? t('Kapitel und Vorschläge schreibt {provider}. Dorthin geht nur Text, keine Aufnahme.', { provider: cloud.summary.provider })
        : t('Kapitel und Vorschläge entstehen ohne Cloud, mit einem lokalen Modell.')
    }
  ];
  if (apiAtLeast('0.4.18')) {
    rows.push({
      title: t('Charakterbögen und Hintergründe'),
      text: campaign.allowCharacterAnalysis
        ? t('Ausgewertet wird nur, was du selbst abgibst und die Spielleitung zulässt. Daraus werden Vorschläge für die Bibel, über die die Spielleitung entscheidet.')
        : t('Werden in dieser Kampagne nicht ausgewertet.')
    });
  }
  rows.push({
    title: t('Geheimes'),
    text: t('Notizen der Spielleitung, offene Vorschläge und die Abschrift sieht nur die Spielleitung. Deine privaten Notizen in der Sammlung verlassen dein Gerät nie – außer in Sicherungen, die du selbst speicherst.')
  });

  return (
    <details className="card data-summary" style={{ gap: 10 }}>
      <summary style={{ fontWeight: 700 }}>{t('Was mit deinen Daten passiert')}</summary>
      <dl style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 0' }}>
        {rows.map((r) => (
          <div key={r.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <dt className="overline">{r.title}</dt>
            <dd className="small" style={{ margin: 0 }}>{r.text}</dd>
          </div>
        ))}
      </dl>
      <span className="muted small">
        {isMusterUrl(currentConnection().baseUrl)
          ? t('In der Musterkampagne gibt es nichts einzustellen.')
          : gm
          ? t('So sehen es alle am Tisch. Ändern kannst du es unter „Kampagne verwalten“ → „Einstellungen“.')
          : t('Diese Einstellungen legt die Spielleitung fest.')}
      </span>
    </details>
  );
}
