# AutoFA

AutoFA is an educational web application for generating and explaining finite automata from language conditions. This repository contains the application foundation only; the automata algorithms are intentionally represented by independent, testable pipeline contracts.

## Project layout

| Path | Purpose |
| --- | --- |
| `client/` | React + Vite + Tailwind user interface |
| `client/src/components/` | Reusable UI primitives and domain presentation components |
| `client/src/layouts/` | Shared page shell and navigation |
| `client/src/pages/` | Route-level pages |
| `client/src/features/` | Feature-local UI and state as features grow |
| `client/src/services/` | HTTP clients and external-service adapters |
| `client/src/styles/` | Global styling and Tailwind entry point |
| `server/src/routes/` | Versioned HTTP route definitions |
| `server/src/controllers/` | HTTP request/response orchestration |
| `server/src/services/` | Application use cases |
| `server/src/engine/` | Framework-independent automata pipeline |
| `server/src/engine/parsers/` | Converts validated conditions into internal rules |
| `server/src/engine/generators/` | Future automaton, table, examples, and descriptions generators |
| `server/src/engine/algorithms/` | Future reusable formal-language algorithms |
| `server/src/middleware/` | Logging, errors, and HTTP concerns |
| `server/src/config/` | Environment configuration |

## Setup

Prerequisites: Node.js 20 or newer and npm 10 or newer.

```bash
npm install
Copy-Item server/.env.example server/.env
npm run dev
```

The client runs at `http://localhost:5173`; the API runs at `http://localhost:4000/api/v1`. Check the server with `GET /api/v1/health`.

## Commands

```bash
npm run dev          # start client and server
npm run dev:client   # start the Vite client
npm run dev:server   # start the Express API
npm run build        # production client build
npm run start        # start the production API
```

## Architecture and workflow

The engine has no Express or React imports. A future generation request should flow through `validateGenerationInput` → `parseRules` → `generateAutomaton` → output generators → `formatGenerationOutput`. The controller calls one application service; it must never contain formal-language logic.

For each capability, define the input/output contract and unit tests in `server/src/engine` first, implement the generator, expose it through a service and route, then connect a focused client feature. Keep feature state close to its UI, keep transport code in `services`, and add cross-cutting concerns only through middleware. Supabase, when introduced, should be accessed through an adapter outside the engine so the generator remains usable offline and in tests.
