declare module 'virtual:i18next-loader' {
  import type { Resource } from 'i18next'

  const component: Record<string, Resource>
  export default component
}

declare var Temporal: typeof import('@js-temporal/polyfill').Temporal

declare namespace Temporal {
  type PlainDate = import('@js-temporal/polyfill').Temporal.PlainDate
}
