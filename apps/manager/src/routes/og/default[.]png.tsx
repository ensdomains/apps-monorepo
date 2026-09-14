import { createFileRoute } from '@tanstack/react-router'
import { renderGenericOgImage } from '@/features/og/card'

/** `/og/default.png` — the social card for every route that isn't a name. */
export const Route = createFileRoute('/og/default.png')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await renderGenericOgImage(request.url)) ??
        new Response('OG image rendering failed', { status: 500 }),
    },
  },
})
