import { fromPromise } from 'neverthrow'
import { fromPromise as fromPromiseNT } from 'neverthrow'
import { assign, createActor, setup } from 'xstate'
import { fromPromise as fromPromiseXState } from 'xstate'

export const lifted = fromPromise(Promise.resolve(1), () => new Error('x'))
export const alias = fromPromiseNT(Promise.resolve(2), () => new Error('y'))
export const actor = fromPromiseXState(async () => 3)
export const unused = [assign, createActor, setup]
