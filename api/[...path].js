// Vercel Serverless Function entry point.
//
// This file does NOT reimplement any routing or business logic. It reuses the
// existing Express app (server/src/app.js) exactly as-is: same routes, same
// controllers, same generator/parser/validator/simulation modules.
//
// How it works:
// - The filename `[...path].js` is Vercel's catch-all route syntax, so every
//   request under /api/* (e.g. /api/generate, /api/simulate, /api/health,
//   /api/v1/...) is sent to this single function.
// - An Express app instance (`app()`) already has the signature
//   `(req, res) => void`, which is exactly what a Vercel Node.js function
//   expects. So we can export it directly with no adapter/shim needed.
// - The app is imported once at module load time, not per-request, so the
//   Express app, its routers, and controllers are reused across warm
//   invocations instead of being rebuilt on every request (avoids
//   unnecessary work on cold starts and keeps warm-start latency low).
import { app } from '../server/src/app.js';

export default app;
