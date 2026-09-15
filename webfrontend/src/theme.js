// Design tokens ported from the FlexiTrack Claude Design canvas (charcoal palette,
// dark sidebar, comfortable density — the canvas's default combination).

const FONT = "'Manrope',sans-serif";
const MONO = "'IBM Plex Mono',monospace";

const PAL = {
  accent: '#264653',
  accentSoft: '#95bece',
  sidebarBg: '#0f1c22',
  sidebarText: '#cadee7',
  sidebarMuted: '#609db6',
  sidebarActiveBg: '#1f3943',
  bg: '#cadee7',
  surface: '#ffffff',
  border: '#95bece',
  textPrimary: '#080e11',
  textSecondary: '#3f7489',
};

const D = { row: 14, card: 20, gap: 16 };

export const SUCCESS = '#16a34a';
export const SUCCESS_SOFT = '#dcfce7';
export const DANGER = '#dc2626';
export const DANGER_SOFT = '#fee2e2';
export const WARNING = '#b45309';
export const WARNING_SOFT = '#fef3c7';

// Soft chip colors cycled by department code so any real department (not just a
// fixed hardcoded list) still gets a distinct, readable chip.
const CHIP_COLORS = [
  { bg: '#95bece', text: '#080e11' },
  { bg: '#9de5dc', text: '#081f1d' },
  { bg: '#fbdac0', text: '#401f04' },
  { bg: '#f5c5b9', text: '#371107' },
  { bg: '#f6e7c3', text: '#3b2c09' },
  { bg: '#d6c8f0', text: '#251a3d' },
];

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function chipStyle(code) {
  const c = code ? CHIP_COLORS[hashCode(code) % CHIP_COLORS.length] : { bg: PAL.border, text: PAL.textSecondary };
  return { background: c.bg, color: c.text, padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700, letterSpacing: '0.02em' };
}

export function navButtonStyle(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    textAlign: 'left', fontFamily: FONT, fontSize: 13.5, fontWeight: active ? 700 : 600,
    background: active ? PAL.sidebarActiveBg : 'transparent',
    color: active ? '#ffffff' : PAL.sidebarText,
  };
}

export function filterBtnStyle(active) {
  return {
    padding: '7px 13px', borderRadius: 20, border: `1px solid ${active ? PAL.accent : PAL.border}`,
    background: active ? PAL.accent : 'transparent', color: active ? '#fff' : PAL.textSecondary,
    fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap', flexShrink: 0,
  };
}

export function barSegStyle(pct, color) {
  return { width: `${Number.isFinite(pct) ? pct : 0}%`, background: color };
}

export function avatarStyle(size) {
  const s = size || 32;
  return {
    width: s, height: s, borderRadius: '50%', background: PAL.accentSoft, color: PAL.accent,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
    fontSize: s > 40 ? 18 : 11.5, flexShrink: 0,
  };
}

