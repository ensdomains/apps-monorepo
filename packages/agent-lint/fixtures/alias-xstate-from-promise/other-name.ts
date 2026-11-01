import { fromPromise as promiseActor } from 'xstate' // expect: alias-xstate-from-promise

export const actor = promiseActor(async () => 1)
