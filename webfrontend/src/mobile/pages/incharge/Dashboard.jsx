import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ErrorState, FilterChips, Loading, Pagination, ProgressRing, ScreenHeader, SearchInput, StatsCard, StatusPill } from '../../components/ui';
import { useMobileAuth } from '../../context/AuthContext';
import { useInchargePolls, usePollCountdown } from '../../hooks';
import {
  endOfDay,
  firstName,
  formatDisplayDate,
  formatShiftLabel,
  greetingFor,
  isSameDay,
  pollDate,
  shiftName,
  startOfMonth,
  startOfWeek,
} from '../../utils';

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Live' },
  { value: 'closed', label: 'Closed' },
];
const PERIOD_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most_responses', label: 'Most responses' },
];

const shiftKey = (p) => (p.shiftStart && p.shiftEnd ? `${p.shiftStart}-${p.shiftEnd}` : p.shift);

// Incharge "Dashboard" tab: the live poll up top, totals, then every poll of
// the department with search / status / shift / period / sort filters.
export function InchargeDashboard() {
  const { user } = useMobileAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [sortFilter, setSortFilter] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [expiredPollIds, setExpiredPollIds] = useState(() => new Set());

  const query = useInchargePolls(page, PAGE_SIZE);
  const polls = useMemo(() => query.data?.data ?? [], [query.data]);
  // Open polls are always the newest, so they all sit on page 1. The live
  // card and the Live count come from page 1 even while a later page is
  // shown (same cached query when already on page 1).
  const firstPage = useInchargePolls(1, PAGE_SIZE);
  const firstPagePolls = useMemo(() => firstPage.data?.data ?? [], [firstPage.data]);
  const pageCount = query.data?.meta?.pageCount ?? 1;

  useEffect(() => {
    if (page > pageCount) setPage(Math.max(1, pageCount));
  }, [page, pageCount]);

  const filteredPolls = useMemo(() => {
    const now = new Date();
    let list = [...polls];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.shift.toLowerCase().includes(q) ||
          formatDisplayDate(pollDate(p.date)).toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter((p) => p.status === statusFilter);
    if (shiftFilter !== 'all') list = list.filter((p) => shiftKey(p) === shiftFilter);
    if (periodFilter !== 'all') {
      list = list.filter((p) => {
        const d = pollDate(p.date);
        if (periodFilter === 'today') return isSameDay(d, now);
        if (periodFilter === 'week') return d >= startOfWeek(now) && d <= endOfDay(now);
        return d >= startOfMonth(now) && d <= endOfDay(now);
      });
    }
    list.sort((a, b) => {
      if (sortFilter === 'oldest') return pollDate(a.date) - pollDate(b.date);
      if (sortFilter === 'most_responses') return (b.summary?.totalResponses ?? 0) - (a.summary?.totalResponses ?? 0);
      return pollDate(b.date) - pollDate(a.date);
    });
    return list;
  }, [polls, search, statusFilter, shiftFilter, periodFilter, sortFilter]);

  // Total comes from the server (every poll, not just this page).
  const stats = useMemo(() => {
    const open = firstPagePolls.filter((p) => p.status === 'open').length;
    const total = query.data?.meta?.total ?? polls.length;
    return { total, open, closed: Math.max(0, total - open) };
  }, [firstPagePolls, polls, query.data]);

  const shiftOptions = useMemo(() => {
    const unique = new Map();
    polls.forEach((p) => unique.set(shiftKey(p), p.shiftStart && p.shiftEnd ? formatShiftLabel(p.shiftStart, p.shiftEnd) : p.shift));
    return [
      { value: 'all', label: 'Any shift' },
      ...[...unique.entries()].sort().map(([value, label]) => ({ value, label })),
    ];
  }, [polls]);

  const livePoll = useMemo(
    () => firstPagePolls.find((p) => p.status === 'open' && !expiredPollIds.has(p.id) && new Date(p.opensAt) <= new Date()),
    [firstPagePolls, expiredPollIds]
  );

  const filtersActive = statusFilter !== 'all' || shiftFilter !== 'all' || periodFilter !== 'all' || sortFilter !== 'newest';

  return (
    <div className="m-screen">
      <ScreenHeader
        kicker={`${greetingFor()}, ${user?.department?.name ?? ''}`}
        title={`Hi, ${firstName(user?.name)}`}
        name={user?.name}
        employeeId={user?.employeeId}
        profilePath="/incharge/profile"
      />

      {query.isLoading ? (
        <Loading />
      ) : query.isError && !query.data ? (
        <div className="m-body">
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        </div>
      ) : (
        <>
          <div className="m-body">
            {livePoll ? (
              <LiveHeroCard
                poll={livePoll}
                onExpire={() => setExpiredPollIds((prev) => new Set(prev).add(livePoll.id))}
              />
            ) : null}

            <StatsCard
              items={[
                { label: 'Total', value: stats.total },
                { label: 'Live', value: stats.open, tone: 'go' },
                { label: 'Closed', value: stats.closed, tone: 'muted' },
              ]}
            />

            <p className="m-info-row">
              <Icon name="clock" size={15} />
              <span>Polls open after a shift ends and close before the next shift starts. Workers get a reminder before closing.</span>
            </p>
          </div>

          <div className="m-sticky">
            <div className="m-search-row">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by date or shift" />
              <button
                type="button"
                className={`m-filter-btn${showFilters || filtersActive ? ' m-filter-btn-active' : ''}`}
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                aria-label="Filters"
              >
                <Icon name="sliders" size={19} />
              </button>
            </div>
            {showFilters ? (
              <div className="m-filter-stack">
                <FilterChips label="Status" value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={STATUS_OPTIONS} />
                <FilterChips label="Shift" value={shiftFilter} onChange={(v) => { setShiftFilter(v); setPage(1); }} options={shiftOptions} />
                <FilterChips label="Period" value={periodFilter} onChange={(v) => { setPeriodFilter(v); setPage(1); }} options={PERIOD_OPTIONS} />
                <FilterChips label="Sort" value={sortFilter} onChange={setSortFilter} options={SORT_OPTIONS} />
              </div>
            ) : null}
            <div className="m-count-label">
              {filteredPolls.length} {filteredPolls.length === 1 ? 'poll' : 'polls'}
            </div>
          </div>

          <div className="m-body">
            <section className="m-card m-list-card">
              {filteredPolls.length === 0 ? (
                <p className="m-list-empty">{polls.length ? 'No polls match these filters.' : 'No polls yet for your department.'}</p>
              ) : (
                filteredPolls.map((poll) => <PollRow key={poll.id} poll={poll} />)
              )}
            </section>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} loading={query.isFetching && query.isPlaceholderData} />
          </div>
        </>
      )}
    </div>
  );
}

