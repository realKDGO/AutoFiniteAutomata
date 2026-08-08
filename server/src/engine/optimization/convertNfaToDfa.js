import { epsilonClosure } from './nfaToDfa.js';
import { validateAutomaton } from '../validators/validateAutomaton.js';

/**
 * Converts an NFA to a DFA using Subset Construction (Powerset Construction)
 * while capturing step-by-step educational explanations.
 *
 * @param {import('../contracts.js').Automaton} automaton
 * @param {Object} [options]
 * @param {'q' | 'alphabet' | 'number'} [options.stateNaming]
 * @returns {{ convertedDfa: import('../contracts.js').Automaton, conversionSteps: Array<Object>, summary: Object }}
 */
export function convertNfaToDfa(automaton, options = {}) {
  const { states: nfaStates, alphabet, acceptingStates, startState } = automaton;
  const acceptSet = new Set(acceptingStates);

  const subsetKey = subset => JSON.stringify([...subset].sort());
  const formatSetLabel = subset => {
    if (!subset || subset.length === 0) return '∅';
    return `{${[...subset].sort().join(',')}}`;
  };

  const initialClosure = epsilonClosure(automaton, [startState]);
  const startKey = subsetKey(initialClosure);

  const seenSubsets = new Map();
  seenSubsets.set(startKey, initialClosure);

  const queue = [startKey];
  const dfaTransitions = {};
  const conversionSteps = [];
  let stepIndex = 1;

  while (queue.length > 0) {
    const currKey = queue.shift();
    const currSubset = seenSubsets.get(currKey);
    const currLabel = formatSetLabel(currSubset);

    dfaTransitions[currKey] = {};

    for (const symbol of alphabet) {
      const nfaTransDetails = [];
      const nextNfaStates = new Set();

      for (const nfaState of currSubset) {
        const targets = automaton.transitions[nfaState]?.[symbol] ?? [];
        const targetArray = Array.isArray(targets) ? targets : (targets !== undefined ? [targets] : []);
        const validTargets = targetArray.filter(Boolean);

        nfaTransDetails.push({
          from: nfaState,
          symbol,
          to: validTargets,
        });

        for (const t of validTargets) {
          nextNfaStates.add(t);
        }
      }

      const closedNext = epsilonClosure(automaton, Array.from(nextNfaStates));
      const nextKey = subsetKey(closedNext);
      const nextLabel = formatSetLabel(closedNext);

      const isNew = !seenSubsets.has(nextKey);
      if (isNew) {
        seenSubsets.set(nextKey, closedNext);
        queue.push(nextKey);
      }

      dfaTransitions[currKey][symbol] = nextKey;

      const isAccepting = closedNext.some(s => acceptSet.has(s));

      conversionSteps.push({
        stepIndex: stepIndex++,
        dfaStateKey: currKey,
        dfaStateLabel: currLabel,
        nfaSubset: currSubset,
        symbol,
        nfaTransitions: nfaTransDetails,
        targetSubset: closedNext,
        targetLabel: nextLabel,
        isNewState: isNew,
        isAccepting,
      });
    }
  }

  const dfaKeys = Array.from(seenSubsets.keys());

  // Map dfaKeys to set labels and alias names (A, B, C...)
  function alphabetName(index) {
    let name = '';
    let value = index;
    do {
      name = String.fromCharCode(65 + (value % 26)) + name;
      value = Math.floor(value / 26) - 1;
    } while (value >= 0);
    return name;
  }

  function aliasNameFor(index, style) {
    if (style === 'alphabet') return alphabetName(index);
    if (style === 'number') return String(index);
    return `q${index}`;
  }

  const namingStyle = options.stateNaming ?? 'alphabet';
  const aliasMapping = {};
  const setLabelMapping = {};

  dfaKeys.forEach((key, index) => {
    const subset = seenSubsets.get(key);
    const label = formatSetLabel(subset);
    const alias = aliasNameFor(index, namingStyle);

    aliasMapping[key] = alias;
    setLabelMapping[key] = label;
  });

  const convertedDfa = {
    kind: 'dfa',
    states: dfaKeys.map(k => setLabelMapping[k]),
    alphabet: [...alphabet],
    transitions: Object.fromEntries(
      dfaKeys.map(k => [
        setLabelMapping[k],
        Object.fromEntries(
          alphabet.map(symbol => [
            symbol,
            setLabelMapping[dfaTransitions[k][symbol]],
          ])
        ),
      ])
    ),
    startState: setLabelMapping[startKey],
    acceptingStates: dfaKeys
      .filter(k => seenSubsets.get(k).some(s => acceptSet.has(s)))
      .map(k => setLabelMapping[k]),
    metadata: {
      ...automaton.metadata,
      convertedFromNfa: true,
      rawSubsetKeys: dfaKeys,
      aliasMapping,
      setLabelMapping,
      aliasTransitions: Object.fromEntries(
        dfaKeys.map(k => [
          aliasMapping[k],
          Object.fromEntries(
            alphabet.map(symbol => [
              symbol,
              aliasMapping[dfaTransitions[k][symbol]],
            ])
          ),
        ])
      ),
      aliasStartState: aliasMapping[startKey],
      aliasAcceptingStates: dfaKeys
        .filter(k => seenSubsets.get(k).some(s => acceptSet.has(s)))
        .map(k => aliasMapping[k]),
    },
  };

  const validation = validateAutomaton(convertedDfa, 'dfa');
  if (!validation.valid) {
    throw new Error(`Subset construction produced invalid DFA: ${validation.issues.join(', ')}`);
  }

  return {
    convertedDfa,
    conversionSteps,
    summary: {
      nfaStateCount: nfaStates.length,
      dfaStateCount: dfaKeys.length,
      startStateSet: formatSetLabel(initialClosure),
      acceptingSetsCount: convertedDfa.acceptingStates.length,
    },
  };
}
