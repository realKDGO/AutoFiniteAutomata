import { removeUnreachableStates } from './removeUnreachableStates.js';
import { minimizeDfa } from './minimizeDfa.js';
import { nfaToDfa } from './nfaToDfa.js';
import { renameStates } from '../utils/renameStates.js';
import { validateAutomaton } from '../validators/validateAutomaton.js';

/**
 * Full optimization pipeline for DFAs and NFAs.
 *
 * For DFA:
 *   Remove unreachable states -> Minimize DFA -> Rename states -> Validate
 *
 * For NFA:
 *   Remove unreachable states -> Rename states -> Validate (preserves nondeterminism)
 *
 * @param {import('../contracts.js').Automaton} automaton
 * @param {Object} [options]
 * @param {'dfa' | 'nfa'} [options.targetKind]
 * @param {'q' | 'alphabet' | 'number'} [options.stateNaming]
 * @returns {import('../contracts.js').Automaton}
 */
export function optimizeAutomaton(automaton, options = {}) {
  const targetKind = options.targetKind ?? automaton.kind ?? 'dfa';
  const stateNaming = options.stateNaming ?? 'q';

  // Check if automaton has array-like (NFA) transitions
  const isNfaStructure = automaton.states.some(s =>
    Object.values(automaton.transitions[s] ?? {}).some(t => Array.isArray(t))
  );

  let current = automaton;

  if (targetKind === 'dfa') {
    // If target is DFA but structure is NFA, perform subset construction
    if (isNfaStructure) {
      current = nfaToDfa(current);
    }
    // Remove unreachable states and minimize DFA
    const reachable = removeUnreachableStates(current);
    const minimized = minimizeDfa(reachable);
    const renamed = renameStates(minimized, stateNaming);

    const validation = validateAutomaton(renamed, 'dfa');
    if (!validation.valid) {
      throw new Error(`Automaton optimization produced invalid DFA: ${validation.issues.join(', ')}`);
    }

    return renamed;
  } else {
    // NFA pipeline: DO NOT apply DFA minimization rules
    const reachable = removeUnreachableStates(current);
    const renamed = renameStates(reachable, stateNaming);

    const validation = validateAutomaton(renamed, 'nfa');
    if (!validation.valid) {
      throw new Error(`Automaton optimization produced invalid NFA: ${validation.issues.join(', ')}`);
    }

    return renamed;
  }
}
