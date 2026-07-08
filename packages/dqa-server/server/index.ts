import "./load-env.ts"; // must be first — populates process.env before other modules read it
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { WebSocketServer } from "ws";

import {
  buildAuthorizeUrl, checkWhitelist, decrypt, devAllowed, exchangeCode,
  fetchViewer, isAllowedOrigin, makeDevSession, makeSession, oauthConfigured,
  requireAuth, revoke, safeOrigin, safeReturnUrl, signJWT, verifyJWT,
} from "./auth.ts";
import { addComment, addReply, listComments, removeComment, updateComment } from "./db.ts";
import { checkLinearStatus, pushToLinear, searchIssues } from "./linear.ts";
import type { Comment, Inspect, StyleEdit } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = resolve(__dirname, "../public");
const UPLOAD_DIR = resolve(__dirname, "../data/uploads");
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "2mb" }));

// CORS: reflect the request origin only when it's on the allowlist. Auth is
// Bearer-token (never cookies), so we never send credentials; an un-allowed
// origin simply gets no CORS headers and the browser blocks the response.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Uploads: images only, with a server-forced safe extension. Prevents an
// attacker uploading e.g. .html and having it served (as text/html) from the
// DQA origin — the filename never derives from client input.
const ALLOWED_IMAGE_EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp" };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID() + (ALLOWED_IMAGE_EXT[file.mimetype] || ".bin")),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, !!ALLOWED_IMAGE_EXT[file.mimetype]),
});

const baseUrl = (req: any): string => `${req.protocol}://${req.get("host")}`;
const esc = (s: unknown): string => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// ======================================================================
//  AUTH
// ======================================================================

app.get("/auth/config", (_req, res) => {
  res.json({ oauthConfigured: oauthConfigured(), devAllowed: devAllowed() });
});

// Resolve + validate the caller-supplied origin/returnUrl against the
// allowlist so a crafted `?returnUrl=` can never redirect the token elsewhere.
function resolveReturn(req) {
  const origin = safeOrigin(req.query.origin) || safeOrigin(req.headers.referer);
  const returnUrl =
    safeReturnUrl(req.query.returnUrl) ||
    safeReturnUrl(req.headers.referer) ||
    (origin ? `${origin}/demo.html` : null);
  return { origin, returnUrl };
}

app.get("/auth/linear", (req, res) => {
  if (!oauthConfigured()) return res.status(400).send("Linear OAuth is not configured.");
  const { origin, returnUrl } = resolveReturn(req);
  if (!origin) return res.status(400).send("Origin not allowed. Set DQA_ALLOWED_ORIGINS.");
  const state = signJWT({ origin, returnUrl, n: randomUUID() }, 600);
  res.redirect(buildAuthorizeUrl(state));
});

/** Popup helper when the user needs to log out of Linear and sign in with another account. */
app.get("/auth/account-switch", (req, res) => {
  if (!oauthConfigured()) return res.status(400).send("Linear OAuth is not configured.");
  const { origin, returnUrl } = resolveReturn(req);
  if (!origin) return res.status(400).send("Origin not allowed. Set DQA_ALLOWED_ORIGINS.");
  const state = signJWT({ origin, returnUrl, n: randomUUID() }, 600);
  const loginUrl = buildAuthorizeUrl(state);
  res.set("Content-Type", "text/html").send(`<!doctype html><meta charset=utf-8>
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
</body>`);
});

function popupResult(res, payload, targetOrigin, returnUrl) {
  // targetOrigin/returnUrl are pre-validated against the allowlist by callers.
  // Never fall back to "*": that would broadcast the token to any opener.
  res.set("Content-Type", "text/html").send(`<!doctype html><meta charset=utf-8>
<body style="font:14px -apple-system,sans-serif;padding:24px;color:#111827">
${payload.token ? "Signed in. Returning…" : "Access denied: " + esc(payload.error || "")}
<script>
(function () {
  var payload = ${JSON.stringify(payload)};
  var targetOrigin = ${JSON.stringify(targetOrigin || "")};
  var returnUrl = ${JSON.stringify(returnUrl || targetOrigin || "/")};
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
</script></body>`);
}

