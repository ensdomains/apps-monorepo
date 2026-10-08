import type { Cursor, Namespace } from './common.types'

/** `GET /v1/search`: query. */
export type SearchQuery = Readonly<{
  /** ENSIP-15 fragment; one trailing dot marks a label boundary. */
  q: string
  match?: 'prefix' | 'contains'
  namespace?: Namespace
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>
