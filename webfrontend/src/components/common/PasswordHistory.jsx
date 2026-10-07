import { Link } from 'react-router-dom';
import { theme, WARNING, WARNING_SOFT } from '../../theme';
import { roleTag } from '../../utils/roles';
import { Badge } from './Badge';

const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : null;

// Plain-language names for the password events in the audit log.
const EVENT_LABELS = {
  'member.created': 'Account created',
  'member.password_reset': 'Temporary password issued by HR',
  'member.password_change_required': 'New password required',
  'auth.worker_password_changed': 'Set their own password',
  'auth.reset_requested': 'Asked for a password reset',
  'auth.reset_request_approved': 'Reset request approved',
  'auth.reset_request_rejected': 'Reset request rejected',
  'auth.reset_request_escalated': 'Reset request moved up',
  'auth.reset_request_expired': 'Reset request expired',
};

function currentState(h) {
  if (h.mustChangePassword) {
    if (h.tempPasswordExpiresAt && new Date(h.tempPasswordExpiresAt) < new Date()) return ['danger', 'Temporary password expired'];
    return ['warning', 'Must set a new password at next sign-in'];
  }
  return ['success', 'Using their own password'];
}

// "Password history" card on a worker's / incharge's staff console page:
// where their password stands now, any open reset request, and every
// password event (from the audit log — never the password itself).
export function PasswordHistory({ history }) {
  if (!history) return null;
  const [tone, label] = currentState(history);
  const rows = [
    ['Status', <Badge key="s" tone={tone}>{label}</Badge>],
    ['Last set their own password', when(history.passwordChangedAt) || 'Not recorded'],
    history.mustChangePassword && history.tempPasswordExpiresAt ? ['Temporary password valid until', when(history.tempPasswordExpiresAt)] : null,
    ['Last signed in (app)', when(history.lastLoginAt) || 'Not recorded'],
    ['Reset requests (30 days)', String(history.requestsLast30Days)],
  ].filter(Boolean);

  return (
    <div style={theme.card}>
      <div style={{ ...theme.sectionHeader, marginTop: 0, marginBottom: 10 }}>Password history</div>

      {history.openRequest && (
        <div style={{ background: WARNING_SOFT, color: WARNING, borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
          <b>Open reset request</b> since {when(history.openRequest.createdAt)} — currently with {history.openRequest.levelLabel}.{' '}
          <Link to="/staff/app/password-requests" style={{ color: 'inherit', fontWeight: 800 }}>
            Handle it →
          </Link>
        </div>
      )}

      {rows.map(([k, v]) => (
        <div key={k} style={theme.settingsRow}>
          <span style={theme.settingsLabel}>{k}</span>
          <span>{v}</span>
        </div>
      ))}

      {history.events.length > 0 ? (
        <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.events.map((e) => (
            <li key={e.id} className="ft-history-event" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 150px) minmax(0, 1fr)', gap: 12, fontSize: 13 }}>
              <span style={{ color: theme.textSecondary, fontSize: 12.5 }}>{when(e.createdAt)}</span>
              <span>
                <b style={{ color: theme.textPrimary }}>{EVENT_LABELS[e.action] || e.action}</b>
                <span style={{ color: theme.textSecondary }}>
                  {' '}
                  — {e.summary}
                  {e.actorName ? ` (by ${e.actorName}${e.actorRole ? `, ${roleTag(e.actorRole)}` : ''})` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 12 }}>No password events recorded yet.</div>
      )}
    </div>
  );
}
