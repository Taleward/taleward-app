import { tn } from '../i18n';
import { isTooQuiet } from './quiet';

/** Eine Zeile, wenn 90 s nichts zu hören war – kein Ton, kein Fenster, verschwindet von selbst. Die Aura steht dann still. */
export function QuietNote({ quietMs }: { quietMs: number | undefined }) {
  if (!isTooQuiet(quietMs)) return null;
  const min = Math.max(1, Math.floor((quietMs ?? 0) / 60_000));
  return (
    <p className="rec-quiet" role="status" style={{ margin: 0, textAlign: 'center' }}>
      {tn(min, 'Das Mikrofon hört seit einer Minute nichts.', 'Das Mikrofon hört seit {n} Minuten nichts.')}
    </p>
  );
}
