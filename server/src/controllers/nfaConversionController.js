import { convertNfaToDfa } from '../engine/optimization/convertNfaToDfa.js';
import { minimizeDfa } from '../engine/optimization/minimizeDfa.js';
import { renameStates } from '../engine/utils/renameStates.js';
import { formatGenerationOutput } from '../engine/formatters/formatGenerationOutput.js';
import { generateTransitionTable } from '../engine/generators/generateTransitionTable.js';
import { generateStateDescriptions } from '../engine/generators/generateStateDescriptions.js';
import { generateExamples } from '../engine/generators/generateExamples.js';
import { findDeadStates } from '../engine/utils/findDeadStates.js';

export function postConvertNfa(req, res, next) {
  try {
    const { automaton, stateNaming = 'alphabet', minimize = false } = req.body ?? {};

    if (!automaton || typeof automaton !== 'object' || !Array.isArray(automaton.states)) {
      const error = new Error('Provide a valid NFA automaton object to convert.');
      error.statusCode = 400;
      error.expose = true;
      throw error;
    }

    const conversionResult = convertNfaToDfa(automaton, { stateNaming });
    let targetDfa = conversionResult.convertedDfa;

    if (minimize) {
      const minimized = minimizeDfa(targetDfa);
      targetDfa = renameStates(minimized, stateNaming);
    }

    const deadStates = findDeadStates(targetDfa);
    const dfaOutput = formatGenerationOutput({
      automaton: targetDfa,
      transitionTable: generateTransitionTable(targetDfa, deadStates),
      stateDescriptions: generateStateDescriptions(targetDfa, deadStates),
      examples: generateExamples(targetDfa),
    });

    res.status(200).json({
      data: {
        convertedDfaOutput: dfaOutput,
        conversionSteps: conversionResult.conversionSteps,
        summary: conversionResult.summary,
      },
    });
  } catch (error) {
    next(error);
  }
}
