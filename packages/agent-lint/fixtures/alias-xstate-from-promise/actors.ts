import { fromPromise } from 'xstate/actors' // expect: alias-xstate-from-promise

export const actor = fromPromise(async () => 1)
