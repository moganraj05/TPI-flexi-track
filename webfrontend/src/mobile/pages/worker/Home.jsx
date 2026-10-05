import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { ErrorState, Loading, ProgressRing, ScreenHeader } from '../../components/ui';
import { useMobileAuth } from '../../context/AuthContext';
import { useMobileToast } from '../../context/ToastContext';
import { usePollCountdown, useTodayPoll } from '../../hooks';
import { api } from '../../api';
import { firstName, formatDisplayTime, formatShiftLabel, formatShortDate, greetingFor, pollDate, shiftName } from '../../utils';

// Worker "Poll" tab: today's poll for the worker's shift, answer Yes / No,
// change the answer until it closes.
export function WorkerHome() {
  const { user } = useMobileAuth();
  const queryClient = useQueryClient();
  const toast = useMobileToast();
  const query = useTodayPoll();
  const [responding, setResponding] = useState(false);
  const [changingAnswer, setChangingAnswer] = useState(false);
  const [expiredPollId, setExpiredPollId] = useState(null);

  const poll = query.data?.data ?? null;
  const visiblePoll = poll && poll.id !== expiredPollId ? poll : null;

  const handleRespond = async (answer) => {
    if (!visiblePoll) return;
    setResponding(true);
    try {
      const result = await api.respondToPoll(visiblePoll.id, answer);
      queryClient.setQueryData(['m', 'today-poll'], (prev) => (prev ? { ...prev, data: result.data } : prev));
      queryClient.invalidateQueries({ queryKey: ['m', 'history'] });
      setChangingAnswer(false);
      toast(answer === 'yes' ? 'Marked as coming' : 'Marked as not coming');
    } catch (error) {
      toast(error.message || 'Could not save your answer', 'Please try again', { variant: 'error' });
      // The poll may have closed meanwhile — refresh what's shown.
      queryClient.invalidateQueries({ queryKey: ['m', 'today-poll'] });
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="m-screen">
      <ScreenHeader
        kicker={`${greetingFor()}, ${user?.department?.name ?? ''}`}
        title={`Hi, ${firstName(user?.name)}`}
        name={user?.name}
        employeeId={user?.employeeId}
        profilePath="/profile"
      />

      <div className="m-body">
        {query.isLoading ? (
          <Loading />
        ) : query.isError && !query.data ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : visiblePoll ? (
          <PollHeroCard
            poll={visiblePoll}
            answering={changingAnswer ? null : visiblePoll.myResponse?.answer ?? null}
            responding={responding}
            onRespond={handleRespond}
            onChangeAnswer={() => setChangingAnswer(true)}
            onExpire={() => {
              setExpiredPollId(visiblePoll.id);
              queryClient.invalidateQueries({ queryKey: ['m', 'today-poll'] });
            }}
          />
        ) : (
          <div className="m-card m-empty">
            <Icon name="clipboard" size={32} className="m-text-muted" />
            <div className="m-empty-title">No live poll</div>
            <p className="m-empty-text">
              {expiredPollId
                ? 'This poll has closed.'
                : query.data?.message || 'There is no open attendance poll for your shift right now.'}
            </p>
            {query.data?.meta?.shiftLabel ? <p className="m-empty-meta">Your shift: {query.data.meta.shiftLabel}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function PollHeroCard({ poll, answering, responding, onRespond, onChangeAnswer, onExpire }) {
  const countdown = usePollCountdown(poll.opensAt, poll.closesAt, onExpire);
  const opens = new Date(poll.opensAt).getTime();
  const closes = poll.closesAt ? new Date(poll.closesAt).getTime() : opens;
  const totalWindow = Math.max(1, closes - opens);
  const fraction = Math.min(1, Math.max(0, 1 - (countdown.now - opens) / totalWindow));
  const closesAtLabel = poll.closesAt ? formatDisplayTime(new Date(poll.closesAt)) : null;

  return (
    <div className="m-stack">
      <section className="m-hero" aria-label="Your next shift">
        <span className="m-hero-ring" aria-hidden="true" />
        <div className="m-hero-top">
          <span className="m-hero-label">Your next shift</span>
          {!countdown.isExpired ? (
            <span className="m-live-badge">
              <span className="m-live-dot" />
              Poll live
            </span>
          ) : null}
        </div>

        <div className="m-hero-main">
          <div className="m-hero-date">{formatShortDate(pollDate(poll.date))}</div>
          <div className="m-pill-row">
            <span className="m-hero-pill">{formatShiftLabel(poll.shiftStart, poll.shiftEnd)}</span>
            <span className="m-hero-pill m-hero-pill-solid">{shiftName(poll.shift)}</span>
          </div>
        </div>

        <div className="m-countdown-strip">
          <ProgressRing size={52} strokeWidth={6} progress={fraction} trackColor="rgba(255,255,255,.18)" fillColor="#fff" />
          <div>
            <div className="m-countdown-label">{countdown.isBeforeOpen ? 'Poll opens in' : 'Poll closes in'}</div>
            <div className="m-countdown-value" aria-live="off">
              {countdown.display}
            </div>
          </div>
        </div>
      </section>

      {!answering && countdown.isLive ? (
        <>
          <h2 className="m-section-heading">Are you coming?</h2>
          <div className="m-tile-row">
            <button type="button" className="m-answer-tile m-answer-yes" disabled={responding} onClick={() => onRespond('yes')}>
              <span className="m-answer-icon">
                <Icon name="check" size={22} strokeWidth={2.6} />
              </span>
              <span className="m-answer-label">Yes, I&apos;m in</span>
            </button>
            <button type="button" className="m-answer-tile m-answer-no" disabled={responding} onClick={() => onRespond('no')}>
              <span className="m-answer-icon">
                <Icon name="close" size={22} strokeWidth={2.6} />
              </span>
              <span className="m-answer-label">Can&apos;t come</span>
            </button>
          </div>
        </>
      ) : null}

      {answering ? (
        <ResultCard
          answer={answering}
          answeredAt={poll.myResponse?.answeredAt}
          canChange={countdown.isLive}
          onChange={onChangeAnswer}
        />
      ) : null}

      <p className="m-footnote">
        <Icon name="info" size={16} />
        <span>
          {answering
            ? `You can change your answer until the poll closes${closesAtLabel ? ` at ${closesAtLabel}` : ''}.`
            : `The poll closes${closesAtLabel ? ` at ${closesAtLabel},` : ''} before your shift starts. No answer counts as no response.`}
        </span>
      </p>
    </div>
  );
}

function ResultCard({ answer, answeredAt, canChange, onChange }) {
  const yes = answer === 'yes';
  const time = answeredAt ? formatDisplayTime(new Date(answeredAt)) : '';
  return (
    <section className={`m-result ${yes ? 'm-result-yes' : 'm-result-no'}`} aria-live="polite">
      <div className="m-result-row">
        <span className="m-result-icon">
          <Icon name={yes ? 'check' : 'close'} size={26} strokeWidth={2.6} />
        </span>
        <div>
          <div className="m-result-title">{yes ? "You're coming" : "You're not coming"}</div>
          <div className="m-result-sub">
            {yes ? 'Confirmed at ' : 'Recorded at '}
            {time}
          </div>
        </div>
      </div>
      {canChange ? (
        <button type="button" className="m-change-btn" onClick={onChange}>
          Change my answer
        </button>
      ) : null}
    </section>
  );
}
