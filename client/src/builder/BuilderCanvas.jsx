import { memo, useState, useRef, useCallback, useEffect } from 'react';
import ArrowMarker from '../components/StateDiagram/ArrowMarker';
import DiagramControls from '../components/StateDiagram/DiagramControls';
import StateNode from '../components/StateDiagram/StateNode';
import TransitionEdge from '../components/StateDiagram/TransitionEdge';
import { edgeGeometry, labelIntersectsLabel } from '../components/StateDiagram/diagramUtils';
import MobileFullscreenSidebar from './MobileFullscreenSidebar';
import {
  getStateConnectors,
  getNearestSnap,
  getVisibleConnectorStateId,
} from './connectorSnap';
import {
  computeSelfLoopGeometry,
  computeTransitionGeometry,
} from './transitionGeometry';


// Matches the Tailwind `lg` breakpoint used elsewhere in the Builder to
// switch between the desktop side-panel layout and the mobile
// floating/sheet layout.
const MOBILE_QUERY = '(max-width: 1023px)';

const NODE_RADIUS = 32;

function labelBox(point, text) {
  const width = Math.max(34, text.length * 7.2);
  return { x: point.x - width / 2, y: point.y - 12, width, height: 18 };
}

function BuilderCanvas({
  automaton,
  stateById,
  groupedEdges,
  activeTool, // 'select' | 'move' | 'transition' — 'move' is the mobile
  // fullscreen "Add State" tool: tapping empty canvas places a new state.
  selectedStateId,
  selectedTransitionKey,
  onSelectState,
  onSelectTransition,
  onMoveState,
  onStartTransition,
  // Called when the user explicitly clicks the Edit button on a selected transition.
  onEditTransition,
  simulation,
  // Mobile fullscreen workspace wiring — all optional so BuilderCanvas keeps
  // working unchanged anywhere it's used without them.
  onSetActiveTool,
  onAddStateAt,
  onOpenMobileSheet,
  onFullscreenChange,
  fullscreenContainerRef,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) {
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  // Fullscreen (mobile-first Interactive Canvas workspace)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Report fullscreen state + the fullscreen root node up to the parent so
  // BuilderPage can portal the Transition Details modal and the mobile
  // Table/Simulator sheets *inside* the element that actually goes
  // fullscreen — the Fullscreen API only renders that element and its
  // descendants, so anything mounted outside of it (as those panels
  // currently are) disappears while fullscreen is active.
  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  useEffect(() => {
    if (fullscreenContainerRef) {
      fullscreenContainerRef.current = wrapperRef.current;
    }
  }, [fullscreenContainerRef]);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handleChange = e => setIsMobile(e.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else {
          // Fullscreen API unsupported — fall back to a CSS-based expanded
          // canvas instead of failing silently.
          setIsFullscreen(true);
        }
        // Progressive enhancement only: never required, never blocks fullscreen.
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen API rejected (unsupported / not allowed) — CSS fallback.
      setIsFullscreen(prev => !prev);
    }
  }, []);

  // Drag tracking state
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [pointerDownStateId, setPointerDownStateId] = useState(null);
  const [pointerDownPos, setPointerDownPos] = useState(null);
  const [hasMoved, setHasMoved] = useState(false);

  // Transition creation / Arrow tip dragging
  const [transitionFromId, setTransitionFromId] = useState(null);
  const [dragLineEnd, setDragLineEnd] = useState(null);

  // Arrow Tip Dragging state (for existing transitions)
  const [draggingArrowEdgeKey, setDraggingArrowEdgeKey] = useState(null);

  // Custom arrow anchor target offsets (for manual non-magnetic pointing)
  const [arrowTargets, setArrowTargets] = useState({}); // edgeKey -> { x, y }

  // ── Connector-snap interaction state ─────────────────────────────────────
  // The snap result currently active during a drag (null = no snap).
  // This is pure interaction state — never stored in the automaton.
  const [activeSnap, setActiveSnap] = useState(null);
  // The state whose 8 connector dots are currently visible (null = none).
  const [visibleConnectorStateId, setVisibleConnectorStateId] = useState(null);
  // Stable ref so handlePointerMove's useCallback closure always reads the
  // latest snap without re-creating the callback on every render.
  const activeSnapRef = useRef(null);

  // Calculate canvas dimensions dynamically
  const positions = automaton.states.map(s => s.position);
  const maxX = Math.max(500, ...positions.map(p => p?.x ?? 200)) + 160;
  const maxY = Math.max(350, ...positions.map(p => p?.y ?? 200)) + 160;

  // edgeGeometry() (shared with the generated State Diagram) expects a flat
  // { x, y } point per state — the same shape layoutStates() produces for
  // generated diagrams. Builder states store their position nested under
  // `.position`, so build a flat map here rather than pass the state objects
  // straight through; that mismatch was why transition paths came out with
  // `undefined` coordinates and never rendered.
  const stateLookup = Object.fromEntries(
    automaton.states.map(s => [s.id, { x: s.position?.x ?? 0, y: s.position?.y ?? 0 }])
  );

  const occupiedLabels = [];
  const routes = groupedEdges.map(edge => {
    const fromState = stateById[edge.from];
    const toState = stateById[edge.to];
    const isSelf = edge.from === edge.to;
    const customTargetPoint = arrowTargets[edge.key];

    let geometry;

    if (isSelf) {
      let connectorId = 0; // Default North
      if (customTargetPoint && customTargetPoint.connectorId !== undefined) {
        connectorId = customTargetPoint.connectorId;
      } else if (customTargetPoint) {
        // Calculate angle to custom point from state center
        const dx = customTargetPoint.x - (fromState?.position?.x ?? 0);
        const dy = customTargetPoint.y - (fromState?.position?.y ?? 0);
        let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (deg < 0) deg += 360;
        connectorId = Math.round(deg / 45) % 8;
      }
      geometry = computeSelfLoopGeometry(
        fromState?.position ?? { x: 0, y: 0 },
        connectorId
      );
    } else {
      const isReverse = groupedEdges.some(other => other.from === edge.to && other.to === edge.from);
      geometry = computeTransitionGeometry(
        fromState?.position ?? { x: 0, y: 0 },
        toState?.position ?? { x: 100, y: 100 },
        customTargetPoint,
        null,
        isReverse
      );
    }

    const adjusted = { ...geometry, label: { ...geometry.label } };

    let candidate = labelBox(adjusted.label, edge.label);

    let attempts = 0;
    while (
      occupiedLabels.some(existing => labelIntersectsLabel(candidate, existing)) &&
      attempts < 12
    ) {
      if (attempts % 3 === 0) {
        adjusted.label.y += isSelf ? 20 : -22;
      } else if (attempts % 3 === 1) {
        adjusted.label.x += 22;
      } else {
        adjusted.label.x -= 44;
      }
      candidate = labelBox(adjusted.label, edge.label);
      attempts++;
    }
    occupiedLabels.push(candidate);
    return { edge, geometry: adjusted };
  });

  const getSvgCoordinates = useCallback(
    e => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const scaleX = (maxX + 40) / rect.width;
      const scaleY = (maxY + 100) / rect.height;

      return {
        x: Math.round((clientX - rect.left) * scaleX - 20),
        y: Math.round((clientY - rect.top) * scaleY - 80),
      };
    },
    [maxX, maxY]
  );

  // Pointer Down on State Node
  const handlePointerDownState = useCallback(
    (e, state) => {
      e.stopPropagation();
      // Capture the pointer so touch-drag isn't interrupted by scroll or
      // a browser-issued pointercancel on the first move.
      if (e.pointerId != null && e.target.setPointerCapture) {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
      }

      const coords = getSvgCoordinates(e);
      setPointerDownStateId(state.id);
      setPointerDownPos(coords);
      setHasMoved(false);

      if (activeTool === 'transition') {
        setTransitionFromId(state.id);
        setDragLineEnd(coords);
      }
    },
    [activeTool, getSvgCoordinates]
  );

  // Pointer Down on Arrow Tip to drag arrow endpoint
  const handlePointerDownArrowTip = useCallback((e, edgeKey) => {
    e.stopPropagation();
    if (e.pointerId != null && e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }
    setDraggingArrowEdgeKey(edgeKey);
  }, []);

  // Pointer Move (Canvas wide)
  const handlePointerMove = useCallback(
    e => {
      const coords = getSvgCoordinates(e);

      // Check if threshold movement reached for dragging node
      if (pointerDownStateId && !hasMoved && pointerDownPos) {
        const dist = Math.hypot(coords.x - pointerDownPos.x, coords.y - pointerDownPos.y);
        if (dist > 5) {
          setHasMoved(true);
          // State dragging is only ever allowed with the Select State tool —
          // 'transition' must draw a transition instead, and 'move' (Add
          // State) must not drag the tapped state either.
          if (activeTool === 'select') {
            setDraggingNodeId(pointerDownStateId);
          }
        }
      }

      if (draggingNodeId) {
        // State drag — no connector snapping.
        onMoveState(draggingNodeId, coords.x, coords.y);
        // Clear any lingering snap/connector visibility.
        if (activeSnapRef.current !== null) {
          activeSnapRef.current = null;
          setActiveSnap(null);
          setVisibleConnectorStateId(null);
        }
      } else if (transitionFromId) {
        // ── New-transition drag ────────────────────────────────────────────
        // Exclude the source state so the dragging line doesn't snap back
        // to its own origin (self-loops are created by tap, not by dragging
        // back to the source and snapping to a connector).
        const snap = getNearestSnap(
          coords,
          automaton.states,
          activeSnapRef.current
        );
        activeSnapRef.current = snap;
        setActiveSnap(snap);

        const effectiveEnd = snap ?? coords;
        setDragLineEnd(effectiveEnd);

        // Show connectors for the nearest state (or the snapped state).
        setVisibleConnectorStateId(
          snap?.stateId ?? getVisibleConnectorStateId(coords, automaton.states)
        );
      } else if (draggingArrowEdgeKey) {
        // ── Existing arrow-tip drag ────────────────────────────────────────
        const snap = getNearestSnap(
          coords,
          automaton.states,
          activeSnapRef.current
        );
        activeSnapRef.current = snap;
        setActiveSnap(snap);

        const effectiveEnd = snap ?? coords;
        setArrowTargets(prev => ({
          ...prev,
          [draggingArrowEdgeKey]: effectiveEnd,
        }));

        setVisibleConnectorStateId(
          snap?.stateId ?? getVisibleConnectorStateId(coords, automaton.states)
        );
      } else {
        // No active drag — clear connector state.
        if (activeSnapRef.current !== null || visibleConnectorStateId !== null) {
          activeSnapRef.current = null;
          setActiveSnap(null);
          setVisibleConnectorStateId(null);
        }
      }
    },
    [
      pointerDownStateId,
      hasMoved,
      pointerDownPos,
      activeTool,
      draggingNodeId,
      transitionFromId,
      draggingArrowEdgeKey,
      automaton.states,
      visibleConnectorStateId,
      getSvgCoordinates,
      onMoveState,
    ]
  );


  // Pointer Up (Canvas wide)
  const handlePointerUp = useCallback(
    e => {
      if (pointerDownStateId) {
        if (!hasMoved) {
          if (activeTool === 'transition') {
            // TAP on a state in Create Transition mode → self-loop.
            // handleStartTransition in BuilderPage handles duplicate-check:
            // if A→A already exists it opens that transition for editing.
            onStartTransition(pointerDownStateId, pointerDownStateId);
          } else {
            // Pure click in Select mode → select the state.
            onSelectState(pointerDownStateId);
          }
        }
        setPointerDownStateId(null);
        setPointerDownPos(null);
      }

      if (transitionFromId) {
        const coords = getSvgCoordinates(e);
        // Find state under release point
        const targetState = automaton.states.find(s => {
          const dx = s.position.x - coords.x;
          const dy = s.position.y - coords.y;
          return Math.hypot(dx, dy) <= NODE_RADIUS + 10;
        });

        if (targetState) {
          // Only call onStartTransition when user dragged to a target (not a
          // tap-without-drag which was already handled above as a self-loop).
          if (hasMoved || targetState.id !== transitionFromId) {
            onStartTransition(transitionFromId, targetState.id);
          }
        }
        setTransitionFromId(null);
        setDragLineEnd(null);
      }

      setDraggingNodeId(null);
      setDraggingArrowEdgeKey(null);
      setHasMoved(false);

      // Always hide connectors and clear snap after any pointer-up.
      activeSnapRef.current = null;
      setActiveSnap(null);
      setVisibleConnectorStateId(null);
    },
    [
      pointerDownStateId,
      hasMoved,
      activeTool,
      transitionFromId,
      automaton.states,
      getSvgCoordinates,
      onSelectState,
      onStartTransition,
    ]
  );

  const initialState = automaton.states.find(s => s.initial);
  const startPos = initialState?.position;

  // Active simulation highlights
  const activeStates = new Set(simulation?.currentStates ?? []);

  return (
    <div className="flex flex-col gap-3">
      {!isFullscreen && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Interactive Canvas</h2>
            <p className="text-xs text-ink-muted dark:text-ink-darkMuted">
              {activeTool === 'transition'
                ? 'Click & drag from source state to target state.'
                : 'Click state to select. Hold & drag node to move. Drag arrow tip to adjust arrow direction.'}
            </p>
          </div>
          <DiagramControls
            zoom={zoom}
            onZoom={setZoom}
            onReset={() => setZoom(1)}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </div>
      )}

      <div
        ref={wrapperRef}
        className={
          isFullscreen
            ? 'fixed inset-0 z-40 flex overflow-hidden bg-surface-muted dark:bg-canvas-dark select-none'
            : 'relative rounded-xl border border-line bg-surface-muted p-3 dark:border-line-dark dark:bg-canvas-dark select-none min-h-[60vh] sm:min-h-0 overflow-auto'
        }
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        // Prevent canvas-level scroll during active drag gestures on touch.
        onTouchMove={e => {
          if (draggingNodeId || transitionFromId || draggingArrowEdgeKey) {
            e.preventDefault();
          }
        }}
      >
        {/* Mobile-only fullscreen control rail — the complete Builder
            workspace controls that would otherwise be trapped outside the
            fullscreen element. Desktop fullscreen is unchanged. */}
        {isFullscreen && isMobile && (
          <MobileFullscreenSidebar
            activeTool={activeTool}
            onSelectTool={onSetActiveTool}
            onAddState={() => onSetActiveTool?.('move')}
            onOpenTable={() => onOpenMobileSheet?.('table')}
            onOpenSimulator={() => onOpenMobileSheet?.('simulator')}
            onExitFullscreen={toggleFullscreen}
          />
        )}

      <div
        className={isFullscreen ? 'flex min-w-0 flex-1 flex-col overflow-auto p-3' : 'contents'}
      >
        {isFullscreen && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 dark:border-line-dark">
            <span className="text-xs font-semibold text-ink-muted dark:text-ink-darkMuted whitespace-nowrap">
              {isMobile ? 'Interactive Canvas' : 'Interactive Canvas — Fullscreen'}
            </span>

            {/* DFA / NFA selector positioned between title and zoom controls */}
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 dark:border-line-dark dark:bg-surface-dark">
              {['DFA', 'NFA'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => automaton.setType?.(t) ?? automaton.type}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                    automaton.type === t
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-ink-muted hover:text-ink dark:text-ink-darkMuted dark:hover:text-ink-dark'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <DiagramControls
              zoom={zoom}
              onZoom={setZoom}
              onReset={() => setZoom(1)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              onUndo={onUndo}
              onRedo={onRedo}
              canUndo={canUndo}
              canRedo={canRedo}
            />
          </div>
        )}
        <svg
          ref={svgRef}
          role="img"
          aria-label="Automaton Builder SVG Canvas"
          viewBox={`-20 -80 ${maxX + 40} ${maxY + 100}`}
          style={{
            width: `${(maxX + 40) * zoom}px`,
            minWidth: `${Math.min(maxX + 40, 440)}px`,
            height: `${(maxY + 100) * zoom}px`,
            touchAction: draggingNodeId || draggingArrowEdgeKey || transitionFromId ? 'none' : 'pan-x pan-y',
          }}
          className={
            isFullscreen
              ? 'block flex-1 min-h-0 mx-auto transition-[width,height] duration-200'
              : 'mx-auto block transition-[width,height] duration-200'
          }
          onClick={e => {
            if (e.target === svgRef.current || e.target.tagName === 'svg') {
              if (activeTool === 'move' && onAddStateAt) {
                onAddStateAt(getSvgCoordinates(e));
              } else {
                onSelectState(null);
                onSelectTransition(null);
              }
            }
          }}
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
                strokeWidth="2"
                markerEnd="url(#autofa-arrowhead)"
              />
              <text
                x={startPos.x - 65}
                y={startPos.y - 8}
                fontSize="10"
                className="fill-current font-bold uppercase tracking-wider"
              >
                Start
              </text>
            </g>
          )}

          {/* Edges & Draggable Arrow Tips */}
          {routes.map(({ edge, geometry }) => {
            const isSelected = selectedTransitionKey === edge.key;
            const tipX = geometry.end?.x ?? geometry.label.x;
            const tipY = geometry.end?.y ?? geometry.label.y;
            // Edit button hovers above the label midpoint
            const editBtnX = geometry.label.x;
            const editBtnY = geometry.label.y - 22;

            return (
              <g
                key={edge.key}
                className="cursor-pointer"
                onClick={e => {
                  e.stopPropagation();
                  // Click/tap transition → SELECT ONLY. Modal does NOT open.
                  onSelectTransition(edge);
                }}
              >
                <TransitionEdge
                  edge={edge}
                  geometry={geometry}
                  alphabet={automaton.alphabet}
                  active={
                    isSelected
                      ? new Set([`${edge.from}\0${edge.to}\0${edge.labels[0]}`])
                      : new Set()
                  }
                />

                {/* Draggable Arrow Tip Handle — only while selected. */}
                {isSelected && (
                  <circle
                    cx={tipX}
                    cy={tipY}
                    r="7"
                    fill="var(--diagram-active)"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="cursor-move touch-none hover:scale-125 transition-transform"
                    onPointerDown={e => handlePointerDownArrowTip(e, edge.key)}
                  >
                    <title>Drag arrow tip to reposition manually</title>
                  </circle>
                )}

                {/* Explicit Edit button — only opens TransitionModal when the
                    user intentionally clicks it. */}
                {isSelected && onEditTransition && (
                  <g
                    className="cursor-pointer"
                    onClick={e => {
                      e.stopPropagation();
                      onEditTransition(edge);
                    }}
                  >
                    <rect
                      x={editBtnX - 24}
                      y={editBtnY - 10}
                      width={48}
                      height={18}
                      rx="9"
                      fill="#1683d8"
                      opacity="0.92"
                    />
                    <text
                      x={editBtnX}
                      y={editBtnY + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#ffffff"
                      className="select-none pointer-events-none"
                    >
                      ✎ Edit
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ── Connector dot overlay ──────────────────────────────────────
               Visible only when a transition endpoint is being dragged AND
               the pointer is near a state. All dots are pointer-events:none
               so they never steal events from the draggable arrow tip. */}
          {visibleConnectorStateId && (transitionFromId || draggingArrowEdgeKey) && (() => {
            const visState = automaton.states.find(s => s.id === visibleConnectorStateId);
            if (!visState) return null;
            const connectors = getStateConnectors(visState);
            return (
              <g pointerEvents="none" aria-hidden="true">
                {connectors.map(conn => {
                  const isActive =
                    activeSnap?.stateId === visibleConnectorStateId &&
                    activeSnap?.connectorId === conn.id;
                  return (
                    <g key={conn.id}>
                      {/* Subtle outer ring for the active target */}
                      {isActive && (
                        <circle
                          cx={conn.x}
                          cy={conn.y}
                          r={11}
                          fill="none"
                          stroke="#1683d8"
                          strokeWidth={1.5}
                          opacity={0.35}
                        />
                      )}
                      {/* Connector dot */}
                      <circle
                        cx={conn.x}
                        cy={conn.y}
                        r={isActive ? 6 : 4}
                        fill={isActive ? '#1683d8' : '#94a3b8'}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        opacity={isActive ? 0.95 : 0.55}
                        style={{ transition: 'r 0.1s, opacity 0.1s' }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Interactive transition drag indicator */}
          {transitionFromId && dragLineEnd && (() => {
            const fromState = stateById[transitionFromId];
            if (!fromState) return null;
            const isSelf = activeSnap?.stateId === transitionFromId;
            const geom = isSelf
              ? computeSelfLoopGeometry(fromState.position, activeSnap?.connectorId ?? 0)
              : computeTransitionGeometry(fromState.position, dragLineEnd, dragLineEnd);
            return (
              <g className="pointer-events-none">
                <path
                  d={geom.path}
                  fill="none"
                  stroke="#1683d8"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                  markerEnd="url(#autofa-arrowhead)"
                />
              </g>
            );
          })()}

          {/* State nodes */}
          {automaton.states.map(state => {
            const isSelected = selectedStateId === state.id;
            const isActiveSim = activeStates.has(state.name);

            return (
              <g
                key={state.id}
                className="cursor-pointer touch-none active:cursor-grabbing"
                onPointerDown={e => handlePointerDownState(e, state)}
              >
                <StateNode
                  state={state.name}
                  point={state.position}
                  accepting={state.accepting}
                  dead={state.dead}
                  active={isSelected || isActiveSim}
                />
              </g>
            );
          })}
        </svg>
      </div>
      </div>
    </div>
  );
}

export default memo(BuilderCanvas);
