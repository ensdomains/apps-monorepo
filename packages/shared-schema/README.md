# @ens-apps/shared-schema

Runtime shared schemas, constants, and derived types used by both manager and api-worker.

## Modules

- `@ens-apps/shared-schema/notifications`
- `@ens-apps/shared-schema/telegram`

## Purpose

- One canonical runtime source for notification kinds and payload schemas
- Shared semantic catalog for frontend/backend consumption
- Shared telegram auth schema/type

## Authoring Notifications

Each kind is defined in a single file under:

- `src/notifications/kinds/*.ts`

A kind definition contains:

- `kind`
- `source`
- `payloadSchema`
- `metadata`
- `delivery`

Kinds are registered in `src/notifications/kinds/index.ts`.
