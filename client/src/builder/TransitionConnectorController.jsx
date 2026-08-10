import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import StateNode from '../components/StateDiagram/StateNode';
import { CONNECTOR_POINTS, getConnectorUsage } from './connectorSnap';

const POINT_RADIUS = 52;
const CENTER = 80;

export function StateConnectorPicker({ state, transitions, selectedId, onSelect, disabled, title, excludeTransitionId = null }) {
  if (!state) return null;
  return (
    <section className={disabled ? 'opacity-45' : ''}>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-soft">{title}</p>
      <div className="relative mx-auto h-[145px] w-[160px]" aria-label={`${title}: ${state.name}`}>
        <svg viewBox="0 0 160 145" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <StateNode state={state.name} point={{ x: CENTER, y: 72 }} accepting={state.accepting} dead={state.dead} active />
        </svg>
        {CONNECTOR_POINTS.map(connector => {
          const angle = connector.angleDeg * Math.PI / 180;
          const usage = getConnectorUsage(transitions, state.id, connector.id, excludeTransitionId);
          const full = usage >= 2;
          const selected = selectedId === connector.id;
          const faded = selectedId != null && !selected;
          const left = CENTER + POINT_RADIUS * Math.cos(angle) - 18;
          const top = 72 + POINT_RADIUS * Math.sin(angle) - 18;
          return (
            <button
              key={connector.id}
              type="button"
              disabled={disabled}
              aria-label={`${connector.label} connector, ${usage} of 2 slots used${full ? ', full' : ''}`}
              aria-disabled={disabled || full}
              title={`${connector.label} connector (${usage}/2)`}
              onClick={() => onSelect(connector.id, full)}
              style={{ left, top }}
              className={`focus-ring absolute flex h-9 w-9 items-center justify-center rounded-full transition ${
                selected ? 'scale-110 bg-primary shadow-[0_0_0_4px_rgb(22_131_216_/_0.22)]' : full ? 'bg-slate-300 dark:bg-slate-600' : usage === 1 ? 'bg-amber-400' : 'bg-slate-500 dark:bg-slate-300'
              } ${faded ? 'scale-75 opacity-20' : full ? 'opacity-40' : 'opacity-100'} ${disabled ? 'cursor-not-allowed' : ''}`}
            >
              <span className="h-3 w-3 rounded-full border-2 border-white/90 bg-white/35" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function TransitionConnectorController({ draft, statesById, transitions, onSelectSource, onSelectTarget, onCancel }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const source = statesById[draft.sourceId];
  const target = statesById[draft.targetId];
  const awaitingSource = draft.sourceConnectorId == null;
  const instruction = awaitingSource ? 'Select a FROM connector.' : target?.id === source?.id ? 'Select a different TO connector.' : 'Select a TO connector.';
  return (
    <aside
      className={`fixed right-3 top-1/2 z-[70] w-[min(19rem,calc(100vw-5.5rem))] -translate-y-1/2 rounded-2xl border border-line bg-surface p-3 shadow-lift transition-transform duration-300 ease-out dark:border-line-dark dark:bg-surface-dark ${entered ? 'translate-x-0' : 'translate-x-[120%]'}`}
      role="dialog"
      aria-label="Transition connector editor"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold text-ink dark:text-ink-dark">Create transition</p><p className="text-[11px] text-ink-muted dark:text-ink-darkMuted">{instruction}</p></div>
        <button type="button" onClick={onCancel} aria-label="Cancel transition" className="focus-ring rounded-lg p-1.5 text-ink-soft hover:bg-primary-soft"><X size={16} /></button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <StateConnectorPicker state={source} transitions={transitions} selectedId={draft.sourceConnectorId} onSelect={onSelectSource} title="From state" />
        <StateConnectorPicker state={target} transitions={transitions} selectedId={draft.targetConnectorId} onSelect={onSelectTarget} disabled={awaitingSource} title="To state" />
      </div>
    </aside>
  );
}
