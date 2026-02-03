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
  // Temporary email handler to log received emails
  email: async (message) => {
    const rawEmail = new Response(message.raw)
    const emailText = await rawEmail.text()

    console.log(
      `Email received from ${message.from} to ${message.to}:\n\n${emailText}`,
    )
  },
} satisfies ExportedHandler<CloudflareBindings>
