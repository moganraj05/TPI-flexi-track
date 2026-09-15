import { theme } from '../../theme';

export function EmptyState({ title, message }) {
  return (
    <div style={{ ...theme.card, textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: theme.textPrimary }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6 }}>{message}</div>}
    </div>
  );
}