app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  const st = verifyJWT(state);
  if (!code || !st) return popupResult(res, { error: "invalid state" }, null, null);
  // Re-validate the state's origin/returnUrl at redemption: the token is only
  // ever posted to / redirected to an allowlisted origin, never a bare "*".
  const origin = safeOrigin(st.origin);
  const returnUrl = safeReturnUrl(st.returnUrl);
  if (!origin) return popupResult(res, { error: "origin not allowed" }, null, null);
  try {
    const tok = await exchangeCode(code);
    const viewer = await fetchViewer(tok.access_token);
    const gate = await checkWhitelist(viewer, tok.access_token);
    if (!gate.ok) return popupResult(res, { error: gate.reason }, origin, returnUrl);
    const token = makeSession(viewer, tok.access_token);
    return popupResult(res, { token }, origin, returnUrl);
  } catch (e) {
    console.error("[auth] callback", e.message);
    return popupResult(res, { error: "sign-in failed" }, origin, returnUrl);
  }
});

// Dev login — only when OAuth isn't configured or DQA_DEV_AUTH=true.
app.get("/auth/dev", (req, res) => {
  if (!devAllowed()) return res.status(403).json({ error: "dev auth disabled" });
  res.json({ token: makeDevSession((req.query.name || "Dev").toString().slice(0, 40)) });
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  const lt = decrypt(req.session.lt);
  if (lt) await revoke(lt);
  res.json({ ok: true });
});

// who am I (handy for the overlay to validate its token)
app.get("/auth/me", requireAuth, (req, res) => {
  const { sub, name, email, color, orgId, dev } = req.session;
  res.json({ id: sub, name, email, color, orgId, dev });
});

// ======================================================================
//  API  (all gated)
// ======================================================================

// How often we re-verify that pushed comments/issues still exist in Linear.
const LINEAR_CHECK_INTERVAL_MS = 60_000;

app.get("/api/comments", requireAuth, async (req, res) => {
  const comments = listComments(req.query.url);
  // Lazily detect Linear-side deletions using the reviewer's token (no-op for
  // dev sessions). Throttled per comment; failures leave the state untouched.
  const token = decrypt(req.session.lt);
  if (token) {
    const now = Date.now();
    const due = comments.filter(
      (c) => c.linear && !c.linearDeleted && (!c.linearCheckedAt || now - c.linearCheckedAt > LINEAR_CHECK_INTERVAL_MS),
    );
    await Promise.all(due.map(async (c) => {
      const status = await checkLinearStatus(c.linear, token);
      updateComment(c.id, {
        linearCheckedAt: now,
        ...(status === "deleted" ? { linearDeleted: true } : {}),
      });
      if (status === "deleted") broadcast(c.url, { type: "comment:update", comment: c });
    }));
  }
  res.json(listComments(req.query.url));
});

app.delete("/api/comments/:id", requireAuth, (req, res) => {
  const removed = removeComment(req.params.id);
  if (!removed) return res.status(404).json({ error: "not found" });
  broadcast(removed.url, { type: "comment:delete", id: removed.id });
  res.json({ ok: true });
});

