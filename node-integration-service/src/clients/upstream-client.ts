import type { Logger } from 'pino'
import { z } from 'zod'
import {
  UpstreamBadResponseError,
  UpstreamHttpError,
  UpstreamNetworkError,
  UpstreamTimeoutError,
  UpstreamError,
} from '../errors/app-errors.js'
import type { NormalizedQuote } from '../types/domain.js'

/**
 * Outbound integration client built on the global `fetch`.
 *
 * Runtime decisions:
 * - Each call owns one AbortController. The configured timeout triggers
 *   `controller.abort()` via setTimeout, and the timer is ALWAYS cleared in a
 *   `finally` block, so slow callers cannot leak timers.
 * - An optional external AbortSignal (usually bound to the current HTTP
 *   request) is relayed onto the same controller, so a disconnecting client
 *   cancels the upstream request too.
 * - Response payloads are validated with Zod before use and reduced to a
 *   normalized shape; unknown/sensitive upstream fields never reach callers,
 *   and upstream error bodies are never forwarded or stored.
 */

const DEFAULT_USER_AGENT = 'node-integration-service/1.0'

const UpstreamQuoteSchema = z.object({
  id: z.number().int(),
  quote: z.string().min(1),
  author: z.string().min(1),
})

export interface QuoteProvider {
  getRandomQuote(externalSignal?: AbortSignal): Promise<NormalizedQuote>
}

export interface UpstreamClientOptions {
  /** Origin of the upstream API (validated by config before use). */
  readonly baseUrl: string
  /** Hard request timeout in milliseconds. */
  readonly timeoutMs: number
  readonly fetchImpl?: typeof fetch
  /** Optional structured logger; anything with pino's `debug` works. */
  readonly logger?: Pick<Logger, 'debug'>
}

export class UpstreamClient implements QuoteProvider {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly logger?: Pick<Logger, 'debug'>

  constructor(options: UpstreamClientOptions) {
    if (!/^https?:\/\//i.test(options.baseUrl)) {
      throw new Error('UpstreamClient requires an absolute http(s) baseUrl')
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.logger = options.logger
  }

  async getRandomQuote(externalSignal?: AbortSignal): Promise<NormalizedQuote> {
    const url = `${this.baseUrl}/quotes/random`
    const controller = new AbortController()
    // One controller for BOTH the timeout and caller-initiated cancellation.
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const relayCallerAbort = (): void => controller.abort()
    externalSignal?.addEventListener('abort', relayCallerAbort, { once: true })

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': DEFAULT_USER_AGENT },
      })

      // Drain-to-discard helps connection pooling; the body is read once and
      // either parsed or dropped — it is never attached to an error response.
      const rawBody = await response.text().catch(() => '')
      if (!response.ok) {
        this.logger?.debug({ upstreamStatus: response.status }, 'Upstream API returned non-2xx')
        throw new UpstreamHttpError(response.status)
      }

      let payload: unknown
      try {
        payload = JSON.parse(rawBody) as unknown
      } catch (cause) {
        throw new UpstreamBadResponseError({ cause })
      }

      const parsed = UpstreamQuoteSchema.safeParse(payload)
      if (!parsed.success) {
        this.logger?.debug(
          { issues: parsed.error.issues.length },
          'Upstream payload failed schema validation',
        )
        throw new UpstreamBadResponseError()
      }

      return { quote: parsed.data.quote, author: parsed.data.author }
    } catch (error: unknown) {
      throw remapFetchError(error, controller, this.timeoutMs)
    } finally {
      // Timer cleanup is unconditional: success, failure, aborts.
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', relayCallerAbort)
    }
  }
}

/**
 * Maps raw fetch/JSON errors onto the typed upstream error hierarchy.
 * Our own errors are re-thrown untouched.
 */
function remapFetchError(error: unknown, controller: AbortController, timeoutMs: number): Error {
  if (error instanceof UpstreamTimeoutError) return error
  if (error instanceof UpstreamError) return error

  // Node's fetch rejects with DOMException-like AbortError when the signal
  // fired. Whether the abort came from OUR timeout or from a cancelled caller
  // is reported identically as UPSTREAM_TIMEOUT — see README for that tradeoff.
  const aborted = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
  if (aborted) return new UpstreamTimeoutError(timeoutMs, { cause: error })

  // undici reports socket/DNS failures as TypeError('fetch failed', {cause}).
  if (error instanceof TypeError) return new UpstreamNetworkError({ cause: error })

  // Malformed/truncated JSON bodies land here as SyntaxError.
  if (error instanceof SyntaxError) return new UpstreamBadResponseError({ cause: error })

  return error instanceof Error ? error : new Error(String(error))
}
