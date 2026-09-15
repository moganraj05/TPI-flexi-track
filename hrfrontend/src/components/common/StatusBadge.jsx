const STATUS_MAP = {
  coming: { label: 'Coming', bg: 'var(--green-tint)', fg: 'var(--green)' },
  yes: { label: 'Coming', bg: 'var(--green-tint)', fg: 'var(--green)' },
  not_coming: { label: 'Not coming', bg: 'var(--red-tint)', fg: 'var(--red)' },
  no: { label: 'Not coming', bg: 'var(--red-tint)', fg: 'var(--red)' },
  pending: { label: 'No response', bg: 'var(--amber-tint)', fg: 'var(--amber)' },
  open: { label: 'Open', bg: 'var(--blue-tint)', fg: 'var(--blue)' },
  closed: { label: 'Closed', bg: '#EEF0F4', fg: 'var(--ink-soft)' },
  not_open: { label: 'Not open yet', bg: '#EEF0F4', fg: 'var(--ink-soft)' },
};

export function StatusBadge({ status, children }) {
  const meta = STATUS_MAP[status] || { label: children || status, bg: '#EEF0F4', fg: 'var(--ink-soft)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: meta.bg,
        color: meta.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children || meta.label}
    </span>
  );
}
