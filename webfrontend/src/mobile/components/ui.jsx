import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { useOnline } from '../../hooks/useOnline';
import { avatarTintIndex, initials } from '../utils';

// Small building blocks of the worker / incharge app, ported one-to-one from
// the Expo app's components (Avatar, Button, TextField, PasswordInput,
// SearchInput, Chip/FilterChips, Pagination, ProgressRing, StatusPill,
// ScreenHeader). Styling lives in mobile.css (m-* classes).

export function Avatar({ name, employeeId, size = 46 }) {
  return (
    <span
      className={`m-avatar m-av-${avatarTintIndex(employeeId)}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

// variant: primary (ink) | brand | go | danger | dangerSoft | field
export function Button({ children, variant = 'primary', loading, disabled, icon, block, className = '', type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={`m-btn m-btn-${variant}${block ? ' m-btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="m-btn-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function TextField({ label, error, className = '', inputClassName = '', id, ...inputProps }) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className={`m-field ${className}`}>
      {label ? (
        <label className="m-field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input id={inputId} className={`m-input${error ? ' m-input-error' : ''} ${inputClassName}`} aria-invalid={error || undefined} {...inputProps} />
    </div>
  );
}

export function PasswordInput({ label, error, id, ...inputProps }) {
  const autoId = useId();
  const inputId = id || autoId;
  const [visible, setVisible] = useState(false);
  return (
    <div className="m-field">
      {label ? (
        <label className="m-field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="m-input-wrap">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={`m-input m-input-with-action${error ? ' m-input-error' : ''}`}
          aria-invalid={error || undefined}
          {...inputProps}
        />
        <button
          type="button"
          className="m-input-action"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          <Icon name={visible ? 'eye-off' : 'eye'} size={19} />
        </button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className = '' }) {
  return (
    <div className={`m-search ${className}`}>
      <Icon name="search" size={18} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="search"
      />
      {value ? (
        <button type="button" className="m-search-clear" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function FilterChips({ options, value, onChange, label }) {
  return (
    <div className="m-chips" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={`m-chip${value === opt.value ? ' m-chip-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageCount, onChange, loading }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="m-pager" aria-label="Pages">
      <button type="button" className="m-pager-btn" onClick={() => onChange(page - 1)} disabled={page <= 1 || loading}>
        ← Prev
      </button>
      <span className="m-pager-label">{loading ? 'Loading…' : `Page ${page} of ${pageCount}`}</span>
      <button type="button" className="m-pager-btn" onClick={() => onChange(page + 1)} disabled={page >= pageCount || loading}>
        Next →
      </button>
    </nav>
  );
}

// SVG ring (the Expo app built this from rotated Views to avoid a native
// SVG dependency; on the web SVG is native).
export function ProgressRing({ size, strokeWidth, progress, trackColor, fillColor, children }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="m-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      {children ? <span className="m-ring-label">{children}</span> : null}
    </span>
  );
}

// tone: go | stop | wait | muted | brand
export function StatusPill({ label, tone = 'muted', small }) {
  return <span className={`m-pill m-pill-${tone}${small ? ' m-pill-sm' : ''}`}>{label}</span>;
}

export function ScreenHeader({ kicker, title, name, employeeId, profilePath, onAdd }) {
  const navigate = useNavigate();
  return (
    <header className="m-header">
      <div className="m-header-text">
        <div className="m-kicker">{kicker}</div>
        <h1 className="m-title">{title}</h1>
      </div>
      {onAdd ? (
        <button type="button" className="m-add-btn" onClick={onAdd}>
          <Icon name="plus" size={18} />
          <span>Add</span>
        </button>
      ) : name && employeeId ? (
        <button type="button" className="m-avatar-btn" onClick={() => navigate(profilePath)} aria-label="Profile">
          <Avatar name={name} employeeId={employeeId} size={46} />
        </button>
      ) : null}
    </header>
  );
}

export function StatsCard({ items }) {
  return (
    <div className="m-card m-stats">
      {items.map((item) => (
        <div key={item.label} className="m-stat">
          <span className={`m-stat-value m-text-${item.tone || 'ink'}`}>{item.value}</span>
          <span className="m-stat-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// Offline with nothing saved for this screen yet: say so instead of spinning
// forever — it loads by itself once the connection is back.
export function Loading({ label = 'Loading…' }) {
  const online = useOnline();
  if (!online) {
    return (
      <div className="m-card m-empty" role="status">
        <Icon name="wifi-off" size={30} className="m-text-muted" />
        <div className="m-empty-title">You&apos;re offline</div>
        <p className="m-empty-text">This screen hasn&apos;t been saved on this phone yet. It loads by itself when you&apos;re back online.</p>
      </div>
    );
  }
  return (
    <div className="m-loading" role="status">
      <span className="m-spinner" aria-hidden="true" />
      <span className="m-visually-hidden">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="m-card m-empty">
      <Icon name="alert" size={30} className="m-text-stop" />
      <div className="m-empty-title">Couldn&apos;t load this</div>
      <p className="m-empty-text">{message}</p>
      {onRetry ? (
        <Button variant="field" onClick={onRetry} icon={<Icon name="refresh" size={16} />}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function DetailRow({ label, value }) {
  return (
    <div className="m-detail-row">
      <span className="m-detail-label">{label}</span>
      <span className="m-detail-value">{value}</span>
    </div>
  );
}
