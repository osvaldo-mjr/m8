/**
 * Core speaks its own language. apps/server translates these into wire
 * messages, so the domain never learns that a network exists.
 *
 * Every variant here is emitted by some operation. There is deliberately no
 * `table-created`: `createTable` returns a `Table` and no events, so such a
 * variant would be a case every downstream switch has to handle for a thing
 * that can never reach it.
 */
export type DomainEvent =
  | { readonly type: 'participant-joined'; readonly code: string; readonly participantId: string }
  | { readonly type: 'participant-rejoined'; readonly code: string; readonly participantId: string }
  | { readonly type: 'participant-left'; readonly code: string; readonly participantId: string }
  | { readonly type: 'participant-disconnected'; readonly code: string; readonly participantId: string }
  | { readonly type: 'profile-changed'; readonly code: string; readonly participantId: string }
  | { readonly type: 'baton-granted'; readonly code: string; readonly participantId: string }
  | { readonly type: 'baton-migrated'; readonly code: string; readonly participantId: string }
  | { readonly type: 'table-emptied'; readonly code: string }