// Cap client-supplied inspection payloads (component snapshot + style edits).
function sanitizeInspect(inspect: any): Inspect | null {
  if (!inspect || typeof inspect !== "object") return null;
  try { if (JSON.stringify(inspect).length > 8000) return null; } catch { return null; }
  return {
    tag: String(inspect.tag || "").slice(0, 40),
    id: inspect.id ? String(inspect.id).slice(0, 120) : null,
    classes: Array.isArray(inspect.classes) ? inspect.classes.slice(0, 60).map((c) => String(c).slice(0, 120)) : [],
    styles: inspect.styles && typeof inspect.styles === "object"
      ? Object.fromEntries(Object.entries(inspect.styles).slice(0, 30).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 200)]))
      : {},
    props: inspect.props && typeof inspect.props === "object"
      ? Object.fromEntries(Object.entries(inspect.props).slice(0, 30).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 200)]))
      : null,
    componentPath: inspect.componentPath ? String(inspect.componentPath).slice(0, 200) : null,
    viewport: inspect.viewport ? String(inspect.viewport).slice(0, 60) : null,
    text: inspect.text ? String(inspect.text).slice(0, 120) : null,
  };
}
function sanitizeStyleEdits(edits: any): StyleEdit[] | null {
  if (!Array.isArray(edits)) return null;
  const out = edits.slice(0, 40).map((e: any) => ({
    prop: String(e?.prop ?? "").slice(0, 60),
    from: String(e?.from ?? "").slice(0, 300),
    to: String(e?.to ?? "").slice(0, 300),
  })).filter((e) => e.prop);
  return out.length ? out : null;
}

app.post("/api/comments", requireAuth, (req, res) => {
  const { url, body, anchor, imageUrl, afterImageUrl, issueRef, inspect, styleEdits } = req.body || {};
  if (!url || !body) return res.status(400).json({ error: "url and body required" });
  const comment = {
    id: randomUUID(),
    url,
    author: req.session.name,        // identity comes from the session, not the client
    authorId: req.session.sub,
    body,
    anchor: anchor || null,
    imageUrl: imageUrl || null,
    // "after" element screenshot with suggested style edits applied
    afterImageUrl: typeof afterImageUrl === "string" && afterImageUrl.startsWith("/uploads/") ? afterImageUrl : null,
    issueRef: issueRef || null,      // e.g. "ENG-123" from the page's data-linear-issue
    inspect: sanitizeInspect(inspect),
    styleEdits: sanitizeStyleEdits(styleEdits),
    status: "open",
    replies: [],
    linear: null,
    createdAt: new Date().toISOString(),
  };
  addComment(comment);
  broadcast(url, { type: "comment:new", comment });
  res.json(comment);
});

app.post("/api/comments/:id/reply", requireAuth, (req, res) => {
  const updated = addReply(req.params.id, {
    id: randomUUID(),
    author: req.session.name,
    body: req.body?.body,
    createdAt: new Date().toISOString(),
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  broadcast(updated.url, { type: "comment:update", comment: updated });
  res.json(updated);
});

app.post("/api/comments/:id/resolve", requireAuth, (req, res) => {
  const updated = updateComment(req.params.id, { status: "resolved" });
  if (!updated) return res.status(404).json({ error: "not found" });
  broadcast(updated.url, { type: "comment:update", comment: updated });
  res.json(updated);
});

app.post("/api/upload", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// Search the reviewer's Linear issues for the ticket picker.
app.get("/api/linear/issues", requireAuth, async (req, res) => {
  try {
    const userToken = decrypt(req.session.lt);
    const issues = await searchIssues((req.query.term || "").toString().trim(), userToken);
    res.json({ issues, dev: !userToken });
  } catch (e) {
    console.error("[linear] search", e.message);
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/comments/:id/linear", requireAuth, async (req, res) => {
  const comment = listComments().find((c) => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: "not found" });
  // A ticket chosen in the picker overrides the page's default data-linear-issue.
  const issueRef = req.body?.issueRef || comment.issueRef || null;
  const action = ["comment", "subissue", "issue"].includes(req.body?.action) ? req.body.action : null;
  const priority = Number.isInteger(req.body?.priority) && req.body.priority >= 0 && req.body.priority <= 4
    ? req.body.priority : null;
  try {
    const userToken = decrypt(req.session.lt); // reviewer's Linear token (actor=user)
    const result = await pushToLinear({ ...comment, issueRef }, { userToken, baseUrl: baseUrl(req), action, priority });
    const updated = updateComment(comment.id, { linear: result.issue, issueRef });
    broadcast(comment.url, { type: "comment:update", comment: updated });
    res.json(result);
  } catch (e) {
    console.error("[linear]", e.message);
    res.status(502).json({ error: e.message });
  }
});

// Screenshots. Filenames are unguessable UUIDs; served with a locked-down
// Content-Type + nosniff so a stored file can never execute as script/HTML.
app.use("/uploads", express.static(UPLOAD_DIR, {
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  },
}));
app.use(express.static(PUBLIC_DIR));

// ======================================================================
//  WebSocket — live cursors + presence (also gated)
// ======================================================================

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/ws",
  // Reject cross-origin WS handshakes from non-allowlisted origins up front.
  // (Every message is still token-gated below; this is defence in depth.)
  verifyClient: ({ origin }) => !origin || isAllowedOrigin(origin),
});
type PeerMeta = {
  url: string | null;
  user: { id: string; name: string; color: string } | null;
  authed: boolean;
};
type Peer = import("ws").WebSocket & { meta: PeerMeta };
const rooms = new Map<string, Set<Peer>>(); // url -> peers

