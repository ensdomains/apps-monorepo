import { createFileRoute } from '@tanstack/react-router'
import { renderGenericOgImage, renderNameOgImage } from '@/features/og/card'
import { fetchNameOgCard } from '@/features/og/nameCardData'

/**
 * `/og/<name>.png` — the social card for a name's profile.
 *
 * This file carries only a server handler, which keeps the route out of the
 * client route tree entirely (see `pruneServerOnlySubtrees`), so none of the
 * renderer reaches the browser bundle.
 */
export const Route = createFileRoute('/og/$name')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const name = params.name.replace(/\.png$/, '')

        // Anything that isn't name-shaped (and any name whose card fails to
        // render) falls through to the generic card rather than 500ing — a
        // broken image is a worse preview than a plain one.
        const rendered = name.includes('.')
          ? await renderNameOgImage(await fetchNameOgCard(name), request.url)
          : null

        return (
          rendered ??
          (await renderGenericOgImage(request.url)) ??
          new Response('OG image rendering failed', { status: 500 })
        )
      },
    },
  },
})
