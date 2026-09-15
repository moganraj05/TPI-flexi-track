import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from './BottomSheet';
import { StatusBadge } from './StatusBadge';
import { Icon } from './Icon';
import { getEmployee, markAttendance } from '../../api/hr';
import { formatDateTime } from '../../utils/format';

export function WorkerDetailSheet({ member, poll, allowOverride, onClose, onChanged }) {
  const open = Boolean(member);
  const queryClient = useQueryClient();
  const [marking, setMarking] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data } = useQuery({
    queryKey: ['hr-employee', member?.id],
    queryFn: () => getEmployee(member.id),
    enabled: open,
  });

  useEffect(() => {
    setActionError('');
  }, [member?.id]);

  if (!open) return null;

  const handleMark = async (answer) => {
    setMarking(true);
    setActionError('');
    try {
      await markAttendance(poll.id, member.id, answer);
      queryClient.invalidateQueries({ queryKey: ['hr-live'] });
      queryClient.invalidateQueries({ queryKey: ['hr-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['hr-polls'] });
      onChanged?.();
    } catch (err) {
      setActionError(err.message || 'Could not update attendance');
    } finally {
      setMarking(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={member.name}>
      <div style={styles.metaRow}>
        <StatusBadge status={member.status || member.answer} />
        {member.shiftStart && (
          <span style={styles.shift}>
            {member.shiftStart}–{member.shiftEnd}
          </span>
        )}
      </div>

      <dl style={styles.dl}>
        <Row label="Employee ID" value={member.employeeId} />
        {member.phone && (
          <Row
            label="Phone"
            value={
              <a href={`tel:${member.phone}`} style={styles.phoneLink}>
                <Icon name="phone" size={14} /> {member.phone}
              </a>
            }
          />
        )}
        <Row label="Answered" value={member.answeredAt ? formatDateTime(member.answeredAt) : 'No response yet'} />
      </dl>

      {allowOverride && (
        <div style={styles.actions}>
          <p style={styles.actionsLabel}>HR override</p>
          <div style={styles.actionBtns}>
            <button
              disabled={marking}
              onClick={() => handleMark('yes')}
              style={{ ...styles.actionBtn, background: 'var(--green-tint)', color: 'var(--green)' }}
            >
              Mark Coming
            </button>
            <button
              disabled={marking}
              onClick={() => handleMark('no')}
              style={{ ...styles.actionBtn, background: 'var(--red-tint)', color: 'var(--red)' }}
            >
              Mark Not Coming
            </button>
          </div>
          {actionError && <p style={styles.error}>{actionError}</p>}
        </div>
      )}

      {data?.history?.length > 0 && (
        <div style={styles.history}>
          <p style={styles.actionsLabel}>Recent responses</p>
          {data.history.slice(0, 6).map((h) => (
            <div key={h.id} style={styles.historyRow}>
              <span style={styles.historyDate}>{formatDateTime(h.answeredAt)}</span>
              <StatusBadge status={h.answer} />
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

function Row({ label, value }) {
  return (
    <div style={styles.row}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value}</dd>
    </div>
  );
}

const styles = {
  metaRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  shift: { fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' },
  dl: { margin: '0 0 4px' },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid var(--line)',
  },
  dt: { margin: 0, fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 },
  dd: { margin: 0, fontSize: 13, fontWeight: 700, textAlign: 'right' },
  phoneLink: { display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--blue)' },
  actions: { marginTop: 18 },
  actionsLabel: { fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', margin: '0 0 8px' },
  actionBtns: { display: 'flex', gap: 8 },
  actionBtn: {
    flex: 1,
    border: 'none',
    borderRadius: 'var(--radius-control)',
    padding: '11px 8px',
    fontWeight: 800,
    fontSize: 13,
    minHeight: 44,
  },
  error: { color: 'var(--red)', fontSize: 12, marginTop: 8 },
  history: { marginTop: 18 },
  historyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--line)',
  },
  historyDate: { fontSize: 12, color: 'var(--ink-soft)' },
};
