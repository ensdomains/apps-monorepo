/// <reference types="vite/client" />

import router from './api'

export default {
  fetch: router.fetch,
} satisfies ExportedHandler<CloudflareBindings>
