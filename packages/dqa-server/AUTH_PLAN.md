# DQA Auth — Plan & Linear Setup

Use Linear as both **identity** (who you are) and **authorization** (whether you're
allowed in) via **"Sign in with Linear" (OAuth2)**. No pasted API keys for end users.
Comments thread onto the feature's existing Linear ticket, authored by the real person.

This doc has two halves:
- **Part 1 — what *you* set up in Linear** (manual, one-time).
- **Part 2 — the build plan** (what we implement afterward; not started yet).

---

## Part 1 — What to create in Linear (do this first)

### 1.1 Create the OAuth application

1. Linear → **Settings → API → OAuth applications → Create new**.
2. Fill in:
   - **Application name:** `ENS DQA`
   - **Developer / icon:** whatever you like.
   - **Callback URLs (redirect URIs):** add every host the service will run on, e.g.
     - `http://localhost:4000/auth/callback` (local dev)
     - `https://<your-tunnel-or-host>/auth/callback` (when exposed via tunnel/deploy)
     - Redirect URIs must match **exactly** at login time — add each one you'll use.
3. After saving you get a **Client ID** and **Client Secret**. Copy both. The secret is
   shown once — store it safely (goes in the service's `.env`, never in the browser).

### 1.2 Choose scopes (least privilege)

Request only what's needed:
- `read` — always present; lets us call `viewer` to identify the user. *(required)*
- `comments:create` — post DQA comments onto tickets. *(required for our core loop)*
- `issues:create` — **only** if you also want the "no ticket mapped → create a new issue"
  fallback. Skip if every DQA page maps to an existing ticket.

Do **not** request `write` or `admin`. (Selling point to the team: DQA can read your
identity and add comments, and literally cannot edit or delete anything.)

### 1.3 Decide the actor mode

- **`user` (recommended):** comments are authored in Linear by the real reviewer. This is
  the default and what makes DQA comments feel native. Requires the service to store each
  user's access token (encrypted) so it can post on their behalf.
- **`application`:** simpler — no per-user token storage — but comments show as authored by
  "ENS DQA" with the reviewer's name in the body. Pick this if storing user tokens is a
  hassle for v1.

> **Decision needed:** `user` vs `application`. Default in this plan: **`user`**.

### 1.4 Find the IDs you'll whitelist against

You need a few Linear IDs for the `.env`. Easiest way: create **one personal API key**
just for this lookup (Settings → Security & access → Personal API keys), run the queries
below, then you can delete the key — end users never touch it.

```bash
# Workspace (organization) id — the coarse gate
curl -s https://api.linear.app/graphql -H "Authorization: <PERSONAL_KEY>" \
  -H "Content-Type: application/json" \
  --data '{"query":"{ organization { id name urlKey } }"}'

# Team ids + keys (e.g. ENG) — medium gate
curl -s https://api.linear.app/graphql -H "Authorization: <PERSONAL_KEY>" \
  -H "Content-Type: application/json" \
  --data '{"query":"{ teams { nodes { id key name } } }"}'

# Project ids — finest gate (the "specific project" you described)
curl -s https://api.linear.app/graphql -H "Authorization: <PERSONAL_KEY>" \
  -H "Content-Type: application/json" \
  --data '{"query":"{ projects { nodes { id name } } }"}'
```

Save the `organization.id`, plus the `team.id` and/or `project.id` you want to gate on.

### 1.5 Summary of what Part 1 produces

| Value | Where it came from | Goes into |
|---|---|---|
| Client ID | OAuth app (1.1) | `.env` (server) |
| Client Secret | OAuth app (1.1) | `.env` (server, secret) |
| Callback URL(s) | OAuth app (1.1) | `.env` + matches redirect |
| Workspace/org id | query (1.4) | `.env` — workspace gate |
| Team id / Project id | query (1.4) | `.env` — finer gate |

### 1.6 New `.env` keys (added to the existing file)

```bash
# --- Linear OAuth (replaces the personal-key approach for end users) ---
LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=
LINEAR_REDIRECT_URI=http://localhost:4000/auth/callback
LINEAR_SCOPES=read,comments:create        # add issues:create only if using the fallback
LINEAR_ACTOR=user                          # or "application"

# --- Whitelist (set the strictness you want) ---
LINEAR_WORKSPACE_ID=                       # required — coarse gate
LINEAR_ALLOWED_TEAM_IDS=                   # optional, comma-separated
LINEAR_ALLOWED_PROJECT_IDS=                # optional, comma-separated

# --- Session ---
SESSION_SECRET=                            # random string to sign DQA session cookies/JWT
TOKEN_ENCRYPTION_KEY=                      # 32-byte key; only if LINEAR_ACTOR=user
```

The old `LINEAR_API_KEY` / `LINEAR_DRY_RUN` keys can stay for now as a fallback path while
we migrate, then be removed.

---

## Part 2 — Build plan (not started)

Phased so each step is demoable on its own.

### Phase 1 — OAuth login
- Add `GET /auth/linear` → builds the authorize URL (`client_id`, `redirect_uri`,
  `response_type=code`, `scope`, random `state`) and redirects to Linear.
- Add `GET /auth/callback` → verify `state`, exchange `code` for an access token at
  `POST https://api.linear.app/oauth/token`, then call `viewer { id name email organization { id } }`.
- Issue a signed DQA session (cookie or JWT via `SESSION_SECRET`). Store the user's
  Linear token server-side, encrypted with `TOKEN_ENCRYPTION_KEY` (only if actor=`user`).
- Add `POST /auth/logout` → clear session, optionally hit `/oauth/revoke`.

### Phase 2 — Whitelist enforcement
- On callback, run the gate in order of configured strictness:
  1. `organization.id === LINEAR_WORKSPACE_ID` (else reject — not in our workspace).
  2. if `LINEAR_ALLOWED_TEAM_IDS` set: `viewer.teamMemberships` must intersect.
  3. if `LINEAR_ALLOWED_PROJECT_IDS` set: viewer must be a member of an allowed project.
- Reject with a clear "you don't have access to DQA" screen if any required gate fails.

### Phase 3 — Gate the API + WebSocket
- Middleware on every `/api/*` route: require a valid DQA session.
- WebSocket `join`: require the session token in the connection; drop unauthenticated
  sockets (no cursor, no presence, no comments).
- Stamp each comment with the real Linear user (id + name) from the session, not a
  free-text name prompt.

### Phase 4 — Comment → ticket routing
- The injected snippet carries the ticket: `<script src=".../overlay.js" data-linear-issue="ENG-123">`.
  Preview builds already know their branch (`linear/<ticket-id>`), so the deploy template
  fills this in automatically.
- Resolve `ENG-123` → issue UUID once (query by team key + number), cache it.
- On "Send to Linear": `commentCreate(input: { issueId, body })` using the reviewer's
  token (actor=`user`) so the comment is authored by them.
- No `data-linear-issue` present → fall back to `issueCreate` (needs `issues:create` scope),
  or disable the button. *(Decision: keep the fallback or not.)*

### Phase 5 — Sign-in UX
- A minimal sign-in screen ("Sign in with Linear") shown when there's no session.
- Replace the current name `prompt()` entirely — identity now comes from Linear.
- Show the signed-in user in the toolbar; add a sign-out affordance.

### Phase 6 — Verify
- Test: non-workspace user blocked; workspace-but-wrong-project user blocked (if project
  gate on); allowed user can comment and the comment appears on the right Linear ticket
  authored by them; unauthenticated WebSocket rejected; token revoke works.

---

## Open decisions (please confirm before we build)

1. **Actor mode:** `user` (real authorship, store tokens) vs `application` (simpler). → default `user`.
2. **Whitelist grain:** workspace-only to start, or go straight to team/project gating?
3. **Ticket routing:** every page maps to an existing ticket via `data-linear-issue`, or
   also keep the "create a new issue" fallback (needs `issues:create`)?
4. **Session store:** stateless JWT in a cookie (no DB) vs server-side session records.

## Caveats

- Redirect URIs must match exactly — every host (localhost, tunnel, prod) needs to be
  registered in the OAuth app.
- Private teams/projects: the membership check only sees what the user can see — which is
  the behavior we want, but it depends on Linear's own visibility rules.
- Token lifetime: handle expiry/refresh and revoke so a removed teammate loses access.
- The client secret and user tokens live only on the server, never in `overlay.js`.

## Rough effort

Phases 1–3 (login + whitelist + gating) ~1 day. Phases 4–5 (routing + UX) ~half a day.
Phase 6 verify ~couple hours. Roughly **2 days** for a solid v1.
