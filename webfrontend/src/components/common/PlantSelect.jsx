import { useState } from 'react';
import { theme } from '../../theme';

// A pill-shaped dropdown for the plant filter — same visual language as the
// filter chips (rounded, bordered, theme font/colors) but compact, since the
// plant list can grow past what a row of chips can comfortably hold.
export function PlantSelect({ options, value, onChange }) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          padding: '7px 32px 7px 16px',
          borderRadius: 20,
          border: `1px solid ${focused ? theme.accent : theme.borderColor}`,
          background: theme.surface,
          color: theme.textPrimary,
          fontSize: 12.5,
          fontWeight: 700,
          fontFamily: theme.font,
          cursor: 'pointer',
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${theme.accentSoft || theme.borderColor}55` : 'none',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          fontSize: 9,
          color: theme.mutedColor,
        }}
      >
        ▼
      </span>
    </div>
  );
}
