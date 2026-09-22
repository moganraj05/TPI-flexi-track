import { theme, SUCCESS, DANGER, WARNING, INFO } from '../../theme';
import { elevation } from '../../tokens';

const TONE_COLOR = {
  neutral: theme.textPrimary,
  success: SUCCESS,
  danger: DANGER,
  warning: WARNING,
  info: INFO,
};

// `color` (a raw hex) is still accepted for backward compatibility with any
// existing call — `tone` is the preferred, semantic way to pick a status
// color going forward. Only Dashboard.jsx uses this component today.
export function StatCard({ label, value, color, tone = 'neutral', hint }) {
  const valueColor = color || TONE_COLOR[tone] || TONE_COLOR.neutral;

  return (
    <div className="ft-card-hover" style={{ ...theme.card, boxShadow: elevation.card }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </div>
      <div
        key={value}
        className="ft-fade-in"
        style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontFamily: theme.mono, color: valueColor }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: theme.mutedColor, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
