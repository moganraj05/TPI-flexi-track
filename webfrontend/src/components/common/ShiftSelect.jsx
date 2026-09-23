import { useState } from 'react';
import { theme } from '../../theme';
import { formatShiftTime12h } from '../../utils/format';

const shiftOptionLabel = (s) => `${s.name} · ${formatShiftTime12h(s.shiftStart)} – ${formatShiftTime12h(s.shiftEnd)}`;

// Same pill-shaped native <select> as PlantSelect, grouped into "General"
// and "Contract" optgroups so the 5 fixed catalog shifts stay readable as
// the list grows past a plain flat dropdown. Pass `disabled` (with
// `disabledLabel`) when the caller wants this gated behind another choice —
// e.g. a plant must be picked first, since which shifts apply depends on it.
export function ShiftSelect({
  shifts,
  value,
  onChange,
  allowEmpty,
  emptyLabel = 'All shifts',
  disabled,
  disabledLabel = 'Select a plant first',
}) {
  const [focused, setFocused] = useState(false);
  const general = (shifts || []).filter((s) => s.category === 'general');
  const contract = (shifts || []).filter((s) => s.category === 'contract');
  const other = (shifts || []).filter((s) => s.category !== 'general' && s.category !== 'contract');

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        value={disabled ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          padding: '7px 32px 7px 16px',
          borderRadius: 20,
          border: `1px solid ${focused ? theme.accent : theme.borderColor}`,
          background: disabled ? theme.borderColor + '33' : theme.surface,
          color: disabled ? theme.mutedColor : theme.textPrimary,
          fontSize: 12.5,
          fontWeight: 700,
          fontFamily: theme.font,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${theme.accentSoft || theme.borderColor}55` : 'none',
        }}
      >
        {disabled && <option value="">{disabledLabel}</option>}
        {!disabled && allowEmpty && <option value="">{emptyLabel}</option>}
        {general.length > 0 && (
          <optgroup label="General">
            {general.map((s) => (
              <option key={s.code} value={s.code}>
                {shiftOptionLabel(s)}
              </option>
            ))}
          </optgroup>
        )}
        {contract.length > 0 && (
          <optgroup label="Contract">
            {contract.map((s) => (
              <option key={s.code} value={s.code}>
                {shiftOptionLabel(s)}
              </option>
            ))}
          </optgroup>
        )}
        {other.map((s) => (
          <option key={s.code || `${s.shiftStart}-${s.shiftEnd}`} value={s.code}>
            {shiftOptionLabel(s)}
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
