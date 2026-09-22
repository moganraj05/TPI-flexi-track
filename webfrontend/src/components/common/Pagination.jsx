import { theme } from '../../theme';

// `disabled` is optional (defaults to false, matching every existing call
// site's behavior exactly) — pages that refetch on a page change without
// showing a full loading state can pass e.g. TanStack Query's `isFetching`
// so a second tap can't fire an overlapping request while one is in flight.
export function Pagination({ page, pageCount, onChange, disabled = false }) {
  if (pageCount <= 1) return null;
  const prevDisabled = page <= 1 || disabled;
  const nextDisabled = page >= pageCount || disabled;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '14px 0 2px' }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={prevDisabled}
        style={{ ...theme.ghostBtn, opacity: prevDisabled ? 0.45 : 1, cursor: prevDisabled ? 'default' : 'pointer' }}
      >
        ← Prev
      </button>
      <span style={{ fontSize: 12.5, color: theme.textSecondary, fontWeight: 600 }}>
        Page {page} of {pageCount}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={nextDisabled}
        style={{ ...theme.ghostBtn, opacity: nextDisabled ? 0.45 : 1, cursor: nextDisabled ? 'default' : 'pointer' }}
      >
        Next →
      </button>
    </div>
  );
}
