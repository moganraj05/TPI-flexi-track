import { useState } from 'react';
import { theme } from '../../theme';

export function NameLinkButton({ onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...theme.nameLinkBtn, ...(hover ? { textDecoration: 'underline', color: theme.accent } : null) }}
    >
      {children}
    </button>
  );
}
