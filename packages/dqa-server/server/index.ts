import './load-env.ts' // must be first — populates process.env before other modules read it
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Request, Response } from 'express'
import express from 'express'
import multer from 'multer'
import { WebSocketServer } from 'ws'

import {
  authOrigin,
  buildAuthorizeUrl,
  checkWhitelist,
  decrypt,
  devAllowed,
  exchangeCode,
  fetchViewer,
  isAllowedOrigin,
  makeDevSession,
  makeSession,
  oauthConfigured,
  requireAuth,
  revoke,
  safeOrigin,
  safeReturnUrl,
  signJWT,
  verifyJWT,
} from './auth.ts'
import {
  addComment,
  addReply,
  listComments,
  removeComment,
  updateComment,
} from './db.ts'
import {
  checkLinearStatus,
  pushReplyToLinear,
  pushToLinear,
  searchIssues,
} from './linear.ts'
import type {
  Anchor,
  Comment,
  Inspect,
  OAuthState,
  StyleEdit,
} from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 4000
const PUBLIC_DIR = resolve(__dirname, '../public')
const UPLOAD_DIR = resolve(__dirname, '../data/uploads')
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })

const app = express()
app.use(express.json({ limit: '2mb' }))

// CORS: reflect the request origin only when it's on the allowlist. Auth is
// Bearer-token (never cookies), so we never send credentials; an un-allowed
// origin simply gets no CORS headers and the browser blocks the response.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && isAllowedOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
    res.header('Vary', 'Origin')
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Uploads: images only, with a server-forced safe extension. Prevents an
// attacker uploading e.g. .html and having it served (as text/html) from the
// DQA origin — the filename never derives from client input.
const ALLOWED_IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
}
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) =>
      cb(null, randomUUID() + (ALLOWED_IMAGE_EXT[file.mimetype] || '.bin')),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, !!ALLOWED_IMAGE_EXT[file.mimetype]),
})

const baseUrl = (req: Request): string => `${req.protocol}://${req.get('host')}`
const esc = (s: unknown): string =>
  String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  )

// ======================================================================
//  AUTH
// ======================================================================

app.get('/auth/config', (_req, res) => {
  // authOrigin: delegated-auth instance the overlay should open sign-in
  // popups against (and trust postMessages from). Ephemeral deployments set
  // DQA_AUTH_URL to a long-lived instance whose domain is the registered
  // Linear redirect URI; its sessions are valid here via shared secrets.
  res.json({
    oauthConfigured: oauthConfigured() || !!authOrigin(),
    devAllowed: devAllowed(),
    authOrigin: authOrigin(),
  })
})

// Resolve + validate the caller-supplied origin/returnUrl against the
// allowlist so a crafted `?returnUrl=` can never redirect the token elsewhere.
function resolveReturn(req: Request): {
  origin: string | null
  returnUrl: string | null
} {
  const origin = safeOrigin(req.query.origin) || safeOrigin(req.headers.referer)
  const returnUrl =
    safeReturnUrl(req.query.returnUrl) ||
    safeReturnUrl(req.headers.referer) ||
    (origin ? `${origin}/demo.html` : null)
  return { origin, returnUrl }
}

// If this instance can't complete OAuth itself but delegates to another
// (DQA_AUTH_URL), forward auth entrypoints there with the query intact — the
// popup-blocked fallback navigates the page here directly, bypassing the
// overlay's own authOrigin handling.
function delegateAuth(req: Request, res: Response): boolean {
  const remote = authOrigin()
  if (oauthConfigured() || !remote) return false
  const qs = req.originalUrl.split('?')[1] || ''
  res.redirect(`${remote}${req.path}${qs ? `?${qs}` : ''}`)
  return true
}

app.get('/auth/linear', (req, res) => {
  if (delegateAuth(req, res)) return
  if (!oauthConfigured())
    return res.status(400).send('Linear OAuth is not configured.')
  const { origin, returnUrl } = resolveReturn(req)
  if (!origin)
    return res.status(400).send('Origin not allowed. Set DQA_ALLOWED_ORIGINS.')
  const state = signJWT({ origin, returnUrl, n: randomUUID() }, 600)
  res.redirect(buildAuthorizeUrl(state))
})

