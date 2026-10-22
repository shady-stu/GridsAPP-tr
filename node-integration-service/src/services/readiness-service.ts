/**
 * Health & readiness logic.
 *
 * - `measureLoopLag()` observes how far behind the event loop's immediate
 *   queue is, giving a lightweight liveness signal for the process.
 * - `UpstreamProbe` performs a HEAD request against the upstream origin with a
 *   short timeout and caches the result. It is deliberately cheap and bounded:
 *   no unbounded waits, no retries, and any HTTP status counts as "reachable"
 *   (we are probing connectivity, not upstream endpoint health).
 *
 * The service has no hard dependency (no database); upstream availability is
 * therefore reported as an advisory check. When `strict` is configured, a
 * degraded upstream promotes readiness to 'failing' with HTTP 503 — useful
 * for deployments where the integration is required.
 */

export interface ReadinessCheck {
  readonly name: string
  readonly status: 'ok' | 'degraded' | 'failing' | 'skipped'
  readonly latencyMs?: number
  readonly detail?: string
}

export interface ReadinessReport {
  readonly status: 'ok' | 'degraded'
  readonly checks: readonly ReadinessCheck[]
}

const LOOP_LAG_DEGRADED_THRESHOLD_MS = 100

/** Measures event-loop scheduling latency across a single tick. */
export function measureLoopLag(): Promise<number> {
  const start = performance.now()
  return new Promise((resolve) => {
    setImmediate(() => resolve(Math.round(performance.now() - start)))
  })
}

export interface UpstreamProbeOptions {
  readonly baseUrl: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  readonly ttlMs?: number
}

/**
 * Bounded upstream reachability probe:
 * - HEAD request with a fixed timeout (default 1.5s).
 * - Result cached for a TTL (default 10s) so readiness checks cannot hammer
 *   the upstream; probe failures are cached with the same TTL.
 * - Any HTTP status counts as reachable (we check connectivity, not semantics).
 */
export class UpstreamProbe {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly ttlMs: number
  private cached?: { checkedAt: number; reachable: boolean; latencyMs: number }

  constructor(options: UpstreamProbeOptions) {
    this.baseUrl = options.baseUrl
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? 1500
    this.ttlMs = options.ttlMs ?? 10_000
  }

  async probe(): Promise<{ reachable: boolean; latencyMs: number }> {
    if (this.cached && Date.now() - this.cached.checkedAt < this.ttlMs) {
      return { reachable: this.cached.reachable, latencyMs: this.cached.latencyMs }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const started = performance.now()
    try {
      const response = await this.fetchImpl(this.baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'user-agent': 'node-integration-service/1.0 (readiness probe)' },
      })
      // Drain-and-discard helps connection reuse; HEAD carries no body anyway.
      await response.arrayBuffer().catch(() => undefined)
      const latencyMs = Math.round(performance.now() - started)
      this.cached = { checkedAt: Date.now(), reachable: true, latencyMs }
      return { reachable: true, latencyMs }
    } catch {
      const latencyMs = Math.round(performance.now() - started)
      this.cached = { checkedAt: Date.now(), reachable: false, latencyMs }
      return { reachable: false, latencyMs }
    } finally {
      clearTimeout(timer)
    }
  }
}

export interface ReadinessServiceOptions {
  readonly probeUpstream: boolean
  readonly strict: boolean
  readonly upstreamBaseUrl: string
  /** Inject a pre-configured probe (tests); default created when probing. */
  readonly probe?: UpstreamProbe
}

export class ReadinessService {
  private readonly probeUpstream: boolean
  private readonly strict: boolean
  private readonly probe?: UpstreamProbe

  constructor(options: ReadinessServiceOptions) {
    this.probeUpstream = options.probeUpstream
    this.strict = options.strict
    this.probe =
      options.probe ??
      (options.probeUpstream ? new UpstreamProbe({ baseUrl: options.upstreamBaseUrl }) : undefined)
  }

  async check(): Promise<ReadinessReport> {
    const loopLagMs = await measureLoopLag()
    const checks: ReadinessCheck[] = [
      {
        name: 'event-loop',
        status: loopLagMs > LOOP_LAG_DEGRADED_THRESHOLD_MS ? 'degraded' : 'ok',
        latencyMs: loopLagMs,
        detail: `Event loop scheduling latency measured ${loopLagMs}ms (degraded above ${LOOP_LAG_DEGRADED_THRESHOLD_MS}ms)`,
      },
      {
        name: 'in-memory-store',
        status: 'ok',
        detail: 'The store is a plain in-process Map — reachable by definition.',
      },
    ]

    if (this.probeUpstream && this.probe) {
      const { reachable, latencyMs } = await this.probe.probe()
      const upstreamStatus: 'ok' | 'degraded' | 'failing' = reachable
        ? 'ok'
        : this.strict
          ? 'failing'
          : 'degraded'
      checks.push({
        name: 'upstream',
        status: upstreamStatus,
        latencyMs,
        detail: reachable
          ? 'Upstream origin answered the HEAD probe (any status counts as reachable).'
          : 'Upstream origin is unreachable (network error or probe timeout).',
      })
    } else {
      checks.push({
        name: 'upstream',
        status: 'skipped',
        detail: 'Upstream probe disabled via READINESS_UPSTREAM_PROBE or no base URL configured.',
      })
    }

    const anyFailure = checks.some((check) => check.status === 'failing')
    const anyDegradation = checks.some((check) => check.status === 'degraded')
    return { status: anyFailure || anyDegradation ? 'degraded' : 'ok', checks }
  }
}