export const theme = {
  font: FONT, mono: MONO,
  accent: PAL.accent, mutedColor: PAL.textSecondary, borderColor: PAL.border,
  textPrimary: PAL.textPrimary, textSecondary: PAL.textSecondary, surface: PAL.surface, bg: PAL.bg,

  loginPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAL.bg, fontFamily: FONT, padding: 20 },
  loginCard: { width: '100%', maxWidth: 380, background: PAL.surface, border: `1px solid ${PAL.border}`, borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  loginBrandRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 },
  loginMark: { width: 34, height: 34, borderRadius: 9, background: PAL.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: PAL.textSecondary, marginBottom: 6, marginTop: 14 },
  input: { width: '100%', padding: '11px 12px', borderRadius: 8, border: `1px solid ${PAL.border}`, fontSize: 14, fontFamily: FONT, color: PAL.textPrimary, background: PAL.bg, outline: 'none' },
  primaryBtn: { width: '100%', marginTop: 22, padding: '12px 16px', borderRadius: 8, border: 'none', background: PAL.accent, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT },
  primaryBtnInline: { padding: '10px 16px', borderRadius: 8, border: 'none', background: PAL.accent, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT },
  dangerBtn: { padding: '10px 16px', borderRadius: 8, border: `1px solid ${DANGER}`, background: 'transparent', color: DANGER, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT },

  appShell: { display: 'flex', height: '100vh', fontFamily: FONT, background: PAL.bg },
  sidebar: { width: 232, flexShrink: 0, background: PAL.sidebarBg, borderRight: '1px solid transparent', display: 'flex', flexDirection: 'column', padding: '20px 14px', gap: 4 },
  sidebarBrandRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 20px' },
  sidebarBrandColor: '#ffffff', sidebarMuted: PAL.sidebarMuted,
  navList: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  sidebarLogout: { marginTop: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: PAL.sidebarMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' },
  mainCol: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', borderBottom: `1px solid ${PAL.border}`, background: PAL.surface, flexShrink: 0 },
  liveRow: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 },
  liveDot: { width: 7, height: 7, borderRadius: '50%', background: SUCCESS, display: 'inline-block', animation: 'livepulse 1.6s ease-in-out infinite' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: PAL.accentSoft, color: PAL.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 },
  content: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: D.gap + 6 },

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: D.gap },
  sectionHeader: { fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: PAL.textSecondary, marginTop: 6 },
  pollStrip: { display: 'flex', gap: D.gap, overflowX: 'auto', paddingBottom: 4 },
  pollStripCard: { minWidth: 260, flex: '0 0 auto', background: PAL.surface, border: `1px solid ${PAL.border}`, borderRadius: 12, padding: D.card },
  pollStripHead: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  warnBadge: { background: WARNING_SOFT, color: WARNING, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 },
  progressTrack: { display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: PAL.border },
  legendRow: { display: 'flex', gap: 14, fontSize: 12, fontWeight: 600, marginTop: 8, flexWrap: 'wrap' },
  plantGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: D.gap },
  card: { background: PAL.surface, border: `1px solid ${PAL.border}`, borderRadius: 12, padding: D.card },
  clickableCard: { background: PAL.surface, borderWidth: 1, borderStyle: 'solid', borderColor: PAL.border, borderRadius: 12, padding: D.card, cursor: 'pointer', textAlign: 'left', fontFamily: FONT, display: 'block', width: '100%' },
  filterRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  liveCardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  liveCardHeadRight: { display: 'flex', alignItems: 'center', gap: 10 },
  ghostBtn: { padding: '6px 12px', borderRadius: 7, border: `1px solid ${PAL.border}`, background: 'transparent', color: PAL.textPrimary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT },
  backBtn: { alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 7, border: `1px solid ${PAL.border}`, background: PAL.surface, color: PAL.textPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT },
  rosterCols: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 14, borderTop: `1px solid ${PAL.border}`, paddingTop: 14 },
  rosterColHead: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 },
  rosterRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 8px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: FONT, marginBottom: 2 },
  rosterPersonInfo: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  rosterPersonName: { fontSize: 13, fontWeight: 700, color: PAL.textPrimary },
  rosterPersonTag: { fontSize: 11.5, color: PAL.textSecondary },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  tableHeadRow: { background: PAL.bg },
  th: { textAlign: 'left', padding: `${D.row}px 16px`, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: PAL.textSecondary, borderBottom: `1px solid ${PAL.border}` },
  tr: { borderBottom: `1px solid ${PAL.border}` },
  td: { padding: `${D.row}px 16px`, color: PAL.textPrimary },
  groupHead: { display: 'flex', alignItems: 'center', gap: 10, padding: D.card, flexWrap: 'wrap' },
  nameLinkBtn: { background: 'none', border: 'none', padding: 0, color: PAL.textPrimary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', textDecoration: 'none' },
  settingsRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${PAL.border}`, fontSize: 14, color: PAL.textPrimary },
  settingsLabel: { color: PAL.textSecondary, fontWeight: 600 },
  detailHeaderRow: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 },
  toast: { position: 'fixed', bottom: 24, right: 24, background: PAL.textPrimary, color: PAL.surface, padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 60, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' },
  errorText: { color: DANGER, fontSize: 13, marginTop: 10 },
};
