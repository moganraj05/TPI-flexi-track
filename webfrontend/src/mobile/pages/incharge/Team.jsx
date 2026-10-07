import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '../../components/BottomSheet';
import { Icon } from '../../components/Icon';
import { Avatar, Button, ErrorState, FilterChips, Loading, ScreenHeader, SearchInput, StatsCard } from '../../components/ui';
import { useMobileAuth } from '../../context/AuthContext';
import { useMobileToast } from '../../context/ToastContext';
import { useTeam } from '../../hooks';
import { api } from '../../api';
import { formatShiftLabel } from '../../utils';
import { WorkerFormSheet } from './WorkerFormSheet';
import { TempPasswordSheet } from './TempPasswordSheet';

const NOTIFY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'on', label: 'Notify on' },
  { value: 'off', label: 'Notify off' },
];
const SORT_LABEL = { name_asc: 'A–Z', name_desc: 'Z–A', id_asc: 'ID' };
const SORT_CYCLE = { name_asc: 'name_desc', name_desc: 'id_asc', id_asc: 'name_asc' };

const byName = (a, b) => a.name.localeCompare(b.name);

// Incharge "Team" tab: everyone on the team (a supervisor sees the whole
// plant), whether each can get notifications, their answer on the live poll,
// and add / edit / remove.
export function InchargeTeam() {
  const { user } = useMobileAuth();
  const queryClient = useQueryClient();
  const toast = useMobileToast();
  const query = useTeam();
  const workers = useMemo(() => query.data?.data ?? [], [query.data]);

  const [search, setSearch] = useState('');
  const [notifyFilter, setNotifyFilter] = useState('all');
  const [sortFilter, setSortFilter] = useState('name_asc');
  const [form, setForm] = useState({ open: false, mode: 'create', worker: null });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [newLogin, setNewLogin] = useState(null); // shown once after adding a worker

  const filtered = useMemo(() => {
    let list = [...workers];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((w) => w.name.toLowerCase().includes(q) || w.employeeId.toLowerCase().includes(q));
    if (notifyFilter === 'on') list = list.filter((w) => w.hasNotifications);
    if (notifyFilter === 'off') list = list.filter((w) => !w.hasNotifications);
    list.sort((a, b) => {
      if (sortFilter === 'name_desc') return b.name.localeCompare(a.name);
      if (sortFilter === 'id_asc') return a.employeeId.localeCompare(b.employeeId);
      return byName(a, b);
    });
    return list;
  }, [workers, search, notifyFilter, sortFilter]);

  const notifyOn = workers.filter((w) => w.hasNotifications).length;

  const setTeam = (updater) =>
    queryClient.setQueryData(['m', 'team'], (prev) => (prev ? { ...prev, data: updater(prev.data) } : prev));

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      if (form.mode === 'create') {
        const result = await api.createTeamWorker({
          employeeId: values.employeeId,
          name: values.name,
          phone: values.phone,
          shiftCode: values.shiftCode,
        });
        setTeam((list) => [...list, result.data].sort(byName));
        setNewLogin(result.data);
      } else {
        const payload = { name: values.name, phone: values.phone };
        if (values.shiftCode) payload.shiftCode = values.shiftCode;
        const result = await api.updateTeamWorker(form.worker.id, payload);
        setTeam((list) => list.map((w) => (w.id === form.worker.id ? { ...w, ...result.data, livePoll: w.livePoll } : w)));
        toast(`Saved ${result.data.name}`, result.data.employeeId);
      }
      setForm((f) => ({ ...f, open: false }));
      // Server truth (live poll answers, counts) after any change.
      queryClient.invalidateQueries({ queryKey: ['m', 'team'] });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const worker = deleteTarget;
    setDeleting(true);
    try {
      await api.deleteTeamWorker(worker.id);
      setTeam((list) => list.filter((w) => w.id !== worker.id));
      toast(`Removed ${worker.name}`);
      setDeleteTarget(null);
    } catch (error) {
      toast(error.message || 'Failed to remove worker', null, { variant: 'error' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="m-screen">
      <ScreenHeader
        kicker={user?.department?.name ?? ''}
        title={user?.role === 'supervisor' ? 'My plant' : 'My team'}
        onAdd={() => setForm({ open: true, mode: 'create', worker: null })}
      />

      {query.isPending ? (
        <Loading />
      ) : query.isError && !query.data ? (
        <div className="m-body">
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        </div>
      ) : (
        <>
          <div className="m-body">
            <StatsCard
              items={[
                { label: 'Workers', value: workers.length },
                { label: 'Notify on', value: notifyOn, tone: 'go' },
                { label: 'Notify off', value: workers.length - notifyOn, tone: 'stop' },
              ]}
            />
          </div>

          <div className="m-sticky">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name or employee ID" />
            <div className="m-chip-bar">
              <FilterChips label="Notifications" value={notifyFilter} onChange={setNotifyFilter} options={NOTIFY_OPTIONS} />
              <button type="button" className="m-sort-pill" onClick={() => setSortFilter((s) => SORT_CYCLE[s])} aria-label={`Sort: ${SORT_LABEL[sortFilter]}`}>
                <Icon name="sort" size={13} />
                {SORT_LABEL[sortFilter]}
              </button>
            </div>
            <div className="m-count-label">
              Showing {filtered.length} of {workers.length} workers
            </div>
          </div>

          <div className="m-body">
            {filtered.length === 0 ? (
              <div className="m-card m-empty">
                <Icon name="people" size={36} className="m-text-muted" />
                <p className="m-empty-text">{workers.length ? 'Nobody matches that search.' : 'No workers on this team yet.'}</p>
              </div>
            ) : (
              <ul className="m-worker-list">
                {filtered.map((worker) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    onEdit={() => setForm({ open: true, mode: 'edit', worker })}
                    onDelete={() => setDeleteTarget(worker)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <WorkerFormSheet
        open={form.open}
        mode={form.mode}
        worker={form.worker}
        saving={saving}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSubmit={handleSubmit}
      />

      <TempPasswordSheet login={newLogin} onClose={() => setNewLogin(null)} />

      <BottomSheet open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} labelledBy="remove-worker-title">
        <span className="m-sheet-icon m-tint-stop">
          <Icon name="alert" size={26} />
        </span>
        <h2 id="remove-worker-title" className="m-sheet-title">
          Remove {deleteTarget?.name}?
        </h2>
        <p className="m-sheet-body">They will stop getting polls and can no longer sign in. Past responses stay in reports.</p>
        <div className="m-sheet-actions">
          <Button variant="field" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Remove
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function WorkerCard({ worker, onEdit, onDelete }) {
  const live = worker.livePoll;
  const pollLabel = live
    ? live.answer === 'yes'
      ? 'Live: coming'
      : live.answer === 'no'
        ? 'Live: not coming'
        : 'Live: no response'
    : 'No live poll';
  const pollTone = live ? (live.answer === 'yes' ? 'go' : live.answer === 'no' ? 'stop' : 'muted') : 'muted';

  return (
    <li className="m-card m-worker-card">
      <div className="m-worker-top">
        <span className="m-avatar-status">
          <Avatar name={worker.name} employeeId={worker.employeeId} size={48} />
          <i className={worker.hasNotifications ? 'm-fill-go' : 'm-fill-stop'} aria-hidden="true" />
        </span>
        <div className="m-row-main">
          <div className="m-worker-name">{worker.name}</div>
          <div className="m-worker-meta">
            <span className="m-mono">{worker.employeeId}</span>
            {worker.phone ? (
              <a href={`tel:${worker.phone}`} className="m-link">
                {worker.phone}
              </a>
            ) : null}
          </div>
        </div>
        <button type="button" className="m-round-btn" onClick={onEdit} aria-label={`Edit ${worker.name}`}>
          <Icon name="edit" size={17} />
        </button>
        <button type="button" className="m-round-btn m-round-btn-danger" onClick={onDelete} aria-label={`Remove ${worker.name}`}>
          <Icon name="trash" size={17} />
        </button>
      </div>
      <div className="m-tag-row">
        <span className="m-tag">{worker.shiftLabel || formatShiftLabel(worker.shiftStart, worker.shiftEnd)}</span>
        <span className={`m-tag m-tag-${worker.hasNotifications ? 'go' : 'stop'}`}>{worker.hasNotifications ? 'Notify on' : 'Notify off'}</span>
        <span className={`m-tag m-tag-${pollTone}`}>{pollLabel}</span>
        {worker.mustChangePassword ? <span className="m-tag m-tag-wait">Password not set</span> : null}
      </div>
    </li>
  );
}
