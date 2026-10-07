import { useEffect } from 'react';

// Phones show data tables as stacked cards (index.css, `.ft-rt`): each row
// becomes a card and each cell a "LABEL  value" line. Inline-styled tables
// can't carry that labelling themselves, so this labels every table inside
// `rootRef` from its own header row — each <td> gets `data-label` (its
// column's header text), the first titled column is the card's heading
// (`data-primary`), full-width cells (colSpan > 1) get `data-full`, and a
// row's select checkbox `data-select` (shown in the card's corner). Tables
// with 6+ columns are `ft-rt-wide`: they become cards on tablets too.
// Re-runs whenever rows are added, removed or re-rendered.
function labelTables(root) {
  root.querySelectorAll('table').forEach((table) => {
    const headRow = table.querySelector(':scope > thead > tr');
    if (!headRow) return;
    const labels = [];
    [...headRow.children].forEach((th) => {
      const text = th.textContent.trim();
      for (let i = 0; i < (th.colSpan || 1); i += 1) labels.push(text);
    });
    const primary = labels.findIndex(Boolean);
    if (!table.classList.contains('ft-rt')) table.classList.add('ft-rt');
    table.classList.toggle('ft-rt-wide', labels.length >= 6);

    table.querySelectorAll(':scope > tbody > tr').forEach((tr) => {
      let col = 0;
      [...tr.children].forEach((td) => {
        const span = td.colSpan || 1;
        if (span > 1) {
          if (td.dataset.full !== '1') td.dataset.full = '1';
        } else {
          const label = labels[col] || '';
          if (td.dataset.label !== label) td.dataset.label = label;
          const isSelect = !label && !!td.querySelector('input[type="checkbox"]');
          if (isSelect && td.dataset.select !== '1') td.dataset.select = '1';
          else if (!isSelect && td.dataset.select) delete td.dataset.select;
          if (col === primary) {
            if (td.dataset.primary !== '1') td.dataset.primary = '1';
          } else if (td.dataset.primary) {
            delete td.dataset.primary;
          }
        }
        col += span;
      });
    });
  });
}

export function useResponsiveTables(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        labelTables(root);
      });
    };
    labelTables(root);
    // Only structure changes — the attributes set above don't re-trigger it.
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootRef]);
}
