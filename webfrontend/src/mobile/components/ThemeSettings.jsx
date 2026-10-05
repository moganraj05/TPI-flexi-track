import { Icon } from './Icon';
import { useMobileTheme } from '../context/ThemeContext';

const OPTIONS = [
  { id: 'system', label: 'System', icon: 'device' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

// Three-tile Appearance picker.
export function ThemeSettings() {
  const { themeMode, setThemeMode } = useMobileTheme();
  return (
    <div className="m-theme-grid" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map((option) => {
        const selected = themeMode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`m-theme-tile${selected ? ' m-theme-tile-active' : ''}`}
            onClick={() => setThemeMode(option.id)}
          >
            <span className="m-theme-icon">
              <Icon name={option.icon} size={18} />
            </span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
