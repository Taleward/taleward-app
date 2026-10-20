import { siDiscord } from 'simple-icons';
import type { AuthProviderId } from '../api/types';
import { t } from '../i18n';

/*
 * Knopf „Mit Google anmelden“ usw. Die Anbieter schreiben Logo und Gestaltung vor – die offiziellen Zeichen liegen
 * unverändert unter src/assets/providers/<id>.svg (Google: Zeichen aus dem Paket „Sign in with Google“ ohne den
 * Knopfrahmen; Microsoft: „MS-SymbolLockup“). Discord kommt aus dem Paket simple-icons in seiner Markenfarbe.
 * Fehlt ein Zeichen, steht nur der Text da. Die Marken gehören ihren Inhabern (NOTICE.md).
 */
const icons = import.meta.glob('../assets/providers/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const iconFor = (id: string) => icons[Object.keys(icons).find((k) => k.endsWith(`/${id}.svg`)) ?? ''] ?? null;

function ProviderIcon({ id }: { id: AuthProviderId }) {
  if (id === 'discord') {
    return (
      <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={siDiscord.path} fill={`#${siDiscord.hex}`} />
      </svg>
    );
  }
  const icon = iconFor(id);
  return icon ? <img src={icon} alt="" width={20} height={20} /> : null;
}

export function ProviderButton({ id, name, onClick, disabled, label }: {
  id: AuthProviderId;
  name: string;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button type="button" className="btn outline" disabled={disabled} onClick={onClick}
      style={{ justifyContent: 'center', gap: 10, fontWeight: 500 }}>
      <ProviderIcon id={id} />
      {label ?? t('Mit {name} anmelden', { name })}
    </button>
  );
}
