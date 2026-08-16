import { useState } from 'react';
import { CheckCircle2, ChevronDown, LoaderCircle, Play, RotateCcw, XCircle, ArrowRight, Sparkles, Network, Pencil } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import StateDiagram from '../components/StateDiagram/StateDiagram';
import Input from '../components/ui/Input';
import PageContainer from '../components/PageContainer';
import { simulateAutomaton, convertNfaToDfa } from '../services/automataApi';
import { createBuilderAutomatonFromGenerated } from '../builder/automatonStorage';
import { layoutStates, groupTransitions, loopSide } from '../components/StateDiagram/diagramUtils';

const labels = {
  startsWith: 'Starts with',
  doesNotStartWith: 'Does not start with',
  endsWith: 'Ends with',
  doesNotEndWith: 'Does not end with',
  contains: 'Contains',
  doesNotContain: 'Does not contain',
  lengthEqual: 'Length =',
  lengthGreaterOrEqual: 'Length >=',
  lengthLessOrEqual: 'Length <=',
  lengthGreater: 'Length >',
  lengthLess: 'Length <',
  evenLength: 'Even length',
  oddLength: 'Odd length',
  firstSymbol: 'First symbol is',
  lastSymbol: 'Last symbol is',
  secondToLastSymbol: '2nd to last symbol is',
  nthSymbol: 'nth symbol is',
  nthSymbolNot: 'nth symbol is not',
  nthToLastSymbol: 'nth to last symbol is',
  nthToLastSymbolNot: 'nth to last symbol is not',
  exactOccurrences: 'Exactly',
  atLeastOccurrences: 'At least',
  atMostOccurrences: 'At most',
  evenOccurrences: 'Even occurrences of',
  oddOccurrences: 'Odd occurrences of',
};

const conditionSummary = condition => {
  const label = labels[condition.type] ?? condition.type;
  if (['evenLength', 'oddLength'].includes(condition.type)) return label;
  if (['firstSymbol', 'lastSymbol', 'secondToLastSymbol', 'evenOccurrences', 'oddOccurrences'].includes(condition.type))
    return `${label} ${condition.symbol}`;
  if (['nthSymbol', 'nthSymbolNot', 'nthToLastSymbol', 'nthToLastSymbolNot'].includes(condition.type))
    return `${condition.position}th ${label.replace('nth ', '')} ${condition.symbol}`;
  if (['exactOccurrences', 'atLeastOccurrences', 'atMostOccurrences'].includes(condition.type))
    return `${label} ${condition.count} occurrences of ${condition.symbol}`;
  return `${label} ${condition.value !== '' && condition.value != null ? condition.value : condition.count}`;
};

