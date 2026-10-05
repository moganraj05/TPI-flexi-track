import { Icon } from './Icon';
import { toDateKey } from '../utils';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// 7-column month grid: soft green/red for answered days, brand fill for the
// selected day, a brand ring on today — same as the Expo app's calendar.
export function HistoryCalendar({ month, year, selectedDate, statusFor, onSelectDate, onPrevMonth, onNextMonth }) {
  const todayKey = toDateKey(new Date());
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cells = Array.from({ length: cellCount }, (_, i) => {
    const date = new Date(year, month, i - startOffset + 1);
    const key = toDateKey(date);
    return {
      key,
      num: date.getDate(),
      inMonth: date.getMonth() === month,
      status: statusFor(key),
      isSelected: key === selectedDate,
      isToday: key === todayKey,
    };
  });

  return (
    <section className="m-card m-calendar" aria-label="Attendance calendar">
      <div className="m-cal-head">
        <h2 className="m-cal-month">
          {MONTHS[month]} {year}
        </h2>
        <div className="m-cal-nav">
          <button type="button" className="m-round-btn" onClick={onPrevMonth} aria-label="Previous month">
            <Icon name="chevron-left" size={16} />
          </button>
          <button type="button" className="m-round-btn" onClick={onNextMonth} aria-label="Next month">
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>

      <div className="m-cal-grid m-cal-dow" aria-hidden="true">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="m-cal-grid">
        {cells.map((cell) => (
          <button
            key={cell.key}
            type="button"
            disabled={!cell.inMonth}
            onClick={() => onSelectDate(cell.key)}
            aria-pressed={cell.isSelected}
            aria-label={`${cell.num} ${MONTHS[month]}${cell.status === 'yes' ? ', coming' : cell.status === 'no' ? ', not coming' : ''}`}
            className={[
              'm-cal-day',
              cell.inMonth ? '' : 'm-cal-day-out',
              cell.status ? `m-cal-day-${cell.status}` : '',
              cell.isSelected ? 'm-cal-day-selected' : '',
              cell.isToday ? 'm-cal-day-today' : '',
            ].join(' ')}
          >
            {cell.num}
          </button>
        ))}
      </div>

      <div className="m-cal-legend">
        <span><i className="m-swatch m-swatch-go" /> Coming</span>
        <span><i className="m-swatch m-swatch-stop" /> Not coming</span>
        <span><i className="m-swatch m-swatch-wait" /> Pending</span>
      </div>
    </section>
  );
}
