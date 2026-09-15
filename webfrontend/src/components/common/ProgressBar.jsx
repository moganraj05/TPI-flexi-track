import { theme, barSegStyle, SUCCESS, DANGER, WARNING } from '../../theme';

export function ProgressBar({ coming, notComing, pending, total }) {
  const safeTotal = total || 1;
  return (
    <div style={theme.progressTrack}>
      <div style={barSegStyle((coming / safeTotal) * 100, SUCCESS)} />
      <div style={barSegStyle((notComing / safeTotal) * 100, DANGER)} />
      <div style={barSegStyle((pending / safeTotal) * 100, WARNING)} />
    </div>
  );
}

export function Legend({ coming, notComing, pending, total }) {
  return (
    <div style={theme.legendRow}>
      <span style={{ color: SUCCESS }}>{coming} coming</span>
      <span style={{ color: DANGER }}>{notComing} not coming</span>
      <span style={{ color: WARNING }}>{pending} pending</span>
      {total !== undefined && <span style={{ color: theme.mutedColor }}>{total} total</span>}
    </div>
  );
}
