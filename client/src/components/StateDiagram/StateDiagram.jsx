import { memo, useMemo, useState } from 'react';
import ArrowMarker from './ArrowMarker';
import DiagramControls from './DiagramControls';
import StateNode from './StateNode';
import TransitionEdge from './TransitionEdge';
import {
  collectDeadStates,
  groupTransitions,
  layoutStates,
  routeEdges,
  simulationHighlights,
} from './diagramUtils';

function StateDiagram({ automaton, simulation }) {
  const [zoom, setZoom] = useState(1);

  const { layout, edges, routes, deadStates, highlights } = useMemo(() => {
    const deadStates = collectDeadStates(automaton);
    const edges = groupTransitions(automaton);
    const layout = layoutStates(automaton, deadStates);
    return {
      layout,
      edges,
      routes: routeEdges(edges, layout),
      deadStates,
      highlights: simulationHighlights(automaton, simulation),
    };
  }, [automaton, simulation]);

  const startPos = layout.positions[automaton.startState];

  return (
    <section aria-labelledby="state-diagram-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="state-diagram-title" className="font-display text-lg font-semibold">
            State Diagram
          </h2>
          <p className="mt-1 text-sm text-ink-muted dark:text-ink-darkMuted">
            A vector view of the same transitions shown in the table.
          </p>
        </div>
        <DiagramControls zoom={zoom} onZoom={setZoom} onReset={() => setZoom(1)} />
      </div>

      <div className="mt-5 overflow-auto rounded-xl border border-line bg-surface-muted p-3 dark:border-line-dark dark:bg-canvas-dark">
        <svg
          role="img"
          aria-label={`${automaton.kind.toUpperCase()} state diagram with ${automaton.states.length} states`}
          viewBox={`-20 -80 ${layout.width + 20} ${layout.height + 80}`}
          style={{
            width: `${(layout.width + 20) * zoom}px`,
            minWidth: `${Math.min(layout.width + 20, 440)}px`,
            height: `${(layout.height + 80) * zoom}px`,
          }}
          className="mx-auto block transition-[width,height] duration-200"
        >
          <defs>
            <ArrowMarker />
          </defs>

          {/* Start-state arrow */}
          {startPos && (
            <g className="text-ink-muted dark:text-ink-darkMuted">
              <path
                d={`M ${startPos.x - 60} ${startPos.y} L ${startPos.x - NODE_RADIUS - 4} ${startPos.y}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                markerEnd="url(#autofa-arrowhead)"
              />
            </g>
          )}

          {/* Edges */}
          {routes.map(({ edge, geometry }) => (
            <TransitionEdge
              key={edge.key}
              edge={edge}
              geometry={geometry}
              alphabet={automaton.alphabet}
              active={highlights.edges}
            />
          ))}

          {/* State nodes */}
          {automaton.states.map(state => (
            <StateNode
              key={state}
              state={state}
              point={layout.positions[state]}
              accepting={(automaton.acceptingStates ?? automaton.acceptStates ?? []).includes(state)}
              dead={deadStates.has(state)}
              active={highlights.states.has(state)}
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div
        className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted dark:text-ink-darkMuted"
        aria-label="Diagram legend"
      >
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-full border border-ink-muted" />
          Normal state
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-full border-2 border-success ring-2 ring-success-soft" />
          Accept state
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-full border border-danger bg-danger-soft" />
          Dead state
        </span>
        <span>Arrow: transition</span>
        {layout.strategy && layout.strategy !== 'linear' && (
          <span className="rounded bg-surface px-2 py-0.5 font-semibold capitalize dark:bg-surface-dark">
            {layout.strategy} layout
          </span>
        )}
      </div>

      {simulation && (
        <p className={`mt-3 text-sm font-medium ${simulation.accepted ? 'text-success' : 'text-danger'}`}>
          Simulation path highlighted: {simulation.accepted ? 'accepted' : 'rejected'}.
        </p>
      )}
    </section>
  );
}

// expose constant for start-arrow calculation
const NODE_RADIUS = 32;

export default memo(StateDiagram);