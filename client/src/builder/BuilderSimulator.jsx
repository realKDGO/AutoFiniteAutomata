import { useState } from 'react';
import { Play, SkipForward, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function BuilderSimulator({ automaton, toSimulatorAutomaton }) {
  const [inputStr, setInputStr] = useState('');
  const [stepIndex, setStepIndex] = useState(-1);
  const [simulationState, setSimulationState] = useState(null);
  const [error, setError] = useState('');

  const simModel = toSimulatorAutomaton();

  const handleRun = () => {
    setError('');
    const initial = automaton.states.find(s => s.initial);

    if (!initial) {
      setError('Cannot simulate: No initial state designated.');
      setSimulationState(null);
      setStepIndex(-1);
      return;
    }

    // Validate symbols
    for (const char of inputStr) {
      if (!automaton.alphabet.includes(char)) {
        setError(`Invalid input: symbol '${char}' is not in the alphabet {${automaton.alphabet.join(', ')}}.`);
        setSimulationState(null);
        setStepIndex(-1);
        return;
      }
    }

    // Perform full simulation computation locally
    const steps = [];
    let currentSet = new Set([initial.name]);
    steps.push({ step: 0, symbol: 'ε (start)', states: [...currentSet] });

    let isBlocked = false;

    for (let i = 0; i < inputStr.length; i++) {
      const sym = inputStr[i];
      const nextSet = new Set();

      for (const st of currentSet) {
        const target = simModel.transitions[st]?.[sym];
        if (target) {
          if (Array.isArray(target)) {
            target.forEach(t => nextSet.add(t));
          } else {
            nextSet.add(target);
          }
        }
      }

      if (nextSet.size === 0) {
        isBlocked = true;
      }

      currentSet = nextSet;
      steps.push({ step: i + 1, symbol: sym, states: [...currentSet] });
    }

    const acceptingSet = new Set(simModel.acceptingStates);
    const accepted = [...currentSet].some(st => acceptingSet.has(st));

    const simResult = {
      steps,
      finalStates: [...currentSet],
      accepted,
      isBlocked,
    };

    setSimulationState(simResult);
    setStepIndex(steps.length - 1);
  };

  const handleStep = () => {
    if (!simulationState) {
      handleRun();
      setStepIndex(0);
      return;
    }

    if (stepIndex < simulationState.steps.length - 1) {
      setStepIndex(prev => prev + 1);
    }
  };

  const handleReset = () => {
    setStepIndex(-1);
    setSimulationState(null);
    setError('');
  };

  const currentStepInfo =
    simulationState && stepIndex >= 0 ? simulationState.steps[stepIndex] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Input String"
            value={inputStr}
            onChange={e => {
              setInputStr(e.target.value);
              handleReset();
            }}
            placeholder="e.g. 0101"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={handleRun} size="sm">
            <Play size={16} /> Run
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleStep}
            size="sm"
            disabled={simulationState && stepIndex >= simulationState.steps.length - 1}
          >
            <SkipForward size={16} /> Step
          </Button>
          <Button type="button" variant="ghost" onClick={handleReset} size="sm">
            <RotateCcw size={16} /> Reset
          </Button>
        </div>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {simulationState && currentStepInfo && (
        <div className="rounded-xl border border-line bg-surface-muted p-4 space-y-3 dark:border-line-dark dark:bg-canvas-dark text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 dark:border-line-dark">
            <span className="font-semibold text-ink dark:text-ink-dark">
              Step {stepIndex} / {simulationState.steps.length - 1}
            </span>
            <span className="font-mono text-xs">
              Current Symbol:{' '}
              <b className="text-primary font-bold">{currentStepInfo.symbol}</b>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <span className="text-ink-soft uppercase text-[10px] font-bold block">Current State(s)</span>
              <span className="font-bold text-sm text-ink dark:text-ink-dark">
                {currentStepInfo.states.length > 0
                  ? `{ ${currentStepInfo.states.join(', ')} }`
                  : '∅ (Trap/Dead)'}
              </span>
            </div>
            <div>
              <span className="text-ink-soft uppercase text-[10px] font-bold block">Progress</span>
              <span className="text-ink dark:text-ink-dark">
                {inputStr.slice(0, Math.max(0, stepIndex))}
                <u className="text-primary font-bold">{inputStr[stepIndex - 1] ?? ''}</u>
                {inputStr.slice(stepIndex)}
              </span>
            </div>
          </div>

          {stepIndex === simulationState.steps.length - 1 && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg font-bold text-sm ${
                simulationState.accepted
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
              }`}
            >
              {simulationState.accepted ? (
                <>
                  <CheckCircle2 size={18} /> ACCEPT
                </>
              ) : (
                <>
                  <XCircle size={18} /> REJECT
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
