// ─── Design Tokens — Éloquence Dark Mode ──────────────────────────────────────
// Référence visuelle : Linear, Notion

export const Colors = {
  // Fonds
  base:    '#0E0E0F',
  surface: '#161618',
  elevated:'#1E1E21',
  border:  '#2A2A2E',

  // Texte
  textPrimary:   '#F0EEE8',
  textSecondary: '#888780',
  textTertiary:  '#555553',

  // Accents
  accent:      '#4F6EF7',
  accentMuted: '#0D1A3A',

  // Sémantique
  success:      '#4ADE80',
  successMuted: '#0A2A0F',
  warning:      '#F59E0B',
  warningMuted: '#2A1A00',
  danger:       '#EF4444',
  dangerMuted:  '#2A0A0A',
  premium:      '#8B5CF6',
} as const;

export const Radius = {
  sm:   8,
  md:   10,
  lg:   14,
  pill: 20,
} as const;

export const FontSize = {
  xs:  11,
  sm:  12,
  base:13,
  md:  14,
  lg:  16,
  xl:  18,
  xxl: 22,
} as const;

export const FontWeight = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
} as const;

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
} as const;

// ─── Type icons ────────────────────────────────────────────────────────────────

export const TypeColors = {
  salon:        { bg: '#1A2A4A', emoji: '🏛' },
  anniversaire: { bg: '#2A1A0A', emoji: '🎂' },
  anniv:        { bg: '#2A1A0A', emoji: '🎂' },
  auto:         { bg: '#1A2A1A', emoji: '🚗' },
  default:      { bg: '#1E1E21', emoji: '📌' },
} as const;

// ─── Score helpers ─────────────────────────────────────────────────────────────

export function scoreStyle(score: number): { color: string; bg: string } {
  if (score >= 80) return { color: Colors.success, bg: Colors.successMuted };
  if (score >= 60) return { color: Colors.accent,  bg: Colors.accentMuted  };
  return              { color: Colors.warning,  bg: Colors.warningMuted };
}

// ─── Qualif helpers ───────────────────────────────────────────────────────────

export const QualifColors: Record<string, string> = {
  'Qualifié chaud':  Colors.success,
  'À contacter':     Colors.accent,
  'Nouveau':         Colors.warning,
  'Non qualifié':    Colors.textTertiary,
  'Qualifié froid':  Colors.warning,
  'Non pertinent':   Colors.textTertiary,
};
