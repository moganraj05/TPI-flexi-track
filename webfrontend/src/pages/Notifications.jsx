import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { theme, SUCCESS, WARNING } from '../theme';
import { getDepartments, sendWorkerNotification } from '../api/hr';
import { Button } from '../components/common/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { FilterChips } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { EmptyState } from '../components/common/EmptyState';
import { isAdminRole } from '../utils/roles';

const TARGETS = [
  { value: 'all', label: 'All workers' },
  { value: 'plant', label: 'One plant' },
  { value: 'worker', label: 'One worker' },
];

// Ready-made messages for a quick demo; HR can still edit them before sending.
const TEMPLATES = [
  { label: 'Test', title: 'FlexiTrack test', message: 'This is a test notification from HR. No action needed.' },
  { label: 'Answer poll', title: 'Please answer your poll', message: 'Your attendance poll is open. Open FlexiTrack and answer Yes or No.' },
  { label: 'Announcement', title: 'Message from HR', message: 'Please check with your incharge before your next shift.' },
];

const TITLE_MAX = 80;
const MESSAGE_MAX = 240;

const fieldStyle = { ...theme.input, background: theme.surface };

// Sends a notification from HR to workers' phones — for demos and short
// announcements. Delivered to every device a worker turned notifications on
// for (browser / installed web app) and to the Android APK.
export function Notifications() {
  const { user } = useAuth();
  const toast = useToast();
  const [target, setTarget] = useState('all');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [message, setMessage] = useState(TEMPLATES[0].message);
  const [sending, setSending] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments, staleTime: 5 * 60 * 1000 });
  if (!isAdminRole(user?.role)) {
    return <EmptyState title="Admins only" message="Sending notifications to workers is available to admin logins." />;
  }

  const plantOptions = [
    { value: '', label: 'Choose a plant' },
    ...(departments || []).filter((d) => d.isActive !== false).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` })),
  ];

  const validate = () => {
    if (target === 'plant' && !departmentId) return 'Choose a plant.';
    if (target === 'worker' && !employeeId.trim()) return 'Enter the worker’s Employee ID.';
    if (!title.trim()) return 'Enter a title.';
    if (!message.trim()) return 'Enter a message.';
    return '';
  };

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await sendWorkerNotification({
        target,
        departmentId: target === 'plant' ? departmentId : undefined,
        employeeId: target === 'worker' ? employeeId.trim() : undefined,
        title: title.trim(),
        message: message.trim(),
      });
      setResult(res);
      toast(res.message, res.devicesSent > 0 ? 'success' : 'info');
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    // Everyone at once deserves a second look; one plant / one worker doesn't.
    if (target === 'all') setConfirmAll(true);
    else send().catch(() => {});
  };

  return (
    <>
      <div>
        <h1 className="ft-page-title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: theme.textPrimary }}>Notifications</h1>
        <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
          Send a message to workers&apos; phones — for a demo or a short announcement.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ ...theme.card, maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ ...theme.label, marginTop: 0 }}>Send to</label>
        <FilterChips options={TARGETS} value={target} onChange={(v) => { setTarget(v); setError(''); setResult(null); }} />

        {target === 'plant' && (
          <div style={{ marginTop: 10 }}>
            <PlantSelect options={plantOptions} value={departmentId} onChange={setDepartmentId} />
          </div>
        )}
        {target === 'worker' && (
          <>
            <label style={theme.label} htmlFor="notify-emp">Employee ID</label>
            <input
              id="notify-emp"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              placeholder="e.g. EMP1042"
              style={{ ...fieldStyle, fontFamily: theme.mono, maxWidth: 260 }}
              autoComplete="off"
            />
          </>
        )}

        <label style={theme.label}>Quick message</label>
        <FilterChips
          options={TEMPLATES.map((t) => ({ value: t.label, label: t.label }))}
          value={TEMPLATES.find((t) => t.title === title && t.message === message)?.label ?? ''}
          onChange={(label) => {
            const t = TEMPLATES.find((x) => x.label === label);
            setTitle(t.title);
            setMessage(t.message);
          }}
        />

        <label style={theme.label} htmlFor="notify-title">Title</label>
        <input id="notify-title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} />

        <label style={theme.label} htmlFor="notify-message">Message</label>
        <textarea
          id="notify-message"
          value={message}
          maxLength={MESSAGE_MAX}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
        <div style={{ fontSize: 11.5, color: theme.mutedColor, textAlign: 'right' }}>
          {message.length}/{MESSAGE_MAX}
        </div>

        {error && <div style={theme.errorText}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <Button type="submit" loading={sending} loadingLabel="Sending…">
            Send notification
          </Button>
        </div>
      </form>

      {result && (
        <section style={{ ...theme.card, maxWidth: 640 }} className="ft-fade-in">
          <div style={{ fontSize: 15, fontWeight: 800, color: result.devicesSent > 0 ? SUCCESS : WARNING }}>{result.message}</div>
          <div style={{ display: 'flex', gap: 28, marginTop: 12, flexWrap: 'wrap' }}>
            <Figure label="Workers targeted" value={result.workers} />
            <Figure label="Notifications on" value={result.reachable} />
            <Figure label="Devices reached" value={result.devicesSent} />
            {result.devicesFailed > 0 && <Figure label="Failed" value={result.devicesFailed} />}
          </div>
          {result.reachable < result.workers && (
            <div style={{ fontSize: 12.5, color: theme.textSecondary, marginTop: 12, lineHeight: 1.5 }}>
              {result.workers - result.reachable} worker(s) haven&apos;t turned on notifications. They can do it in the
              FlexiTrack app under Profile → Notifications.
            </div>
          )}
        </section>
      )}

      {confirmAll && (
        <ConfirmDialog
          title="Send to all workers?"
          message={`“${title.trim()}” will be sent to every active worker who has notifications turned on.`}
          confirmLabel="Send to all"
          onCancel={() => setConfirmAll(false)}
          onConfirm={async () => {
            await send();
            setConfirmAll(false);
          }}
        />
      )}
    </>
  );
}

function Figure({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: theme.mono, color: theme.textPrimary }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}
