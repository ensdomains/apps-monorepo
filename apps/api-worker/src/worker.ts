/// <reference types="vite/client" />

import router from './router'

export default {
  fetch: router.fetch,
} satisfies ExportedHandler<CloudflareBindings>
