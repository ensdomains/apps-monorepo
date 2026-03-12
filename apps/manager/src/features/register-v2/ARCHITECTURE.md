# Registration V2 Architecture

`register-v2` is intentionally parallel to the existing manager registration flow.
It exists to validate the state model and wiring before rebuilding the real UI.

## Ownership

- Router:
  - Owns the canonical registration target via `/register-v2/$name`
  - Canonicalizes the target name at the route boundary
- React Query:
  - Owns read state such as availability and pricing
  - Query options live in `queries/` and are consumed where needed
- UI machine:
  - Owns page-local flow state
  - Owns duration and selected payment token
  - Invokes the shared registration machine as a child actor
- Transaction manager registration machine:
  - Owns the resumable registration workflow
  - Owns transaction progress, success, failure, retry, and cancel semantics

## Current Flow

1. Route param enters at `routes/register-v2/$name.tsx`
2. `RegistrationV2Page` provides a page-scoped actor context keyed by target name
3. Availability query decides whether the page renders:
   - loading
   - unavailable
   - ready
4. Ready state reads pricing directly from React Query and sends submit into the UI machine
5. UI machine forwards `START_REGISTRATION` into the child registration actor
6. Page listens to the child actor and bridges coarse results back to the UI machine:
   - `TX_SUCCEEDED`
   - `TX_FAILED`
7. Transaction view reads the child actor state directly and shows the exact workflow stage

## Why It Is Split This Way

- The target name is not duplicated into local UI state.
- Query data is not mirrored into XState context.
- Transaction progress is not reimplemented in the manager app.
- The UI machine stays small and page-focused.

## Follow-up Recommendations

- Replace the minimal buttons/cards with the real v2 UI without moving ownership boundaries.
- Add a more intentional transaction progress component on top of the existing actor-state feed.
- Revisit whether duration/token should stay sticky across names once the real UX is designed.
- Decide whether active in-flight registrations should survive route changes or be explicitly blocked more strongly.
