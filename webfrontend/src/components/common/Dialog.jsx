import { theme } from '../../theme';

// The shared overlay/card chrome ConfirmDialog already used inline — pulled
// out so any future non-confirm modal reuses the same structure (and the
// same fade/scale entrance) instead of re-implementing theme.modalOverlay /
// theme.modalCard from scratch. ConfirmDialog itself is the only current
// consumer; its rendered output/behavior is unchanged by this extraction.
export function Dialog({ onClose, disableOverlayClose, children }) {
  return (
    <div
      className="ft-modal-overlay"
      style={theme.modalOverlay}
      onMouseDown={(e) => e.target === e.currentTarget && !disableOverlayClose && onClose?.()}
    >
      <div className="ft-modal-card" style={theme.modalCard}>
        {children}
      </div>
    </div>
  );
}
