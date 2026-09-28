import { createFileRoute } from '@tanstack/react-router'

/** `/og/default.png` — the social card for every route that isn't a name. */
export const Route = createFileRoute('/og/default.png')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { renderGenericOgImage } = await import('@/features/og/card')

        return (
          (await renderGenericOgImage(request.url)) ??
          new Response('OG image rendering failed', { status: 500 })
        )
      },
    },
  },
})
