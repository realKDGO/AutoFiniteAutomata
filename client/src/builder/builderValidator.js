/**
 * Validates an automaton state structure for DFA and NFA.
 * 
 * DFA Rules:
 * - Exactly 1 initial state.
 * - At least 1 state.
 * - Non-empty alphabet with unique symbols.
 * - Every transition must use symbols present in the alphabet.
 * - Deterministic: No state can have multiple outgoing transitions for the same symbol.
 * - Completeness check: Checks whether every state has exactly 1 transition for every alphabet symbol.
 * 
 * NFA Rules:
 * - Exactly 1 initial state.
 * - At least 1 state.
 * - Non-empty alphabet.
 * - Multiple destinations for the same symbol are allowed.
 */
export function validateAutomaton(automaton) {
  const errors = [];
  const warnings = [];

  const { type, alphabet, states, transitions } = automaton;

  // 1. Alphabet check
  if (!alphabet || alphabet.length === 0) {
    errors.push('Alphabet cannot be empty.');
  }

  // 2. States check
  if (!states || states.length === 0) {
    errors.push('Automaton must have at least one state.');
    return { valid: false, errors, warnings, isComplete: false };
  }

  // 3. Initial state check
  const initialStates = states.filter(s => s.initial);
  if (initialStates.length === 0) {
    errors.push('Automaton must have an initial state.');
  } else if (initialStates.length > 1) {
    errors.push('Automaton cannot have more than one initial state in V1.');
  }

  const stateIds = new Set(states.map(s => s.id));
  const stateNames = new Map(states.map(s => [s.id, s.name]));

  // 4. Validate transitions references and deterministic choices
  const dfaTransitionMap = new Map(); // key: `fromId\0symbol` -> targetStateId
  const connectorUsage = new Map();

  for (const t of transitions) {
    if (!stateIds.has(t.from) || !stateIds.has(t.to)) {
      errors.push('Found transition referencing non-existent states.');
      continue;
    }

    const sourceConnector = t.sourceConnectorId ?? 2;
    const targetConnector = t.targetConnectorId ?? 6;
    if (![sourceConnector, targetConnector].every(id => Number.isInteger(id) && id >= 0 && id < 8)) {
      errors.push('Found transition with an invalid connector.');
      continue;
    }
    if (t.from === t.to && sourceConnector === targetConnector) {
      errors.push('A loop transition must use two different connectors.');
      continue;
    }
    for (const key of [`${t.from}\0${sourceConnector}`, `${t.to}\0${targetConnector}`]) {
      connectorUsage.set(key, (connectorUsage.get(key) ?? 0) + 1);
      if (connectorUsage.get(key) > 2) errors.push('A connector cannot have more than two transition endpoints.');
    }

    for (const sym of t.symbols) {
      if (!alphabet.includes(sym) && sym !== 'ε') {
        errors.push(`Transition uses symbol '${sym}' which is not in the defined alphabet.`);
      }

      if (type === 'DFA') {
        const key = `${t.from}\0${sym}`;
        if (dfaTransitionMap.has(key)) {
          const fromName = stateNames.get(t.from);
          const existingToName = stateNames.get(dfaTransitionMap.get(key));
          const newToName = stateNames.get(t.to);
          errors.push(
            `Invalid DFA: State ${fromName} has multiple destinations (${existingToName}, ${newToName}) for symbol '${sym}'.`
          );
        } else {
          dfaTransitionMap.set(key, t.to);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, isComplete: false };
  }

  // 5. Completeness check (mainly relevant for DFA)
  let missingTransitionsCount = 0;
  if (type === 'DFA') {
    for (const s of states) {
      for (const sym of alphabet) {
        const key = `${s.id}\0${sym}`;
        if (!dfaTransitionMap.has(key)) {
          missingTransitionsCount++;
        }
      }
    }

    if (missingTransitionsCount > 0) {
      warnings.push(
        `Valid DFA structure, but ${missingTransitionsCount} transition${
          missingTransitionsCount > 1 ? 's are' : ' is'
        } missing for full completeness.`
      );
    }
  }

  return {
    valid: true,
    errors: [],
    warnings,
    isComplete: missingTransitionsCount === 0,
  };
}
