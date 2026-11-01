import { fromPromise as fromPromiseXState } from 'xstate/actors'

export const actor = fromPromiseXState(async () => 1)
