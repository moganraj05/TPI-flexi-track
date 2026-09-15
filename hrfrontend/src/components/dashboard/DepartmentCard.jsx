export function DepartmentCard({ dept, onClick }) {
  return (
    <button onClick={onClick} style={styles.card}>
      <div style={styles.top}>
        <span style={styles.code}>{dept.code}</span>
        {dept.livePolls > 0 && <span style={styles.liveDot} />}
      </div>
      <p style={styles.name}>{dept.name}</p>
      <p style={styles.workers}>{dept.workers} workers</p>
      <div style={styles.counts}>
        <span style={{ ...styles.count, color: 'var(--green)' }}>{dept.coming}</span>
        <span style={{ ...styles.count, color: 'var(--red)' }}>{dept.notComing}</span>
        <span style={{ ...styles.count, color: 'var(--amber)' }}>{dept.pending}</span>
      </div>
    </button>
  );
}

const styles = {
  card: {
    textAlign: 'left',
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minHeight: 108,
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  code: {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--blue)',
    background: 'var(--blue-tint)',
    padding: '2px 8px',
    borderRadius: 999,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--green)',
    boxShadow: '0 0 0 3px var(--green-tint)',
  },
  name: {
    margin: '6px 0 0',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'Manrope, sans-serif',
    color: 'var(--ink)',
  },
  workers: {
    margin: 0,
    fontSize: 12,
    color: 'var(--ink-soft)',
  },
  counts: {
    display: 'flex',
    gap: 10,
    marginTop: 6,
    fontSize: 12,
    fontWeight: 800,
    fontFamily: 'Manrope, sans-serif',
  },
  count: {},
};
