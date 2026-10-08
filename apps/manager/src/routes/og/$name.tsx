import { createFileRoute } from '@tanstack/react-router'
import {
  renderAddressOgImage,
  renderGenericOgImage,
  renderInvalidNameOgImage,
  renderNameOgImage,
} from '@/features/og/card'
import { getOgCardSubject, type OgCardSubject } from '@/features/og/cardSubject'
import { fetchNameOgCard } from '@/features/og/nameCardData'

async function renderSubject(
  subject: OgCardSubject,
  requestUrl: string,
): Promise<Response | null> {
  switch (subject.kind) {
    case 'address':
      return renderAddressOgImage(subject.address, requestUrl)
    case 'invalid':
      return renderInvalidNameOgImage(requestUrl)
    case 'name':
      return renderNameOgImage(await fetchNameOgCard(subject.name), requestUrl)
    case 'generic':
      return null
  }
}

/**
 * `/og/<name>.png` and `/og/<address>.png` — the social card for a name's or
 * an address's profile.
 *
 * This file carries only a server handler, which keeps the route out of the
 * client route tree entirely (see `pruneServerOnlySubtrees`), so none of the
 * renderer reaches the browser bundle.
 */
export const Route = createFileRoute('/og/$name')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        // Anything that isn't name- or address-shaped (and any card that fails
        // to render) falls through to the generic card rather than 500ing — a
        // broken image is a worse preview than a plain one.
        const rendered = await renderSubject(
          getOgCardSubject(params.name),
          request.url,
        )

        return (
          rendered ??
          (await renderGenericOgImage(request.url)) ??
          new Response('OG image rendering failed', { status: 500 })
        )
      },
    },
  },
})
