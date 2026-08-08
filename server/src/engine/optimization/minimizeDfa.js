import { removeUnreachableStates } from './removeUnreachableStates.js';

/**
 * Minimizes a DFA using Hopcroft's partition refinement algorithm.
 * Merges language-equivalent states and handles dead states cleanly.
 *
 * @param {import('../contracts.js').Automaton} automaton
 * @returns {import('../contracts.js').Automaton}
 */
export function minimizeDfa(automaton) {
  // Step 1: Remove unreachable states first
  const reachableAutomaton = removeUnreachableStates(automaton);
  const { states, alphabet, transitions, startState, acceptingStates } = reachableAutomaton;

  if (states.length <= 1) {
    return {
      ...reachableAutomaton,
      metadata: {
        ...reachableAutomaton.metadata,
        optimizationTrace: {
          initialStateCount: automaton.states.length,
          reachableStateCount: states.length,
          equivalentGroups: states.map(s => [s]),
          minimizedStateCount: states.length,
        },
      },
    };
  }

  const acceptSet = new Set(acceptingStates);
  const F = new Set();
  const NF = new Set();

  for (const s of states) {
    if (acceptSet.has(s)) {
      F.add(s);
    } else {
      NF.add(s);
    }
  }

  // Partition set P
  let P = [];
  if (F.size > 0) P.push(F);
  if (NF.size > 0) P.push(NF);

  // Worklist W
  let W = [];
  if (F.size > 0 && NF.size > 0) {
    W.push(F.size <= NF.size ? new Set(F) : new Set(NF));
  } else if (P.length > 0) {
    W.push(new Set(P[0]));
  }

  // Helper to find inverse transitions: for symbol c, which states transition into set A?
  function getInverseTransitions(A, symbol) {
    const inverse = new Set();
    for (const s of states) {
      const target = transitions[s]?.[symbol];
      if (target !== undefined && A.has(target)) {
        inverse.add(s);
      }
    }
    return inverse;
  }

  while (W.length > 0) {
    const A = W.pop();

    for (const symbol of alphabet) {
      const X = getInverseTransitions(A, symbol);
      if (X.size === 0) continue;

      const newP = [];
      for (const Y of P) {
        const Y1 = new Set(); // Y intersect X
        const Y2 = new Set(); // Y difference X

        for (const s of Y) {
          if (X.has(s)) Y1.add(s);
          else Y2.add(s);
        }

        if (Y1.size > 0 && Y2.size > 0) {
          newP.push(Y1, Y2);

          // Update worklist W
          const wIdx = W.findIndex(wSet => {
            if (wSet.size !== Y.size) return false;
            for (const item of wSet) if (!Y.has(item)) return false;
            return true;
          });

          if (wIdx !== -1) {
            W.splice(wIdx, 1, new Set(Y1), new Set(Y2));
          } else {
            if (Y1.size <= Y2.size) {
              W.push(new Set(Y1));
            } else {
              W.push(new Set(Y2));
            }
          }
        } else {
          newP.push(Y);
        }
      }
      P = newP;
    }
  }

  // Ensure block containing startState is first
  let startBlockIndex = P.findIndex(block => block.has(startState));
  if (startBlockIndex > 0) {
    const startBlock = P.splice(startBlockIndex, 1)[0];
    P.unshift(startBlock);
  }

  // Build merged states and mapping
  const equivalentGroups = P.map(block => Array.from(block).sort());

  // Canonical name for each block (e.g. state names joined by |)
  const blockNames = equivalentGroups.map(group => group.join('|'));
  const stateToBlockName = new Map();

  for (let i = 0; i < P.length; i++) {
    for (const s of P[i]) {
      stateToBlockName.set(s, blockNames[i]);
    }
  }

  const newStartState = stateToBlockName.get(startState);
  const newAcceptingStates = [];
  const newTransitions = {};

  for (let i = 0; i < P.length; i++) {
    const blockName = blockNames[i];
    const representative = equivalentGroups[i][0];

    if (acceptSet.has(representative)) {
      newAcceptingStates.push(blockName);
    }

    newTransitions[blockName] = {};
    for (const symbol of alphabet) {
      const origTarget = transitions[representative]?.[symbol];
      if (origTarget !== undefined) {
        newTransitions[blockName][symbol] = stateToBlockName.get(origTarget);
      }
    }
  }

  return {
    kind: 'dfa',
    states: blockNames,
    alphabet: [...alphabet],
    transitions: newTransitions,
    startState: newStartState,
    acceptingStates: newAcceptingStates,
    metadata: {
      ...automaton.metadata,
      optimizationTrace: {
        initialStateCount: automaton.states.length,
        reachableStateCount: states.length,
        equivalentGroups,
        minimizedStateCount: blockNames.length,
      },
    },
  };
}
