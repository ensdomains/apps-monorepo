/// <reference types="vite/client" />

import router from './app'

export type AppRouter = typeof router

export default {
  fetch: router.fetch,
} satisfies ExportedHandler<CloudflareBindings>
