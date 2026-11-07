import { tn } from '../i18n';
import { isTooQuiet } from './quiet';

/** Schmaler Pegelstreifen unter der Uhr: zeigt nur, dass das Mikrofon etwas hört (für Screenreader ohne Bedeutung) */
export function MicLevel({ level }: { level: number | undefined }) {
  if (level === undefined) return null;
  return (
    <div className="mic-level" aria-hidden>
      <span style={{ width: `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%` }} />
    </div>
  );
}

/** Ruhiger Hinweis, wenn 90 s nichts zu hören war – kein Ton, kein Fenster, verschwindet von selbst */
export function QuietNote({ quietMs }: { quietMs: number | undefined }) {
  if (!isTooQuiet(quietMs)) return null;
  const min = Math.max(1, Math.floor((quietMs ?? 0) / 60_000));
  return (
    <div className="notice warn" role="status">
      {tn(min, 'Das Mikrofon hört seit einer Minute nichts. Liegt das Handy frei? Nutzt gerade eine andere App das Mikrofon, etwa ein Anruf?',
        'Das Mikrofon hört seit {n} Minuten nichts. Liegt das Handy frei? Nutzt gerade eine andere App das Mikrofon, etwa ein Anruf?')}
    </div>
  );
}
