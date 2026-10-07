import { theme } from '../../theme';
import brandMark from '../../assets/brand-mark.svg';

// The split brand-panel + card layout shared by every signed-out screen
// (sign in, create account, forgot password), so they read as one flow.
export function AuthLayout({ children }) {
  return (
    <div className="ft-auth" style={theme.loginPage}>
      <div className="ft-auth-brand" style={theme.loginLeftPanel}>
        <img src={brandMark} alt="" style={theme.loginWatermark} aria-hidden="true" />
        <div style={theme.loginLogoGlow} aria-hidden="true" />
        <div style={{ position: 'relative' }}>
          <div style={theme.loginBadge}>Ops Console</div>
          <img className="ft-auth-logo" src={brandMark} alt="" style={{ width: 88, height: 88, display: 'block', marginBottom: 20 }} />
          <div className="ft-auth-name" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>FlexiTrack</div>
        </div>
      </div>

      <div className="ft-auth-main" style={theme.loginRightPanel}>{children}</div>
    </div>
  );
}

export function AuthHeading({ title, subtitle }) {
  return (
    <>
      <div style={{ fontSize: 22, fontWeight: 800, color: theme.textPrimary }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: theme.mutedColor, marginTop: 4, marginBottom: 8 }}>{subtitle}</div>}
    </>
  );
}

// "Step 2 of 3" progress dots for the multi-step flows.
export function StepDots({ step, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }} aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            height: 4,
            flex: 1,
            borderRadius: 2,
            background: i < step ? theme.accent : theme.borderColor,
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  );
}
