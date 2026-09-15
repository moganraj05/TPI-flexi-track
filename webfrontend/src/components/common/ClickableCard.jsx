import { useState } from 'react';
import { theme } from '../../theme';

export function ClickableCard({ onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...theme.clickableCard, ...(hover ? { borderColor: theme.accent } : null) }}
    >
      {children}
    </button>
  );
}
