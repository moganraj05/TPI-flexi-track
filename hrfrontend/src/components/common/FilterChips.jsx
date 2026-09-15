export function FilterChips({ options, value, onChange }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 4,
        marginBottom: 14,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 999,
              border: active ? '1px solid var(--blue)' : '1px solid var(--line)',
              background: active ? 'var(--blue-tint)' : 'var(--white)',
              color: active ? 'var(--blue)' : 'var(--ink-soft)',
              fontSize: 13,
              fontWeight: 700,
              minHeight: 36,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