function broadcast(url: string, payload: unknown, except?: Peer): void {
  const peers = rooms.get(url);
  if (!peers) return;
  const msg = JSON.stringify(payload);
  for (const ws of peers) if (ws !== except && ws.readyState === ws.OPEN) ws.send(msg);
}

wss.on("connection", (rawWs) => {
  const ws = rawWs as Peer;
  ws.meta = { url: null, user: null, authed: false };

  ws.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "join") {
      // identity + auth come from the verified token, never from client-supplied fields
      const session = verifyJWT(msg.token);
      if (!session) { ws.send(JSON.stringify({ type: "unauthorized" })); return ws.close(); }
      ws.meta.authed = true;
      ws.meta.url = msg.url;
      ws.meta.user = { id: session.sub, name: session.name, color: session.color };
      if (!rooms.has(msg.url)) rooms.set(msg.url, new Set());
      rooms.get(msg.url).add(ws);
      const others = [...rooms.get(msg.url)].filter((p) => p !== ws && p.meta.user).map((p) => p.meta.user);
      ws.send(JSON.stringify({ type: "presence", users: others }));
      broadcast(msg.url, { type: "join", user: ws.meta.user }, ws);
      return;
    }

    if (!ws.meta.authed) return; // ignore everything until joined with a valid token

    if (msg.type === "cursor" && ws.meta.url) {
      broadcast(ws.meta.url, { type: "cursor", user: ws.meta.user, x: msg.x, y: msg.y }, ws);
    }
  });

  ws.on("close", () => {
    const { url, user } = ws.meta;
    if (url && rooms.has(url)) {
      rooms.get(url).delete(ws);
      broadcast(url, { type: "leave", user });
      if (rooms.get(url).size === 0) rooms.delete(url);
    }
  });
});

function lanIp() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

// Bind on 0.0.0.0 so other machines on the network can reach it.
server.listen(PORT, "0.0.0.0", () => {
  const mode = oauthConfigured() ? "Linear OAuth" : (devAllowed() ? "DEV (no OAuth configured)" : "LOCKED");
  const ip = lanIp();
  console.log(`\n  DQA overlay service → http://localhost:${PORT}`);
  if (ip) console.log(`  On this network     → http://${ip}:${PORT}   (use this in VITE_DQA_URL on other machines)`);
  console.log(`  Demo page           → http://localhost:${PORT}/demo.html`);
  console.log(`  Auth                → ${mode}`);
  console.log(`  Linear push         → ${oauthConfigured() ? "as signed-in user" : ((process.env.LINEAR_DRY_RUN ?? "true") !== "false" ? "DRY RUN" : "app key")}\n`);
});
