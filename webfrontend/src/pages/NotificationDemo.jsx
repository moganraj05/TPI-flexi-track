import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDepartments, getWorkforce, sendDemoNotification } from '../api/hr';
import { theme, chipStyle } from '../theme';
import { spacing, radius, elevation } from '../tokens';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips, plantFilterOptions } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { Avatar } from '../components/common/Avatar';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Table, TableHead, Th, TableRow, Td } from '../components/common/Table';
import { SkeletonTableRows } from '../components/common/Skeleton';
import { Pagination } from '../components/common/Pagination';
import { useToast } from '../context/ToastContext';

const PAGE_SIZE = 8;

const MODE_OPTIONS = [
  { value: 'poll', label: 'Demo poll notification' },
  { value: 'custom', label: 'Custom message' },
];

// What a worker actually sees when a real shift poll opens — used verbatim
// as the "Demo poll notification" preset so the demo is a faithful preview,
// not a made-up example.
const DEMO_POLL_PRESET = {
  title: 'New attendance poll',
  body: "Shift B poll is open — tap to say if you're coming.",
};

export function NotificationDemo() {
  const toast = useToast();
  const [plantFilter, setPlantFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Map());
  const [mode, setMode] = useState('poll');
  const [title, setTitle] = useState(DEMO_POLL_PRESET.title);
  const [body, setBody] = useState(DEMO_POLL_PRESET.body);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const { data: departments, isLoading: departmentsLoading } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: getDepartments,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isFetching } = useQuery({
    queryKey: ['hr-workforce', 'notify-demo', plantFilter, search, page],
    queryFn: () =>
      getWorkforce({
        role: 'worker',
        active: 'true',
        department: plantFilter === 'all' ? undefined : plantFilter,
        q: search.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      }),
  });

  if (departmentsLoading) {
    return <EmptyState title="Loading…" />;
  }

  const pageItems = data?.items || [];
  const pageCount = data?.meta?.pageCount || 1;
  const showSkeleton = isFetching && !data;

  const handleModeChange = (m) => {
    setMode(m);
    setTitle(m === 'poll' ? DEMO_POLL_PRESET.title : '');
    setBody(m === 'poll' ? DEMO_POLL_PRESET.body : '');
  };

  const toggleWorker = (worker) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(worker.id)) next.delete(worker.id);
      else next.set(worker.id, worker);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      pageItems.forEach((w) => next.set(w.id, w));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Map());

  const canSend = selected.size > 0 && title.trim() && body.trim() && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const data = await sendDemoNotification({
        workerIds: [...selected.keys()],
        title: title.trim(),
        body: body.trim(),
      });
      setResult(data);
      toast(
        data.sent > 0 ? `Sent to ${data.sent} device${data.sent === 1 ? '' : 's'}` : 'No devices reached',
        data.sent > 0 ? 'success' : 'error'
      );
    } catch (err) {
      toast(err.message || 'Could not send notification', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: theme.textPrimary, letterSpacing: '-0.01em' }}>
          Notification demo
        </div>
        <div style={{ fontSize: 13.5, color: theme.textSecondary, marginTop: 6, fontWeight: 500 }}>
          Send a real push notification to selected workers' phones for a live demo.
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          background: theme.borderColor + '22',
          border: `1px solid ${theme.borderColor}`,
          borderRadius: radius.md,
          padding: spacing.base,
          fontSize: 13,
          color: theme.textSecondary,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>ⓘ</span>
        <span>
          This goes straight to the Expo/FCM push service and lands on the selected workers' real devices — nothing is
          written to the database. No poll, no response, no history entry is created; it's safe to send as many times as
          you need for the demo.
        </span>
      </div>

      <div style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, padding: spacing.lg, boxShadow: elevation.card }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: theme.textPrimary }}>Message</div>
          <FilterChips options={MODE_OPTIONS} value={mode} onChange={handleModeChange} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 16px' }}>
          <div>
            <label style={theme.label}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={theme.input} placeholder="e.g. New attendance poll" />
          </div>
          <div>
            <label style={theme.label}>Message</label>
            <input value={body} onChange={(e) => setBody(e.target.value)} style={theme.input} placeholder="What the notification says" />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, padding: `${spacing.sm}px ${spacing.base}px` }}>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or employee ID"
          style={{ ...theme.input, maxWidth: 260 }}
        />
        <div style={{ width: 1, alignSelf: 'stretch', background: theme.borderColor }} />
        <PlantSelect
          options={plantFilterOptions(departments)}
          value={plantFilter}
          onChange={(v) => {
            setPlantFilter(v);
            setPage(1);
          }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={selectAllVisible} disabled={pageItems.length === 0}>
            Select page
          </Button>
          <Button variant="secondary" size="sm" onClick={clearSelection} disabled={selected.size === 0}>
            Clear ({selected.size})
          </Button>
        </div>
      </div>

      <div style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, overflow: 'hidden' }}>
        {!showSkeleton && pageItems.length === 0 ? (
          <EmptyState title="No workers found" message="Try a different search or plant filter." />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <Th></Th>
                  <Th>Worker</Th>
                  <Th>Emp ID</Th>
                  <Th>Plant</Th>
                  <Th>Push status</Th>
                </TableHead>
                {showSkeleton ? (
                  <SkeletonTableRows columns={5} rows={4} />
                ) : (
                  <tbody key={page} className="ft-fade-in">
                    {pageItems.map((w) => {
                      const isSelected = selected.has(w.id);
                      return (
                        <TableRow key={w.id} onClick={() => toggleWorker(w)} style={{ cursor: 'pointer', background: isSelected ? theme.bg : undefined }}>
                          <Td>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleWorker(w)} onClick={(e) => e.stopPropagation()} />
                          </Td>
                          <Td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Avatar name={w.name} size={30} />
                              <span style={{ fontWeight: 700, color: theme.textPrimary }}>{w.name}</span>
                            </div>
                          </Td>
                          <Td>
                            <span style={{ fontFamily: theme.mono, fontSize: 12.5, color: theme.textSecondary }}>{w.employeeId}</span>
                          </Td>
                          <Td>
                            <span style={chipStyle(w.department?.code)}>{w.department?.code || '—'}</span>
                          </Td>
                          <Td>
                            <Badge tone={w.hasNotifications ? 'success' : 'neutral'}>
                              {w.hasNotifications ? 'Registered' : 'No device'}
                            </Badge>
                          </Td>
                        </TableRow>
                      );
                    })}
                  </tbody>
                )}
              </Table>
            </div>
            <div style={{ padding: '0 16px' }}>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} disabled={isFetching} />
            </div>
          </>
        )}
      </div>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          background: theme.surface,
          border: `1px solid ${theme.borderColor}`,
          borderRadius: radius.lg,
          padding: spacing.lg,
          boxShadow: elevation.raised,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13.5, color: theme.textSecondary, fontWeight: 600 }}>
          {selected.size === 0
            ? 'No workers selected yet'
            : `${selected.size} worker${selected.size === 1 ? '' : 's'} selected`}
        </div>
        <Button variant="primary" onClick={handleSend} disabled={!canSend} loading={sending} loadingLabel="Sending…">
          Send demo notification
        </Button>
      </div>

      {result && (
        <div style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, padding: spacing.lg, boxShadow: elevation.card }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: theme.textPrimary, marginBottom: 10 }}>Result</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: result.skipped?.length ? 14 : 0 }}>
            <ResultStat label="Targeted" value={result.targeted} />
            <ResultStat label="Delivered" value={result.sent} tone="success" />
            <ResultStat label="Failed" value={result.failed} tone={result.failed > 0 ? 'danger' : 'neutral'} />
          </div>
          {result.skipped?.length > 0 && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textSecondary, marginBottom: 6 }}>
                No registered device — not sent:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {result.skipped.map((w) => (
                  <Badge key={w.id} tone="neutral">
                    {w.name} ({w.employeeId})
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultStat({ label, value, tone = 'neutral' }) {
  const color = tone === 'success' ? theme.accent : tone === 'danger' ? '#dc2626' : theme.textPrimary;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: theme.mono, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}