/** Popup helper when the user needs to log out of Linear and sign in with another account. */
app.get('/auth/account-switch', (req, res) => {
  if (delegateAuth(req, res)) return
  if (!oauthConfigured())
    return res.status(400).send('Linear OAuth is not configured.')
  const { origin, returnUrl } = resolveReturn(req)
  if (!origin)
    return res.status(400).send('Origin not allowed. Set DQA_ALLOWED_ORIGINS.')
  const state = signJWT({ origin, returnUrl, n: randomUUID() }, 600)
  const loginUrl = buildAuthorizeUrl(state)
  res.set('Content-Type', 'text/html').send(`<!doctype html><meta charset=utf-8>
<title>Switch Linear account</title>
<body style="font:14px -apple-system,BlinkMacSystemFont,sans-serif;padding:24px;max-width:420px;color:#111827;line-height:1.5">
<h1 style="font-size:18px;margin:0 0 8px">Switch Linear account</h1>
<p style="color:#6b7280;margin:0 0 16px">If access was denied, log out of Linear first, then sign in with an authorized account.</p>
<ol style="padding-left:20px;margin:0 0 20px">
<li style="margin-bottom:12px"><a href="https://linear.app/logout" style="color:#2563eb;font-weight:600">Log out of Linear</a></li>
<li><a href="${esc(loginUrl)}" style="color:#2563eb;font-weight:600">Sign in with Linear</a></li>
</ol>
<p style="color:#6b7280;font-size:12px;margin:0">You can close this window after signing in.</p>
<script>
try { localStorage.removeItem("dqa_token"); } catch (e) {}
</script>
</body>`)
})

function popupResult(
  res: Response,
  payload: { token?: string; error?: string },
  targetOrigin: string | null,
  returnUrl: string | null,
) {
  // targetOrigin/returnUrl are pre-validated against the allowlist by callers.
  // Never fall back to "*": that would broadcast the token to any opener.
  res.set('Content-Type', 'text/html').send(`<!doctype html><meta charset=utf-8>
<body style="font:14px -apple-system,sans-serif;padding:24px;color:#111827">
${payload.token ? 'Signed in. Returning…' : 'Access denied: ' + esc(payload.error || '')}
<script>
(function () {
  var payload = ${JSON.stringify(payload)};
  var targetOrigin = ${JSON.stringify(targetOrigin || '')};
  var returnUrl = ${JSON.stringify(returnUrl || targetOrigin || '/')};
  if (!targetOrigin) { document.body.append(" (no allowed return origin)"); return; }
  if (payload.token) {
    try { localStorage.setItem("dqa_token", payload.token); } catch (e) {}
  }
  try { window.opener && window.opener.postMessage(payload, targetOrigin); } catch (e) {}
  if (window.opener) {
    setTimeout(function () { window.close(); }, ${payload.token ? 300 : 4000});
  } else {
    location.replace(returnUrl);
  }
})();
</script></body>`)
}

app.get('/auth/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const st = verifyJWT<OAuthState>(req.query.state)
  if (!code || !st)
    return popupResult(res, { error: 'invalid state' }, null, null)
  // Re-validate the state's origin/returnUrl at redemption: the token is only
  // ever posted to / redirected to an allowlisted origin, never a bare "*".
  const origin = safeOrigin(st.origin)
  const returnUrl = safeReturnUrl(st.returnUrl)
  if (!origin)
    return popupResult(res, { error: 'origin not allowed' }, null, null)
  try {
    const tok = await exchangeCode(code)
    const viewer = await fetchViewer(tok.access_token)
    const gate = await checkWhitelist(viewer, tok.access_token)
    if (!gate.ok)
      return popupResult(res, { error: gate.reason }, origin, returnUrl)
    const token = makeSession(viewer, tok.access_token)
    return popupResult(res, { token }, origin, returnUrl)
  } catch (e) {
    console.error('[auth] callback', (e as Error).message)
    return popupResult(res, { error: 'sign-in failed' }, origin, returnUrl)
  }
})

