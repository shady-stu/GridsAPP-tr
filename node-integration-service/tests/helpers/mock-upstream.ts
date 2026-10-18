import http, { type IncomingMessage, type ServerResponse } from 'node:http'

/**
 * Minimal local HTTP mock used as a stand-in "upstream API" for deterministic
 * tests: success paths, status codes, delays (timeouts), etc.
 */
export interface MockUpstream {
  readonly url: string
  readonly close: () => Promise<void>
}

export async function startMockUpstream(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<MockUpstream> {
  const server = http.createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('mock upstream did not bind a TCP port')
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve) => {
        // Connections from fetch may still be lingering; force-close them.
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

/** Starts a server and immediately closes it, returning the now-idle URL. */
export async function startAndClosePort(
  handler: (req: IncomingMessage, res: ServerResponse) => void = () => {},
): Promise<string> {
  const mock = await startMockUpstream(handler)
  await mock.close()
  return mock.url
}