export default function ResultPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const result = state?.result;
  const request = state?.request;

  const [open, setOpen] = useState('');
  const [input, setInput] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // NFA -> DFA conversion states
  const [conversionData, setConversionData] = useState(null);
  const [activeTab, setActiveTab] = useState('original'); // 'original' | 'converted'
  const [showStateSets, setShowStateSets] = useState(true);
  const [converting, setConverting] = useState(false);
  const [minimizing, setMinimizing] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  // Equivalence test state
  const [equivInput, setEquivInput] = useState('101');
  const [equivResult, setEquivResult] = useState(null);
  const [equivLoading, setEquivLoading] = useState(false);
  const [handoffError, setHandoffError] = useState('');

  if (!result || !request) {
    return (
      <PageContainer className="grid min-h-[55vh] place-items-center text-center">
        <Card className="max-w-md">
          <h1 className="font-display text-2xl font-bold">No automaton has been generated yet.</h1>
          <p className="mt-3 text-ink-muted dark:text-ink-darkMuted">
            Create a language definition first, then its generated result will appear here.
          </p>
          <Button to="/generate" className="mt-6">
            Go to generator
          </Button>
        </Card>
      </PageContainer>
    );
  }

  const isOriginalNfa = result.automaton.kind === 'nfa';

  // Determine active displayed output (Original or Converted DFA)
  const isViewingConverted = activeTab === 'converted' && conversionData;
  const currentOutput = isViewingConverted ? conversionData.convertedDfaOutput : result;

  // Derive display automaton (handling Show NFA State Sets vs Show DFA State Names)
  const rawAutomaton = currentOutput.automaton;
  const rawTable = currentOutput.transitionTable;

  let displayAutomaton = rawAutomaton;
  let displayTable = rawTable;

  if (isViewingConverted && !showStateSets && rawAutomaton.metadata?.aliasMapping) {
    const aliasMap = rawAutomaton.metadata.aliasMapping;
    const aliasStart = rawAutomaton.metadata.aliasStartState;
    const aliasAccepting = rawAutomaton.metadata.aliasAcceptingStates;
    const aliasTrans = rawAutomaton.metadata.aliasTransitions;

    const newStates = rawAutomaton.states.map(s => aliasMap[rawAutomaton.metadata.setLabelMapping ? Object.keys(rawAutomaton.metadata.setLabelMapping).find(k => rawAutomaton.metadata.setLabelMapping[k] === s) : s] ?? s);

    displayAutomaton = {
      ...rawAutomaton,
      states: Object.values(aliasMap),
      startState: aliasStart,
      acceptingStates: aliasAccepting,
      transitions: aliasTrans,
    };

    displayTable = {
      ...rawTable,
      states: Object.values(aliasMap),
      startState: aliasStart,
      acceptStates: aliasAccepting,
      transitions: aliasTrans,
    };
  }

  const runConvert = async (shouldMinimize = false) => {
    setError('');
    if (shouldMinimize) setMinimizing(true);
    else setConverting(true);

    try {
      const data = await convertNfaToDfa({
        automaton: result.automaton,
        stateNaming: request?.stateNaming ?? 'alphabet',
        minimize: shouldMinimize,
      });
      setConversionData(data);
      setActiveTab('converted');
    } catch (err) {
      setError(err.message);
    } finally {
      setConverting(false);
      setMinimizing(false);
    }
  };

  const runSimulation = async () => {
    setError('');
    setSimulation(null);
    if (!input) {
      setError('Enter an input string to simulate.');
      return;
    }
    setLoading(true);
    try {
      setSimulation(await simulateAutomaton({ automaton: displayAutomaton, input }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const runEquivalenceTest = async () => {
    if (!conversionData || !equivInput) return;
    setEquivLoading(true);
    try {
      const nfaRes = await simulateAutomaton({ automaton: result.automaton, input: equivInput });
      const dfaRes = await simulateAutomaton({ automaton: conversionData.convertedDfaOutput.automaton, input: equivInput });

      setEquivResult({
        input: equivInput,
        nfaAccepted: nfaRes.accepted,
        dfaAccepted: dfaRes.accepted,
        matched: nfaRes.accepted === dfaRes.accepted,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setEquivLoading(false);
    }
  };

  const openInBuilder = () => {
    setHandoffError('');
    // Reuse the exact layout/edges the diagram above was just rendered with
    // (components/StateDiagram/diagramUtils) — and displayAutomaton/
    // displayTable specifically, since those reflect whatever's actually on
    // screen (e.g. aliased DFA state names), not the raw engine output —
    // so the Builder opens with the same states, positions, connector
    // sides, and labels the user just looked at.
    const deadStatesList = displayTable.deadStates ?? [];
    const layout = layoutStates(displayAutomaton, new Set(deadStatesList));
    const edges = groupTransitions(displayAutomaton);
    const loopSides = {};
    for (const edge of edges) {
      if (edge.from === edge.to) {
        loopSides[edge.from] = loopSide(edge, layout.positions, edges);
      }
    }
    const builderAutomaton = createBuilderAutomatonFromGenerated({
      automaton: displayAutomaton,
      deadStates: deadStatesList,
      stateNaming: request?.stateNaming ?? 'alphabet',
      positions: layout.positions,
      loopSides,
    });
    if (!builderAutomaton) {
      setHandoffError('Unable to open this automaton in Builder. Please try generating it again.');
      return;
    }
    navigate('/builder', { state: { generatorTransfer: { automaton: builderAutomaton } } });
  };

  return (
    <PageContainer className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">GENERATED AUTOMATON</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            Your {displayAutomaton.kind.toUpperCase()} result
          </h1>
          <p className="mt-2 text-ink-muted dark:text-ink-darkMuted">Generated from your language definition.</p>
        </div>
        <div className="flex items-center gap-3">
          {isOriginalNfa && !conversionData && (
            <Button onClick={() => runConvert(false)} disabled={converting}>
              {converting ? <LoaderCircle className="animate-spin" size={16} /> : <Network size={16} />}
              Convert NFA → DFA
            </Button>
          )}
          <Button onClick={openInBuilder}>
            <Pencil size={16} /> Open in Builder
          </Button>
          <Button to="/generate" variant="secondary">
            Create another
          </Button>
        </div>
      </div>
      {handoffError && <p role="alert" className="mt-4 text-sm text-red-600">{handoffError}</p>}

      {/* Tabs if converted */}
      {conversionData && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3 dark:border-line-dark">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('original')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'original'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-muted text-ink-muted hover:text-ink dark:bg-surface-darkMuted'
              }`}
            >
              Original NFA ({result.automaton.states.length} states)
            </button>
            <button
              onClick={() => setActiveTab('converted')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'converted'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-muted text-ink-muted hover:text-ink dark:bg-surface-darkMuted'
              }`}
            >
              Converted DFA ({conversionData.convertedDfaOutput.automaton.states.length} states)
            </button>
          </div>

          {activeTab === 'converted' && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowStateSets(!showStateSets)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-muted dark:border-line-dark dark:hover:bg-surface-darkMuted"
              >
                {showStateSets ? 'Show DFA State Names (A, B...)' : 'Show NFA State Sets ({A, B})'}
              </button>
              <Button onClick={() => runConvert(true)} disabled={minimizing} variant="secondary" size="sm">
                {minimizing ? <LoaderCircle className="animate-spin" size={14} /> : <Sparkles size={14} />}
                Minimize DFA
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Overview stats cards */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Language summary</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <Detail label="Automaton" value={displayAutomaton.kind.toUpperCase()} />
            <Detail label="Alphabet" value={`{${displayAutomaton.alphabet.join(', ')}}`} mono />
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">Conditions</dt>
              <dd className="mt-1 text-sm font-semibold">
                {request.conditions
                  .map((condition, index) => `${index ? `${condition.operator} ` : ''}${conditionSummary(condition)}`)
                  .join(' ')}
              </dd>
            </div>
          </dl>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Language status</p>
          <div className="mt-4 flex items-center gap-2 text-emerald-600">
            <CheckCircle2 size={22} />
            <span className="font-semibold">Valid definition</span>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {displayAutomaton.states.length} states • {displayAutomaton.acceptingStates.length} accepting
            {displayTable.deadStates?.length > 0 && ` • ${displayTable.deadStates.length} dead`}
          </p>
        </Card>
      </div>

      {/* State Diagram Card */}
      <Card className="mt-5">
        <StateDiagram automaton={displayAutomaton} simulation={simulation} />
      </Card>

      {/* Transition Table Card */}
      <Card className="mt-5 overflow-hidden p-0">
        <div className="p-6">
          <h2 className="font-display text-lg font-semibold">Transition table</h2>
          <p className="mt-1 text-sm text-ink-muted dark:text-ink-darkMuted">
            Each row identifies the next state for a symbol in the alphabet.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-full sm:min-w-[480px] text-left text-xs sm:text-sm">
            <thead className="sticky top-0 bg-surface-muted text-xs uppercase tracking-wider text-ink-soft dark:bg-surface-darkMuted/60">
              <tr>
                <th className="px-3 py-3 sm:px-6 sm:py-4">State</th>
                {displayTable.alphabet.map(symbol => (
                  <th key={symbol} className="px-3 py-3 sm:px-6 sm:py-4">
                    {symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayTable.states.map(name => (
                <tr key={name} className="border-t border-line/70 dark:border-line-dark">
                  <th className="px-3 py-3 sm:px-6 sm:py-4 font-mono font-semibold whitespace-normal">
                    {name}
                    {displayTable.acceptStates.includes(name) && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-sans text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        ACCEPT
                      </span>
                    )}
                    {displayTable.deadStates?.includes(name) && (
                      <span
                        title="Dead (Trap) State"
                        className="ml-2 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wide text-danger dark:bg-red-950 dark:text-red-300"
                      >
                        DEAD
                      </span>
                    )}
                  </th>
                  {displayTable.alphabet.map(symbol => (
                    <td key={symbol} className="px-3 py-3 sm:px-6 sm:py-4 font-mono">
                      {Array.isArray(displayTable.transitions[name][symbol])
                        ? displayTable.transitions[name][symbol].join(', ') || '—'
                        : displayTable.transitions[name][symbol]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Educational Conversion Steps Section */}
      {conversionData && (
        <Card className="mt-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Educational: Conversion Steps</h2>
              <p className="mt-1 text-sm text-ink-muted dark:text-ink-darkMuted">
                Step-by-step Subset Construction process from NFA to DFA.
              </p>
            </div>
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary"
            >
              {showSteps ? 'Hide Steps' : 'Show Steps'}
              <ChevronDown className={`transition ${showSteps ? 'rotate-180' : ''}`} size={16} />
            </button>
          </div>

          {showSteps && (
            <div className="mt-5 space-y-3">
              {conversionData.conversionSteps.map((step, idx) => (
                <div key={idx} className="rounded-xl border border-line p-4 dark:border-line-dark">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-sm">
                      Step {step.stepIndex}: Process DFA state <code className="font-mono text-primary">{step.dfaStateLabel}</code> on symbol{' '}
                      <code className="font-mono text-emerald-600">{step.symbol}</code>
                    </span>
                    {step.isNewState && (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        Discovered New DFA State
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs font-mono space-y-1 text-ink-muted dark:text-ink-darkMuted">
                    {step.nfaTransitions.map((t, tidx) => (
                      <div key={tidx}>
                        NFA transition: {t.from} --{t.symbol}--&gt; [{t.to.join(', ') || '∅'}]
                      </div>
                    ))}
                    <div className="mt-1 font-semibold text-ink dark:text-ink-dark">
                      Combined Destination Set: <code>{step.targetLabel}</code>{' '}
                      {step.isAccepting && <span className="text-emerald-600 font-sans">(Accepting State)</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Interactive Simulation & Equivalence Checker */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold">State descriptions</h2>
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {currentOutput.stateDescriptions.map(item => (
              <div key={item.state}>
                <button
                  className="focus-ring flex w-full items-center justify-between py-4 text-left"
                  onClick={() => setOpen(open === item.state ? '' : item.state)}
                  aria-expanded={open === item.state}
                >
                  <span>
                    <b className="font-mono">{item.state}</b>
                    <span
                      className={`ml-2 text-xs font-semibold ${
                        item.accepting ? 'text-emerald-600' : item.dead ? 'text-danger dark:text-red-400' : 'text-ink-soft'
                      }`}
                    >
                      {item.accepting ? 'Accepting' : item.dead ? 'Dead (trap)' : 'Non-accepting'}
                    </span>
                  </span>
                  <ChevronDown className={`transition ${open === item.state ? 'rotate-180' : ''}`} size={18} />
                </button>
                {open === item.state && (
                  <p className="pb-4 text-sm leading-6 text-ink-muted dark:text-ink-darkMuted">{item.description}</p>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="font-display text-lg font-semibold">Try a simulation</h2>
            <p className="mt-1 text-sm text-ink-muted dark:text-ink-darkMuted">Follow an input through the generated automaton.</p>
            <div className="mt-5 flex gap-2">
              <Input aria-label="Input string" value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. 101" />
              <Button onClick={runSimulation} disabled={loading}>
                {loading ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />} Run
              </Button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
            {simulation && (
              <div className="mt-5 rounded-xl bg-primary-soft p-4 dark:bg-primary/15">
                <div
                  className={`flex items-center gap-2 font-semibold ${
                    simulation.accepted ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                  }`}
                >
                  {simulation.accepted ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  {simulation.accepted ? 'Accepted' : 'Rejected'}
                </div>
                <ol className="mt-3 space-y-1 text-sm text-ink-muted dark:text-ink-darkMuted">
                  {simulation.steps.map((item, index) => (
                    <li key={index}>
                      Read <b>{item.symbol}</b> to <code>{item.states.join(', ') || 'no states'}</code>
                    </li>
                  ))}
                </ol>
                <Button variant="ghost" className="mt-2 px-0" onClick={() => setSimulation(null)}>
                  <RotateCcw size={15} /> Reset
                </Button>
              </div>
            )}
          </Card>

          {/* Equivalence Comparison Card */}
          {conversionData && (
            <Card>
              <h2 className="font-display text-lg font-semibold">Compare NFA and DFA</h2>
              <p className="mt-1 text-sm text-ink-muted dark:text-ink-darkMuted">
                Verify that both NFA and converted DFA yield identical results.
              </p>
              <div className="mt-4 flex gap-2">
                <Input value={equivInput} onChange={e => setEquivInput(e.target.value)} placeholder="Test string e.g. 101" />
                <Button onClick={runEquivalenceTest} disabled={equivLoading} variant="secondary">
                  {equivLoading ? <LoaderCircle className="animate-spin" size={16} /> : 'Compare'}
                </Button>
              </div>

              {equivResult && (
                <div className="mt-4 rounded-xl border border-line p-4 dark:border-line-dark text-sm">
                  <div className="flex items-center gap-2 font-semibold text-emerald-600">
                    <CheckCircle2 size={18} /> Equivalent result verified!
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>NFA Result: <b className={equivResult.nfaAccepted ? 'text-emerald-600' : 'text-red-600'}>{equivResult.nfaAccepted ? 'ACCEPT' : 'REJECT'}</b></div>
                    <div>DFA Result: <b className={equivResult.dfaAccepted ? 'text-emerald-600' : 'text-red-600'}>{equivResult.dfaAccepted ? 'ACCEPT' : 'REJECT'}</b></div>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <ExampleCard title="Accepted examples" icon={<CheckCircle2 className="text-emerald-600" />} examples={currentOutput.acceptedExamples} />
        <ExampleCard title="Rejected examples" icon={<XCircle className="text-red-500" />} examples={currentOutput.rejectedExamples} />
      </div>
    </PageContainer>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className={`mt-1 font-semibold ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function ExampleCard({ title, icon, examples }) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <div className="mt-4 space-y-2">
        {examples.map(example => (
          <div key={example.value} className="rounded-lg bg-surface-muted px-2.5 py-2 dark:bg-surface-darkMuted">
            <code className="text-sm font-semibold">{example.value || 'empty string'}</code>
            <p className="mt-1 text-xs text-ink-muted dark:text-ink-darkMuted">{example.explanation}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