// Dev login — only when OAuth isn't configured or DQA_DEV_AUTH=true.
app.get('/auth/dev', (req, res) => {
  if (!devAllowed()) return res.status(403).json({ error: 'dev auth disabled' })
  res.json({
    // Empty name → server auto-assigns "Dev N" (unique per session).
    token: makeDevSession(String(req.query.name ?? '').slice(0, 40)),
  })
})

app.post('/auth/logout', requireAuth, async (req, res) => {
  const lt = decrypt(req.session.lt)
  if (lt) await revoke(lt)
  res.json({ ok: true })
})

// who am I (handy for the overlay to validate its token)
app.get('/auth/me', requireAuth, (req, res) => {
  const { sub, name, email, color, orgId, dev, avatarUrl } = req.session
  res.json({
    id: sub,
    name,
    email,
    color,
    orgId,
    dev,
    avatarUrl: avatarUrl || null,
  })
})

// ======================================================================
//  API  (all gated)
// ======================================================================

// How often we re-verify that pushed comments/issues still exist in Linear.
const LINEAR_CHECK_INTERVAL_MS = 60_000

// Distinct pages that have comments, with open/total counts — powers the
// DevDrawer "Pages" navigator.
app.get('/api/pages', requireAuth, (_req, res) => {
  const byUrl = new Map<string, { url: string; open: number; total: number }>()
  for (const c of listComments()) {
    const e = byUrl.get(c.url) ?? { url: c.url, open: 0, total: 0 }
    e.total += 1
    if (c.status !== 'resolved') e.open += 1
    byUrl.set(c.url, e)
  }
  res.json(
    [...byUrl.values()].sort((a, b) => b.open - a.open || b.total - a.total),
  )
})

app.get('/api/comments', requireAuth, async (req, res) => {
  const pageUrl = typeof req.query.url === 'string' ? req.query.url : undefined
  const comments = listComments(pageUrl)
  // Lazily detect Linear-side deletions using the reviewer's token (no-op for
  // dev sessions). Throttled per comment; failures leave the state untouched.
  const token = decrypt(req.session.lt)
  if (token) {
    const now = Date.now()
    const due = comments.filter(
      (c) =>
        c.linear &&
        !c.linearDeleted &&
        (!c.linearCheckedAt ||
          now - c.linearCheckedAt > LINEAR_CHECK_INTERVAL_MS),
    )
    await Promise.all(
      due.map(async (c) => {
        const status = await checkLinearStatus(c.linear, token)
        const updated = updateComment(c.id, {
          linearCheckedAt: now,
          ...(status === 'deleted' ? { linearDeleted: true } : {}),
        })
        if (status === 'deleted' && updated)
          broadcast(c.url, { type: 'comment:update', comment: updated })
      }),
    )
  }
  res.json(listComments(pageUrl))
})

app.delete('/api/comments/:id', requireAuth, (req, res) => {
  const removed = removeComment(req.params.id)
  if (!removed) return res.status(404).json({ error: 'not found' })
  broadcast(removed.url, { type: 'comment:delete', id: removed.id })
  res.json({ ok: true })
})

