export function Pagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  return (
    <div style={styles.wrap}>
      <button
        style={styles.btn}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Prev
      </button>
      <span style={styles.label}>
        Page {page} of {pageCount}
      </span>
      <button
        style={styles.btn}
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  btn: {
    border: '1px solid var(--line)',
    background: 'var(--white)',
    borderRadius: 'var(--radius-control)',
    padding: '8px 16px',
    fontWeight: 700,
    fontSize: 13,
    color: 'var(--ink)',
    minHeight: 40,
  },
  label: {
    fontSize: 12,
    color: 'var(--ink-soft)',
    fontWeight: 600,
  },
};
