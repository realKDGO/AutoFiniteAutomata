import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { useState, useEffect } from 'react';

export default function TransitionModal({
  open,
  onClose,
  fromState,
  toState,
  existingSymbols = [],
  alphabet = [],
  onSave,
  onDelete,
  sourceConnectorId,
  targetConnectorId,
}) {
  const [selectedSymbols, setSelectedSymbols] = useState([]);

  useEffect(() => {
    setSelectedSymbols(existingSymbols);
  }, [existingSymbols, open]);

  if (!open || !fromState || !toState) return null;

  const toggleSymbol = sym => {
    setSelectedSymbols(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  const handleSave = () => {
    if (selectedSymbols.length > 0) {
      onSave(selectedSymbols, sourceConnectorId, targetConnectorId);
    } else if (onDelete) {
      onDelete();
    }
    onClose();
  };

  return (
    <Modal open={open} title="Transition Details" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-surface-muted p-3 dark:bg-surface-darkMuted">
          <div>
            <span className="text-xs uppercase font-bold text-ink-soft">From State</span>
            <p className="font-mono font-bold text-base text-ink dark:text-ink-dark">{fromState.name}</p>
          </div>
          <div>
            <span className="text-xs uppercase font-bold text-ink-soft">To State</span>
            <p className="font-mono font-bold text-base text-ink dark:text-ink-dark">{toState.name}</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
            Input Symbols
          </label>
          <div className="flex flex-wrap gap-2">
            {alphabet.map(sym => {
              const active = selectedSymbols.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggleSymbol(sym)}
                  className={`focus-ring rounded-lg px-3.5 py-1.5 font-mono text-sm font-semibold transition ${
                    active
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-primary/15'
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2 pt-2 border-t border-line dark:border-line-dark">
          {onDelete && existingSymbols.length > 0 ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              Delete Transition
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
