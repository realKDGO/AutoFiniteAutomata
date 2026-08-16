import { useEffect, useState } from 'react';
import { Save, FolderOpen, Trash2, AlertTriangle } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

/**
 * Save/Load management UI (V2.3.2). Purely presentational — all actual
 * persistence goes through the props, which BuilderPage wires up to
 * useSavedAutomata() and the "will this replace unsaved work" confirmation.
 *
 * Internal `view` state only ever swaps between sub-screens of THIS panel
 * (list / duplicate-name conflict / delete confirmation) — it never stacks
 * a second modal on top, keeping with the app's one-panel-at-a-time rule.
 */
export default function SavedAutomataPanel({
  entries,
  currentAutomaton,
  defaultName = '',
  onSave,
  onRequestLoad,
  onDelete,
}) {
  const [view, setView] = useState('list'); // 'list' | 'confirmDuplicate' | 'confirmDelete'
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState('');
  const [pendingDuplicateId, setPendingDuplicateId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  const isEmptyAutomaton = !currentAutomaton?.states || currentAutomaton.states.length === 0;

  const handleSaveClick = () => {
    setError('');
    const result = onSave(name);
    if (result.ok) {
      setView('list');
      return;
    }
    if (result.error === 'duplicate-name') {
      setPendingDuplicateId(result.existingId);
      setView('confirmDuplicate');
      return;
    }
    if (result.error === 'empty-automaton') {
      setError('Add at least one state before saving.');
      return;
    }
    if (result.error === 'name-required') {
      setError('Enter a name for this automaton.');
      return;
    }
    setError('Something went wrong saving locally. Please try again.');
  };

  const handleConfirmOverwrite = () => {
    const result = onSave(name, { overwriteId: pendingDuplicateId });
    setPendingDuplicateId(null);
    setError(result.ok ? '' : 'Something went wrong saving locally. Please try again.');
    setView('list');
  };

  const handleChooseDifferentName = () => {
    setPendingDuplicateId(null);
    setView('list');
  };

  const requestDelete = id => {
    setPendingDeleteId(id);
    setView('confirmDelete');
  };

  const confirmDelete = () => {
    if (pendingDeleteId) onDelete(pendingDeleteId);
    setPendingDeleteId(null);
    setView('list');
  };

  const pendingDeleteEntry = entries.find(e => e.id === pendingDeleteId);
  const pendingDuplicateEntry = entries.find(e => e.id === pendingDuplicateId);

  if (view === 'confirmDuplicate') {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-ink-muted dark:text-ink-darkMuted">
          An automaton named <span className="font-semibold text-ink dark:text-ink-dark">"{pendingDuplicateEntry?.name ?? name.trim()}"</span> already exists.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={handleConfirmOverwrite}>
            Update "{pendingDuplicateEntry?.name ?? name.trim()}"
          </Button>
          <Button variant="secondary" onClick={handleChooseDifferentName}>
            Choose a different name
          </Button>
          <Button variant="ghost" onClick={() => { setPendingDuplicateId(null); setView('list'); }}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (view === 'confirmDelete') {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-ink-muted dark:text-ink-darkMuted">
          Delete <span className="font-semibold text-ink dark:text-ink-dark">"{pendingDeleteEntry?.name}"</span>? This saved automaton will be permanently removed.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setPendingDeleteId(null); setView('list'); }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-sm">
      {/* Save form */}
      <div className="space-y-2">
        <Input
          label="Automaton name"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          placeholder="e.g. Binary Automaton"
          maxLength={60}
        />
        {error && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-danger">
            <AlertTriangle size={13} /> {error}
          </p>
        )}
        <Button
          variant="primary"
          className="w-full"
          disabled={isEmptyAutomaton}
          onClick={handleSaveClick}
        >
          <Save size={15} /> Save Current Automaton
        </Button>
        {isEmptyAutomaton && (
          <p className="text-xs text-ink-soft">Add at least one state before saving.</p>
        )}
      </div>

      {/* Saved list */}
      <div className="space-y-2 border-t border-line pt-4 dark:border-line-dark">
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Saved Automata
        </label>

        {entries.length === 0 ? (
          <p className="rounded-lg bg-surface-muted p-3 text-xs text-ink-soft dark:bg-surface-darkMuted">
            Nothing saved yet. Give your automaton a name above to keep it here.
          </p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {entries.map(entry => (
              <li
                key={entry.id}
                className="rounded-xl border border-line p-3 dark:border-line-dark"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink dark:text-ink-dark">{entry.name}</p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      Updated {formatTimestamp(entry.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => requestDelete(entry.id)}
                    className="focus-ring shrink-0 rounded-lg p-1.5 text-ink-soft hover:bg-danger-soft hover:text-danger"
                    aria-label={`Delete ${entry.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {entry.automatonValid ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => onRequestLoad(entry.id, entry.name)}
                  >
                    <FolderOpen size={14} /> Load
                  </Button>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
                    <AlertTriangle size={13} /> Unable to load this automaton. The saved data is invalid or incompatible.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
