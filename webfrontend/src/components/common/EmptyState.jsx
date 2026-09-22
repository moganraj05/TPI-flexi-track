import { theme, DANGER, DANGER_SOFT } from '../../theme';

const RING_TONE = {
  neutral: { background: theme.bg, color: theme.accent },
  danger: { background: DANGER_SOFT, color: DANGER },
};

// `icon`/`tone` are optional and default to rendering nothing extra — every
// existing call site (LiveBoard, Attendance, Workforce, Reports,
// WorkerDetail, InchargeDetail) that doesn't pass them renders byte-for-byte
// the same as before this was added.
export function EmptyState({ title, message, icon, tone = 'neutral' }) {
  return (
    <div style={{ ...theme.card, textAlign: 'center', padding: 40 }}>
      {icon && (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            margin: '0 auto 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 800,
            ...(RING_TONE[tone] || RING_TONE.neutral),
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 700, color: theme.textPrimary }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6 }}>{message}</div>}
    </div>
  );
}