// Cap client-supplied inspection payloads (component snapshot + style edits).
function sanitizeInspect(inspect: unknown): Inspect | null {
  if (!inspect || typeof inspect !== 'object') return null
  try {
    if (JSON.stringify(inspect).length > 8000) return null
  } catch {
    return null
  }
  const o = inspect as Record<string, unknown>
  return {
    tag: String(o.tag || '').slice(0, 40),
    id: o.id ? String(o.id).slice(0, 120) : null,
    classes: Array.isArray(o.classes)
      ? o.classes.slice(0, 60).map((c) => String(c).slice(0, 120))
      : [],
    styles:
      o.styles && typeof o.styles === 'object'
        ? Object.fromEntries(
            Object.entries(o.styles as Record<string, unknown>)
              .slice(0, 30)
              .map(([k, v]) => [
                String(k).slice(0, 60),
                String(v).slice(0, 200),
              ]),
          )
        : {},
    props:
      o.props && typeof o.props === 'object'
        ? Object.fromEntries(
            Object.entries(o.props as Record<string, unknown>)
              .slice(0, 30)
              .map(([k, v]) => [
                String(k).slice(0, 60),
                String(v).slice(0, 200),
              ]),
          )
        : null,
    componentPath: o.componentPath
      ? String(o.componentPath).slice(0, 200)
      : null,
    viewport: o.viewport ? String(o.viewport).slice(0, 60) : null,
    text: o.text ? String(o.text).slice(0, 120) : null,
  }
}
// A CSS value we're willing to persist / put in a Linear issue. Blocks tokens
// that could smuggle a payload (url() trackers, extra declarations, imports).
// The `class` edit carries a class list, which is checked with the same rule.
function isSafeCssValue(v: string): boolean {
  return (
    v.length <= 300 &&
    !/[<>{};]|url\(|expression|javascript:|@import|\\/i.test(v)
  )
}
// Cap free-text fields — bodies are rendered escaped everywhere, but there is
// no reason to store megabytes per comment (express.json allows 2mb requests
// for screenshot metadata).
const MAX_BODY_LEN = 5_000
const MAX_URL_LEN = 2_000

function sanitizeAnchor(a: unknown): Anchor | null {
  if (!a || typeof a !== 'object') return null
  const o = a as Record<string, unknown>
  const selector = String(o.selector ?? '').slice(0, 500)
  if (!selector) return null
  const num = (v: unknown): number | undefined => {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return {
    selector,
    label: o.label ? String(o.label).slice(0, 200) : undefined,
    offsetX: num(o.offsetX),
    offsetY: num(o.offsetY),
    pageXPct: num(o.pageXPct),
    pageYPct: num(o.pageYPct),
  }
}

function sanitizeStyleEdits(edits: unknown): StyleEdit[] | null {
  if (!Array.isArray(edits)) return null
  const out = edits
    .slice(0, 40)
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>
      return {
        prop: String(o.prop ?? '').slice(0, 60),
        from: String(o.from ?? '').slice(0, 300),
        to: String(o.to ?? '').slice(0, 300),
      }
    })
    .filter((e) => {
      // prop must be a CSS property name or the literal "class".
      if (!/^(class|[a-z][a-z-]{0,59})$/.test(e.prop)) return false
      // The class list can't inject (escaped on display, code-fenced in Linear)
      // and legitimately contains `>` etc. in Tailwind arbitrary variants —
      // length-cap only. CSS *values* get the strict token check.
      if (e.prop === 'class') return true
      return isSafeCssValue(e.from) && isSafeCssValue(e.to)
    })
  return out.length ? out : null
}

app.post('/api/comments', requireAuth, (req, res) => {
  const {
    url,
    body,
    anchor,
    imageUrl,
    afterImageUrl,
    issueRef,
    inspect,
    styleEdits,
  } = req.body || {}
  if (!url || !body)
    return res.status(400).json({ error: 'url and body required' })
  // Server-hosted screenshots only — both image fields must point at our
  // own /uploads/ (same rule the "after" shot always had).
  const ownUpload = (v: unknown) =>
    typeof v === 'string' && v.startsWith('/uploads/') && v.length < 200
      ? v
      : null
  const comment: Comment = {
    id: randomUUID(),
    url: String(url).slice(0, MAX_URL_LEN),
    author: req.session.name, // identity comes from the session, not the client
    authorId: req.session.sub,
    authorAvatar: req.session.avatarUrl || null,
    body: String(body).slice(0, MAX_BODY_LEN),
    anchor: sanitizeAnchor(anchor),
    imageUrl: ownUpload(imageUrl),
    // "after" element screenshot with suggested style edits applied
    afterImageUrl: ownUpload(afterImageUrl),
    issueRef: issueRef ? String(issueRef).slice(0, 40) : null, // e.g. "ENG-123"
    inspect: sanitizeInspect(inspect),
    styleEdits: sanitizeStyleEdits(styleEdits),
    status: 'open',
    replies: [],
    linear: null,
    createdAt: new Date().toISOString(),
  }
  addComment(comment)
  broadcast(url, { type: 'comment:new', comment })
  res.json(comment)
})

