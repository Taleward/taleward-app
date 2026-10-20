import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLive, onLiveChange, type LiveRecording } from './live';

/** Laufende Browser-Aufnahme; tick: jede Sekunde neu zeichnen (Zeit, Pause) */
export function useLive(tick = false): LiveRecording | null {
  const live = useSyncExternalStore(onLiveChange, getLive);
  const [, setN] = useState(0);
  useEffect(() => {
    if (!tick || !live) return;
    const id = window.setInterval(() => setN((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [tick, live]);
  return live;
}
