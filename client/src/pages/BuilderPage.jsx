import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  MousePointer,
  ArrowUpRight,
  ShieldAlert,
  Save,
  Download,
  History,
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
import { useSavedAutomata } from '../builder/useSavedAutomata';
import {
  serializeForCompare,
  buildAutomatonExport,
  sanitizeAutomatonImport,
  sanitizeBuilderAutomaton,
  buildExportFilename,
} from '../builder/automatonStorage';
import { exportAutomatonAsPng } from '../builder/imageExporter';
import { validateAutomaton } from '../builder/builderValidator';
import BuilderCanvas from '../builder/BuilderCanvas';
import BuilderErrorBoundary from '../builder/BuilderErrorBoundary';
import BuilderTable from '../builder/BuilderTable';
import BuilderSimulator from '../builder/BuilderSimulator';
import TransitionModal from '../builder/TransitionModal';
import SavedAutomataPanel from '../builder/SavedAutomataPanel';
import ImportExportPanel from '../builder/ImportExportPanel';
import SimulationHistoryPanel from '../builder/SimulationHistoryPanel';
import { useSimulationHistory } from '../builder/useSimulationHistory';

export default function BuilderPage() {
  const location = useLocation();
  const navigate = useNavigate();

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
    setTransitionBend,
    clearAll,
    loadAutomatonIntoBuilder,
    undo,
    redo,
    canUndo,
    canRedo,
    persistenceAvailable,
  } = useAutomaton();

  // ── Simulation hook ────────────────────────────────────────────────────────
  const simulation = useBuilderSimulation(automaton);
  const { simulationActive } = simulation;

  // ── Simulation History (V2.3.5) ─────────────────────────────────────────────
  const { history: simHistory, addRecord: addHistoryRecord, clearHistory } = useSimulationHistory();
  // Guard ref: track the last session id that was recorded so a re-render
  // or strict-mode double-effect never creates a duplicate entry.
  const lastRecordedSessionIdRef = useRef(null);

  // ── Saved Automata (V2.3.2) ─────────────────────────────────────────────────
  const savedAutomata = useSavedAutomata();
  // Identity of the saved entry the current canvas was last explicitly
  // loaded from or saved as — used to prefill the Save name field and to
  // detect unsaved changes. `null` means "current work has never been
  // explicitly saved this session".
  const [loadedMeta, setLoadedMeta] = useState(null); // { id, name } | null
  const savedSnapshotRef = useRef(null); // string | null — serialized automaton as of last explicit save/load
  const [loadConfirm, setLoadConfirm] = useState(null); // { id, name } | null

  // ── JSON Import / Export (V2.3.3) ───────────────────────────────────────────
  // A validated-but-not-yet-applied import, awaiting the user's confirmation
  // to replace current work — same pattern as loadConfirm above.
  const [importConfirm, setImportConfirm] = useState(null); // { automaton } | null

  // ── Generator → Builder handoff (V2.3.4.1) ──────────────────────────────────
  // Same "awaiting confirmation" pattern as importConfirm above.
  const [generatorConfirm, setGeneratorConfirm] = useState(null); // { automaton } | null
  const handledGeneratorTransferRef = useRef(false);

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

  // Save/Load and Import/Export are Fullscreen-only on mobile — auto-close
  // whichever is open if the user exits Fullscreen, so neither lingers
  // outside the canvas.
  useEffect(() => {
    if (!isCanvasFullscreen && isMobileViewport) {
      setActivePanel(current =>
        current === 'savedAutomata' || current === 'importExport' || current === 'simulationHistory' ? null : current
      );
    }
  }, [isCanvasFullscreen, isMobileViewport]);

  const showToast = message => {
    setToast(message);
    window.setTimeout(() => setToast(current => current === message ? '' : current), 2600);
  };

  // Non-blocking notice if LocalStorage persistence isn't available (quota
  // exceeded, private browsing, etc.) — editing continues normally either way.
  const hasWarnedPersistenceRef = useRef(false);
  useEffect(() => {
    if (!persistenceAvailable && !hasWarnedPersistenceRef.current) {
      hasWarnedPersistenceRef.current = true;
      showToast('Local autosave is unavailable — changes won\u2019t persist after you leave.');
    }
  }, [persistenceAvailable]);

  // ── Auto-record completed simulations (V2.3.5) ──────────────────────────────
  // Fires only when the session reaches a terminal status (ACCEPTED/REJECTED).
  // The lastRecordedSessionIdRef guard prevents double-recording on re-renders.
  // A unique session key is derived from the timestamp + input so the same
  // session is never recorded twice even under React strict-mode double-effects.
  useEffect(() => {
    const { status, sessionPath, input, result, finalStateId, timestamp } = simulation.session;
    if (status !== 'ACCEPTED' && status !== 'REJECTED') return;

    // Build a stable per-session key from the terminal timestamp.
    // finish() sets status+result atomically, so the timestamp only exists
    // once the session is truly done. Fall back to input+result as a tiebreak.
    const sessionKey = timestamp ?? `${input}:${result}`;
    if (lastRecordedSessionIdRef.current === sessionKey) return;
    lastRecordedSessionIdRef.current = sessionKey;

    // Resolve state names from stateById.
    const initialState = automaton.states.find(s => s.initial);
    const startingStateName = initialState?.name ?? null;
    const finalStateObj = finalStateId ? stateById[finalStateId] : null;
    const finalStateName = finalStateObj?.name ?? null;

    addHistoryRecord({
      input,
      result,
      type:          automaton.type,
      startingState: startingStateName,
      finalState:    finalStateName,
      path:          sessionPath ?? [],
      automatonName: loadedMeta?.name ?? null,
      timestamp:     new Date().toISOString(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulation.session.status, simulation.session.timestamp]);

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
    if ((panel === 'table' || panel === 'simulator' || panel === 'savedAutomata' || panel === 'importExport' || panel === 'simulationHistory') && isMobileViewport && !isCanvasFullscreen) {
      showToast(
        panel === 'table'
          ? 'Table is only available in Fullscreen mode.'
          : panel === 'simulator'
            ? 'Simulation is only available in Fullscreen mode.'
            : panel === 'savedAutomata'
              ? 'Save / Load is only available in Fullscreen mode.'
              : panel === 'simulationHistory'
                ? 'Simulation History is only available in Fullscreen mode.'
                : 'Import / Export is only available in Fullscreen mode.'
      );
      return;
    }
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

  // A canvas with no states has nothing worth warning about losing.
  const hasUnsavedChanges =
    automaton.states.length > 0 &&
    serializeForCompare(automaton) !== savedSnapshotRef.current;

  const performLoad = id => {
    const result = savedAutomata.loadById(id);
    if (!result.ok) {
      showToast('Unable to load this automaton. The saved data is invalid or incompatible.');
      return;
    }
    simulation.reset();
    loadAutomatonIntoBuilder(result.automaton);
    savedSnapshotRef.current = serializeForCompare(result.automaton);
    setLoadedMeta({ id: result.id, name: result.name });
    setSelectedStateId(null);
    setSelectedTransitionKey(null);
    setActivePanel(null);
    setCanvasResetVersion(version => version + 1);
    showToast(`Loaded "${result.name}".`);
  };

  const handleRequestLoad = (id, name) => {
    if (hasUnsavedChanges) {
      setActivePanel(null);
      setLoadConfirm({ id, name });
      return;
    }
    performLoad(id);
  };

  const handleSavedPanelSave = (name, opts) => {
    const result = savedAutomata.save(name, automaton, opts);
    if (result.ok) {
      savedSnapshotRef.current = serializeForCompare(automaton);
      setLoadedMeta({ id: result.id, name: name.trim() });
      showToast(opts?.overwriteId ? `Updated "${name.trim()}".` : `Saved "${name.trim()}".`);
    }
    return result;
  };

  const handleDeleteSaved = id => {
    const ok = savedAutomata.remove(id);
    if (!ok) showToast('Could not delete — please try again.');
    return ok;
  };

  // ── JSON Import / Export (V2.3.3) ───────────────────────────────────────────

  const handleExport = () => {
    if (!automaton.states || automaton.states.length === 0) return;
    const payload = buildAutomatonExport(automaton);
    const filename = buildExportFilename(loadedMeta?.name);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Applies an already-validated imported automaton — mirrors performLoad,
  // but an import isn't tied to any saved slot, so loadedMeta is cleared
  // rather than pointed at one. Reused by the Generator handoff below with
  // a different confirmation message.
  const applyImport = (importedAutomaton, message = 'Automaton imported.') => {
    simulation.reset();
    loadAutomatonIntoBuilder(importedAutomaton);
    savedSnapshotRef.current = null;
    setLoadedMeta(null);
    setSelectedStateId(null);
    setSelectedTransitionKey(null);
    setActivePanel(null);
    setCanvasResetVersion(version => version + 1);
    showToast(message);
  };

  // Reads, parses, and validates the selected file before ever touching the
  // Builder or LocalStorage — a failed import leaves both untouched.
  const handleImportFile = file => {
    const reader = new FileReader();
    reader.onerror = () => {
      showToast('Unable to import automaton. The selected JSON file is invalid or incompatible with AutoFA.');
    };
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        showToast('Unable to import automaton. The selected JSON file is invalid or incompatible with AutoFA.');
        return;
      }
      const result = sanitizeAutomatonImport(parsed);
      if (!result.ok) {
        showToast(
          result.error === 'unsupported-version'
            ? 'This AutoFA file was created with a newer format and cannot be opened by this version.'
            : 'Unable to import automaton. The selected JSON file is invalid or incompatible with AutoFA.'
        );
        return;
      }
      if (automaton.states.length > 0) {
        setActivePanel(null);
        setImportConfirm({ automaton: result.automaton });
      } else {
        applyImport(result.automaton);
      }
    };
    reader.readAsText(file);
  };

  // ── Image Export (V2.3.4) ───────────────────────────────────────────────────

  const handleExportImage = async () => {
    if (!automaton.states || automaton.states.length === 0) return;
    const isDarkMode = document.documentElement.classList.contains('dark');
    const result = await exportAutomatonAsPng({
      automaton,
      stateById,
      groupedEdges,
      loadedName: loadedMeta?.name,
      isDarkMode,
    });
    if (!result.ok) {
      showToast('Unable to export image. Please try again.');
    }
  };

  // ── Generator → Builder handoff (V2.3.4.1) ──────────────────────────────────
  // Reuses the same automaton contract as JSON Import/Save-Load — the
  // Generator already converted its result into that shape (see
  // createBuilderAutomatonFromGenerated in automatonStorage.js) before
  // navigating here, so this only re-validates it defensively and decides
  // whether it's safe to apply immediately.
  useEffect(() => {
    const transfer = location.state?.generatorTransfer;
    if (!transfer || handledGeneratorTransferRef.current) return;
    handledGeneratorTransferRef.current = true;

    // Clear the router state immediately — a refresh, a Cancel, or simply
    // navigating back to /builder later must never re-apply this handoff.
    navigate(location.pathname, { replace: true, state: {} });

    const validated = sanitizeBuilderAutomaton(transfer.automaton);
    if (!validated) {
      showToast('Unable to open this automaton in Builder. Please try generating it again.');
      return;
    }
    if (automaton.states.length > 0) {
      setGeneratorConfirm({ automaton: validated });
    } else {
      applyImport(validated, 'Automaton loaded from Generator.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

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

              <div className="h-6 w-px bg-line dark:bg-line-dark mx-1" />

              <button
                type="button"
                onClick={() => togglePanel('savedAutomata')}
                className={`focus-ring hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold lg:inline-flex ${
                  activePanel === 'savedAutomata'
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-line bg-surface hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark'
                }`}
              >
                <Save size={14} /> Save / Load
              </button>

              <button
                type="button"
                onClick={() => togglePanel('importExport')}
                className={`focus-ring hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold lg:inline-flex ${
                  activePanel === 'importExport'
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-line bg-surface hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark'
                }`}
              >
                <Download size={14} /> Import / Export
              </button>

              <button
                type="button"
                onClick={() => togglePanel('simulationHistory')}
                className={`focus-ring hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold lg:inline-flex ${
                  activePanel === 'simulationHistory'
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-line bg-surface hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark'
                }`}
              >
                <History size={14} /> Sim History
              </button>
            </div>
          </Card>

          {/* Visual Canvas */}
          <Card>
            <BuilderErrorBoundary
              onReset={() => {
                setActivePanel(null);
                setTransitionModalOpen(false);
                setSelectedStateId(null);
                setSelectedTransitionKey(null);
                setActiveTool('select');
                setCanvasResetVersion(version => version + 1);
              }}
            >
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
                onSetTransitionBend={setTransitionBend}
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
            </BuilderErrorBoundary>
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
              simulationActive={simulationActive}
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

      {/* Mobile floating Table/Simulator buttons were removed: per the
          mobile UX spec, Simulation and Table are Fullscreen-only on
          mobile — the MobileFullscreenSidebar is the only mobile entry
          point for them (it only renders while isFullscreen && isMobile).
          togglePanel() above still guards every path defensively with the
          "only available in Fullscreen mode" toast. Desktop is unaffected —
          its Simulator/Table live in the right-column Cards above. */}

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
          side
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
            simulationActive={simulationActive}
          />
        </MobileSheet>

        <MobileSheet
          open={activePanel === 'savedAutomata'}
          title="Save / Load"
          onClose={() => setActivePanel(null)}
          side
        >
          <SavedAutomataPanel
            entries={savedAutomata.entries}
            currentAutomaton={automaton}
            defaultName={loadedMeta?.name ?? ''}
            onSave={handleSavedPanelSave}
            onRequestLoad={handleRequestLoad}
            onDelete={handleDeleteSaved}
          />
        </MobileSheet>

        <MobileSheet
          open={activePanel === 'importExport'}
          title="Import / Export"
          onClose={() => setActivePanel(null)}
          side
        >
          <ImportExportPanel
            currentAutomaton={automaton}
            onExport={handleExport}
            onExportImage={handleExportImage}
            onImportFile={handleImportFile}
          />
        </MobileSheet>

        <MobileSheet
          open={activePanel === 'simulationHistory'}
          title="Simulation History"
          onClose={() => setActivePanel(null)}
          side={isCanvasFullscreen}
        >
          <SimulationHistoryPanel
            history={simHistory}
            onClearHistory={clearHistory}
          />
        </MobileSheet>
      </div>
      </FullscreenPortal>

      {/* Save/Load — desktop version. Mobile uses the right-to-left
          MobileSheet above instead of this centered dialog. */}
      <div className="hidden lg:block">
        <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
          <Modal
            open={activePanel === 'savedAutomata' && !isMobileViewport}
            title="Save / Load Automata"
            onClose={() => setActivePanel(null)}
          >
            <SavedAutomataPanel
              entries={savedAutomata.entries}
              currentAutomaton={automaton}
              defaultName={loadedMeta?.name ?? ''}
              onSave={handleSavedPanelSave}
              onRequestLoad={handleRequestLoad}
              onDelete={handleDeleteSaved}
            />
          </Modal>
        </FullscreenPortal>
      </div>

      {/* Import/Export — desktop version. Mobile uses the right-to-left
          MobileSheet above instead of this centered dialog. */}
      <div className="hidden lg:block">
        <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
          <Modal
            open={activePanel === 'importExport' && !isMobileViewport}
            title="Import / Export"
            onClose={() => setActivePanel(null)}
          >
            <ImportExportPanel
              currentAutomaton={automaton}
              onExport={handleExport}
              onExportImage={handleExportImage}
              onImportFile={handleImportFile}
            />
          </Modal>
        </FullscreenPortal>
      </div>

      {/* Simulation History — desktop version (modal). Mobile uses the
          right-to-left MobileSheet in the lg:hidden block above. */}
      <div className="hidden lg:block">
        <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
          <Modal
            open={activePanel === 'simulationHistory' && !isMobileViewport}
            title="Simulation History"
            onClose={() => setActivePanel(null)}
          >
            <SimulationHistoryPanel
              history={simHistory}
              onClearHistory={clearHistory}
            />
          </Modal>
        </FullscreenPortal>
      </div>

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
                  simulation.reset();
                  clearAll();
                  setSelectedStateId(null);
                  setSelectedTransitionKey(null);
                  setActivePanel(null);
                  setCanvasResetVersion(version => version + 1);
                  setClearModalOpen(false);
                  setLoadedMeta(null);
                }}
              >
                Clear Canvas
              </Button>
            </div>
          </div>
        </Modal>
      </FullscreenPortal>

      {/* Load Confirmation Modal — only shown when the current canvas has
          unsaved changes; a clean/empty canvas loads immediately. */}
      <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
        <Modal
          open={Boolean(loadConfirm)}
          title="Load this automaton?"
          onClose={() => setLoadConfirm(null)}
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink-muted dark:text-ink-darkMuted">
              Your current work will be replaced{loadConfirm ? ` with "${loadConfirm.name}"` : ''}.
              It was auto-saved, but any unsaved changes won&rsquo;t be reachable unless you save them first.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setLoadConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = loadConfirm;
                  setLoadConfirm(null);
                  if (target) performLoad(target.id);
                }}
              >
                Load
              </Button>
            </div>
          </div>
        </Modal>
      </FullscreenPortal>

      {/* Import Confirmation Modal — only shown when the current canvas has
          states; an empty canvas imports immediately. */}
      <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
        <Modal
          open={Boolean(importConfirm)}
          title="Import this automaton?"
          onClose={() => setImportConfirm(null)}
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink-muted dark:text-ink-darkMuted">
              Your current Builder automaton will be replaced. It was auto-saved, but any unsaved changes won&rsquo;t be reachable unless you save them first.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setImportConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = importConfirm;
                  setImportConfirm(null);
                  if (target) applyImport(target.automaton);
                }}
              >
                Import
              </Button>
            </div>
          </div>
        </Modal>
      </FullscreenPortal>

      {/* Generator Handoff Confirmation Modal — only shown when the current
          canvas has states; an empty canvas opens the generated automaton
          immediately. */}
      <FullscreenPortal active={isCanvasFullscreen} container={fullscreenContainerRef.current}>
        <Modal
          open={Boolean(generatorConfirm)}
          title="Open generated automaton in Builder?"
          onClose={() => setGeneratorConfirm(null)}
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink-muted dark:text-ink-darkMuted">
              Your current Builder automaton will be replaced with the automaton you just generated. It was auto-saved, but any unsaved changes won&rsquo;t be reachable unless you save them first.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setGeneratorConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = generatorConfirm;
                  setGeneratorConfirm(null);
                  if (target) applyImport(target.automaton, 'Automaton loaded from Generator.');
                }}
              >
                Open in Builder
              </Button>
            </div>
          </div>
        </Modal>
      </FullscreenPortal>
    </PageContainer>
  );
}
