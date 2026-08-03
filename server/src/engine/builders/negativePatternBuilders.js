import { buildPrefixAutomaton, buildSuffixAutomaton, buildSubstringAutomaton } from './patternBuilders.js';
function complement(automaton) { return { ...automaton, acceptingStates: automaton.states.filter(state => !automaton.acceptingStates.includes(state)) }; }
export const buildNotPrefixAutomaton = args => complement(buildPrefixAutomaton(args));
export const buildNotSuffixAutomaton = args => complement(buildSuffixAutomaton(args));
export const buildNotSubstringAutomaton = args => complement(buildSubstringAutomaton(args));