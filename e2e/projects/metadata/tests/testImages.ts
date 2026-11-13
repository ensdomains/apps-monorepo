/**
 * Minimal, byte-verified 1x1 PNGs as `data:` URIs — used as `avatar`/`header`
 * text-record values across this project's specs.
 *
 * `data:` is an explicitly supported avatar/header URI scheme in
 * metadata-service-v2 (`src/services/avatar.ts` `fetchMedia`), so this keeps
 * every scenario hermetic: no outbound fetch to a real image host, and no
 * dependency on IPFS gateway availability.
 *
 * Two distinct images (not just distinct records) so cache-invalidation
 * tests can assert on changed response *bytes*, not merely a changed record.
 */

export const RED_AVATAR_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

export const BLUE_AVATAR_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC'
