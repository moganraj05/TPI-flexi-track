import { theme } from '../../theme';

// Consolidates the button styles every page already applies ad hoc
// (theme.primaryBtnInline / theme.ghostBtn / theme.dangerBtnFilled / the
// repeated `{...theme.ghostBtn, color: SUCCESS, borderColor: SUCCESS}`
// override) behind one component with real hover/active/focus feedback —
// inline `style` objects can't express those pseudo-classes, so this is the
// only way to give existing button styles that feedback without rewriting
// every page. Existing pages keep using theme.* directly for now; this is
// additive, for new/updated call sites to adopt.
const VARIANTS = {
  primary: { style: theme.primaryBtnInline, className: 'ft-btn ft-btn-primary' },
  secondary: { style: theme.ghostBtn, className: 'ft-btn ft-btn-secondary' },
  danger: { style: theme.dangerBtnFilled, className: 'ft-btn ft-btn-danger' },
  success: { style: theme.successBtnOutline, className: 'ft-btn ft-btn-success' },
};

// `size="sm"` compacts any variant to the same 6px/12px padding ghostBtn and
// successBtnOutline already used — needed for inline/per-row actions (e.g. a
// table's Yes/No buttons) where the default padding (sized for a toolbar or
// modal action) would look oversized next to other compact controls.
const SIZE_STYLE = { sm: { padding: '6px 12px' } };

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  loadingLabel,
  type = 'button',
  onClick,
  style,
  children,
  ...rest
}) {
  const { style: variantStyle, className } = VARIANTS[variant] || VARIANTS.primary;
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={className}
      style={{ ...variantStyle, ...SIZE_STYLE[size], opacity: isDisabled ? 0.5 : 1, ...style }}
      {...rest}
    >
      {loading ? loadingLabel || 'Working…' : children}
    </button>
  );
}
