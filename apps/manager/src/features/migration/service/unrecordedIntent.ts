/** What is known about an intent whose wallet prompt started but left no hash. */
export type UnrecordedIntentEvidence = {
  readonly lease: 'held' | 'free' | 'unsupported'
  readonly wallet: 'pending' | 'idle' | 'unknown'
}

/** Re-prompt only when no tab still holds the intent's prompt and the wallet has nothing in flight. */
export const canReadStateForUnrecordedIntent = ({
  lease,
  wallet,
}: UnrecordedIntentEvidence): boolean => lease !== 'held' && wallet === 'idle'
