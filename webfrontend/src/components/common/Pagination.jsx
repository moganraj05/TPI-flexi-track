import { theme } from '../../theme';

export function Pagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '14px 0 2px' }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        style={{ ...theme.ghostBtn, opacity: page <= 1 ? 0.45 : 1, cursor: page <= 1 ? 'default' : 'pointer' }}
      >
        ← Prev
      </button>
      <span style={{ fontSize: 12.5, color: theme.textSecondary, fontWeight: 600 }}>
        Page {page} of {pageCount}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        style={{ ...theme.ghostBtn, opacity: page >= pageCount ? 0.45 : 1, cursor: page >= pageCount ? 'default' : 'pointer' }}
      >
        Next →
      </button>
    </div>
  );
}
