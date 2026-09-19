import { theme, filterBtnStyle } from '../../theme';

export function FilterChips({ options, value, onChange }) {
  return (
    <div style={theme.filterRow}>
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)} style={filterBtnStyle(value === opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function plantFilterOptions(departments) {
  return [
    { value: 'all', label: 'All plants' },
    ...(departments || []).filter((d) => d.isActive !== false).map((d) => ({ value: d.id, label: d.code })),
  ];
}
