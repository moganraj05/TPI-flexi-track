import { StatusBadge } from './StatusBadge';
import { Icon } from './Icon';

export function RowCard({ name, subtitle, status, onClick }) {
  return (
    <button onClick={onClick} style={styles.row}>
      <div style={styles.left}>
        <p style={styles.name}>{name}</p>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      </div>
      <div style={styles.right}>
        <StatusBadge status={status} />
        <Icon name="chevronRight" size={18} />
      </div>
    </button>
  );
}

const styles = {
  row: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-control)',
    padding: '12px 14px',
    marginBottom: 8,
    textAlign: 'left',
    minHeight: 44,
    color: 'var(--ink)',
  },
  left: { minWidth: 0 },
  name: {
    margin: 0,
    fontWeight: 700,
    fontSize: 14,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    margin: '2px 0 0',
    fontSize: 12,
    color: 'var(--ink-soft)',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    color: 'var(--ink-soft)',
  },
};
