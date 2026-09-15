export function EmptyState({ title, message, icon }) {
  return (
    <div
      style={{
        background: 'var(--white)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-card)',
        padding: '32px 20px',
        textAlign: 'center',
        color: 'var(--ink-soft)',
      }}
    >
      {icon}
      <p style={{ margin: '8px 0 4px', fontWeight: 700, color: 'var(--ink)', fontFamily: 'Manrope, sans-serif' }}>
        {title}
      </p>
      {message && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{message}</p>}
    </div>
  );
}
