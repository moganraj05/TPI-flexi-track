import { countdown, shiftLabel } from '../../utils/format';

export function LivePollCard({ poll, onClick, wide = false }) {
  const s = poll.summary || {};
  return (
    <button onClick={onClick} style={{ ...styles.card, minWidth: wide ? '100%' : 220 }}>
      <div style={styles.header}>
        <span style={styles.liveDot} />
        <span style={styles.live}>LIVE</span>
        <span style={styles.countdown}>{countdown(poll.closesAt)}</span>
      </div>
      <p style={styles.dept}>{poll.department?.name || 'Department'}</p>
      <p style={styles.shift}>{shiftLabel(poll)}</p>
      <div style={styles.counts}>
        <span style={{ color: 'var(--green)' }}>{s.coming ?? 0} yes</span>
        <span style={{ color: 'var(--red)' }}>{s.notComing ?? 0} no</span>
        <span style={{ color: 'var(--amber)' }}>{s.pending ?? 0} pending</span>
      </div>
    </button>
  );
}

const styles = {
  card: {
    flexShrink: 0,
    textAlign: 'left',
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: 14,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--green)',
  },
  live: {
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--green)',
    letterSpacing: '0.05em',
  },
  countdown: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--ink-soft)',
  },
  dept: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    fontFamily: 'Manrope, sans-serif',
  },
  shift: {
    margin: '2px 0 8px',
    fontSize: 12,
    color: 'var(--ink-soft)',
  },
  counts: {
    display: 'flex',
    gap: 10,
    fontSize: 12,
    fontWeight: 700,
  },
};
