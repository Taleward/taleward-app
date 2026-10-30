import { tk } from '../i18n';
import type { LevelKind } from './levelField';

export const LEVEL_LABEL: Record<LevelKind, string> = {
  class: tk('Klasse und Stufe (optional)'),
  experience: tk('Erfahrungsgrad (optional)'),
  herograde: tk('Heldengrad (optional)'),
  level: tk('Stufe (optional)')
};

export const LEVEL_PLACEHOLDER: Record<LevelKind, string | null> = {
  class: tk('z. B. Magierin 3 / Schurkin 2'),
  experience: tk('z. B. Erfahren'),
  herograde: tk('z. B. 2'),
  level: null
};
