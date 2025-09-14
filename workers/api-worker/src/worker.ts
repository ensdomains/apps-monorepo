/// <reference types="vite/client" />

import router from './app'

export default {
  fetch: router.fetch,
} satisfies ExportedHandler<CloudflareBindings>
