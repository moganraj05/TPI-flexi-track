import { useState } from 'react';
import { theme } from '../../theme';

const EyeIcon = ({ off }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M9.9 4.2A9.6 9.6 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
      </>
    ) : (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

// A password field with a show/hide (eye) button. Takes every normal <input>
// prop; `style` styles the input itself. Pass `visible`/`onToggle` to let
// several fields (password + confirm) share one setting.
export function PasswordInput({ style, visible, onToggle, ...inputProps }) {
  const [ownVisible, setOwnVisible] = useState(false);
  const shown = visible ?? ownVisible;
  const toggle = onToggle ?? (() => setOwnVisible((v) => !v));

  return (
    <div style={{ position: 'relative' }}>
      <input {...inputProps} type={shown ? 'text' : 'password'} style={{ ...style, paddingRight: 44 }} />
      <button
        type="button"
        onClick={toggle}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        title={shown ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 34,
          height: 34,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 6,
          background: 'transparent',
          color: theme.mutedColor,
          cursor: 'pointer',
        }}
      >
        <EyeIcon off={shown} />
      </button>
    </div>
  );
}
