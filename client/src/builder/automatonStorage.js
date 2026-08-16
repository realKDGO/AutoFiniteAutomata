// ─── Persistent LocalStorage for the Builder Automaton (V2.3.1) ─────────────
//
// Serializes ONLY the data required to reconstruct the automaton — the same
// shape useAutomaton.js keeps as `present` state (type, alphabet,
// stateNaming, states, transitions). Never stores UI/interaction state
// (open modals, selection, in-progress transition drafts, simulation
// state) — those live outside this object entirely, as component state in
// BuilderPage/BuilderCanvas, so they're naturally excluded.
//
// Storage is versioned so future stages (JSON import/export, multi-slot
// save/load) can reuse or migrate this format without replacing the
// underlying serialization logic.

const STORAGE_KEY = 'autofa.builder.automaton.v1';
const STORAGE_VERSION = 1;

const VALID_TYPES = new Set(['DFA', 'NFA']);
const VALID_NAMING = new Set(['alphabet', 'q', 'number']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Structural sanity check only — this is intentionally NOT the semantic
 * DFA/NFA validator (builderValidator.js). A half-built automaton (no
 * transitions yet, no initial state chosen yet) is a completely normal
 * thing to persist and restore. This function only guards against data
 * that is malformed, corrupted, or incompatible in a way that could break
 * the reducer or crash rendering — e.g. wrong types, dangling transition
 * references, duplicate ids, out-of-range connectors.
 *
 * Returns a clean automaton object, or null if the data can't be trusted.
 */
function sanitizeAutomaton(raw) {
  if (!isPlainObject(raw)) return null;
  if (!VALID_TYPES.has(raw.type)) return null;
  if (!Array.isArray(raw.alphabet) || !raw.alphabet.every(s => typeof s === 'string')) return null;
  if (!VALID_NAMING.has(raw.stateNaming)) return null;
  if (!Array.isArray(raw.states)) return null;
  if (!Array.isArray(raw.transitions)) return null;

  const seenStateIds = new Set();
  const states = [];
  for (const s of raw.states) {
    if (!isPlainObject(s)) return null;
    if (typeof s.id !== 'string' || !s.id || seenStateIds.has(s.id)) return null;
    if (typeof s.name !== 'string' || !s.name) return null;
    if (typeof s.initial !== 'boolean') return null;
    if (typeof s.accepting !== 'boolean') return null;
    if (typeof s.dead !== 'boolean') return null;
    if (!isPlainObject(s.position) || !isFiniteNumber(s.position.x) || !isFiniteNumber(s.position.y)) return null;
    seenStateIds.add(s.id);
    states.push({
      id: s.id,
      name: s.name,
      initial: s.initial,
      accepting: s.accepting,
      dead: s.dead,
      position: { x: s.position.x, y: s.position.y },
    });
  }
  // A valid automaton can never have had more than one initial state.
  if (states.filter(s => s.initial).length > 1) return null;

  const stateIds = new Set(states.map(s => s.id));
  const seenTransitionIds = new Set();
  const transitions = [];
  for (const t of raw.transitions) {
    if (!isPlainObject(t)) return null;
    if (typeof t.id !== 'string' || !t.id || seenTransitionIds.has(t.id)) return null;
    if (typeof t.from !== 'string' || !stateIds.has(t.from)) return null;
    if (typeof t.to !== 'string' || !stateIds.has(t.to)) return null;
    if (!Array.isArray(t.symbols) || t.symbols.length === 0 || !t.symbols.every(s => typeof s === 'string')) return null;

    const sourceConnectorId = Number.isInteger(t.sourceConnectorId) ? t.sourceConnectorId : 2;
    const targetConnectorId = Number.isInteger(t.targetConnectorId) ? t.targetConnectorId : 6;
    if (sourceConnectorId < 0 || sourceConnectorId > 7) return null;
    if (targetConnectorId < 0 || targetConnectorId > 7) return null;
    if (t.from === t.to && sourceConnectorId === targetConnectorId) return null;

    let bend = null;
    if (isPlainObject(t.bend) && isFiniteNumber(t.bend.dx) && isFiniteNumber(t.bend.dy)) {
      bend = { dx: t.bend.dx, dy: t.bend.dy };
    }

    seenTransitionIds.add(t.id);
    transitions.push({
      id: t.id,
      from: t.from,
      to: t.to,
      sourceConnectorId,
      targetConnectorId,
      symbols: [...t.symbols],
      bend,
    });
  }

  return {
    type: raw.type,
    alphabet: [...raw.alphabet],
    stateNaming: raw.stateNaming,
    states,
    transitions,
  };
}

// The Generator emits the engine's automaton contract, while the Builder
// persists the richer editing contract above. Keeping this conversion beside
// the shared serializer means a generated automaton uses the same shape as
// JSON import/export, autosave, and named saves once it reaches the Builder.
//
// Positions/loop sides are optional: when the caller (ResultPage) supplies
// the exact layout it rendered on the Generator result — via
// components/StateDiagram/diagramUtils.layoutStates/loopSide — the Builder
// canvas opens with that same structure instead of a generic grid. Missing
// or non-finite entries fall back to the grid so a malformed/omitted layout
// never breaks the handoff.
function generatedStatePosition(index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return { x: 150 + col * 210, y: 160 + row * 185 };
}

function directionConnector(from, to) {
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return Math.round((((angle + 90) % 360 + 360) % 360) / 45) % 8;
}

// Builder connector ids run clockwise from the top: 0=N, 2=E, 4=S, 6=W (see
// directionConnector above / imageExporter.getStateConnectors). A self-loop
// needs two distinct connectors on the same state — placed symmetrically
// either side of the requested visual side so the loop still reads as
// bulging that direction, matching components/StateDiagram's loopSide().
const LOOP_SIDE_CONNECTOR = { top: 0, right: 2, bottom: 4, left: 6 };

function selfLoopConnectors(side) {
  const center = LOOP_SIDE_CONNECTOR[side] ?? LOOP_SIDE_CONNECTOR.top;
  return { source: (center + 7) % 8, target: (center + 1) % 8 };
}

function nextAvailableConnector(usage, preferred) {
  for (let offset = 0; offset < 8; offset++) {
    const connectorId = (preferred + offset) % 8;
    if ((usage[connectorId] ?? 0) < 2) return connectorId;
  }
  // Preserve every generated transition even when an unusually dense graph
  // exhausts the Builder's visual connector capacity.
  return preferred;
}

/**
 * Converts the generated engine contract into the Builder's established
 * serializable automaton format. Returns null for malformed generated data;
 * callers must leave their current Builder canvas untouched in that case.
 *
 * `positions` — optional `{ [stateName]: { x, y } }`, e.g. from
 * diagramUtils.layoutStates(automaton, deadStates).positions — reproduces
 * the exact state layout shown on the Generator result instead of a plain
 * grid. `loopSides` — optional `{ [stateName]: 'top'|'right'|'bottom'|'left' }`,
 * e.g. from diagramUtils.loopSide() per self-loop edge — keeps a self-loop's
 * visual side consistent with what was shown there too.
 */
export function createBuilderAutomatonFromGenerated({
  automaton,
  deadStates = [],
  stateNaming = 'alphabet',
  positions: suppliedPositions = null,
  loopSides = null,
} = {}) {
  if (!isPlainObject(automaton)) return null;

  const type = String(automaton.kind ?? '').toUpperCase();
  if (!VALID_TYPES.has(type) || !VALID_NAMING.has(stateNaming)) return null;
  if (!Array.isArray(automaton.alphabet) || !automaton.alphabet.length) return null;
  const alphabet = automaton.alphabet.map(symbol => String(symbol));
  if (alphabet.some(symbol => !symbol) || new Set(alphabet).size !== alphabet.length) return null;
  if (!Array.isArray(automaton.states) || !automaton.states.length) return null;
  const names = automaton.states.map(name => String(name));
  if (names.some(name => !name) || new Set(names).size !== names.length) return null;
  if (!names.includes(automaton.startState)) return null;
  if (!Array.isArray(automaton.acceptingStates) || !Array.isArray(deadStates)) return null;
  if (automaton.acceptingStates.some(name => !names.includes(name)) || deadStates.some(name => !names.includes(name))) return null;
  if (!isPlainObject(automaton.transitions)) return null;

  const stateIdByName = new Map(names.map((name, index) => [name, `generated-state-${index}`]));
  const positions = new Map(names.map((name, index) => {
    const supplied = suppliedPositions?.[name];
    const usable = isPlainObject(supplied) && isFiniteNumber(supplied.x) && isFiniteNumber(supplied.y)
      ? { x: supplied.x, y: supplied.y }
      : generatedStatePosition(index);
    return [name, usable];
  }));
  const states = names.map((name, index) => ({
    id: `generated-state-${index}`,
    name,
    initial: name === automaton.startState,
    accepting: automaton.acceptingStates.includes(name),
    dead: deadStates.includes(name),
    position: positions.get(name),
  }));

  const grouped = new Map();
  for (const [fromName, bySymbol] of Object.entries(automaton.transitions)) {
    if (!stateIdByName.has(fromName) || !isPlainObject(bySymbol)) return null;
    for (const [symbol, rawTargets] of Object.entries(bySymbol)) {
      if (!alphabet.includes(symbol)) return null;
      const targets = rawTargets == null ? [] : Array.isArray(rawTargets) ? rawTargets : [rawTargets];
      for (const targetName of targets) {
        if (!stateIdByName.has(targetName)) return null;
        const key = `${fromName}\u0000${targetName}`;
        const symbols = grouped.get(key) ?? { fromName, targetName, symbols: [] };
        if (!symbols.symbols.includes(symbol)) symbols.symbols.push(symbol);
        grouped.set(key, symbols);
      }
    }
  }

  const connectorUsage = new Map(names.map(name => [name, Array(8).fill(0)]));
  const transitions = [...grouped.values()].map(({ fromName, targetName, symbols }, index) => {
    const fromUsage = connectorUsage.get(fromName);
    const targetUsage = connectorUsage.get(targetName);
    const isSelfLoop = fromName === targetName;

    let preferredSource;
    let preferredTarget;
    if (isSelfLoop) {
      const side = loopSides?.[fromName];
      const connectors = selfLoopConnectors(side);
      preferredSource = connectors.source;
      preferredTarget = connectors.target;
    } else {
      preferredSource = directionConnector(positions.get(fromName), positions.get(targetName));
      preferredTarget = (preferredSource + 4) % 8;
    }

    const sourceConnectorId = nextAvailableConnector(fromUsage, preferredSource);
    const targetConnectorId = nextAvailableConnector(targetUsage, preferredTarget);
    fromUsage[sourceConnectorId]++;
    targetUsage[targetConnectorId]++;
    return {
      id: `generated-transition-${index}`,
      from: stateIdByName.get(fromName),
      to: stateIdByName.get(targetName),
      sourceConnectorId,
      targetConnectorId,
      symbols,
      bend: null,
    };
  });

  return sanitizeAutomaton({ type, alphabet, stateNaming, states, transitions });
}

/** Validates a Builder-format handoff before it can replace the current canvas. */
export function sanitizeBuilderAutomaton(raw) {
  return sanitizeAutomaton(raw);
}

/** Strip an in-memory automaton down to the exact plain-data shape we
 * persist — shared by the V2.3.1 auto-save slot and V2.3.2 named saves so
 * both write (and compare) the same thing. */
function toStorableAutomaton(automaton) {
  return {
    type: automaton.type,
    alphabet: automaton.alphabet,
    stateNaming: automaton.stateNaming,
    states: automaton.states.map(s => ({
      id: s.id,
      name: s.name,
      initial: s.initial,
      accepting: s.accepting,
      dead: s.dead,
      position: { x: s.position.x, y: s.position.y },
    })),
    transitions: automaton.transitions.map(t => ({
      id: t.id,
      from: t.from,
      to: t.to,
      sourceConnectorId: t.sourceConnectorId ?? 2,
      targetConnectorId: t.targetConnectorId ?? 6,
      symbols: t.symbols,
      bend: t.bend ?? null,
    })),
  };
}

/** Deterministic, dependency-free id generator — good enough for a local
 * storage key, not meant to be a cryptographic uuid. */
function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable string to compare "is the current canvas the same as what was
 * last explicitly saved/loaded" without caring about key order. */
export function serializeForCompare(automaton) {
  return JSON.stringify(toStorableAutomaton(automaton));
}

/** Cheap probe for quota/privacy-mode failures. Never throws. */
export function isStorageAvailable() {
  try {
    const probeKey = '__autofa_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads and validates the saved automaton. Returns null if nothing is
 * saved, or if the saved data is invalid/corrupted/from an incompatible
 * version — callers should fall back to a clean Builder in that case.
 * Never throws.
 */
export function loadAutomaton() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    if (parsed.version !== STORAGE_VERSION) return null;

    return sanitizeAutomaton(parsed.automaton);
  } catch {
    return null;
  }
}

/**
 * Persists the given automaton (the `present` shape from useAutomaton).
 * Only the fields required to reconstruct the diagram are written — no
 * history, no UI state. Returns true on success, false on any failure
 * (quota exceeded, privacy mode, etc.) so callers can surface a
 * non-blocking notice without interrupting editing.
 */
export function saveAutomaton(automaton) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const payload = { version: STORAGE_VERSION, automaton: toStorableAutomaton(automaton) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredAutomaton() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// ─── V2.3.2: Named Saved Automata ────────────────────────────────────────────
//
// A separate store from the V2.3.1 auto-save slot above. Auto-save always
// tracks "whatever is currently on the canvas"; this store holds a list of
// automata the user has explicitly chosen to keep, each addressed by a
// stable id (never by name, so renaming later is safe).

const SAVED_STORAGE_KEY = 'autofa.builder.savedAutomata.v1';
const SAVED_ENTRY_VERSION = 1;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validates just the addressable metadata of a saved entry (id/name/
 * timestamps) — enough to list it safely even if its automaton payload
 * later turns out to be corrupted. An entry that fails this can't be
 * displayed at all, so it's dropped. */
function sanitizeEntryMeta(raw) {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.name !== 'string' || !raw.name) return null;
  if (typeof raw.createdAt !== 'string') return null;
  if (typeof raw.updatedAt !== 'string') return null;
  return { id: raw.id, name: raw.name, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
}

/** Reads the raw saved-automata array. Never throws; returns [] for
 * missing/corrupted/wrong-shaped top-level data (the whole list isn't lost
 * just because one write went wrong — see readSavedStore's caller). */
function readSavedStore() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedStore(list) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * Lightweight list for the Save/Load panel: metadata only (no automaton
 * payload), sorted most-recently-updated first. Entries whose automaton
 * payload is corrupted are still listed (so the user can see and delete
 * them) but flagged via `automatonValid: false`; entries whose own
 * metadata is unusable are silently dropped since there's nothing to show.
 */
export function listSavedAutomata() {
  const raw = readSavedStore();
  const entries = [];
  for (const item of raw) {
    const meta = sanitizeEntryMeta(item);
    if (!meta) continue;
    const automatonValid = sanitizeAutomaton(item.automaton) !== null;
    entries.push({ ...meta, automatonValid });
  }
  entries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return entries;
}

/** True if a saved automaton with this name (case-insensitive, trimmed)
 * already exists; returns its id, or null. */
export function findSavedAutomatonIdByName(name) {
  const target = name.trim().toLowerCase();
  const raw = readSavedStore();
  for (const item of raw) {
    const meta = sanitizeEntryMeta(item);
    if (meta && meta.name.trim().toLowerCase() === target) return meta.id;
  }
  return null;
}

/**
 * Full lookup for loading: validates both metadata and the automaton
 * payload. Returns { ok: true, id, name, automaton } on success, or
 * { ok: false, error } — 'not-found' or 'corrupted' — on failure. Never
 * throws, and never partially applies a bad load.
 */
export function getSavedAutomatonForLoad(id) {
  const raw = readSavedStore();
  const item = raw.find(entry => isPlainObject(entry) && entry.id === id);
  if (!item) return { ok: false, error: 'not-found' };

  const meta = sanitizeEntryMeta(item);
  if (!meta) return { ok: false, error: 'corrupted' };

  const automaton = sanitizeAutomaton(item.automaton);
  if (!automaton) return { ok: false, error: 'corrupted' };

  return { ok: true, id: meta.id, name: meta.name, automaton };
}

/** Creates a new named save. Caller is responsible for the duplicate-name
 * decision (see findSavedAutomatonIdByName) — this always appends. */
export function createSavedAutomaton(name, automaton) {
  const trimmed = name.trim();
  if (!isNonEmptyString(trimmed)) return { ok: false, error: 'name-required' };

  const now = new Date().toISOString();
  const entry = {
    version: SAVED_ENTRY_VERSION,
    id: genId(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    automaton: toStorableAutomaton(automaton),
  };

  const list = readSavedStore();
  list.push(entry);
  if (!writeSavedStore(list)) return { ok: false, error: 'storage-failed' };
  return { ok: true, id: entry.id };
}

/** Overwrites an existing saved automaton's name + content in place,
 * preserving its id and createdAt. Used for explicit "update" saves. */
export function updateSavedAutomaton(id, name, automaton) {
  const trimmed = name.trim();
  if (!isNonEmptyString(trimmed)) return { ok: false, error: 'name-required' };

  const list = readSavedStore();
  const index = list.findIndex(entry => isPlainObject(entry) && entry.id === id);
  if (index === -1) return { ok: false, error: 'not-found' };

  const existing = list[index];
  list[index] = {
    version: SAVED_ENTRY_VERSION,
    id,
    name: trimmed,
    createdAt: typeof existing.createdAt === 'string' ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    automaton: toStorableAutomaton(automaton),
  };

  if (!writeSavedStore(list)) return { ok: false, error: 'storage-failed' };
  return { ok: true, id };
}

/** Removes a single saved automaton by id. Never touches the current
 * Builder automaton or the V2.3.1 auto-save slot. */
export function deleteSavedAutomaton(id) {
  const list = readSavedStore();
  const next = list.filter(entry => !(isPlainObject(entry) && entry.id === id));
  if (next.length === list.length) return false;
  return writeSavedStore(next);
}

// ─── V2.3.3: Portable JSON Import / Export ──────────────────────────────────
//
// Reuses the exact same `toStorableAutomaton` / `sanitizeAutomaton` foundation
// as LocalStorage auto-save and Save/Load above — the on-disk JSON shape is
// just that same storable automaton wrapped with a format/version envelope,
// so all four features (auto-save, Save/Load, Export, Import) stay backed by
// one data model instead of drifting into separate representations.

const EXPORT_FORMAT = 'AutoFA';
const EXPORT_VERSION = 1;

/** Wraps `automaton` in the versioned envelope written to a `.json` file. */
export function buildAutomatonExport(automaton) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    automaton: toStorableAutomaton(automaton),
  };
}

/**
 * Validates a parsed JSON value against the AutoFA export envelope, then
 * against the same structural rules as any other stored automaton. Never
 * throws, never partially applies. Returns:
 *   { ok: true, automaton }
 *   { ok: false, error: 'invalid' }             — not AutoFA / malformed
 *   { ok: false, error: 'unsupported-version' }  — newer than this build supports
 */
export function sanitizeAutomatonImport(raw) {
  if (!isPlainObject(raw)) return { ok: false, error: 'invalid' };
  if (raw.format !== EXPORT_FORMAT) return { ok: false, error: 'invalid' };
  if (!Number.isInteger(raw.version) || raw.version < 1) return { ok: false, error: 'invalid' };
  if (raw.version > EXPORT_VERSION) return { ok: false, error: 'unsupported-version' };

  // Only version 1 exists today, so there's nothing to migrate yet — an
  // older-but-compatible branch belongs here once EXPORT_VERSION advances.
  const automaton = sanitizeAutomaton(raw.automaton);
  if (!automaton) return { ok: false, error: 'invalid' };
  return { ok: true, automaton };
}

/** Strips an automaton name down to safe filename characters. Never empty. */
function sanitizeFilenamePart(name) {
  const cleaned = (name ?? '').trim().replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_');
  return cleaned || 'Automaton';
}

export function buildExportFilename(name) {
  return `AutoFA_${sanitizeFilenamePart(name)}.json`;
}
