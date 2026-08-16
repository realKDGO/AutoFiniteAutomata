import { memo } from 'react';

function BuilderTable({
  tableData,
  onUpdateCell,
  simulationActive = false,
}) {
  const { type, states, alphabet, transitions, stateById } = tableData;
  // Editing the transition table while a simulation is running/paused/
  // animating would mutate the automaton out from under the active
  // animateMotion + activeTransitionId the simulator is tracking. Lock the
  // table the same way the canvas is locked until the user resets.
  const guardedUpdateCell = (...args) => {
    if (simulationActive) return;
    onUpdateCell(...args);
  };

  if (states.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface-muted p-6 text-center text-sm text-ink-muted dark:border-line-dark dark:bg-canvas-dark">
        No states created yet. Add states to view the transition table.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      <table className="data-table w-full min-w-[500px] text-left text-xs sm:text-sm">
        <thead className="sticky top-0 bg-surface-muted text-xs uppercase tracking-wider text-ink-soft dark:bg-surface-darkMuted/60">
          <tr>
            <th className="px-4 py-3 sm:px-6 sm:py-4">State</th>
            {alphabet.map(symbol => (
              <th key={symbol} className="px-4 py-3 sm:px-6 sm:py-4 font-mono">
                {symbol}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {states.map(state => {
            return (
              <tr key={state.id} className="border-t border-line/70 dark:border-line-dark">
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-mono font-semibold whitespace-nowrap">
                  {state.initial && <span className="mr-1 text-primary">→</span>}
                  {state.name}
                  {state.accepting && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-sans text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      ACCEPT
                    </span>
                  )}
                  {state.dead && (
                    <span className="ml-2 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wide text-danger dark:bg-red-950 dark:text-red-300">
                      DEAD
                    </span>
                  )}
                </th>

                {alphabet.map(symbol => {
                  // Find outgoing transition for this symbol
                  const outgoing = transitions.filter(
                    t => t.from === state.id && t.symbols.includes(symbol)
                  );
                  const targetStateIds = outgoing.map(t => t.to);

                  return (
                    <td key={symbol} className="px-4 py-3 sm:px-6 sm:py-4 font-mono">
                      {type === 'DFA' ? (
                        <select
                          className="focus-ring rounded-md border border-line bg-surface px-2 py-1 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
                          value={targetStateIds[0] ?? ''}
                          disabled={simulationActive}
                          onChange={e => {
                            const newToId = e.target.value;
                            guardedUpdateCell(state.id, symbol, newToId ? [newToId] : []);
                          }}
                        >
                          <option value="">— (none)</option>
                          {states.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {targetStateIds.length === 0 && (
                            <span
                              className="mr-1 text-sm font-semibold text-ink-soft dark:text-ink-darkMuted"
                              aria-label="No destination states (empty set)"
                              title="No destination states"
                            >
                              ∅
                            </span>
                          )}
                          {states.map(s => {
                            const isSelected = targetStateIds.includes(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                disabled={simulationActive}
                                onClick={() => {
                                  const updated = isSelected
                                    ? targetStateIds.filter(id => id !== s.id)
                                    : [...targetStateIds, s.id];
                                  guardedUpdateCell(state.id, symbol, updated);
                                }}
                                className={`rounded px-1.5 py-0.5 text-xs font-mono transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  isSelected
                                    ? 'bg-primary text-white font-bold'
                                    : 'border border-line bg-surface-muted text-ink-muted hover:bg-primary-soft dark:border-line-dark dark:bg-surface-darkMuted'
                                }`}
                              >
                                {s.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(BuilderTable);
