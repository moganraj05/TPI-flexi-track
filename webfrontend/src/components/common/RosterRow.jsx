import { useState } from 'react';
import { theme } from '../../theme';
import { Avatar } from './Avatar';

export function RosterRow({ name, tag, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...theme.rosterRow, background: hover ? theme.bg : 'transparent' }}
    >
      <Avatar name={name} />
      <span style={theme.rosterPersonInfo}>
        <span style={theme.rosterPersonName}>{name}</span>
        {tag && <span style={theme.rosterPersonTag}>{tag}</span>}
      </span>
    </button>
  );
}
