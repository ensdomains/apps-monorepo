/// <reference types="vite/client" />

import router from './app'
import { handleQueue } from './queues'
import { handleScheduled } from './scheduled'

export type AppRouter = typeof router

// @ts-expect-error
BigInt.prototype.toJSON = function () {
  return this.toString()
}

export default {
  fetch: router.fetch,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<CloudflareBindings>
