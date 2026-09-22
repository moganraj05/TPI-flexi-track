// FlexiTrack web design tokens — the formal source of truth for color,
// spacing, radius, elevation and motion values. theme.js's existing style
// objects/exports (theme.ghostBtn, SUCCESS, chipStyle(), etc.) are built on
// top of these, so every current call site keeps working unchanged; this
// file exists so new shared components have named values to build on
// instead of inventing their own one-off numbers.

export const colors = {
  accent: '#264653',
  accentSoft: '#95bece',
  sidebarBg: '#0f1c22',
  sidebarText: '#cadee7',
  sidebarMuted: '#609db6',
  sidebarActiveBg: '#1f3943',
  background: '#cadee7',
  surface: '#ffffff',
  border: '#95bece',
  textPrimary: '#080e11',
  textSecondary: '#3f7489',
  // A muted tone for disabled surfaces — between `border` and `background`
  // so a disabled control still reads as part of the same palette.
  disabled: '#b7c9d1',

  success: '#16a34a',
  successSoft: '#dcfce7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  // New — no "informational" status existed before (only success/danger/
  // warning). Kept distinct from `accent` (teal) so it reads as its own
  // status rather than a second brand color.
  info: '#2563eb',
  infoSoft: '#dbeafe',
};

export const spacing = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 20 };

// Approximate rendered height of the app's existing inputs/buttons (padding
// + line-height) — named so new components can target a deliberate height
// instead of arriving at one by accident.
export const controlHeight = { sm: 32, md: 40, lg: 48 };

// Reuses the two shadow values already in theme.js (loginCard, modalCard)
// plus one new "raised" step for hover/dropdown-style elevation that
// nothing currently has a token for.
export const elevation = {
  card: '0 1px 3px rgba(0,0,0,0.06)',
  raised: '0 4px 12px rgba(0,0,0,0.10)',
  modal: '0 20px 50px rgba(0,0,0,0.35)',
};

export const duration = { fast: 120, normal: 180, slow: 240 };
export const easing = { standard: 'ease-out', decelerate: 'cubic-bezier(0.16, 1, 0.3, 1)' };

export const status = { positive: colors.success, negative: colors.danger, pending: colors.warning };
