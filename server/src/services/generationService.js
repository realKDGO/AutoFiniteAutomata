import { formatGenerationOutput } from '../engine/formatters/formatGenerationOutput.js';
import { generateAutomaton } from '../engine/generators/generateAutomaton.js';
import { generateExamples } from '../engine/generators/generateExamples.js';
import { generateStateDescriptions } from '../engine/generators/generateStateDescriptions.js';
import { generateTransitionTable } from '../engine/generators/generateTransitionTable.js';
import { findDeadStates } from '../engine/utils/findDeadStates.js';
import { parseRules } from '../engine/parsers/parseRules.js';
import { simulateInput } from '../engine/simulation/simulateInput.js';
import { validateGenerationInput } from '../engine/validation/validateGenerationInput.js';
import { optimizeAutomaton } from '../engine/optimization/optimizeAutomaton.js';

export function createGeneration(input) {
  const validation = validateGenerationInput(input);
  if (!validation.valid) {
    const error = new Error(validation.issues.join(' '));
    error.statusCode = 400;
    error.code = 'INVALID_GENERATION_INPUT';
    error.expose = true;
    throw error;
  }

  const { value } = validation;
  const rules = parseRules(value.conditions);
  const generated = generateAutomaton({ kind: value.kind, alphabet: value.alphabet, rules });

  const automaton = optimizeAutomaton(generated, {
    targetKind: value.kind,
    stateNaming: value.stateNaming,
  });

  const deadStates = findDeadStates(automaton);

  return formatGenerationOutput({
    automaton,
    transitionTable: generateTransitionTable(automaton, deadStates),
    stateDescriptions: generateStateDescriptions(automaton, deadStates),
    examples: generateExamples(automaton),
  });
}

export function createSimulation({ automaton, input, generation } = {}) {
  const source = automaton ?? (generation ? createGeneration(generation).automaton : null);
  if (!source || typeof input !== 'string') {
    const error = new Error('Provide an automaton (or generation input) and an input string.');
    error.statusCode = 400;
    error.expose = true;
    throw error;
  }
  return simulateInput({ ...source, acceptingStates: source.acceptingStates ?? source.acceptStates ?? [] }, input);
}