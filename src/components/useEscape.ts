import { useEffect, useRef } from 'react';

// Zuletzt geöffnetes Vollbild zuerst: nur das oberste reagiert
const stack: object[] = [];

/**
 * Escape schließt ein Vollbild-Fenster. Die Android-Zurück-Taste schickt bei offenem `aria-modal` ein Escape
 * (BackButton.tsx) – ohne diesen Haken blieb sie dort wirkungslos. Liegt das Vollbild über einem Dialog, schließt
 * nur das Vollbild (Abfangen vor den übrigen Escape-Hörern).
 */
export function useEscape(onEscape: () => void): void {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    const me = {};
    stack.push(me);
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== me) return;
      e.stopImmediatePropagation();
      ref.current();
    };
    window.addEventListener('keydown', on, true);
    return () => {
      window.removeEventListener('keydown', on, true);
      stack.splice(stack.indexOf(me), 1);
    };
  }, []);
}
