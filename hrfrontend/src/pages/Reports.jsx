import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDepartments, getPolls, downloadManpowerExcel, downloadPollExcel, downloadPollPdf } from '../api/hr';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips } from '../components/common/FilterChips';
import { Icon } from '../components/common/Icon';
import { formatDate, shiftLabel } from '../utils/format';

export function Reports() {
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('closed');
  const [selectedPollId, setSelectedPollId] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments });

  const { data: polls, isLoading } = useQuery({
    queryKey: ['hr-polls', status, department],
    queryFn: () => getPolls({ status, department: department === 'all' ? undefined : department }),
  });

  const runExport = async (fn, key) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Export failed');
    } finally {
      setBusy('');
    }
  };

  const deptChips = [
    { value: 'all', label: 'All depts' },
    ...(departments || []).map((d) => ({ value: d.id, label: d.code })),
  ];

  return (
    <div>
      <SectionLabel text="Filter" />
      <FilterChips options={deptChips} value={department} onChange={setDepartment} />
      <FilterChips
        options={[
          { value: 'closed', label: 'Closed polls' },
          { value: 'open', label: 'Open polls' },
        ]}
        value={status}
        onChange={setStatus}
      />

      <div style={styles.card}>
        <p style={styles.cardTitle}>Manpower plan (bulk)</p>
        <p style={styles.cardDesc}>
          Excel of the last {status === 'open' ? 'open' : 'closed'} polls across all departments — one row per
          shift session.
        </p>
        <ExportButton
          label="Export Excel"
          tone="excel"
          busy={busy === 'manpower'}
          onClick={() => runExport(() => downloadManpowerExcel(status), 'manpower')}
        />
      </div>

      <SectionLabel text="Or export a specific poll" />
      {isLoading ? (
        <CenteredSpinner label="Loading polls…" />
      ) : !polls || polls.length === 0 ? (
        <EmptyState title="No polls found" message="Try a different department or status." />
      ) : (
        polls.map((poll) => {
          const isSelected = poll.id === selectedPollId;
          return (
            <div key={poll.id} style={styles.pollWrap}>
              <button
                onClick={() => setSelectedPollId(isSelected ? null : poll.id)}
                style={{ ...styles.pollRow, borderColor: isSelected ? 'var(--blue)' : 'var(--line)' }}
              >
                <div>
                  <p style={styles.pollTitle}>{poll.department?.name}</p>
                  <p style={styles.pollMeta}>
                    {shiftLabel(poll)} · {formatDate(poll.date)}
                  </p>
                </div>
                <Icon name="chevronDown" size={18} />
              </button>
              {isSelected && (
                <div style={styles.exportRow}>
                  <ExportButton
                    label="Excel"
                    tone="excel"
                    busy={busy === `xlsx-${poll.id}`}
                    onClick={() =>
                      runExport(
                        () => downloadPollExcel(poll.id, `${poll.department?.code}_${formatDate(poll.date)}`),
                        `xlsx-${poll.id}`
                      )
                    }
                  />
                  <ExportButton
                    label="PDF"
                    tone="pdf"
                    busy={busy === `pdf-${poll.id}`}
                    onClick={() =>
                      runExport(
                        () => downloadPollPdf(poll.id, `${poll.department?.code}_${formatDate(poll.date)}`),
                        `pdf-${poll.id}`
                      )
                    }
                  />
                </div>
              )}
            </div>
          );
        })
      )}

      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

function ExportButton({ label, tone, busy, onClick }) {
  const toneStyles = tone === 'excel' ? styles.excelBtn : styles.pdfBtn;
  return (
    <button disabled={busy} onClick={onClick} style={{ ...styles.exportBtn, ...toneStyles }}>
      <Icon name="download" size={16} />
      {busy ? 'Preparing…' : label}
    </button>
  );
}

function SectionLabel({ text }) {
  return <h2 style={{ fontSize: 14, margin: '4px 0 10px', color: 'var(--ink-soft)' }}>{text}</h2>;
}

const styles = {
  card: {
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: { margin: 0, fontSize: 15, fontWeight: 800, fontFamily: 'Manrope, sans-serif' },
  cardDesc: { margin: '4px 0 14px', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 },
  pollWrap: { marginBottom: 10 },
  pollRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: 14,
    textAlign: 'left',
  },
  pollTitle: { margin: 0, fontSize: 14, fontWeight: 800, fontFamily: 'Manrope, sans-serif' },
  pollMeta: { margin: '2px 0 0', fontSize: 12, color: 'var(--ink-soft)' },
  exportRow: { display: 'flex', gap: 8, marginTop: 8 },
  exportBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: 'none',
    borderRadius: 'var(--radius-control)',
    padding: '12px 10px',
    fontWeight: 800,
    fontSize: 13,
    minHeight: 44,
  },
  excelBtn: { background: 'var(--green-tint)', color: 'var(--green)' },
  pdfBtn: { background: 'var(--red-tint)', color: 'var(--red)' },
  error: { color: 'var(--red)', fontSize: 13, marginTop: 12 },
};
