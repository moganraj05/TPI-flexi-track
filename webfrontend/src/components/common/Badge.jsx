import { theme, SUCCESS, SUCCESS_SOFT, DANGER, DANGER_SOFT, WARNING, WARNING_SOFT, INFO, INFO_SOFT } from '../../theme';

const TONES = {
  neutral: { background: theme.borderColor, color: theme.textSecondary },
  success: { background: SUCCESS_SOFT, color: SUCCESS },
  danger: { background: DANGER_SOFT, color: DANGER },
  warning: { background: WARNING_SOFT, color: WARNING },
  info: { background: INFO_SOFT, color: INFO },
};

// Consolidates the soft-pill badge pattern reimplemented per page today
// (Workforce.jsx's `inactiveBadgeStyle`, AttendanceDetail.jsx's `ANSWER`
// map, theme.js's `warnBadge`) behind one component. Existing pages keep
// their own inline versions for now — this is for new/updated call sites.
export function Badge({ tone = 'neutral', children, style }) {
  const toneStyle = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        ...toneStyle,
        padding: '3px 9px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
