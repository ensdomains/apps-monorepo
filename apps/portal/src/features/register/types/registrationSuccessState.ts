/**
 * Registration success details handed to `/$name` after a registration.
 *
 * This travels in history state rather than search params so it can't be
 * forged: a URL is attacker-controlled, and the name page renders "You are the
 * owner of {name}" plus the paid figure verbatim from it (Immunefi #92544).
 * History state is only writable by the app's own `navigate` call.
 */
export type RegistrationSuccessState = {
  readonly durationSeconds: number
  readonly paid: string
}

/**
 * History state is `unknown` to us at the type level (the augmentable
 * `HistoryState` interface lives in `@tanstack/history`, which isn't a direct
 * dependency), and it survives reloads and back/forward, so it's parsed rather
 * than trusted.
 */
export const readRegistrationSuccessState = (
  state: unknown,
): RegistrationSuccessState | null => {
  if (typeof state !== 'object' || state === null) return null

  const value = (state as Record<string, unknown>).registrationSuccess
  if (typeof value !== 'object' || value === null) return null

  const { durationSeconds, paid } = value as Record<string, unknown>
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds))
    return null
  if (typeof paid !== 'string') return null

  return { durationSeconds, paid }
}
