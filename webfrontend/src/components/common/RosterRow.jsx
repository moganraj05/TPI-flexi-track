import { useState } from 'react';
import { theme } from '../../theme';
import { Avatar } from './Avatar';

// `actions` is optional trailing content (e.g. mark-attendance buttons) that
// sits next to the row instead of inside it — the name/avatar stays its own
// <button> (so the whole row is still one click to open the person's detail
// page), with actions as a sibling so a nested <button> never happens. Every
// existing caller that doesn't pass `actions` renders byte-for-byte the same
// as before this was added.
export function RosterRow({ name, tag, onClick, actions }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        borderRadius: 8,
        background: hover ? theme.bg : 'transparent',
        marginBottom: 2,
      }}
    >
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ ...theme.rosterRow, flex: 1, minWidth: 0, marginBottom: 0, background: 'transparent' }}
      >
        <Avatar name={name} />
        <span style={theme.rosterPersonInfo}>
          <span style={theme.rosterPersonName}>{name}</span>
          {tag && <span style={theme.rosterPersonTag}>{tag}</span>}
        </span>
      </button>
      {actions && (
        <span style={{ display: 'flex', gap: 6, paddingRight: 8, flexShrink: 0 }}>{actions}</span>
      )}
    </div>
  );
}
