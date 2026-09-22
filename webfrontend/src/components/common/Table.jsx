import { theme } from '../../theme';

// Wraps the table style objects every page already applies directly
// (theme.table / theme.tableHeadRow / theme.th / theme.tr / theme.td) so a
// hover state can be added once (via the `ft-table-row` CSS class — inline
// styles can't express :hover) instead of every page needing its own. This
// is additive: existing pages keep rendering raw <table style={theme.table}>
// elements unchanged.
export function Table({ children, style }) {
  return <table style={{ ...theme.table, ...style }}>{children}</table>;
}

export function TableHead({ children }) {
  return (
    <thead>
      <tr style={theme.tableHeadRow}>{children}</tr>
    </thead>
  );
}

export function Th({ children, style }) {
  return <th style={{ ...theme.th, ...style }}>{children}</th>;
}

export function TableRow({ children, style, onClick, className }) {
  return (
    <tr className={className ? `ft-table-row ${className}` : 'ft-table-row'} style={{ ...theme.tr, ...style }} onClick={onClick}>
      {children}
    </tr>
  );
}

export function Td({ children, style }) {
  return <td style={{ ...theme.td, ...style }}>{children}</td>;
}
