import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';

const WORKER_TABS = [
  { to: '/home', label: 'Poll', icon: 'clipboard', dotKey: 'poll' },
  { to: '/history', label: 'History', icon: 'calendar' },
  { to: '/profile', label: 'Profile', icon: 'person' },
];

const INCHARGE_TABS = [
  { to: '/incharge', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/incharge/team', label: 'Team', icon: 'people' },
  { to: '/incharge/profile', label: 'Profile', icon: 'person' },
];

// The floating pill dock: the active tab grows and shows its label; the
// others show only their icon. `pollUnanswered` puts the small amber dot on
// the worker's Poll tab while today's poll still needs an answer.
export function TabBar({ isIncharge, pollUnanswered }) {
  const tabs = isIncharge ? INCHARGE_TABS : WORKER_TABS;
  return (
    <nav className="m-dock" aria-label="Main">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          replace
          className={({ isActive }) => `m-dock-item${isActive ? ' m-dock-item-active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <Icon name={tab.icon} size={20} />
              <span className={isActive ? 'm-dock-label' : 'm-visually-hidden'}>{tab.label}</span>
              {tab.dotKey === 'poll' && pollUnanswered && !isActive ? (
                <span className="m-dock-dot" aria-label="Poll waiting for your answer" />
              ) : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
