import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { HistoryCalendar } from '../../components/HistoryCalendar';
import { ErrorState, Loading, Pagination, ScreenHeader, StatusPill } from '../../components/ui';
import { useMobileAuth } from '../../context/AuthContext';
import { useHistory } from '../../hooks';
import { formatShortDate, parseDateKey, pollDate, pollDateKey, shiftName, toDateKey } from '../../utils';

const PAGE_SIZE = 90;
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Worker "History" tab: month calendar coloured by answer, the selected
// day's answer, and the full list of responses (paged, 90 per page).
export function WorkerHistory() {
  const { user } = useMobileAuth();
  const today = new Date();
  const [page, setPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState(toDateKey(today));
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());

  const query = useHistory(page, PAGE_SIZE);
  const responses = useMemo(() => query.data?.data ?? [], [query.data]);
  const pageCount = query.data?.meta?.pageCount ?? 1;

  // History can shrink (e.g. an old poll removed) — never sit past the end.
  useEffect(() => {
    if (page > pageCount) setPage(Math.max(1, pageCount));
  }, [page, pageCount]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const item of responses) {
      if (item.poll) map.set(pollDateKey(item.poll.date), item);
    }
    return map;
  }, [responses]);

  const answered = useMemo(() => responses.filter((r) => r.poll), [responses]);
  const yesCount = answered.filter((r) => r.answer === 'yes').length;
  const selected = byDate.get(selectedDate) ?? null;

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else setCalMonth((m) => m + 1);
  };

  return (
    <div className="m-screen">
      <ScreenHeader kicker="Your record" title="My attendance" name={user?.name} employeeId={user?.employeeId} profilePath="/profile" />

      <div className="m-body">
        {query.isLoading ? (
          <Loading />
        ) : query.isError && !query.data ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : (
          <>
            <HistoryCalendar
              month={calMonth}
              year={calYear}
              selectedDate={selectedDate}
              statusFor={(key) => byDate.get(key)?.answer ?? null}
              onSelectDate={setSelectedDate}
              onPrevMonth={prevMonth}
              onNextMonth={nextMonth}
            />

            <SelectedDay dateKey={selectedDate} response={selected} />

            <div className="m-section-row">
              <h2 className="m-section-title">All responses</h2>
              <span className="m-tally">
                {yesCount} coming, {answered.length - yesCount} not coming
              </span>
            </div>

            <section className="m-card m-list-card">
              {answered.length === 0 ? (
                <p className="m-list-empty">No responses yet.</p>
              ) : (
                answered.map((item) => <ResponseRow key={item.id} response={item} />)
              )}
            </section>

            <Pagination page={page} pageCount={pageCount} onChange={setPage} loading={query.isFetching && query.isPlaceholderData} />
          </>
        )}
      </div>
    </div>
  );
}

function SelectedDay({ dateKey, response }) {
  const label = formatShortDate(parseDateKey(dateKey));
  if (!response?.poll) {
    return (
      <section className="m-card m-selected-day">
        <span className="m-selected-icon m-tint-field">
          <Icon name="calendar" size={20} />
        </span>
        <div>
          <div className="m-selected-kicker">{label}</div>
          <div className="m-selected-title">No poll response</div>
        </div>
      </section>
    );
  }
  const yes = response.answer === 'yes';
  return (
    <section className={`m-card m-selected-day ${yes ? 'm-bg-go-soft' : 'm-bg-stop-soft'}`}>
      <span className={`m-selected-icon ${yes ? 'm-fill-go' : 'm-fill-stop'}`}>
        <Icon name={yes ? 'check' : 'close'} size={20} strokeWidth={2.6} />
      </span>
      <div>
        <div className="m-selected-kicker">{label}</div>
        <div className="m-selected-title">{yes ? 'Coming' : 'Not coming'}</div>
        <div className="m-selected-sub">{shiftName(response.poll.shift)} shift</div>
      </div>
    </section>
  );
}

function ResponseRow({ response }) {
  const yes = response.answer === 'yes';
  const date = pollDate(response.poll.date);
  return (
    <div className="m-row">
      <span className="m-date-block">
        <span className="m-date-dow">{DOW_SHORT[date.getDay()]}</span>
        <span className="m-date-num">{date.getDate()}</span>
      </span>
      <div className="m-row-main">
        <div className="m-row-title">{shiftName(response.poll.shift)}</div>
        <div className="m-row-meta">
          Answered {new Date(response.answeredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </div>
      </div>
      <StatusPill label={yes ? 'Coming' : 'Not coming'} tone={yes ? 'go' : 'stop'} />
    </div>
  );
}
