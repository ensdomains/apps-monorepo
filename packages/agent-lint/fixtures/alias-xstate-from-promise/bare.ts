import { fromPromise } from 'xstate' // expect: alias-xstate-from-promise

export const actor = fromPromise(async () => 1)
