import { theme, WARNING_SOFT } from '../../theme';
import { useOnline } from '../../hooks/useOnline';

// Shown across the top of the console while the device is offline: pages
// keep showing the data saved on this device, and changes are refused with a
// clear message (api/client.js) until the connection is back — then every
// page refreshes by itself.
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '8px 16px',
        background: WARNING_SOFT,
        color: theme.textPrimary,
        borderBottom: `1px solid ${theme.borderColor}`,
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'center',
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8a15 15 0 0 0-11.3-3.7M12 20h.01" />
      </svg>
      <span>
        <b>You&apos;re offline.</b> Showing data saved on this device · changes are paused until you&apos;re back online.
      </span>
    </div>
  );
}
