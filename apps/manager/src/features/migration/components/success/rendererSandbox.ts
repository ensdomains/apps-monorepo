export const getRendererSandbox = (params: {
  readonly rendererUrl?: string
  readonly appOrigin?: string
  readonly trustedRendererOrigin: string
}): string => {
  if (
    !params.rendererUrl ||
    !params.appOrigin ||
    !URL.canParse(params.rendererUrl) ||
    !URL.canParse(params.appOrigin) ||
    !URL.canParse(params.trustedRendererOrigin)
  ) {
    return 'allow-scripts'
  }

  const rendererUrl = new URL(params.rendererUrl)
  const appUrl = new URL(params.appOrigin)
  const trustedRendererUrl = new URL(params.trustedRendererOrigin)

  if (
    rendererUrl.protocol !== 'https:' ||
    trustedRendererUrl.protocol !== 'https:' ||
    (appUrl.protocol !== 'http:' && appUrl.protocol !== 'https:') ||
    rendererUrl.origin !== trustedRendererUrl.origin ||
    rendererUrl.origin === appUrl.origin
  ) {
    return 'allow-scripts'
  }

  // Preserve the trusted renderer's origin for asset CORS requests. Keeping
  // it cross-origin from the app prevents access to the parent document.
  return 'allow-scripts allow-same-origin'
}
