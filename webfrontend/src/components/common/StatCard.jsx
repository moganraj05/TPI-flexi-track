import { theme } from '../../theme';

export function StatCard({ label, value, color }) {
  return (
    <div style={theme.card}>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontFamily: theme.mono, color: color || theme.textPrimary }}>
        {value}
      </div>
    </div>
  );
}
