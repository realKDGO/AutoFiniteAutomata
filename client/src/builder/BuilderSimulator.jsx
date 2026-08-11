import { Pause, Play, RotateCcw, SkipForward, Lock } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { SIMULATION_SPEEDS } from './useBuilderSimulation';

const STATUS_LABELS = {
  IDLE:     'Ready',
  RUNNING:  'Running',
  PAUSED:   'Paused',
  ACCEPTED: 'ACCEPT',
  REJECTED: 'REJECT',
};

/** Returns resolved state representation for single state or NFA state set. */
function resolveCurrentStateText(session, stateById) {
  const activeIds = session?.currentStates?.length
    ? session.currentStates
    : session?.currentStateId
      ? [session.currentStateId]
      : [];

  if (!activeIds.length || !stateById) return '—';

  const names = activeIds.map(id => {
    const s = stateById[id];
    if (!s) return id;
    return `${s.name}${s.dead ? ' (dead)' : ''}`;
  });

  return names.join(', ');
}

export default function BuilderSimulator({ simulation, stateById }) {
  const { session, speed, setSpeed, setInput, play, pause, nextStep, reset, simulationActive } = simulation;
  const terminal      = session.status === 'ACCEPTED' || session.status === 'REJECTED';
  const status        = session.isDead && !terminal ? 'DEAD' : STATUS_LABELS[session.status];
  const currentStateText = resolveCurrentStateText(session, stateById);
  const isAccepted    = session.status === 'ACCEPTED';
  const isRejected    = session.status === 'REJECTED';

  const statusColor = isAccepted
    ? 'text-emerald-700 dark:text-emerald-300'
    : isRejected
      ? 'text-danger'
      : session.isDead
        ? 'text-amber-700 dark:text-amber-300'
        : session.status === 'RUNNING'
          ? 'text-primary'
          : 'text-ink-soft dark:text-ink-darkMuted';

  return (
    <div className="space-y-4">

      {/* ── Input + speed ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <Input
            label="Input String"
            value={session.input}
            onChange={event => setInput(event.target.value)}
            placeholder="e.g. 0101"
            disabled={session.status === 'RUNNING' || session.isAnimating}
          />
        </div>
        <label className="space-y-1 text-xs font-bold uppercase tracking-wider text-ink-soft">
          Speed
          <select
            value={speed}
            onChange={event => setSpeed(event.target.value)}
            className="block w-full rounded-lg border border-line bg-surface px-2 py-2 text-xs font-semibold normal-case tracking-normal dark:border-line-dark dark:bg-surface-dark"
          >
            {Object.keys(SIMULATION_SPEEDS).map(value => (
              <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-2">
        {session.isPlaying ? (
          <Button type="button" size="sm" variant="secondary" onClick={pause}>
            <Pause size={16} /> Pause
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={play} disabled={terminal || session.isAnimating}>
            <Play size={16} /> {session.status === 'PAUSED' ? 'Resume' : 'Run'}
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={nextStep} disabled={session.isAnimating || terminal}>
          <SkipForward size={16} /> Next Step
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset}>
          <RotateCcw size={16} /> Reset
        </Button>
      </div>

      {/* Editing-locked notice (only while actively running/paused/animating) */}
      {simulationActive && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <Lock size={12} />
          Canvas editing is locked — reset simulation to edit.
        </div>
      )}

      {/* Input tape + Current state info. Order differs by breakpoint: on
          mobile the spec wants Current State directly above Input Tape;
          desktop keeps its original Input Tape → Current State order.
          Wrapping in a flex column lets `order` reflow them per-breakpoint
          without duplicating either card's markup. */}
      <div className="flex flex-col gap-4">
        {/* ── Input tape ── */}
        <div className="order-2 lg:order-1 rounded-xl border border-line bg-surface-muted p-3 dark:border-line-dark dark:bg-canvas-dark">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold uppercase tracking-wider text-ink-soft">Input tape</span>
            <span className={`font-bold ${statusColor}`}>{status}</span>
          </div>

          {session.input ? (
            <div
              className="flex flex-wrap gap-1"
              aria-label={`Input tape, position ${session.index} of ${session.input.length}`}
            >
              {[...session.input].map((symbol, index) => (
                <span
                  key={`${symbol}-${index}`}
                  className={`grid h-8 w-8 place-items-center rounded-md border font-mono text-sm font-bold transition-colors ${
                    index === session.index && !terminal
                      ? 'border-amber-400 bg-amber-400 text-white shadow-sm'
                      : index < session.index
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-line bg-surface text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'
                  }`}
                >
                  {symbol}
                </span>
              ))}
              {terminal && <span className="ml-1 self-center text-xs font-semibold text-ink-muted">Complete</span>}
            </div>
          ) : (
            <p className="text-sm text-ink-muted dark:text-ink-darkMuted">
              Empty input — the initial state will be evaluated.
            </p>
          )}
        </div>

        {/* ── Current state info ── */}
        <div className="order-1 lg:order-2 grid grid-cols-2 gap-3 rounded-xl border border-line p-3 text-xs dark:border-line-dark">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-soft">Current state</span>
            <span className="font-mono font-bold text-ink dark:text-ink-dark">
              <span className={session.isDead ? 'text-red-600 dark:text-red-400' : 'text-ink dark:text-ink-dark'}>
                {currentStateText}
              </span>
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-soft">Progress</span>
            <span className="font-mono font-bold text-ink dark:text-ink-dark">
              {session.index} / {session.input.length}
            </span>
          </div>
        </div>
      </div>

      {/* ── Active symbol callout ── */}
      {session.activeSymbol && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
          <span className="grid h-6 w-6 place-items-center rounded border border-amber-400 bg-amber-400 font-mono text-sm font-bold text-white">
            {session.activeSymbol}
          </span>
          <span className="font-semibold text-amber-800 dark:text-amber-300">
            Reading symbol and following transition…
          </span>
        </div>
      )}

      {/* ── Error message ── */}
      {session.error && (
        <p className="text-xs font-medium text-danger">{session.error}</p>
      )}

      {/* ── Terminal result banner ── */}
      {terminal && (
        <div className={`rounded-xl p-4 text-center ${
          isAccepted
            ? 'bg-emerald-100 dark:bg-emerald-950/50'
            : 'bg-red-100 dark:bg-red-950/50'
        }`}>
          <p className={`text-xl font-black tracking-wide ${
            isAccepted ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-400'
          }`}>
            {session.result}
          </p>
          <p className="mt-1 text-xs text-ink-muted dark:text-ink-darkMuted">
            Final state: <strong className="font-mono">{currentStateText}</strong>
          </p>
          {session.input.length > 0 && (
            <p className="mt-0.5 text-xs text-ink-muted dark:text-ink-darkMuted">
              Input: <strong className="font-mono">{session.input}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
