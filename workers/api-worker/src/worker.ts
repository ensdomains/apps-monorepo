/// <reference types="vite/client" />

import router from './app'
import { handleQueue } from './queues'

export type AppRouter = typeof router

export default {
  fetch: router.fetch,
  queue: handleQueue,
} satisfies ExportedHandler<CloudflareBindings>
