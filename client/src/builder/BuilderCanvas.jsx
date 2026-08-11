import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import ArrowMarker from '../components/StateDiagram/ArrowMarker';
import DiagramControls from '../components/StateDiagram/DiagramControls';
import StateNode from '../components/StateDiagram/StateNode';
import TransitionEdge from '../components/StateDiagram/TransitionEdge';
import MobileFullscreenSidebar from './MobileFullscreenSidebar';
import StateMovementController from './StateMovementController';
import TransitionConnectorController from './TransitionConnectorController';
import { getConnectorUsage, getNearestSnap, getStateConnectors, getVisibleConnectorStateId } from './connectorSnap';
import { computeSelfLoopGeometry, computeTransitionGeometry } from './transitionGeometry';

const MOBILE_QUERY = '(max-width: 1023px)';
const NODE_RADIUS = 32;
const MIN_CANVAS_WIDTH = 900;
const MIN_CANVAS_HEIGHT = 640;
const CANVAS_EDGE_MARGIN = 220;
const HOLD_DURATION_MS = 1000;

function nearestConnectorId(state, point) {
  return getStateConnectors(state).reduce((nearest, connector) => (
    Math.hypot(point.x - connector.x, point.y - connector.y) < nearest.distance
      ? { id: connector.id, distance: Math.hypot(point.x - connector.x, point.y - connector.y) }
      : nearest
  ), { id: 0, distance: Infinity }).id;
}

