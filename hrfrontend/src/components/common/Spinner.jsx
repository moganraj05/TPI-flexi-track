export function Spinner({ size = 28 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '3px solid var(--blue-tint)',
        borderTopColor: 'var(--blue)',
        animation: 'spin 0.7s linear infinite',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function CenteredSpinner({ label }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '48px 0',
        color: 'var(--ink-soft)',
      }}
    >
      <Spinner />
      {label && <p style={{ margin: 0, fontSize: 13 }}>{label}</p>}
    </div>
  );
}
