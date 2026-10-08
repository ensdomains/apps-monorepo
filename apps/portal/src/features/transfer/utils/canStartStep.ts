/**
 * Whether a transfer step may be started.
 *
 * A step's `onStart` can arrive twice — from the modal's button and from the
 * previous step's auto-advance — so the flow records the ids it has started.
 * That record is not the whole answer, though: once a step has an actor, the
 * actor is what knows whether it is running or has finished, and if the
 * manager has since dropped it there is nothing left to wait on. Leaving such
 * a step blocked strands the modal on it, showing "Not Started" next to a
 * button that quietly does nothing.
 *
 * So: blocked only while an actor for it exists.
 *
 * The remaining case — started, but the actor does not exist yet — is allowed
 * through, which means two clicks in that window both reach the manager. That
 * is safe because the manager refuses to open a second actor for an id already
 * in flight and hands back the running transaction instead, so the duplicate
 * resolves onto the same wallet prompt rather than a new one.
 */
export const canStartStep = (input: {
  readonly startedSteps: ReadonlySet<string>
  readonly id: string
  /** Whether the transaction manager still holds an actor for this step. */
  readonly hasActor: boolean
}): boolean => !input.startedSteps.has(input.id) || !input.hasActor