function BuilderCanvas({
  automaton, stateById, groupedEdges, activeTool, activePanel, selectedStateId, selectedTransitionKey,
  onSelectState, onSelectTransition, onMoveState, onStartTransition, onEditTransition, onReconnectTransition,
  simulation, onSetActiveTool, onAddStateAt, onOpenMobileSheet, onFullscreenChange,
  fullscreenContainerRef, onUndo, onRedo, canUndo, canRedo, onRequestClear, resetVersion,
}) {
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [movementControllerStateId, setMovementControllerStateId] = useState(null);
  const [transitionDraft, setTransitionDraft] = useState(null);
  const [desktopTransitionDrag, setDesktopTransitionDrag] = useState(null);
  const [toast, setToast] = useState('');
  const [, setViewportVersion] = useState(0);
  const wrapperRef = useRef(null);
  const svgRef = useRef(null);
  const holdTimerRef = useRef(null);
  const holdFiredRef = useRef(false);
  const desktopDragRef = useRef(null);
  const desktopTransitionDragRef = useRef(null);

  // ── Simulation integration ────────────────────────────────────────────────
  const session = simulation?.session;
  const simulationActive = simulation?.simulationActive ?? false;

  // Active transition IDs during animation
  const simActiveTransitionIds = useMemo(() => {
    if (!session?.isAnimating) return [];
    if (session.activeTransitionIds?.length) return session.activeTransitionIds;
    if (session.activeTransitionId) return [session.activeTransitionId];
    return [];
  }, [session?.activeTransitionId, session?.activeTransitionIds, session?.isAnimating]);

  // SINGLE active simulation state ID (EXACTLY 0 or 1 state ID)
  // When status === 'IDLE', returns null (0 indicators!)
  const activeSimStateId = useMemo(() => {
    if (!session || session.status === 'IDLE') return null;

    // Terminal result: always use the explicit final indicator state computed
    // by finish() — never fall back to currentStates/currentStateId here.
    // For an NFA those can hold several simultaneously-active paths, and
    // picking an arbitrary one (e.g. the last array entry) can land the
    // indicator back on a stale, non-final, non-accepting state like the
    // initial state instead of the actual accepting state the result is
    // based on.
    if (session.status === 'ACCEPTED' || session.status === 'REJECTED') {
      return session.finalStateId ?? null;
    }

    // While a transition is animating, `session.currentStateId` still holds
    // the PRE-transition (source) state — it isn't updated until the
    // animation settles. Resolving the active transition's real destination
    // here keeps the ring synced to where the simulation is actually headed,
    // instead of lingering on the source for the whole animation. For a
    // self-loop this naturally still resolves to the same state (to === from),
    // matching "A = still YELLOW while the loop completes".
    if (session.isAnimating) {
      const activeIds = session.activeTransitionIds?.length
        ? session.activeTransitionIds
        : session.activeTransitionId
          ? [session.activeTransitionId]
          : [];
      const activeTransition = automaton.transitions.find(t => activeIds.includes(t.id));
      if (activeTransition) return activeTransition.to;
    }

    if (session.currentStates?.length) return session.currentStates[session.currentStates.length - 1];
    if (session.currentStateId) return session.currentStateId;
    return null;
  }, [session, automaton.transitions]);

  // Color for the active simulation state indicator ring
  const simIndicatorColor = useMemo(() => {
    if (!activeSimStateId) return 'yellow';
    const currState = stateById[activeSimStateId];
    if (!currState) return 'yellow';

    if (currState.accepting) return 'green';
    if (currState.dead || session?.isDead) return 'red';
    if (session?.status === 'REJECTED' || session?.result === 'REJECT') return 'red';
    return 'yellow';
  }, [activeSimStateId, stateById, session?.status, session?.result, session?.isDead]);

  const showToast = useCallback(message => {
    setToast(message);
    window.setTimeout(() => setToast(current => current === message ? '' : current), 2600);
  }, []);
  const editingAllowed = !isMobile || isFullscreen;
  const blockMobileEditing = useCallback(() => {
    if (!editingAllowed) { showToast('This feature is only available in Fullscreen mode.'); return true; }
    return false;
  }, [editingAllowed, showToast]);

  const blockSimulationEditing = useCallback(() => {
    if (simulationActive) { showToast('Reset the simulation before editing the automaton.'); return; }
    return false;
  }, [simulationActive, showToast]);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const change = event => setIsMobile(event.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const change = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => { onFullscreenChange?.(isFullscreen); }, [isFullscreen, onFullscreenChange]);
  useEffect(() => {
    if (!isFullscreen) window.screen?.orientation?.unlock?.();
  }, [isFullscreen]);
  useEffect(() => { if (fullscreenContainerRef) fullscreenContainerRef.current = wrapperRef.current; }, [fullscreenContainerRef]);
  useEffect(() => () => clearTimeout(holdTimerRef.current), []);
  useEffect(() => {
    const recalculate = () => setViewportVersion(version => version + 1);
    window.addEventListener('resize', recalculate);
    window.addEventListener('orientationchange', recalculate);
    return () => {
      window.removeEventListener('resize', recalculate);
      window.removeEventListener('orientationchange', recalculate);
    };
  }, []);
  useEffect(() => {
    setTransitionDraft(null);
    setMovementControllerStateId(null);
  }, [resetVersion]);

  const toggleFullscreen = useCallback(async () => {
    const element = wrapperRef.current;
    if (!element) return;
    try {
      if (!document.fullscreenElement) {
        if (element.requestFullscreen) await element.requestFullscreen();
        else setIsFullscreen(true);
        const orientation = window.screen?.orientation;
        if (isMobile && orientation?.lock) {
          try { await orientation.lock('landscape'); } catch { /* unsupported or rejected */ }
        }
      } else {
        await document.exitFullscreen?.();
        window.screen?.orientation?.unlock?.();
      }
    } catch { setIsFullscreen(value => !value); }
  }, [isMobile]);
  const maxX = Math.max(MIN_CANVAS_WIDTH, ...automaton.states.map(state => (state.position?.x ?? 0) + CANVAS_EDGE_MARGIN));
  const maxY = Math.max(MIN_CANVAS_HEIGHT, ...automaton.states.map(state => (state.position?.y ?? 0) + CANVAS_EDGE_MARGIN));
  const getSvgCoordinates = useCallback(event => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!svg || !rect?.width || !rect.height) return { x: 0, y: 0 };
    const viewBox = svg.viewBox.baseVal;
    return { x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width, y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height };
  }, []);
  const cancelTransition = useCallback(() => {
    setTransitionDraft(null);
  }, []);

  const chooseStateForTransition = useCallback(state => {
    if (blockMobileEditing()) return;
    if (blockSimulationEditing()) return;
    if (!transitionDraft) {
      setMovementControllerStateId(null);
      onSelectState(null);
      setTransitionDraft({ sourceId: state.id, sourceConnectorId: null, targetId: null, targetConnectorId: null });
      return;
    }
    if (!transitionDraft.targetId) {
      setTransitionDraft(draft => ({ ...draft, targetId: state.id, targetConnectorId: null }));
      return;
    }
  }, [blockMobileEditing, blockSimulationEditing, onSelectState, transitionDraft]);
  const chooseSourceConnector = useCallback((connectorId, full) => {
    if (full) { showToast('Connector is full (2/2). Choose another connector.'); return; }
    setTransitionDraft(draft => ({ ...draft, sourceConnectorId: connectorId }));
  }, [showToast]);
  const chooseTargetConnector = useCallback((connectorId, full) => {
    if (full) { showToast('Connector is full (2/2). Choose another connector.'); return; }
    if (!transitionDraft?.targetId) return;
    if (transitionDraft.targetId === transitionDraft.sourceId && connectorId === transitionDraft.sourceConnectorId) {
      showToast('A loop requires two different connectors.');
      return;
    }
    const completed = { ...transitionDraft, targetConnectorId: connectorId };
    setTransitionDraft(completed);
    window.requestAnimationFrame(() => {
      setTransitionDraft(null);
      onStartTransition?.(completed);
    });
  }, [onStartTransition, showToast, transitionDraft]);

  const connectorAvailable = useCallback((stateId, connectorId, excludeTransitionId = null) => (
    getConnectorUsage(automaton.transitions, stateId, connectorId, excludeTransitionId) < 2
  ), [automaton.transitions]);

  const beginDesktopTransition = useCallback((event, state) => {
    const point = getSvgCoordinates(event);
    const sourceConnectorId = nearestConnectorId(state, point);
    const drag = {
      sourceId: state.id,
      sourceConnectorId,
      start: point,
      pointer: point,
      snap: null,
      visibleStateId: null,
      moved: false,
    };
    desktopTransitionDragRef.current = drag;
    setDesktopTransitionDrag(drag);
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* optional */ }
  }, [getSvgCoordinates]);

  const beginDesktopEndpointDrag = useCallback((event, edge, point) => {
    event.stopPropagation();
    const drag = {
      type: 'endpoint',
      edge,
      sourceId: edge.from,
      sourceConnectorId: edge.sourceConnectorId,
      start: point,
      pointer: point,
      snap: null,
      visibleStateId: null,
      moved: false,
    };
    desktopTransitionDragRef.current = drag;
    setDesktopTransitionDrag(drag);
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* optional */ }
  }, []);

  const finishDesktopTransition = useCallback(() => {
    const drag = desktopTransitionDragRef.current;
    if (!drag) return false;
    desktopTransitionDragRef.current = null;
    setDesktopTransitionDrag(null);
    if (!drag.moved) return true;
    const target = drag.snap;
    const excludedTransitionId = drag.type === 'endpoint' ? drag.edge.transitionIds?.[0] : null;
    if (!target || !connectorAvailable(drag.sourceId, drag.sourceConnectorId, excludedTransitionId) || !connectorAvailable(target.stateId, target.connectorId, excludedTransitionId)) {
      if (target) showToast('Connector is full (2/2). Choose another connector.');
      return true;
    }
    if (target.stateId === drag.sourceId && target.connectorId === drag.sourceConnectorId) {
      showToast('A loop requires two different connectors.');
      return true;
    }
    if (drag.type === 'endpoint') {
      onReconnectTransition?.(drag.edge, target.stateId, target.connectorId);
      return true;
    }
    onStartTransition?.({
      sourceId: drag.sourceId,
      targetId: target.stateId,
      sourceConnectorId: drag.sourceConnectorId,
      targetConnectorId: target.connectorId,
    });
    return true;
  }, [connectorAvailable, onReconnectTransition, onStartTransition, showToast]);

  const handleStatePointerDown = useCallback((event, state) => {
    event.stopPropagation();
    if (activeTool === 'transition') {
      if (simulationActive) { showToast('Reset the simulation before editing the automaton.'); return; }
      if (isMobile) chooseStateForTransition(state);
      else beginDesktopTransition(event, state);
      return;
    }
    if (activeTool !== 'select') return;
    if (isMobile && !isFullscreen) return;
    if (isMobile) {
      holdFiredRef.current = false;
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => {
        holdFiredRef.current = true;
        if (!simulationActive) setMovementControllerStateId(state.id);
      }, HOLD_DURATION_MS);
    } else {
      if (simulationActive) return;
      const point = getSvgCoordinates(event);
      desktopDragRef.current = {
        stateId: state.id,
        offset: { x: point.x - state.position.x, y: point.y - state.position.y },
        start: point,
        moved: false,
      };
    }
  }, [activeTool, beginDesktopTransition, chooseStateForTransition, getSvgCoordinates, isFullscreen, isMobile, showToast, simulationActive]);

  const handleStatePointerUp = useCallback((event, state) => {
    event.stopPropagation();
    clearTimeout(holdTimerRef.current);
    if (activeTool === 'transition' && !isMobile) {
      if (!simulationActive) finishDesktopTransition();
      return;
    }
    const dragged = desktopDragRef.current?.stateId === state.id && desktopDragRef.current.moved;
    desktopDragRef.current = null;
    if (activeTool === 'select' && !holdFiredRef.current && !dragged) onSelectState(state.id);
    holdFiredRef.current = false;
  }, [activeTool, finishDesktopTransition, isMobile, onSelectState, simulationActive]);

  const handleCanvasPointerMove = useCallback(event => {
    const transitionDrag = desktopTransitionDragRef.current;
    if (transitionDrag) {
      const point = getSvgCoordinates(event);
      const source = stateById[transitionDrag.sourceId];
      if (!source) return;
      transitionDrag.moved ||= Math.hypot(point.x - transitionDrag.start.x, point.y - transitionDrag.start.y) > 3;
      transitionDrag.pointer = point;
      const excludedTransitionId = transitionDrag.type === 'endpoint' ? transitionDrag.edge.transitionIds?.[0] : null;
      const candidate = getNearestSnap(point, automaton.states, transitionDrag.snap);
      const snap = candidate && connectorAvailable(candidate.stateId, candidate.connectorId, excludedTransitionId) ? candidate : null;
      transitionDrag.snap = snap;
      transitionDrag.visibleStateId = getVisibleConnectorStateId(point, automaton.states);
      setDesktopTransitionDrag({ ...transitionDrag });
      return;
    }
    const drag = desktopDragRef.current;
    if (!drag) return;
    if (simulationActive) { desktopDragRef.current = null; return; }
    const point = getSvgCoordinates(event);
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 3) drag.moved = true;
    if (!drag.moved) return;
    onMoveState(drag.stateId, Math.max(20, Math.min(maxX, point.x - drag.offset.x)), Math.max(20, Math.min(maxY, point.y - drag.offset.y)));
  }, [automaton.states, connectorAvailable, getSvgCoordinates, maxX, maxY, onMoveState, simulationActive, stateById]);

  const handleCanvasPointerUp = useCallback(() => {
    if (finishDesktopTransition()) return;
    desktopDragRef.current = null;
  }, [finishDesktopTransition]);

  const moveState = useCallback((stateId, dx, dy) => {
    if (simulationActive) return;
    const state = stateById[stateId];
    if (!state) return;
    onMoveState(stateId, Math.max(20, Math.min(maxX, state.position.x + dx)), Math.max(20, Math.min(maxY, state.position.y + dy)));
  }, [maxX, maxY, onMoveState, simulationActive, stateById]);

  const guardedTool = useCallback(tool => {
    if (simulationActive) { showToast('Reset the simulation before editing the automaton.'); return; }
    if (tool === 'transition' && blockMobileEditing()) return;
    setTransitionDraft(null);
    setDesktopTransitionDrag(null);
    desktopTransitionDragRef.current = null;
    setMovementControllerStateId(null);
    onSetActiveTool?.(tool);
  }, [blockMobileEditing, onSetActiveTool, showToast, simulationActive]);

  const openMobilePanel = useCallback(panel => {
    setTransitionDraft(null);
    setMovementControllerStateId(null);
    onOpenMobileSheet?.(panel);
  }, [onOpenMobileSheet]);

  const guardedUndo = useCallback(() => { if (!blockMobileEditing() && !blockSimulationEditing()) onUndo?.(); }, [blockMobileEditing, blockSimulationEditing, onUndo]);
  const guardedRedo = useCallback(() => { if (!blockMobileEditing() && !blockSimulationEditing()) onRedo?.(); }, [blockMobileEditing, blockSimulationEditing, onRedo]);

  // ── Derived geometry ──────────────────────────────────────────────────────

  const routes = useMemo(() => groupedEdges.map(edge => {
    const source = stateById[edge.from];
    const target = stateById[edge.to];
    const sourceConnector = getStateConnectors(source).find(point => point.id === edge.sourceConnectorId);
    const targetConnector = getStateConnectors(target).find(point => point.id === edge.targetConnectorId);
    const geometry = edge.from === edge.to
      ? computeSelfLoopGeometry(source.position, edge.sourceConnectorId, edge.targetConnectorId)
      : computeTransitionGeometry(source.position, target.position, targetConnector, sourceConnector, groupedEdges.some(other => other.from === edge.to && other.to === edge.from));
    return { edge, geometry };
  }), [groupedEdges, stateById]);

  const preview = useMemo(() => {
    if (transitionDraft?.sourceConnectorId == null || !transitionDraft.targetId) return null;
    const source = stateById[transitionDraft.sourceId];
    const target = stateById[transitionDraft.targetId];
    const from = getStateConnectors(source).find(point => point.id === transitionDraft.sourceConnectorId);
    if (transitionDraft.targetConnectorId != null) {
      const to = getStateConnectors(target).find(point => point.id === transitionDraft.targetConnectorId);
      return source.id === target.id ? computeSelfLoopGeometry(source.position, transitionDraft.sourceConnectorId, transitionDraft.targetConnectorId) : computeTransitionGeometry(source.position, target.position, to, from);
    }
    return computeTransitionGeometry(source.position, target.position, target.position, from);
  }, [stateById, transitionDraft]);

  const desktopPreview = useMemo(() => {
    if (!desktopTransitionDrag) return null;
    const source = stateById[desktopTransitionDrag.sourceId];
    if (!source) return null;
    const from = getStateConnectors(source).find(point => point.id === desktopTransitionDrag.sourceConnectorId);
    const snap = desktopTransitionDrag.snap;
    if (snap?.stateId === source.id) {
      return computeSelfLoopGeometry(source.position, desktopTransitionDrag.sourceConnectorId, snap.connectorId);
    }
    const target = snap ? stateById[snap.stateId] : desktopTransitionDrag.pointer;
    const targetConnector = snap ? getStateConnectors(target).find(point => point.id === snap.connectorId) : null;
    return computeTransitionGeometry(source.position, target.position ?? target, targetConnector ?? desktopTransitionDrag.pointer, from);
  }, [desktopTransitionDrag, stateById]);

  const visibleDesktopConnectorStates = useMemo(() => {
    if (!desktopTransitionDrag) return new Set();
    return new Set([desktopTransitionDrag.sourceId, desktopTransitionDrag.visibleStateId].filter(Boolean));
  }, [desktopTransitionDrag]);

  // ── Active-transition geometries for simulation overlay ─────────────────
  const activeRouteGeometries = useMemo(() => {
    if (!simActiveTransitionIds.length || !session?.isAnimating) return [];
    return routes
      .filter(r => r.edge.transitionIds?.some(id => simActiveTransitionIds.includes(id)))
      .map(r => r.geometry);
  }, [routes, session?.isAnimating, simActiveTransitionIds]);

  const animDurationSec = session?.animationDuration
    ? (session.animationDuration / 1000).toFixed(2) + 's'
    : '0.55s';

  const initial = automaton.states.find(state => state.initial);

  // Is simulation currently running, paused, or displaying result?
  const isSimulationSessionActive = session?.status !== 'IDLE';

  return (
    <div className="flex flex-col gap-3">
      {!isFullscreen && <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Interactive Canvas</h2><p className="text-xs text-ink-muted dark:text-ink-darkMuted">{activeTool === 'transition' ? (transitionDraft?.sourceId ? 'Select a destination state.' : 'Select a source state.') : 'Click a state to select it.'}</p></div><div className="flex items-center gap-1"><DiagramControls zoom={zoom} onZoom={setZoom} onReset={() => setZoom(1)} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} onUndo={guardedUndo} onRedo={guardedRedo} canUndo={canUndo} canRedo={canRedo} /><button type="button" onClick={onRequestClear} aria-label="Reset canvas" title="Reset canvas" className="focus-ring rounded-lg border border-line bg-surface p-2 text-danger hover:bg-danger-soft dark:border-line-dark dark:bg-surface-dark"><Trash2 size={16} /></button></div></div>}
      <div ref={wrapperRef} className={isFullscreen ? 'fixed inset-0 z-40 flex overflow-hidden bg-surface-muted dark:bg-canvas-dark select-none' : 'relative min-h-[60vh] overflow-auto rounded-xl border border-line bg-surface-muted p-3 dark:border-line-dark dark:bg-canvas-dark select-none'}>
        {isFullscreen && isMobile && <MobileFullscreenSidebar activeTool={activeTool} activePanel={activePanel} onSelectTool={guardedTool} onAddState={() => guardedTool('move')} onOpenTable={() => openMobilePanel('table')} onOpenSimulator={() => openMobilePanel('simulator')} />}
        <div className={isFullscreen ? 'flex min-w-0 flex-1 flex-col overflow-auto p-3' : 'contents'}>
          {isFullscreen && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 dark:border-line-dark"><span className="text-xs font-semibold text-ink-muted dark:text-ink-darkMuted">Interactive Canvas — Fullscreen</span><div className="flex rounded-lg border border-line bg-surface p-1 dark:border-line-dark dark:bg-surface-dark">{['DFA','NFA'].map(type => <button key={type} type="button" onClick={() => !simulationActive && automaton.setType?.(type)} className={`focus-ring rounded-md px-2.5 py-1 text-xs font-bold transition ${automaton.type === type ? 'bg-primary text-white shadow-sm' : 'text-ink-muted hover:bg-primary-soft hover:text-primary dark:text-ink-darkMuted dark:hover:bg-primary/15 dark:hover:text-sky-300'}`}>{type}</button>)}</div><div className="flex items-center gap-1"><DiagramControls zoom={zoom} onZoom={setZoom} onReset={() => setZoom(1)} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} onUndo={guardedUndo} onRedo={guardedRedo} canUndo={canUndo} canRedo={canRedo} /><button type="button" onClick={onRequestClear} aria-label="Reset canvas" title="Reset canvas" className="focus-ring rounded-lg border border-line bg-surface p-2 text-danger hover:bg-danger-soft dark:border-line-dark dark:bg-surface-dark"><Trash2 size={16} /></button></div></div>}
          <svg
            ref={svgRef}
            role="img"
            aria-label="Automaton Builder SVG Canvas"
            viewBox={`-20 -80 ${maxX + 40} ${maxY + 100}`}
            style={isFullscreen
              ? { width: `${zoom * 100}%`, height: `${zoom * 100}%`, minWidth: 0 }
              : { width: `${(maxX + 40) * zoom}px`, minWidth: `${Math.min(maxX + 40, 440)}px`, height: `${(maxY + 100) * zoom}px` }
            }
            className={isFullscreen ? 'mx-auto block min-h-0 flex-1' : 'mx-auto block'}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            onClick={event => {
              if (event.target === svgRef.current) {
                if (simulationActive) return;
                if (activeTool === 'move' && !blockMobileEditing()) onAddStateAt?.(getSvgCoordinates(event));
                else { onSelectState(null); onSelectTransition(null); }
              }
            }}
          >
            <defs>
              <ArrowMarker />
              <style>{`
                @keyframes sim-pulse {
                  0% { stroke-dashoffset: 0; opacity: 0.7; }
                  50% { opacity: 1; }
                  100% { stroke-dashoffset: 24; opacity: 0.7; }
                }
                @keyframes sim-dot-glow {
                  0%, 100% { opacity: 0.9; }
                  50% { opacity: 1; }
                }
              `}</style>
            </defs>

            {/* Initial state arrow */}
            {initial && <path d={`M ${initial.position.x - 60} ${initial.position.y} L ${initial.position.x - NODE_RADIUS - 4} ${initial.position.y}`} fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#autofa-arrowhead)" className="text-ink-muted" />}

            {/* Transition edges — highlight active sim transition */}
            {routes.map(({ edge, geometry }) => (
              <g
                key={edge.key}
                className="cursor-pointer"
                onClick={event => { event.stopPropagation(); onSelectTransition(edge); }}
              >
                <TransitionEdge
                  edge={edge}
                  geometry={geometry}
                  alphabet={automaton.alphabet}
                  active={!isSimulationSessionActive && selectedTransitionKey === edge.key ? new Set([`${edge.from}\0${edge.to}\0${edge.labels[0]}`]) : new Set()}
                  simActive={edge.transitionIds?.some(id => simActiveTransitionIds.includes(id))}
                  onEndpointPointerDown={event => {
                    if (!isMobile && !simulationActive && selectedTransitionKey === edge.key) {
                      beginDesktopEndpointDrag(event, edge, getSvgCoordinates(event));
                    }
                  }}
                />
                {/* Draggable endpoint handle point — ONLY VISIBLE WHILE ACTIVELY DRAGGING / REPOSITIONING */}
                {desktopTransitionDrag?.type === 'endpoint' && desktopTransitionDrag.edge.key === edge.key && !isMobile && (
                  <circle
                    cx={geometry.end.x}
                    cy={geometry.end.y}
                    r="7"
                    fill="#fff"
                    stroke="#1683d8"
                    strokeWidth="2.5"
                    className="cursor-grab pointer-events-none"
                  />
                )}
                {/* Edit pill — hidden during simulation sessions */}
                {!isSimulationSessionActive && selectedTransitionKey === edge.key && (
                  <g onClick={event => { event.stopPropagation(); if (blockMobileEditing()) return; if (blockSimulationEditing()) return; onEditTransition?.(edge); }}>
                    <rect x={geometry.label.x - 24} y={geometry.label.y - 32} width="48" height="18" rx="9" fill="#1683d8" />
                    <text x={geometry.label.x} y={geometry.label.y - 18} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">Edit</text>
                  </g>
                )}
              </g>
            ))}

            {/* Connector dots (desktop drag only) */}
            {[...visibleDesktopConnectorStates].map(stateId => {
              const state = stateById[stateId];
              if (!state) return null;
              return getStateConnectors(state).map(connector => {
                const full = !connectorAvailable(state.id, connector.id);
                const selected = (desktopTransitionDrag?.sourceId === state.id && desktopTransitionDrag?.sourceConnectorId === connector.id) || (desktopTransitionDrag?.snap?.stateId === state.id && desktopTransitionDrag?.snap?.connectorId === connector.id);
                return <circle key={`${state.id}-${connector.id}`} cx={connector.x} cy={connector.y} r={selected ? 6 : 4} fill={full ? '#94a3b8' : selected ? '#1683d8' : '#ffffff'} stroke={full ? '#64748b' : '#1683d8'} strokeWidth="2" opacity={full ? 0.45 : 0.95} className="pointer-events-none" />;
              });
            })}

            {/* Transition draft preview */}
            {(preview || desktopPreview) && <path d={(desktopPreview ?? preview).path} fill="none" stroke="#1683d8" strokeWidth="2.5" strokeDasharray="6 4" markerEnd="url(#autofa-arrowhead-selected)" className="pointer-events-none" />}

            {/* State nodes */}
            {automaton.states.map(state => (
              <g
                key={state.id}
                className="cursor-pointer touch-none"
                onPointerDown={event => handleStatePointerDown(event, state)}
                onPointerUp={event => handleStatePointerUp(event, state)}
                onPointerCancel={() => { clearTimeout(holdTimerRef.current); holdFiredRef.current = false; }}
              >
                <StateNode
                  state={state.name}
                  point={state.position}
                  accepting={state.accepting}
                  dead={state.dead}
                  active={
                    !isSimulationSessionActive && (
                      selectedStateId === state.id ||
                      movementControllerStateId === state.id ||
                      transitionDraft?.sourceId === state.id ||
                      transitionDraft?.targetId === state.id
                    )
                  }
                  simCurrent={state.id === activeSimStateId}
                  simColor={simIndicatorColor}
                />
              </g>
            ))}

            {/* ── Simulation overlay: animated travelling dot(s) ─────────────── */}
            {activeRouteGeometries.map((geometry, idx) => (
              <g
                key={`sim-overlay-${session.animationVersion}-${idx}`}
                className="pointer-events-none"
                aria-label="Simulation transition indicator"
                aria-hidden="true"
              >
                {/* Glow halo behind the dot */}
                <circle r="10" fill="#f59e0b" opacity="0.25">
                  <animateMotion
                    dur={animDurationSec}
                    begin="0s"
                    fill="freeze"
                    path={geometry.path}
                  />
                </circle>
                {/* Main travelling dot */}
                <circle r="6" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" style={{ animation: 'sim-dot-glow 0.6s ease-in-out infinite' }}>
                  <animateMotion
                    dur={animDurationSec}
                    begin="0s"
                    fill="freeze"
                    path={geometry.path}
                  />
                </circle>
              </g>
            ))}

          </svg>
        </div>

        {transitionDraft?.sourceId && transitionDraft?.targetId && (
          <TransitionConnectorController
            draft={transitionDraft}
            statesById={stateById}
            transitions={automaton.transitions}
            onSelectSource={chooseSourceConnector}
            onSelectTarget={chooseTargetConnector}
            onCancel={cancelTransition}
          />
        )}
        {isMobile && isFullscreen && movementControllerStateId && stateById[movementControllerStateId] && (
          <StateMovementController
            stateName={stateById[movementControllerStateId].name}
            onMove={(dx, dy) => moveState(movementControllerStateId, dx, dy)}
            onClose={() => setMovementControllerStateId(null)}
          />
        )}
        {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lift dark:bg-white dark:text-ink">{toast}</div>}
      </div>
    </div>
  );
}

export default memo(BuilderCanvas);