function LiveHeroCard({ poll, onExpire }) {
  const navigate = useNavigate();
  const countdown = usePollCountdown(poll.opensAt, poll.closesAt, onExpire);
  const s = poll.summary;
  const tiles = [
    ['Coming', s?.coming ?? 0],
    ['Not coming', s?.notComing ?? 0],
    ['Silent', s?.pending ?? 0],
  ];

  return (
    <button type="button" className="m-hero m-hero-button" onClick={() => navigate(`/incharge/poll/${poll.id}`)}>
      <span className="m-hero-ring" aria-hidden="true" />
      <span className="m-hero-top">
        <span className="m-live-badge">
          <span className="m-live-dot" />
          Live now
        </span>
        <span className="m-hero-countdown">{countdown.display}</span>
      </span>
      <span className="m-hero-main">
        <span className="m-hero-title">{shiftName(poll.shift)} attendance</span>
        <span className="m-hero-sub">
          {formatDisplayDate(pollDate(poll.date))} · {formatShiftLabel(poll.shiftStart, poll.shiftEnd)}
        </span>
      </span>
      <span className="m-hero-tiles">
        {tiles.map(([label, n]) => (
          <span key={label} className="m-hero-tile">
            <span className="m-hero-tile-value">{n}</span>
            <span className="m-hero-tile-label">{label}</span>
          </span>
        ))}
      </span>
      <span className="m-hero-report">
        <span>Open report</span>
        <Icon name="arrow-right" size={18} />
      </span>
    </button>
  );
}

function PollRow({ poll }) {
  const navigate = useNavigate();
  const s = poll.summary;
  const total = s?.totalWorkers ?? 0;
  const fraction = total > 0 ? (s?.coming ?? 0) / total : 0;
  const live = poll.status === 'open';

  return (
    <button type="button" className="m-row m-row-button" onClick={() => navigate(`/incharge/poll/${poll.id}`)}>
      <ProgressRing size={52} strokeWidth={6} progress={fraction} trackColor="var(--field)" fillColor="var(--go)">
        {Math.round(fraction * 100)}%
      </ProgressRing>
      <span className="m-row-main">
        <span className="m-row-title-line">
          <span className="m-row-title">{shiftName(poll.shift)}</span>
          <StatusPill label={live ? 'LIVE' : 'CLOSED'} tone={live ? 'go' : 'muted'} small />
        </span>
        <span className="m-row-meta">{formatDisplayDate(pollDate(poll.date))}</span>
        <span className="m-row-counts">
          <span className="m-text-go">{s?.coming ?? 0} coming</span>
          <span className="m-text-stop">{s?.notComing ?? 0} no</span>
          <span className="m-text-muted">{s?.pending ?? 0} silent</span>
        </span>
      </span>
      <Icon name="chevron-right" size={18} className="m-text-muted" />
    </button>
  );
}