app.post('/api/comments/:id/reply', requireAuth, async (req, res) => {
  const body =
    typeof req.body?.body === 'string'
      ? req.body.body.trim().slice(0, MAX_BODY_LEN)
      : ''
  if (!body) return res.status(400).json({ error: 'body required' })

  // If the parent comment was already pushed to Linear, mirror the reply
  // there as a THREADED reply (parentId) so the conversation continues on
  // the ticket. Best-effort — the DQA reply saves regardless.
  const parent = listComments().find((c) => c.id === req.params.id)
  let linearSynced = false
  if (parent?.linear && !parent.linearDeleted) {
    const userToken = decrypt(req.session.lt) // null for dev sessions
    linearSynced = await pushReplyToLinear(parent.linear, body, userToken)
  }

  const updated = addReply(req.params.id, {
    id: randomUUID(),
    author: req.session.name,
    authorAvatar: req.session.avatarUrl || null,
    body,
    createdAt: new Date().toISOString(),
    linearSynced,
  })
  if (!updated) return res.status(404).json({ error: 'not found' })
  broadcast(updated.url, { type: 'comment:update', comment: updated })
  res.json(updated)
})

app.post('/api/comments/:id/resolve', requireAuth, (req, res) => {
  const updated = updateComment(req.params.id, { status: 'resolved' })
  if (!updated) return res.status(404).json({ error: 'not found' })
  broadcast(updated.url, { type: 'comment:update', comment: updated })
  res.json(updated)
})

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' })
  res.json({ imageUrl: `/uploads/${req.file.filename}` })
})

// Search the reviewer's Linear issues for the ticket picker.
app.get('/api/linear/issues', requireAuth, async (req, res) => {
  try {
    const userToken = decrypt(req.session.lt)
    const term = typeof req.query.term === 'string' ? req.query.term.trim() : ''
    const after =
      typeof req.query.after === 'string' && req.query.after.length < 500
        ? req.query.after
        : null
    const page = await searchIssues(term, userToken, after)
    res.json({
      issues: page.issues,
      nextCursor: page.nextCursor,
      dev: !userToken,
    })
  } catch (e) {
    console.error('[linear] search', (e as Error).message)
    res.status(502).json({ error: (e as Error).message })
  }
})

const PUSH_ACTIONS = ['comment', 'subissue', 'issue'] as const
type PushAction = (typeof PUSH_ACTIONS)[number]

app.post('/api/comments/:id/linear', requireAuth, async (req, res) => {
  const comment = listComments().find((c) => c.id === req.params.id)
  if (!comment) return res.status(404).json({ error: 'not found' })
  const body = (req.body ?? {}) as {
    issueRef?: string
    action?: string
    priority?: number
  }
  // A ticket chosen in the picker overrides the page's default data-linear-issue.
  const issueRef = body.issueRef || comment.issueRef || null
  const action: PushAction | null = PUSH_ACTIONS.includes(
    body.action as PushAction,
  )
    ? (body.action as PushAction)
    : null
  const priority =
    typeof body.priority === 'number' &&
    Number.isInteger(body.priority) &&
    body.priority >= 0 &&
    body.priority <= 4
      ? body.priority
      : null
  try {
    const userToken = decrypt(req.session.lt) // reviewer's Linear token (actor=user)
    const result = await pushToLinear(
      { ...comment, issueRef },
      { userToken, baseUrl: baseUrl(req), action, priority },
    )
    const updated = updateComment(comment.id, {
      linear: result.issue,
      issueRef,
    })
    broadcast(comment.url, { type: 'comment:update', comment: updated })
    res.json(result)
  } catch (e) {
    console.error('[linear]', (e as Error).message)
    res.status(502).json({ error: (e as Error).message })
  }
})

// Screenshots. Filenames are unguessable UUIDs; served with a locked-down
// Content-Type + nosniff so a stored file can never execute as script/HTML.
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Disposition', 'inline')
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    },
  }),
)
// `no-cache` = browsers must revalidate (ETag/304) before reusing a cached
// copy, so overlay.js updates are picked up on refresh instead of a stale
// script silently serving until the heuristic cache expires.
app.use(
  express.static(PUBLIC_DIR, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache')
    },
  }),
)

// ======================================================================
//  WebSocket — live cursors + presence (also gated)
// ======================================================================

