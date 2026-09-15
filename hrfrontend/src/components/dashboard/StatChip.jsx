export function StatChip({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: 'var(--white)', fg: 'var(--ink)' },
    blue: { bg: 'var(--blue-tint)', fg: 'var(--blue-deep)' },
    green: { bg: 'var(--green-tint)', fg: 'var(--green)' },
    red: { bg: 'var(--red-tint)', fg: 'var(--red)' },
    amber: { bg: 'var(--amber-tint)', fg: 'var(--amber)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <div
      style={{
        flexShrink: 0,
        minWidth: 104,
        background: t.bg,
        border: tone === 'neutral' ? '1px solid var(--line)' : 'none',
        borderRadius: 'var(--radius-control)',
        padding: '12px 14px',
      }}
    >
      <p style={{ margin: 0, fontSize: 22, fontFamily: 'Manrope, sans-serif', fontWeight: 800, color: t.fg }}>
        {value}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 700, color: tone === 'neutral' ? 'var(--ink-soft)' : t.fg, opacity: 0.85 }}>
        {label}
      </p>
    </div>
  );
}
