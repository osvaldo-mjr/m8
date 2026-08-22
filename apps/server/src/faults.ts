/**
 * What the server does when something throws where nothing could catch it.
 *
 * Two places need this and neither may reach for Fastify: `socket-transport.ts`
 * is the only file allowed to know Socket.IO exists (invariant 9) and must stay
 * free of the web framework as well, and `session.ts` is the translator between
 * the transport and the domain. So both report a fault through a callback and
 * `app.ts` — the one place that owns the logger — decides that reporting a fault
 * means writing a line at error level.
 *
 * A callback rather than a logger interface: `SocketIoTransport` already takes
 * `onNegotiation` in exactly this shape, and a second callback beside it costs
 * one type and no indirection, where a logger interface would invite the
 * transport to log conversationally instead of reporting the one event the
 * owner has to act on.
 */

export interface ConnectionFault {
  /** The connection whose work threw. */
  readonly connectionId: string
  /**
   * `handling` — a message from this connection threw while being handled, so
   * the domain may have half-applied it. `sending` — a message could not be
   * delivered to this connection, and the others in the same broadcast still
   * were.
   */
  readonly stage: 'handling' | 'sending'
  /** The `type` of the message being handled, when the raw value carried one. */
  readonly messageType?: string
  readonly error: Error
}

export type FaultReporter = (fault: ConnectionFault) => void

/**
 * Whatever was thrown, as something with a stack.
 *
 * `throw` accepts any value, and a fault report whose whole content is the
 * string `"undefined"` tells the person reading the log nothing about where it
 * came from. Anything that is not already an `Error` is wrapped in one, which
 * captures a stack at the point of wrapping — the catch site, which is the
 * frame that matters here.
 */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * The `type` a raw inbound message claims, or `undefined` for anything that
 * does not carry a string one.
 *
 * Read from the unvalidated value on purpose: a fault report is written
 * precisely when validation or handling did not complete, so the only thing
 * available to name the message is what the wire actually carried.
 */
export function messageTypeOf(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const type = (raw as { type?: unknown }).type
  return typeof type === 'string' ? type : undefined
}
