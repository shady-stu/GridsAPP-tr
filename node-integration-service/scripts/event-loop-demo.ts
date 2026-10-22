/**
 * Event-loop demonstration.
 *
 * Node.js runs all request handlers on ONE thread. Any synchronous CPU-heavy
 * work blocks every other request, timer, and socket event for its duration.
 *
 * This script assumes the service runs with ENABLE_DEMO_BLOCK=true, then:
 *  1. fires GET /api/v1/demo/sync-block?ms=1500 (dispatch, not awaited),
 *  2. measures GET /health latency WHILE the block request is running.
 *
 * Expected result: /health — a trivial route with no I/O — takes ~1.5s as
 * well, because it must wait for the event loop to unblock. That observable
 * stall is exactly why CPU-bound work must not live in request paths.
 *
 * Run:  node --import tsx scripts/event-loop-demo.ts [baseUrl]
 */
const base = process.argv[2] ?? 'http://127.0.0.1:3000'

async function timeRequest(path: string, init?: RequestInit): Promise<number> {
  const started = performance.now()
  const response = await fetch(new URL(path, base), init)
  await response.arrayBuffer()
  return Math.round(performance.now() - started)
}

console.log(`Proving event loop blocking against ${base}`)
const blockerPromise = timeRequest('/api/v1/demo/sync-block?ms=1500').catch(() => -1)
await new Promise((resolve) => setTimeout(resolve, 100))
const healthLatency = await timeRequest('/health')
const blockerLatency = await blockerPromise

console.log(`GET /api/v1/demo/sync-block?ms=1500 -> ${blockerLatency}ms (as requested)`)
console.log(
  `GET /health while blocked          -> ${healthLatency}ms`,
  healthLatency >= 1400
    ? '(BLOCKED — event loop stall demonstrated)'
    : '(not blocked — demo requires ENABLE_DEMO_BLOCK=true traffic ordering)',
)
