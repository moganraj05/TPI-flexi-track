import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../../components/BottomSheet';
import { Button, TextField } from '../../components/ui';
import { useShiftCatalog } from '../../hooks';
import { formatShiftLabel } from '../../utils';

const KEEP_CURRENT = '__keep__';

// Add / edit a worker on the incharge's team. Shifts are picked from the
// plant's fixed catalog (A–E, same list the HR console uses) and sent as a
// shiftCode. A worker whose saved times aren't in the catalog (set up before
// it existed) keeps those times unless the incharge picks a catalog shift.
export function WorkerFormSheet({ open, mode, worker, saving, onClose, onSubmit }) {
  const catalogQuery = useShiftCatalog();
  const catalog = useMemo(() => catalogQuery.data?.data ?? [], [catalogQuery.data]);
  const isEditing = mode === 'edit';

  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [shiftCode, setShiftCode] = useState('');
  const [error, setError] = useState('');

  const currentCatalogCode =
    isEditing && worker ? catalog.find((s) => s.shiftStart === worker.shiftStart && s.shiftEnd === worker.shiftEnd)?.code : undefined;
  const hasCustomShift = isEditing && worker && catalog.length > 0 && !currentCatalogCode;

  useEffect(() => {
    if (!open) return;
    setError('');
    // Re-picked by the effect below (it runs right after this one).
    setShiftCode('');
    if (isEditing && worker) {
      setEmployeeId(worker.employeeId);
      setName(worker.name);
      setPhone(worker.phone || '');
    } else {
      setEmployeeId('');
      setName('');
      setPhone('');
    }
  }, [open, isEditing, worker]);

  // Default selection once the catalog is known: the worker's current shift,
  // "keep current" for a custom one, or the first catalog shift for a new worker.
  useEffect(() => {
    if (!open || catalog.length === 0) return;
    if (isEditing) setShiftCode(currentCatalogCode || KEEP_CURRENT);
    else setShiftCode((prev) => prev || catalog[0].code);
  }, [open, isEditing, catalog, currentCatalogCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeId.trim() || !name.trim()) {
      setError('Employee ID and full name are required.');
      return;
    }
    if (!shiftCode) {
      setError('Choose a shift.');
      return;
    }
    setError('');
    try {
      await onSubmit({
        employeeId: employeeId.trim(),
        name: name.trim(),
        phone: phone.trim(),
        shiftCode: shiftCode === KEEP_CURRENT ? undefined : shiftCode,
      });
    } catch (err) {
      setError(err.message || 'Failed to save worker');
    }
  };

  return (
    <BottomSheet open={open} onClose={() => !saving && onClose()} labelledBy="worker-form-title">
      <form onSubmit={handleSubmit} noValidate>
        <h2 id="worker-form-title" className="m-sheet-title">
          {isEditing ? 'Edit worker' : 'Add worker'}
        </h2>

        <div className="m-form-stack">
          <div className="m-form-row">
            <TextField
              label="Employee ID *"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              placeholder="EMP1050"
              disabled={isEditing}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputClassName="m-mono"
              error={!!error && !employeeId.trim()}
              className="m-flex-1"
            />
            <TextField
              label="Full name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Worker name"
              autoComplete="off"
              error={!!error && !name.trim()}
              className="m-flex-14"
            />
          </div>

          <TextField
            label="Phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile"
            autoComplete="off"
            inputClassName="m-mono"
          />

          <fieldset className="m-fieldset">
            <legend className="m-field-label">Shift</legend>
            {catalogQuery.isPending ? (
              <p className="m-hint">Loading shifts…</p>
            ) : catalogQuery.isError && !catalogQuery.data ? (
              <p className="m-form-error">Could not load the shift list. Check your connection.</p>
            ) : (
              <div className="m-shift-grid">
                {hasCustomShift ? (
                  <ShiftOption
                    checked={shiftCode === KEEP_CURRENT}
                    onSelect={() => setShiftCode(KEEP_CURRENT)}
                    title="Keep current"
                    sub={formatShiftLabel(worker.shiftStart, worker.shiftEnd)}
                  />
                ) : null}
                {catalog.map((shift) => (
                  <ShiftOption
                    key={shift.code}
                    checked={shiftCode === shift.code}
                    onSelect={() => setShiftCode(shift.code)}
                    title={shift.name}
                    sub={formatShiftLabel(shift.shiftStart, shift.shiftEnd)}
                  />
                ))}
              </div>
            )}
            <p className="m-hint">This worker gets a poll after each of these shifts ends, for the next one.</p>
          </fieldset>

          {!isEditing && (
            <p className="m-hint">
              A temporary password is created for them and shown once after you add them. They choose their own password
              the first time they sign in.
            </p>
          )}

          {error ? (
            <p className="m-form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="m-sheet-actions">
          <Button variant="field" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="brand" loading={saving}>
            {isEditing ? 'Save changes' : 'Add worker'}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

function ShiftOption({ checked, onSelect, title, sub }) {
  return (
    <label className={`m-shift-option${checked ? ' m-shift-option-active' : ''}`}>
      <input type="radio" name="shift" checked={checked} onChange={onSelect} className="m-visually-hidden" />
      <span className="m-shift-title">{title}</span>
      <span className="m-shift-sub">{sub}</span>
    </label>
  );
}
