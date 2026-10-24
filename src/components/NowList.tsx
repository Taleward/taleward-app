import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../i18n';

/** Eine Aufgabe im Block „Jetzt dran“: führt auf eine Seite (to) oder klappt die Entscheidung auf (detail) */
export interface NowItem {
  key: string;
  label: string;
  to?: string;
  detail?: ReactNode;
  /** Die Karte im Aufklapper wiederholt die Zeile als Überschrift – dann ausblenden */
  hideDetailTitle?: boolean;
}

/**
 * „Jetzt dran (n)“ oben auf der Übersicht: eine kurze Zeile je Aufgabe statt einer Karte mit
 * eigenen Knöpfen. Entschieden wird auf der Zielseite oder im Aufklapper, nicht in der Liste.
 */
export function NowList({ items }: { items: NowItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="card now-list" aria-labelledby="now-title" data-tour="now">
      <h2 id="now-title" className="overline">{t('Jetzt dran ({n})', { n: items.length })}</h2>
      <ul>
        {items.map((i) => (
          <li key={i.key}>
            {i.to ? (
              <Link className="now-row" to={i.to}>
                <span>{i.label}</span>
                <span aria-hidden="true" className="now-go">›</span>
              </Link>
            ) : (
              <details className="now-fold">
                <summary>{i.label}</summary>
                <div className={i.hideDetailTitle ? 'now-detail no-title' : 'now-detail'}>{i.detail}</div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
