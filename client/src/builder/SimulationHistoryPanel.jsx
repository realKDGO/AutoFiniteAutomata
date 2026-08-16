// ─── Simulation History Panel — V2.3.5 ───────────────────────────────────────
//
// Purely presentational — all actual persistence goes through props, which
// BuilderPage wires up to useSimulationHistory(). Internal `view` state only
// ever swaps between sub-screens of THIS panel (list / detail / confirmClear)
// following the same pattern as SavedAutomataPanel.
//
// No canvas data, no replay, no SVG — just display of recorded metadata.

import { useState } from 'react';
import { Clock, ChevronLeft, Trash2, CheckCircle2, XCircle, Info } from 'lucide-react';
import Button from '../components/ui/Button';

// ── helpers ────────────────────────────────────────────────────────────────────

function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso ?? '';
  }
}

function formatPath(path) {
  if (!Array.isArray(path) || path.length === 0) return '—';
  return path.join(' → ');
}

// ── sub-components ─────────────────────────────────────────────────────────────

function ResultBadge({ result }) {
  const accepted = result === 'ACCEPT';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        accepted
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
      }`}
    >
      {accepted ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {accepted ? 'Accepted' : 'Rejected'}
    </span>
  );
}

// ── views ──────────────────────────────────────────────────────────────────────

function ListView({ history, onSelect, onRequestClear }) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-xs text-ink-muted dark:text-ink-darkMuted">
        <Clock size={28} className="opacity-30" />
        <div>
          <p className="font-semibold">No simulations recorded yet.</p>
          <p className="mt-0.5">Run a simulation to see its history here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* List */}
      <ul className="max-h-[52vh] space-y-2 overflow-y-auto pr-0.5">
        {history.map(item => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="focus-ring w-full rounded-xl border border-line bg-surface-muted p-3 text-left transition hover:border-primary/50 hover:bg-primary-soft dark:border-line-dark dark:bg-canvas-dark dark:hover:bg-primary/10"
            >
              {/* Row 1: number + result badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-ink-muted dark:text-ink-darkMuted">
                  Simulation #{item.index}
                </span>
                <ResultBadge result={item.result} />
              </div>

              {/* Row 2: input + type */}
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-xs text-ink-muted dark:text-ink-darkMuted">
                  Input:{' '}
                  <span className="font-mono font-semibold text-ink dark:text-ink-dark">
                    {item.input === '' ? <em>ε (empty)</em> : item.input}
                  </span>
                </span>
                <span className="text-xs text-ink-muted dark:text-ink-darkMuted">
                  Type:{' '}
                  <span className="font-semibold text-ink dark:text-ink-dark">{item.type}</span>
                </span>
              </div>

              {/* Row 3: final state + date */}
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-xs text-ink-muted dark:text-ink-darkMuted">
                  Final:{' '}
                  <span className="font-mono font-semibold text-ink dark:text-ink-dark">
                    {item.finalState ?? '—'}
                  </span>
                </span>
                <span className="text-[10px] text-ink-soft dark:text-ink-darkMuted">
                  {formatTimestamp(item.timestamp)}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Clear button */}
      <div className="border-t border-line pt-3 dark:border-line-dark">
        <button
          type="button"
          onClick={onRequestClear}
          className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/30 py-2 text-xs font-semibold text-danger hover:bg-danger-soft"
        >
          <Trash2 size={13} />
          Clear History
        </button>
      </div>
    </div>
  );
}

function DetailView({ item, onBack }) {
  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        className="focus-ring -ml-1 flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-primary dark:text-ink-darkMuted dark:hover:text-sky-300"
      >
        <ChevronLeft size={14} />
        Back to list
      </button>

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-sm font-semibold">
          Simulation #{item.index}
        </h4>
        <ResultBadge result={item.result} />
      </div>

      {/* Detail grid */}
      <div className="rounded-xl border border-line bg-surface-muted p-3 dark:border-line-dark dark:bg-canvas-dark">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="font-bold uppercase tracking-wider text-ink-soft dark:text-ink-darkMuted">Input</dt>
            <dd className="mt-0.5 font-mono font-semibold text-ink dark:text-ink-dark">
              {item.input === '' ? <em className="not-italic text-ink-muted">ε (empty)</em> : item.input}
            </dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-wider text-ink-soft dark:text-ink-darkMuted">Type</dt>
            <dd className="mt-0.5 font-semibold text-ink dark:text-ink-dark">{item.type}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-wider text-ink-soft dark:text-ink-darkMuted">Starting State</dt>
            <dd className="mt-0.5 font-mono font-semibold text-ink dark:text-ink-dark">{item.startingState ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-wider text-ink-soft dark:text-ink-darkMuted">Final State</dt>
            <dd className="mt-0.5 font-mono font-semibold text-ink dark:text-ink-dark">{item.finalState ?? '—'}</dd>
          </div>
          {item.automatonName && (
            <div className="col-span-2">
              <dt className="font-bold uppercase tracking-wider text-ink-soft dark:text-ink-darkMuted">Automaton</dt>
              <dd className="mt-0.5 font-semibold text-ink dark:text-ink-dark">{item.automatonName}</dd>
            </div>
          )}
          <div className="col-span-2">
            <dt className="font-bold uppercase tracking-wider text-ink-soft dark:text-ink-darkMuted">Date / Time</dt>
            <dd className="mt-0.5 text-ink dark:text-ink-dark">{formatTimestamp(item.timestamp)}</dd>
          </div>
        </dl>
      </div>

      {/* Path */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft dark:text-ink-darkMuted">
          Simulation Path
        </p>
        {item.path && item.path.length > 0 ? (
          <div className="rounded-xl border border-line bg-surface-muted p-3 dark:border-line-dark dark:bg-canvas-dark">
            <p className="break-words font-mono text-xs leading-relaxed text-ink dark:text-ink-dark">
              {formatPath(item.path)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-ink-muted dark:text-ink-darkMuted">No path recorded.</p>
        )}
        {item.type === 'NFA' && item.path?.some(p => p.includes('/')) && (
          <p className="flex items-start gap-1 text-[10px] text-ink-soft dark:text-ink-darkMuted">
            <Info size={11} className="mt-0.5 shrink-0" />
            States separated by / indicate multiple simultaneous NFA paths at that step.
          </p>
        )}
      </div>
    </div>
  );
}

function ConfirmClearView({ onConfirm, onCancel }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-ink-muted dark:text-ink-darkMuted">
        Clear all simulation history? This cannot be undone.
      </p>
      <p className="text-[11px] text-ink-soft dark:text-ink-darkMuted">
        Your automaton, saved automata, and all other data will{' '}
        <strong>not</strong> be affected.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Clear History
        </Button>
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function SimulationHistoryPanel({ history, onClearHistory }) {
  const [view, setView] = useState('list');       // 'list' | 'detail' | 'confirmClear'
  const [selectedItem, setSelectedItem] = useState(null);

  const handleSelect = item => {
    setSelectedItem(item);
    setView('detail');
  };

  const handleBack = () => {
    setSelectedItem(null);
    setView('list');
  };

  const handleRequestClear = () => {
    setView('confirmClear');
  };

  const handleConfirmClear = () => {
    onClearHistory();
    setSelectedItem(null);
    setView('list');
  };

  const handleCancelClear = () => {
    setView('list');
  };

  if (view === 'detail' && selectedItem) {
    return <DetailView item={selectedItem} onBack={handleBack} />;
  }

  if (view === 'confirmClear') {
    return <ConfirmClearView onConfirm={handleConfirmClear} onCancel={handleCancelClear} />;
  }

  return (
    <ListView
      history={history}
      onSelect={handleSelect}
      onRequestClear={handleRequestClear}
    />
  );
}
