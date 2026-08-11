import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  MousePointer,
  ArrowUpRight,
  ShieldAlert,
  Play,
  Table,
} from 'lucide-react';
import PageContainer from '../components/PageContainer';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import MobileSheet from '../components/ui/MobileSheet';
import FullscreenPortal from '../components/ui/FullscreenPortal';
import { useAutomaton } from '../builder/useAutomaton';
import { useBuilderSimulation } from '../builder/useBuilderSimulation';
import { validateAutomaton } from '../builder/builderValidator';
import BuilderCanvas from '../builder/BuilderCanvas';
import BuilderTable from '../builder/BuilderTable';
import BuilderSimulator from '../builder/BuilderSimulator';
import TransitionModal from '../builder/TransitionModal';

export default function BuilderPage() {
  const {
    automaton,
    stateById,
    groupedEdges,
    toSimulatorAutomaton,
    getTransitionTable,
    setType,
    setAlphabet,
    setStateNaming,
    addState,
    removeState,
    updateState,
    moveState,
    setInitialState,
    toggleAccepting,
    toggleDead,
    addTransition,
    updateTransition,
    removeTransition,
    clearAll,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useAutomaton();

  // ── Simulation hook ────────────────────────────────────────────────────────
  const simulation = useBuilderSimulation(automaton);
  const { simulationActive } = simulation;

  // Active Tool state
  const [activeTool, setActiveTool] = useState('select'); // 'select' | 'move' | 'transition'

  // Selection
  const [selectedStateId, setSelectedStateId] = useState(null);
  const [selectedTransitionKey, setSelectedTransitionKey] = useState(null);

  // One source of truth for contextual Builder interfaces. Persistent canvas
  // controls intentionally sit outside this state, but editing panels never
  // stack on top of one another.
  const [activePanel, setActivePanel] = useState(null); // 'editState' | 'transitionDetails' | 'simulator' | 'table' | null

  // Mobile fullscreen workspace: BuilderCanvas reports whether it's
  // currently fullscreen and hands back the DOM node that's actually in
  // fullscreen, so the panels below can be portaled inside it instead of
  // silently disappearing (the Fullscreen API only renders the fullscreen
  // element and its descendants).
  const fullscreenContainerRef = useRef(null);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [canvasResetVersion, setCanvasResetVersion] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  );
  const [toast, setToast] = useState('');

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const change = event => setIsMobileViewport(event.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  const showToast = message => {
    setToast(message);
    window.setTimeout(() => setToast(current => current === message ? '' : current), 2600);
  };

  const handleAddStateAt = coords => {
    addState({ position: coords });
  };

  // Transition Modal State
  const [transitionModalOpen, setTransitionModalOpen] = useState(false);
  const [pendingFromId, setPendingFromId] = useState(null);
  const [pendingToId, setPendingToId] = useState(null);
  const [pendingSourceConnectorId, setPendingSourceConnectorId] = useState(null);
  const [pendingTargetConnectorId, setPendingTargetConnectorId] = useState(null);
  const [editingTransitionId, setEditingTransitionId] = useState(null);
  const [existingSymbols, setExistingSymbols] = useState([]);

  // Clear confirmation modal
  const [clearModalOpen, setClearModalOpen] = useState(false);

  // Alphabet editing state
  const [newSymbol, setNewSymbol] = useState('');
  const [alphabetError, setAlphabetError] = useState('');

  // Selected State editing input
  const [editStateName, setEditStateName] = useState('');

  const validation = validateAutomaton(automaton);
  const selectedState = selectedStateId ? stateById[selectedStateId] : null;

  const closeContextualPanels = () => {
    setActivePanel(null);
    setTransitionModalOpen(false);
    setSelectedStateId(null);
    setSelectedTransitionKey(null);
  };

  const togglePanel = panel => {
    if (activePanel === panel) {
      setActivePanel(null);
      return;
    }
    setTransitionModalOpen(false);
    setSelectedStateId(null);
    setSelectedTransitionKey(null);
    setActivePanel(panel);
  };

  const activateTool = tool => {
    closeContextualPanels();
    setActiveTool(tool);
  };

  // Handler for adding symbol to alphabet
  const handleAddSymbol = e => {
    e.preventDefault();
    setAlphabetError('');
    const sym = newSymbol.trim();
    if (!sym) return;
    if (automaton.alphabet.includes(sym)) {
      setAlphabetError(`Symbol '${sym}' is already in the alphabet.`);
      return;
    }
    setAlphabet([...automaton.alphabet, sym]);
    setNewSymbol('');
  };

  const handleRemoveSymbol = sym => {
    if (automaton.alphabet.length <= 1) {
      setAlphabetError('Alphabet cannot be empty.');
      return;
    }
    setAlphabet(automaton.alphabet.filter(s => s !== sym));
  };

  const handleStartTransition = ({ sourceId, targetId, sourceConnectorId, targetConnectorId }) => {
    setSelectedStateId(null);
    setSelectedTransitionKey(null);
    setActivePanel('transitionDetails');
    setPendingFromId(sourceId);
    setPendingToId(targetId);
    setPendingSourceConnectorId(sourceConnectorId);
    setPendingTargetConnectorId(targetConnectorId);
    setEditingTransitionId(null);
    setExistingSymbols(
      [automaton.alphabet[0] ?? '0']
    );
    setTransitionModalOpen(true);
  };

  // Called when the user clicks the explicit "Edit" button on a selected
  // transition arrow. Opens the TransitionModal pre-populated with that edge.
  const handleEditTransition = edge => {
    if (!edge) return;
    setSelectedStateId(null);
    setActivePanel('transitionDetails');
    const firstTransId = edge.transitionIds?.[0];
    setPendingFromId(edge.from);
    setPendingToId(edge.to);
    setPendingSourceConnectorId(edge.sourceConnectorId);
    setPendingTargetConnectorId(edge.targetConnectorId);
    setEditingTransitionId(firstTransId ?? null);
    setExistingSymbols(edge.labels ?? [automaton.alphabet[0] ?? '0']);
    setTransitionModalOpen(true);
  };

  const handleSaveTransitionModal = (symbols, sourceConnectorId, targetConnectorId) => {
    if (pendingFromId && pendingToId) {
      if (editingTransitionId) {
        updateTransition(editingTransitionId, symbols, sourceConnectorId, targetConnectorId);
      } else {
        addTransition(pendingFromId, pendingToId, symbols, sourceConnectorId, targetConnectorId);
      }
    }
  };

  const handleDeleteTransitionModal = () => {
    if (editingTransitionId) {
      removeTransition(editingTransitionId);
    }
  };

  const handleReconnectTransition = (edge, targetId, targetConnectorId) => {
    const transition = automaton.transitions.find(item => item.id === edge?.transitionIds?.[0]);
    if (!transition) return;
    updateTransition(
      transition.id,
      transition.symbols,
      transition.sourceConnectorId,
      targetConnectorId,
      transition.from,
      targetId
    );
  };

  const handleUpdateTableCell = (fromId, symbol, targetStateIds) => {
    // For DFA or NFA table cell edit
    statesForSymbol: for (const toId of automaton.states.map(s => s.id)) {
      const isTarget = targetStateIds.includes(toId);
      const existing = automaton.transitions.find(
        t => t.from === fromId && t.to === toId
      );

      if (isTarget) {
        if (!existing) {
          addTransition(fromId, toId, [symbol]);
        } else if (!existing.symbols.includes(symbol)) {
          updateTransition(existing.id, [...existing.symbols, symbol]);
        }
      } else if (existing && existing.symbols.includes(symbol)) {
        const nextSymbols = existing.symbols.filter(s => s !== symbol);
        updateTransition(existing.id, nextSymbols);
      }
    }
  };

  return (
    <PageContainer className="max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="eyebrow">AUTOMATON BUILDER</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            Automaton Builder
          </h1>
          <p className="mt-2 text-ink-muted dark:text-ink-darkMuted">
            Create and simulate your own finite automaton.
          </p>
        </div>
      </div>

      {/* Automaton Setup Card */}
      <Card className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Automaton Type */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
              Automaton Type
            </label>
            <div className="flex gap-2">
              {['DFA', 'NFA'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 focus-ring rounded-xl py-2.5 text-sm font-bold transition ${
                    automaton.type === t
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Alphabet */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
              Alphabet
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {automaton.alphabet.map(sym => (
                <span
                  key={sym}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-muted px-3 py-1 font-mono text-sm font-semibold dark:border-line-dark dark:bg-surface-darkMuted"
                >
                  {sym}
                  <button
                    type="button"
                    onClick={() => handleRemoveSymbol(sym)}
                    className="text-ink-soft hover:text-danger ml-1"
                    aria-label={`Remove symbol ${sym}`}
                  >
                    ×
                  </button>
                </span>
              ))}

              <form onSubmit={handleAddSymbol} className="flex gap-2">
                <input
                  type="text"
                  maxLength={3}
                  value={newSymbol}
                  onChange={e => setNewSymbol(e.target.value)}
                  placeholder="+ Add symbol"
                  className="w-28 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-mono dark:border-line-dark dark:bg-surface-dark"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Add
                </Button>
              </form>
            </div>
            {alphabetError && (
              <p className="mt-1 text-xs text-danger">{alphabetError}</p>
            )}
          </div>
        </div>

        {/* State Naming Preference */}
        <div className="border-t border-line pt-4 dark:border-line-dark flex items-center justify-start gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            State Naming Style:
          </label>
          <select
            value={automaton.stateNaming}
            onChange={e => setStateNaming(e.target.value)}
            className="focus-ring rounded-lg border border-line bg-surface px-3 py-1 text-xs font-semibold dark:border-line-dark dark:bg-surface-dark"
          >
            <option value="alphabet">A, B, C...</option>
            <option value="q">q0, q1, q2...</option>
            <option value="number">0, 1, 2...</option>
          </select>
        </div>
      </Card>

      {/* Main Workspace Layout */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        {/* Left Column: Canvas & Controls (2 Cols) */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Builder Toolbar */}
          <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => {
                if (simulationActive) { showToast('Reset the simulation before editing the automaton.'); return; }
                if (isMobileViewport && !isCanvasFullscreen) {
                  showToast('This feature is only available in Fullscreen mode.');
                  return;
                }
                addState();
              }} size="sm" disabled={simulationActive}>
                <Plus size={16} /> Add State
              </Button>

              <div className="h-6 w-px bg-line dark:bg-line-dark mx-1" />

              <button
                type="button"
                onClick={() => activateTool('select')}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  activeTool === 'select'
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-line bg-surface hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark'
                }`}
              >
                <MousePointer size={14} /> Select State
              </button>

              <button
                type="button"
                disabled={simulationActive}
                onClick={() => {
                  if (simulationActive) { showToast('Reset the simulation before editing the automaton.'); return; }
                  if (isMobileViewport && !isCanvasFullscreen) {
                    showToast('This feature is only available in Fullscreen mode.');
                    return;
                  }
                  activateTool('transition');
                }}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  simulationActive
                    ? 'cursor-not-allowed border border-line bg-surface opacity-40 dark:border-line-dark dark:bg-surface-dark'
                    : activeTool === 'transition'
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-line bg-surface hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark'
                }`}
              >
                <ArrowUpRight size={14} /> Create Transition
              </button>
            </div>
          </Card>

          {/* Visual Canvas */}
          <Card>
            <BuilderCanvas
              automaton={{ ...automaton, setType }}
              stateById={stateById}
              groupedEdges={groupedEdges}
              activeTool={activeTool}
              activePanel={activePanel}
              selectedStateId={selectedStateId}
              selectedTransitionKey={selectedTransitionKey}
              simulation={simulation}
              onSelectState={id => {
                setSelectedStateId(id);
                setSelectedTransitionKey(null);
                if (id) {
                  setEditStateName(stateById[id]?.name ?? '');
                  setTransitionModalOpen(false);
                  setActivePanel('editState');
                } else if (activePanel === 'editState') {
                  setActivePanel(null);
                }
              }}
              onSelectTransition={edge => {
                setSelectedTransitionKey(edge.key);
                setSelectedStateId(null);
                setActivePanel(current => current === 'editState' ? null : current);
              }}
              onMoveState={moveState}
              onStartTransition={handleStartTransition}
              onEditTransition={handleEditTransition}
              onReconnectTransition={handleReconnectTransition}
              onSetActiveTool={activateTool}
              onAddStateAt={handleAddStateAt}
              onOpenMobileSheet={togglePanel}
              onFullscreenChange={setIsCanvasFullscreen}
              fullscreenContainerRef={fullscreenContainerRef}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              onRequestClear={() => setClearModalOpen(true)}
              resetVersion={canvasResetVersion}
            />
          </Card>

          {/* Synchronized Transition Table — always visible on desktop;
              on mobile it moves into the floating Table sheet instead so it
              doesn't permanently eat canvas space. */}
          <Card className="hidden space-y-4 lg:block">
            <h2 className="font-display text-lg font-semibold">
              Transition Table
            </h2>
            <BuilderTable
              tableData={getTransitionTable()}
              onUpdateCell={handleUpdateTableCell}
            />
          </Card>

          {/* Compact validation banner — mobile only. Desktop keeps the
              full Validation panel in the right column. */}
          <Card className="space-y-2 lg:hidden">
            {validation.valid ? (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={16} /> Valid {automaton.type}
              </div>
            ) : (
              <div className="space-y-1 text-xs text-red-700 dark:text-red-300">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle size={16} /> Invalid {automaton.type}
                </div>
                {validation.errors.map((err, idx) => (
                  <p key={idx}>• {err}</p>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: State Inspector, Validation, Simulator — desktop only.
            Mobile gets these via contextual bottom sheets and floating buttons. */}
        <div className="hidden space-y-6 lg:block">
          {/* State Inspector / Editor */}
          {selectedState ? (
            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-base">
                  Edit State {selectedState.name}
                </h3>
                <button
                  type="button"
                  onClick={() => removeState(selectedState.id)}
                  className="text-xs font-semibold text-danger hover:underline flex items-center gap-1"
                >
                  <Trash2 size={14} /> Remove State
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <Input
                    label="State Name"
                    value={editStateName}
                    onChange={e => {
                      setEditStateName(e.target.value);
                      updateState(selectedState.id, { name: e.target.value });
                    }}
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    State Properties
                  </label>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted dark:bg-surface-darkMuted">
                    <span>Initial State</span>
                    <input
                      type="radio"
                      name="initialState"
                      checked={selectedState.initial}
                      onChange={() => setInitialState(selectedState.id)}
                      className="accent-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted dark:bg-surface-darkMuted">
                    <span>Accepting State</span>
                    <input
                      type="checkbox"
                      checked={selectedState.accepting}
                      onChange={() => toggleAccepting(selectedState.id)}
                      className="accent-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted dark:bg-surface-darkMuted">
                    <span>Dead (Trap) State</span>
                    <input
                      type="checkbox"
                      checked={selectedState.dead}
                      onChange={() => toggleDead(selectedState.id)}
                      className="accent-primary"
                    />
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-5 text-center text-xs text-ink-muted dark:text-ink-darkMuted">
              Click any state on the canvas to configure its properties.
            </Card>
          )}

          {/* Validation Panel */}
          <Card className="space-y-3">
            <h3 className="font-display font-semibold text-base flex items-center gap-2">
              <ShieldAlert size={18} className="text-primary" />
              Automaton Validation
            </h3>

            {validation.valid ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 size={16} /> Valid {automaton.type}
                </div>
                {validation.warnings.map((w, idx) => (
                  <p key={idx} className="text-amber-700 dark:text-amber-300">
                    • {w}
                  </p>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={16} /> Invalid {automaton.type}
                </div>
                {validation.errors.map((err, idx) => (
                  <p key={idx}>• {err}</p>
                ))}
              </div>
            )}
          </Card>

          {/* Simulator Panel */}
          <Card className="space-y-4">
            <h3 className="font-display font-semibold text-base">Simulator</h3>
            <BuilderSimulator
              simulation={simulation}
              stateById={stateById}
            />
          </Card>
        </div>
      </div>

      {/* Mobile floating controls — Simulator & Transition Table.
          Kept out of the way in the safe-area bottom-right corner in
          normal mobile mode. In fullscreen, the mobile sidebar already
          exposes Table/Simulator, so this pair is redundant there and would
          overlap the canvas — the portal below re-parents this whole block
          inside the fullscreen root but the buttons stay hidden via the
          sidebar taking over that job, so just skip rendering them while
          fullscreen. */}
      {!isCanvasFullscreen && (
        <div
          className="fixed bottom-4 right-4 z-30 flex flex-col gap-3 lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <button
            type="button"
            onClick={() => togglePanel('table')}
            className="focus-ring flex h-12 w-12 items-center justify-center rounded-full bg-surface text-primary shadow-lift border border-line dark:border-line-dark dark:bg-surface-dark"
            aria-label="Open transition table"
          >
            <Table size={20} />
          </button>
          <button
            type="button"
            onClick={() => togglePanel('simulator')}
            className="focus-ring flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lift"
            aria-label="Open simulator"
          >
            <Play size={20} />
          </button>
        </div>
      )}

      {/* Mobile contextual state inspector, Simulator sheet, and Table
          sheet. Portaled inside the fullscreen root while fullscreen is
          active so they stay reachable instead of disappearing behind it —
          same components, same state, just re-parented. */}
      <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
      <div className="lg:hidden">
        <MobileSheet
          open={activePanel === 'editState' && Boolean(selectedState)}
          title={selectedState ? `Edit State ${selectedState.name}` : 'Edit State'}
          onClose={() => {
            setSelectedStateId(null);
            setActivePanel(null);
          }}
        >
          {selectedState && (
            <div className="space-y-3 text-sm">
              <Input
                label="State Name"
                value={editStateName}
                onChange={e => {
                  setEditStateName(e.target.value);
                  updateState(selectedState.id, { name: e.target.value });
                }}
              />

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted dark:bg-surface-darkMuted">
                  <span>Initial State</span>
                  <input
                    type="radio"
                    name="initialStateMobile"
                    checked={selectedState.initial}
                    onChange={() => setInitialState(selectedState.id)}
                    className="accent-primary"
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted dark:bg-surface-darkMuted">
                  <span>Accepting State</span>
                  <input
                    type="checkbox"
                    checked={selectedState.accepting}
                    onChange={() => toggleAccepting(selectedState.id)}
                    className="accent-primary"
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted dark:bg-surface-darkMuted">
                  <span>Dead (Trap) State</span>
                  <input
                    type="checkbox"
                    checked={selectedState.dead}
                    onChange={() => toggleDead(selectedState.id)}
                    className="accent-primary"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  removeState(selectedState.id);
                  setSelectedStateId(null);
                  setActivePanel(null);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/30 py-2 text-xs font-semibold text-danger hover:bg-danger-soft"
              >
                <Trash2 size={14} /> Remove State
              </button>
            </div>
          )}
        </MobileSheet>

        <MobileSheet
          open={activePanel === 'simulator'}
          title="Simulator"
          onClose={() => setActivePanel(null)}
          side={isCanvasFullscreen}
        >
          <BuilderSimulator
            simulation={simulation}
            stateById={stateById}
          />
        </MobileSheet>

        <MobileSheet
          open={activePanel === 'table'}
          title="Transition Table"
          onClose={() => setActivePanel(null)}
          side={isCanvasFullscreen}
        >
          <BuilderTable
            tableData={getTransitionTable()}
            onUpdateCell={handleUpdateTableCell}
          />
        </MobileSheet>
      </div>
      </FullscreenPortal>

      {/* Transition Modal — also portaled into the fullscreen root while
          fullscreen is active. Unlike the panels above this one is used on
          both desktop and mobile, since creating/editing a transition while
          fullscreen would otherwise be unreachable on any device. */}
      <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
        <TransitionModal
          open={transitionModalOpen && activePanel === 'transitionDetails'}
          onClose={() => {
            setTransitionModalOpen(false);
            setActivePanel(null);
          }}
          fromState={stateById[pendingFromId]}
          toState={stateById[pendingToId]}
          existingSymbols={existingSymbols}
          alphabet={automaton.alphabet}
          onSave={handleSaveTransitionModal}
          onDelete={handleDeleteTransitionModal}
          sourceConnectorId={pendingSourceConnectorId}
          targetConnectorId={pendingTargetConnectorId}
          transitions={automaton.transitions}
          editingTransitionId={editingTransitionId}
        />
      </FullscreenPortal>

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lift dark:bg-white dark:text-ink">
          {toast}
        </div>
      )}

      {/* Clear Confirmation Modal — portaled into fullscreen root when fullscreen is active */}
      <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
        <Modal
          open={clearModalOpen}
          title="Clear Automaton?"
          onClose={() => setClearModalOpen(false)}
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink-muted dark:text-ink-darkMuted">
              This will permanently remove all states and transitions from your current Builder session.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setClearModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  clearAll();
                  setSelectedStateId(null);
                  setSelectedTransitionKey(null);
                  setActivePanel(null);
                  setCanvasResetVersion(version => version + 1);
                  setClearModalOpen(false);
                }}
              >
                Clear Canvas
              </Button>
            </div>
          </div>
        </Modal>
      </FullscreenPortal>
    </PageContainer>
  );
}
