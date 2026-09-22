import { theme } from '../../theme';

// Loading-state primitives for the gap the audit flagged: every page today
// is either a full CenteredSpinner or fully-rendered content, with nothing
// in between for a background refetch (isFetching) or a page turn. Not
// wired into any page yet — available for the screen-by-screen redesign.
export function Skeleton({ width = '100%', height = 14, radius = 8, style }) {
  return <div className="ft-skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonText({ width = '100%', height = 14, style }) {
  return <Skeleton width={width} height={height} radius={4} style={style} />;
}

// Mirrors theme.card's shape so it can drop in wherever a StatCard/poll-strip
// card is loading.
export function SkeletonCard({ lines = 2 }) {
  return (
    <div style={theme.card}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonText
          key={i}
          width={i === lines - 1 ? '55%' : '80%'}
          height={i === 0 ? 18 : 12}
          style={i > 0 ? { marginTop: 10 } : undefined}
        />
      ))}
    </div>
  );
}

// A drop-in <tbody> replacement for a table whose query is still loading —
// reuses theme.tr/theme.td so skeleton rows sit at the same height as real
// rows once they arrive.
export function SkeletonTableRows({ columns = 4, rows = 4 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} style={theme.tr}>
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c} style={theme.td}>
              <SkeletonText width={c === 0 ? '70%' : '50%'} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
