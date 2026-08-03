# AutoFA generator engine

## Pipeline

`validateGenerationInput` normalizes API data (`automataType`/`kind`) and rejects malformed alphabets, invalid conditions, operators, and pattern symbols outside the alphabet. `parseRules` converts conditions to a small rule AST without constructing transitions. `generateAutomaton` dispatches each rule to a builder, combines the resulting DFAs, validates the result, and then formats educational output.

## Rule builders

- **Prefix** tracks how much of the required beginning has been read. A mismatch moves to a looping dead state; the full prefix state loops, because later characters cannot invalidate a correct start.
- **Suffix** uses a prefix/suffix fallback calculation (the same idea as KMP matching). Its accepting state is only accepting at end of input, so subsequent input may move away from it.
- **Substring** uses the same fallback calculation but makes the full-match state absorbing: once the substring has appeared, it remains true.

Every builder produces a complete DFA with a transition for every state and alphabet symbol.

## Composition and NFA support

`combineAutomata` uses a reachable Cartesian-product construction. `AND` accepts a pair when both component states accept; `OR` accepts when either does. The NFA representation is created by converting each deterministic transition to a one-item target array. This is a valid NFA and keeps composition correct while leaving space for future epsilon/non-deterministic builders.

## API

- `POST /api/generate` or `/api/v1/generate`: accepts a generation input and returns the automaton, table, descriptions, and examples.
- `POST /api/simulate` or `/api/v1/simulate`: accepts `{ automaton, input }`, or `{ generation, input }`, and returns every traversal step.
- `GET /api/health` or `/api/v1/health`: health check.

Run `npm run test -w server` to run independent parser, builder, combiner, table, and simulation tests.
## State naming

Generation accepts `stateNaming` as `q`, `alphabet`, or `number`. `renameStates` runs after construction and before formatting, so state labels remain consistent in the automaton, transition table, examples, descriptions, and simulation responses.

## Expanded conditions

New builders are isolated by category under `server/src/engine/builders/`:

- `negativePatternBuilders.js` complements the existing complete prefix, suffix, and substring DFAs for the three negative pattern conditions.
- `lengthBuilders.js` tracks a bounded input length, an overflow state where needed, or two parity states.
- `positionBuilders.js` tracks symbols until the requested position; `lastSymbol` tracks the most recently read symbol.
- `countingBuilders.js` tracks occurrences of one alphabet symbol using capped counts or parity states.

All builders return the same complete automaton contract, so they compose through the existing AND/OR product construction and run unchanged through state renaming, examples, formatting, and simulation.
