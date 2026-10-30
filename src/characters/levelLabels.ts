import { tk } from '../i18n';
import type { LevelKind } from './levelField';

export const LEVEL_LABEL: Record<LevelKind, string> = {
  class: tk('Klasse und Stufe (optional)'),
  experience: tk('Erfahrungsgrad (optional)'),
  herograde: tk('Heldengrad (optional)'),
  level: tk('Stufe (optional)')
};

export const LEVEL_PLACEHOLDER: Record<LevelKind, string | null> = {
  class: null,
  experience: tk('z. B. Erfahren'),
  herograde: tk('z. B. 2'),
  level: null
};
