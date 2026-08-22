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

/**
 * The two classes an avatar tile in the picker may carry.
 *
 * Pulled out of `App.tsx` as a pure function so the selection cue has a
 * guard at all: `apps/phone` has no DOM testing library and this repository
 * is not taking one on for one component, so a rendered assertion is not an
 * option. What broke once already is testable without one — the chosen tile
 * was marked by `m8-person-bg` alone, which is a fill colour, and the fill
 * against the palette that replaced violet dropped as low as 1.65:1 for
 * three of eight avatars. Nothing caught it before the owner did by eye. The
 * fix added a border in the paper colour, constant regardless of which fill
 * is behind it, and this function is what keeps that border from being
 * silently dropped in the same way: it does not check contrast, only that
 * the chosen tile still carries a cue the fill is not.
 */
export const AVATAR_TILE_CHOSEN_CLASS = 'm8-person-bg rounded-2xl border-4 border-paper py-6 text-4xl'
export const AVATAR_TILE_UNCHOSEN_CLASS = 'rounded-2xl border-4 border-transparent bg-table py-6 text-4xl'

export function avatarTileClassName(chosen: boolean): string {
  return chosen ? AVATAR_TILE_CHOSEN_CLASS : AVATAR_TILE_UNCHOSEN_CLASS
}

/**
 * The one button this app has, in its two states.
 *
 * TAKE A PLACE, PLAY THIS and START were three copies of the same ternary —
 * the first two identical to the character, the third differing only by its
 * width — so a change to how a disabled control reads had three places to
 * make it and two chances to miss one.
 *
 * Disabled is drawn as an outline in this person's colour, not as the same
 * button faded out: a saturated colour at 40% over the ground turns to mud,
 * and mud is the one thing the palette is not allowed to produce.
 */
export const PRIMARY_BUTTON_ENABLED_CLASS = 'm8-person-bg m8-eyebrow rounded-2xl py-5 text-lg text-ink'
export const PRIMARY_BUTTON_DISABLED_CLASS =
  'm8-person-text m8-eyebrow rounded-2xl border-2 border-current py-5 text-lg'

export function primaryButtonClassName(
  enabled: boolean,
  options: { readonly fullWidth?: boolean } = {},
): string {
  const base = enabled ? PRIMARY_BUTTON_ENABLED_CLASS : PRIMARY_BUTTON_DISABLED_CLASS
  return options.fullWidth === true ? `${base} w-full` : base
}