const server = createServer(app)
const wss = new WebSocketServer({
  server,
  path: '/ws',
  // Reject cross-origin WS handshakes from non-allowlisted origins up front.
  // (Every message is still token-gated below; this is defence in depth.)
  verifyClient: (info: { origin?: string }) =>
    !info.origin || isAllowedOrigin(info.origin),
})
type PeerMeta = {
  url: string | null
  user: {
    id: string
    name: string
    color: string
    avatarUrl?: string | null
  } | null
  authed: boolean
}
type Peer = import('ws').WebSocket & { meta: PeerMeta }
const rooms = new Map<string, Set<Peer>>() // url -> peers

function broadcast(url: string, payload: unknown, except?: Peer): void {
  const peers = rooms.get(url)
  if (!peers) return
  const msg = JSON.stringify(payload)
  for (const ws of peers)
    if (ws !== except && ws.readyState === ws.OPEN) ws.send(msg)
}

wss.on('connection', (rawWs) => {
  const ws = rawWs as Peer
  ws.meta = { url: null, user: null, authed: false }

  ws.on('message', (raw) => {
    let msg: {
      type?: string
      token?: unknown
      url?: string
      x?: number
      y?: number
    }
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'join') {
      // identity + auth come from the verified token, never from client-supplied fields
      const session = verifyJWT(msg.token)
      if (!session || !msg.url) {
        ws.send(JSON.stringify({ type: 'unauthorized' }))
        return ws.close()
      }
      ws.meta.authed = true
      // On SPA navigation the client re-joins with a new url. Leave the old
      // room first so this socket stops receiving the previous page's cursor
      // events (otherwise it lingers in both rooms).
      if (ws.meta.url && ws.meta.url !== msg.url) {
        const prev = rooms.get(ws.meta.url)
        if (prev) {
          prev.delete(ws)
          broadcast(ws.meta.url, { type: 'leave', user: ws.meta.user })
          if (prev.size === 0) rooms.delete(ws.meta.url)
        }
      }
      ws.meta.url = msg.url
      ws.meta.user = {
        id: session.sub,
        name: session.name,
        color: session.color,
        avatarUrl: session.avatarUrl || null,
      }
      const room = rooms.get(msg.url) ?? new Set<Peer>()
      rooms.set(msg.url, room)
      room.add(ws)
      const others = [...room]
        .filter((p) => p !== ws && p.meta.user)
        .map((p) => p.meta.user)
      ws.send(JSON.stringify({ type: 'presence', users: others }))
      broadcast(msg.url, { type: 'join', user: ws.meta.user }, ws)
      return
    }

    if (!ws.meta.authed) return // ignore everything until joined with a valid token

    if (msg.type === 'cursor' && ws.meta.url) {
      broadcast(
        ws.meta.url,
        { type: 'cursor', user: ws.meta.user, x: msg.x, y: msg.y },
        ws,
      )
    }
  })

  ws.on('close', () => {
    const { url, user } = ws.meta
    const room = url ? rooms.get(url) : undefined
    if (url && room) {
      room.delete(ws)
      broadcast(url, { type: 'leave', user })
      if (room.size === 0) rooms.delete(url)
    }
  })
})

function lanIp(): string | null {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address
    }
  }
  return null
}

// Bind on 0.0.0.0 so other machines on the network can reach it.
server.listen(PORT, '0.0.0.0', () => {
  const mode = oauthConfigured()
    ? 'Linear OAuth'
    : devAllowed()
      ? 'DEV (no OAuth configured)'
      : 'LOCKED'
  const ip = lanIp()
  console.log(`\n  DQA overlay service → http://localhost:${PORT}`)
  if (ip)
    console.log(
      `  On this network     → http://${ip}:${PORT}   (use this in VITE_DQA_URL on other machines)`,
    )
  console.log(`  Demo page           → http://localhost:${PORT}/demo.html`)
  console.log(`  Auth                → ${mode}`)
  console.log(
    `  Linear push         → ${oauthConfigured() ? 'as signed-in user' : (process.env.LINEAR_DRY_RUN ?? 'true') !== 'false' ? 'DRY RUN' : 'app key'}\n`,
  )
})
