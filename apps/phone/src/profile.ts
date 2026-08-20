export interface ProfileSubmission {
  readonly canSubmit: boolean
  readonly reason: string | null
}

/**
 * The domain (`TableRegistry.setProfile`) treats a blank nickname as no
 * profile change at all, precisely because the empty string doubles as the
 * sentinel this app reads as "no profile chosen yet". A submit button that
 * fired anyway would look broken to whoever is holding the phone: the
 * request would silently do nothing and the same form would render again
 * with no explanation. This mirrors that rule on the client, as a pure
 * decision, so the button can be disabled with a visible reason instead of
 * offering an action that cannot work.
 */
export function describeProfileSubmission(nickname: string): ProfileSubmission {
  if (nickname.trim() === '') {
    return { canSubmit: false, reason: 'Type a name to take a place.' }
  }
  return { canSubmit: true, reason: null }
}
