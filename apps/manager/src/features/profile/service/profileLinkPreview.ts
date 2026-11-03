export const getProfileLinkPreviewUrl = ({
  apiBaseUrl,
  href,
}: {
  readonly apiBaseUrl: string
  readonly href: string
}) =>
  `${apiBaseUrl.replace(/\/+$/, '')}/link-preview/image?url=${encodeURIComponent(href)}`
