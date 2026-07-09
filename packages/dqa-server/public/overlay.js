/* DQA Overlay — inject on any page with:
 *   <script src="http://localhost:4000/overlay.js" data-linear-issue="ENG-123"></script>
 * Legacy mode: floating sign-in card + toolbar (demo.html, manual embed).
 * DevDrawer mode: set window.__DQA_EMBED__ = "drawer" or data-embed="drawer" on the
 * script tag — only pins, cursors, and comment popovers render; auth UI lives in DevDrawer.
 */
(function () {
  if (window.__DQA_OVERLAY__) {
    if (window.__DQA__) return;
    document.getElementById("dqa-overlay-host")?.remove();
    delete window.__DQA_OVERLAY__;
  }
  window.__DQA_OVERLAY__ = true;

  const self =
    document.currentScript ||
    [...document.scripts].reverse().find((s) => /overlay\.js/.test(s.src));
  const API = self ? new URL(self.src, location.href).origin : location.origin;
  const WS_URL = API.replace(/^http/, "ws") + "/ws";
  // Comments are scoped per page. In a SPA the route changes without a reload,
  // so PAGE_URL must be recomputed on every navigation (see the history hooks
  // near the bottom) — never cached as a constant.
  let PAGE_URL = location.origin + location.pathname;
  const ISSUE_REF = self ? self.getAttribute("data-linear-issue") : null; // e.g. "ENG-123"
  /** DevDrawer embed — legacy floating sign-in/toolbar disabled. */
  const EMBED =
    window.__DQA_EMBED__ === "drawer" ||
    !!(self && self.getAttribute("data-embed") === "drawer");

  let TOKEN = null;
  try { TOKEN = localStorage.getItem("dqa_token"); } catch {}
  let USER = null;

  // ---- shadow-root host -------------------------------------------------
  const host = document.createElement("div");
  host.id = "dqa-overlay-host";
  // Above the host app, but BELOW the DevDrawer sheet (z 2147483640) and its
  // trigger (z 2147483645) — pins/cursors/popovers must never cover the drawer.
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483600;pointer-events:none;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        -webkit-font-smoothing: antialiased; }
      /* dark theme (default) */
      :host { --ink:#e5e7eb; --muted:#9ca3af; --line:#374151; --surface:#111827; --subtle:#1f2937; --accent:#3b82f6;
        --pin-bg:#111827; --pin-fg:#ffffff; --btn-bg:#3b82f6; --btn-fg:#ffffff; }
      :host(.light) { --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --surface:#fff; --subtle:#f9fafb; --accent:#2563eb;
        --pin-bg:#111827; --pin-fg:#ffffff; --btn-bg:#111827; --btn-fg:#ffffff; }
      .layer { position: fixed; inset: 0; pointer-events: none; }
      .hl { position: absolute; pointer-events: none; border: 1.5px solid var(--accent);
        border-radius: 4px; background: rgba(37,99,235,.06); transition: all .04s linear; display: none; }
      .hl-label { position: absolute; left: 0; top: -20px; font-size: 11px; font-weight: 600;
        color: #fff; background: var(--accent); padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
      .pin { position: absolute; width: 24px; height: 24px; margin-top: -24px;
        border-radius: 50% 50% 50% 2px; background: var(--pin-bg); color: var(--pin-fg);
        display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
        cursor: pointer; pointer-events: auto; box-shadow: 0 1px 4px rgba(0,0,0,.25); border: 1.5px solid #fff; }
      .pin.resolved { background: var(--surface); color: var(--muted); border-color: var(--line); box-shadow: none; }
      .cursor { position: absolute; pointer-events: none; transition: transform .06s linear; }
      .cursor svg { display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,.25)); }
      .cursor .tag { position: absolute; left: 13px; top: 13px; white-space: nowrap;
        font-size: 11px; font-weight: 600; color: #fff; padding: 1px 6px; border-radius: 4px; }
      .toolbar { position: fixed; bottom: 18px; right: 18px; pointer-events: auto;
        background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 10px;
        padding: 6px; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
      .toolbar .mode { all: unset; cursor: pointer; font-size: 13px; font-weight: 600; padding: 7px 12px;
        border-radius: 7px; color: var(--ink); background: var(--subtle); display: flex; align-items: center; gap: 6px; }
      .toolbar .mode.active { background: var(--ink); color: #fff; }
      .presence { display: flex; align-items: center; padding-left: 2px; }
      .avatar { width: 22px; height: 22px; border-radius: 50%; margin-left: -5px; border: 2px solid var(--surface);
        display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; }
      .count { font-size: 12px; color: var(--muted); padding: 0 6px; }
      .icon-btn { all: unset; cursor: pointer; color: var(--muted); font-size: 12px; padding: 6px; border-radius: 6px; }
      .icon-btn:hover { background: var(--subtle); color: var(--ink); }
      .popover { position: absolute; pointer-events: auto; width: 348px; background: var(--surface); color: var(--ink);
        border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.16); border: 1px solid var(--line); overflow: hidden;
        max-height: 85vh; display: flex; flex-direction: column; }
      .popover .head { padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 12px; color: var(--muted);
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
      /* default body: scroll the whole body within the capped popover (compose) */
      .popover .body { flex: 1; min-height: 0; overflow-y: auto; }
      /* thread body: messages+summaries scroll, reply+actions stay pinned */
      .popover .body.body-thread { overflow: hidden; display: flex; flex-direction: column; }
      .body-thread .context { flex-shrink: 0; max-height: 34%; overflow-y: auto; }
      .body-thread .thread-scroll { flex: 1; min-height: 60px; overflow-y: auto; }
      .body-thread .reply-area { flex-shrink: 0; border-top: 1px solid var(--line); padding-top: 8px; margin-top: 8px; }
      .body-thread .reply-area .row.actions { margin-top: 8px; padding-top: 0; border-top: none; }
      .popover .head .sel { font-family: ui-monospace, monospace; color: var(--ink); max-width: 190px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: right; }
      .popover .head .head-x { all: unset; cursor: pointer; margin-left: 8px; color: var(--muted);
        font-size: 12px; line-height: 1; padding: 3px 5px; border-radius: 5px; flex-shrink: 0; }
      .popover .head .head-x:hover { background: var(--subtle); color: var(--ink); }
      .popover .body { padding: 12px; }
      .row.actions { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
      .thread { display: flex; flex-direction: column; gap: 12px; padding: 2px 0; }
      .msg { display: flex; gap: 8px; align-items: flex-start; }
      .msg .av { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 700;
        text-transform: uppercase; margin-top: 1px; }
      .msg .bubble { flex: 1; min-width: 0; }
      .msg .meta { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
      .msg .who { font-size: 12px; font-weight: 700; color: var(--ink); }
      .msg .when { font-size: 10px; color: var(--muted); }
      .msg .txt { font-size: 13px; white-space: pre-wrap; line-height: 1.45; word-wrap: break-word; }
      .msg.first .txt { background: var(--subtle); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; }
      .msg img { max-width: 100%; border-radius: 6px; margin-top: 6px; }
      textarea { width: 100%; min-height: 58px; border: 1px solid var(--line); border-radius: 8px; padding: 8px;
        font-size: 13px; resize: vertical; font-family: inherit; color: var(--ink); background: var(--subtle); }
      textarea:focus { outline: none; border-color: var(--accent); }
      .row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
      .row .spacer { flex: 1; }
      .file { font-size: 12px; color: var(--muted); max-width: 150px; }
      .btn { all: unset; box-sizing: border-box; cursor: pointer; font-size: 13px; font-weight: 600; padding: 7px 12px; border-radius: 7px; white-space: nowrap; }
      .btn.primary { background: var(--btn-bg); color: var(--btn-fg); }
      .btn.ghost { color: var(--muted); }
      .btn.ghost:hover { background: var(--subtle); }
      .btn.link { color: var(--ink); border: 1px solid var(--line); }
      .btn.link:hover { background: var(--subtle); }
      .badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600;
        color: var(--muted); text-decoration: none; padding: 6px 4px; }
      .badge.done { color: var(--ink); }
      .thumb { max-width: 100%; border-radius: 6px; margin-top: 6px; }
      /* ticket picker */
      .picker-search { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px;
        font-size: 13px; font-family: inherit; color: var(--ink); background: var(--subtle); }
      .picker-search:focus { outline: none; border-color: var(--accent); }
      .picker-list { max-height: 220px; overflow: auto; margin-top: 8px; }
      .picker-item { display: flex; gap: 8px; align-items: baseline; padding: 8px; border-radius: 7px; cursor: pointer; }
      .picker-item:hover { background: var(--subtle); }
      .picker-item .pid { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); flex-shrink: 0; }
      .picker-item .pt { font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .picker-empty { font-size: 12px; color: var(--muted); padding: 10px 4px; }
      .opt { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); cursor: pointer; user-select: none; }
      .opt input { margin: 0; cursor: pointer; }
      .hint { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); pointer-events: none;
        background: #fff; color: #111827; font-size: 12px; font-weight: 500; padding: 6px 14px; border-radius: 20px;
        border: 1px solid var(--line); box-shadow: 0 4px 14px rgba(0,0,0,.18); }
      /* sign-in card */
      .signin { position: fixed; bottom: 18px; right: 18px; pointer-events: auto; width: 260px;
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px;
        box-shadow: 0 6px 24px rgba(0,0,0,.12); }
      .signin h4 { margin: 0 0 4px; font-size: 14px; color: var(--ink); }
      .signin p { margin: 0 0 12px; font-size: 12px; color: var(--muted); line-height: 1.4; }
      .signin .btn { display: block; width: 100%; text-align: center; margin-top: 8px; }
      .signin .err { color: #be123c; font-size: 12px; margin-top: 8px; }
      /* component inspector */
      .inspect { margin-top: 10px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
      .i-tabs { display: flex; border-bottom: 1px solid var(--line); background: var(--subtle); }
      .i-tab { all: unset; cursor: pointer; flex: 1; text-align: center; font-size: 11px; font-weight: 600;
        padding: 6px 0; color: var(--muted); }
      .i-tab.active { color: var(--ink); background: var(--surface); }
      .i-body { max-height: 150px; overflow: auto; padding: 8px; }
      .i-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
      .i-row label { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); width: 112px; flex-shrink: 0; }
      .i-row input { flex: 1; min-width: 0; border: 1px solid var(--line); border-radius: 5px; padding: 3px 6px;
        font-size: 11px; font-family: ui-monospace, monospace; color: var(--ink); background: var(--subtle); }
      .i-row input:focus { outline: none; border-color: var(--accent); }
      .i-row input.edited, .i-row select.edited { border-color: var(--accent); color: var(--accent); }
      .i-row input.i-color { flex: 0 0 26px; width: 26px; height: 22px; padding: 0; border-radius: 5px; cursor: pointer; background: none; }
      .i-row input.i-num { flex: 1; }
      .i-row select.i-unit { flex: 0 0 52px; border: 1px solid var(--line); border-radius: 5px; padding: 3px 4px;
        font-size: 11px; font-family: ui-monospace, monospace; color: var(--ink); background: var(--subtle); }
      /* highlight-all outlines */
      .outline-all { position: absolute; pointer-events: auto; border: 1px solid rgba(59,130,246,.55);
        background: rgba(59,130,246,.05); border-radius: 2px; cursor: pointer; }
      .outline-all:hover { border-color: var(--accent); background: rgba(59,130,246,.14); }
      .outline-all .oa-tag { position: absolute; left: 0; top: -15px; font-size: 9px; font-weight: 600; color: #fff;
        background: var(--accent); padding: 0 4px; border-radius: 3px; white-space: nowrap; max-width: 180px;
        overflow: hidden; text-overflow: ellipsis; }
      .class-input { width: 100%; margin-top: 6px; border: 1px solid var(--line); border-radius: 5px; padding: 4px 6px;
        font-size: 11px; font-family: ui-monospace, monospace; color: var(--ink); background: var(--subtle); }
      .class-input:focus { outline: none; border-color: var(--accent); }
      .chip { display: inline-block; font-family: ui-monospace, monospace; font-size: 10.5px; background: var(--subtle);
        border: 1px solid var(--line); color: var(--ink); border-radius: 4px; padding: 1px 5px; margin: 0 4px 4px 0; }
      .i-kv { font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.6; word-break: break-all; }
      .i-kv b { color: var(--accent); font-weight: 600; }
      .i-empty { font-size: 11px; color: var(--muted); }
      .i-note { font-size: 10.5px; color: var(--muted); padding: 6px 8px; border-top: 1px solid var(--line); }
      .i-summary { margin-top: 8px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; }
      .i-k { font-size: 11px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
      .i-edit { font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.7; }
      .i-edit s { color: var(--muted); }
      .i-edit b { color: var(--accent); }
      .theme-btn { all: unset; cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 5px; color: var(--muted); }
      .theme-btn:hover { background: var(--subtle); color: var(--ink); }
      .i-details { margin-top: 8px; border: 1px solid var(--line); border-radius: 8px; }
      .i-details summary { cursor: pointer; padding: 7px 8px; font-size: 11px; font-weight: 600;
        color: var(--ink); user-select: none; list-style: none; }
      .i-details summary::before { content: "▸ "; }
      .i-details[open] summary::before { content: "▾ "; }
      .i-details .i-inner { padding: 0 8px 8px; max-height: 140px; overflow: auto; }
      .shot-label { font-size: 11px; font-weight: 600; color: var(--ink); margin-top: 8px; }
      .prio { border: 1px solid var(--line); border-radius: 5px; background: var(--subtle); color: var(--ink);
        font-size: 11px; padding: 3px 4px; font-family: inherit; }
      .action-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
    </style>
    <div class="layer" id="pins"></div>
    <div class="layer" id="outline-all"></div>
    <div class="layer" id="hl-layer"><div class="hl" id="hl"><span class="hl-label" id="hl-label"></span></div></div>
    <div class="layer" id="cursors"></div>
    <div id="ui"></div>
  `;

  const pinsLayer = root.getElementById("pins");
  const outlineLayer = root.getElementById("outline-all");
  const cursorsLayer = root.getElementById("cursors");
  const hlBox = root.getElementById("hl");
  const hlLabel = root.getElementById("hl-label");
  const ui = root.getElementById("ui");
  ui.style.pointerEvents = "none";
  const styleFix = document.createElement("style");
  styleFix.textContent = ".toolbar,.popover,.pin,.signin{pointer-events:auto!important;}";
  root.appendChild(styleFix);
  if (EMBED) {
    const embedHide = document.createElement("style");
    embedHide.textContent =
      ".signin,.toolbar{display:none!important;visibility:hidden!important;pointer-events:none!important;}";
    root.appendChild(embedHide);
  }

  // ---- theme (dark default, persisted) -----------------------------------
  let THEME = "dark";
  try { THEME = localStorage.getItem("dqa_theme") === "light" ? "light" : "dark"; } catch {}
  function applyTheme() { host.classList.toggle("light", THEME === "light"); }
  function setTheme(t) {
    THEME = t === "light" ? "light" : "dark";
    try { localStorage.setItem("dqa_theme", THEME); } catch {}
    applyTheme();
    notifyState();
  }
  applyTheme();

  let commentMode = false, comments = [], activeCommentId = null, activePopover = null, draft = null, hoverEl = null, pinnedEl = null, ws = null;
  let showResolved = false;
  try { showResolved = localStorage.getItem("dqa_show_resolved") === "1"; } catch {}
  let authConf = { oauthConfigured: false, devAllowed: true };
  let signInError = null;
  let ready = false;
  let loading = true;
  const listeners = new Set();

  function getOpenCount() {
    return comments.filter((c) => c.status !== "resolved").length;
  }

  function serializeComments() {
    return comments.map((c, i) => ({
      id: c.id,
      pinIndex: i + 1,
      body: c.body,
      author: c.author,
      authorId: c.authorId || null,
      status: c.status === "resolved" ? "resolved" : "open",
      anchorLabel: (c.anchor && c.anchor.label) || "",
      replyCount: (c.replies || []).length,
      createdAt: c.createdAt || new Date().toISOString(),
      issueRef: c.issueRef || null,
      linear: c.linear || null,
      linearDeleted: !!c.linearDeleted,
    }));
  }

  function getPresenceUsers() {
    if (!USER) return [];
    const users = [{ id: USER.id || "self", name: USER.name, color: USER.color || "#111827" }];
    cursorEls.forEach((el) => {
      const tag = el.querySelector(".tag");
      if (!tag) return;
      users.push({
        id: tag.textContent || "peer",
        name: tag.textContent || "Peer",
        color: tag.style.background || "#777",
      });
    });
    return users;
  }

  function getState() {
    return {
      ready,
      loading,
      authenticated: !!(TOKEN && USER),
      user: USER,
      commentMode,
      openCount: getOpenCount(),
      presence: getPresenceUsers(),
      authConfig: authConf,
      signInError,
      comments: serializeComments(),
      activeCommentId,
      pageIssueRef: ISSUE_REF,
      theme: THEME,
      showResolved,
      outlineAll,
      pageUrl: PAGE_URL,
    };
  }

  function notifyState() {
    const state = getState();
    listeners.forEach((cb) => {
      try { cb(state); } catch {}
    });
  }

  async function fetchAuthConfig() {
    try { authConf = await (await fetch(API + "/auth/config")).json(); } catch {}
    notifyState();
    return authConf;
  }

  async function devLogin(name) {
    const devName = (name && String(name).trim()) || "Dev";
    signInError = null;
    try {
      const r = await fetch(API + "/auth/dev?name=" + encodeURIComponent(devName));
      const d = await r.json();
      if (d.token) { setToken(d.token); USER = null; await init(); }
      else showSignIn("dev login failed");
    } catch { showSignIn("dev login failed"); }
  }

  // ---- auth-aware fetch -------------------------------------------------
  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    if (res.status === 401) { signOut(); throw new Error("unauthorized"); }
    return res;
  }

  // ======================================================================
  //  AUTH
  // ======================================================================
  function setToken(t) {
    TOKEN = t;
    try { t ? localStorage.setItem("dqa_token", t) : localStorage.removeItem("dqa_token"); } catch {}
  }

  async function init() {
    loading = true;
    notifyState();
    if (TOKEN) {
      try {
        const r = await fetch(API + "/auth/me", { headers: { Authorization: "Bearer " + TOKEN } });
        if (r.ok) { USER = await r.json(); loading = false; ready = true; notifyState(); return start(); }
      } catch {}
      setToken(null);
    }
    loading = false;
    ready = true;
    notifyState();
    showSignIn();
  }

  async function showSignIn(err) {
    teardown();
    signInError = err || null;
    await fetchAuthConfig();
    if (EMBED) {
      ui.style.pointerEvents = "none";
      notifyState();
      return;
    }
    const card = document.createElement("div");
    card.className = "signin";
    card.innerHTML = `
      <h4>Design QA</h4>
      <p>Sign in to leave comments on this page.</p>
      ${authConf.oauthConfigured ? '<button class="btn primary" data-act="linear">Sign in with Linear</button>' : ""}
      ${authConf.devAllowed ? `<button class="btn ${authConf.oauthConfigured ? "ghost" : "primary"}" data-act="dev">Continue in dev mode</button>` : ""}
      ${signInError ? `<div class="err">${esc(signInError)}</div>` : ""}`;
    ui.style.pointerEvents = "auto";
    ui.appendChild(card);
    const lin = card.querySelector('[data-act="linear"]');
    if (lin) lin.onclick = startLinearLogin;
    const dev = card.querySelector('[data-act="dev"]');
    if (dev) dev.onclick = async () => {
      const name = prompt("Dev mode — your name:", "") || "Dev";
      await devLogin(name);
    };
    notifyState();
  }

  function startLinearLogin() {
    openAuthPopup("/auth/linear");
  }

  function switchLinearAccount() {
    signInError = null;
    setToken(null);
    USER = null;
    notifyState();
    openAuthPopup("/auth/account-switch");
  }

  function openAuthPopup(authPath) {
    const returnUrl = location.href;
    const url = `${API}${authPath}?origin=${encodeURIComponent(location.origin)}&returnUrl=${encodeURIComponent(returnUrl)}`;
    const priorToken = TOKEN;
    let popup = null;
    let pollTimer = null;
    let done = false;

    function cleanup() {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("storage", onStorage);
      if (pollTimer) clearInterval(pollTimer);
    }

    function finishLogin(token, err) {
      if (done) return;
      done = true;
      cleanup();
      if (token) { setToken(token); USER = null; init(); }
      else if (err) showSignIn(err);
      try { popup && popup.close(); } catch {}
    }

    function onMsg(e) {
      if (e.origin !== API) return; // only trust messages from our own service
      if (e.data && e.data.token) finishLogin(e.data.token);
      else if (e.data && e.data.error) finishLogin(null, e.data.error);
    }

    function onStorage(e) {
      if (e.key !== "dqa_token" || !e.newValue || e.newValue === priorToken) return;
      finishLogin(e.newValue);
    }

    window.addEventListener("message", onMsg);
    window.addEventListener("storage", onStorage);

    popup = window.open(url, "dqa_login", "width=520,height=680");
    if (!popup) {
      // Popup blocked — continue in this tab; callback redirects back via returnUrl.
      location.href = url;
      return;
    }

    // Fallback when OAuth breaks window.opener (common after cross-site redirects).
    pollTimer = setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      pollTimer = null;
      try {
        const t = localStorage.getItem("dqa_token");
        if (t && t !== priorToken) finishLogin(t);
      } catch {}
    }, 400);
  }

  async function signOut() {
    try { await fetch(API + "/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + TOKEN } }); } catch {}
    setToken(null); USER = null;
    if (ws) { try { ws.close(); } catch {} ws = null; }
    cursorEls.forEach((el) => el.remove()); cursorEls.clear();
    comments = []; renderPins();
    showSignIn();
  }

  function teardown() {
    closePopover();
    root.querySelectorAll(".toolbar, .signin").forEach((node) => node.remove());
  }

  // ======================================================================
  //  start (post-auth)
  // ======================================================================
  function start() {
    teardown();
    ui.style.pointerEvents = "none";
    signInError = null;
    if (!EMBED) renderToolbar();
    else notifyState();
    loadComments();
    connect();
  }

  // ---- resilient element anchoring --------------------------------------
  const STABLE_ATTRS = ["data-testid", "data-test", "data-qa", "data-component", "data-cy", "id"];
  function buildSelector(el) {
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      for (const attr of STABLE_ATTRS) {
        const v = node.getAttribute && node.getAttribute(attr);
        if (v) return { selector: `[${attr}="${cssEscape(v)}"]`, label: node.getAttribute("data-component") || node.tagName.toLowerCase() };
      }
      node = node.parentElement;
    }
    const parts = [];
    node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return { selector: parts.join(" > "), label: el.tagName.toLowerCase() };
  }
  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }
  function captureAnchor(el, clientX, clientY) {
    const rect = el.getBoundingClientRect();
    const { selector, label } = buildSelector(el);
    return {
      selector, label,
      offsetX: rect.width ? (clientX - rect.left) / rect.width : 0.5,
      offsetY: rect.height ? (clientY - rect.top) / rect.height : 0.5,
      pageXPct: (clientX + window.scrollX) / document.documentElement.scrollWidth,
      pageYPct: (clientY + window.scrollY) / document.documentElement.scrollHeight,
    };
  }
  function resolveAnchor(anchor) {
    let el = null;
    try { el = document.querySelector(anchor.selector); } catch {}
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + anchor.offsetX * r.width, y: r.top + anchor.offsetY * r.height, el, found: true };
    }
    return {
      x: anchor.pageXPct * document.documentElement.scrollWidth - window.scrollX,
      y: anchor.pageYPct * document.documentElement.scrollHeight - window.scrollY, el: null, found: false,
    };
  }

  // ---- component inspection (classes, computed styles, React props) ------
  const INSPECT_PROPS = [
    "font-size", "font-weight", "line-height", "letter-spacing", "color",
    "background-color", "padding", "margin", "border-radius", "display",
    "align-items", "justify-content", "gap", "width", "height",
  ];
  function reactPropsOf(el) {
    try {
      let node = el;
      for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
        const key = Object.keys(node).find((k) => k.startsWith("__reactProps$"));
        if (!key) continue;
        const raw = node[key];
        const out = {};
        for (const [k, v] of Object.entries(raw)) {
          if (k === "children") continue;
          if (typeof v === "function") out[k] = "ƒ";
          else if (v == null || typeof v !== "object") out[k] = String(v);
          else { try { out[k] = JSON.stringify(v).slice(0, 120); } catch { out[k] = "{…}"; } }
        }
        if (Object.keys(out).length) return out;
      }
    } catch {}
    return null;
  }
  // Nearest React component names from the fiber — far more reliable than a
  // tag-based description ("RegisterCard › Button" instead of "button").
  function componentPathOf(el) {
    try {
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      if (!key) return null;
      let fiber = el[key];
      const names = [];
      while (fiber && names.length < 4) {
        const t = fiber.type;
        let name = null;
        if (typeof t === "function") name = t.displayName || t.name;
        else if (t && typeof t === "object") name = t.displayName || (t.render && (t.render.displayName || t.render.name)) || null;
        if (name && !/^(Fragment|Suspense|Provider|Consumer|Anonymous)$/.test(name) && names[names.length - 1] !== name) {
          names.push(name);
        }
        fiber = fiber.return;
      }
      return names.length ? names.reverse().join(" › ") : null;
    } catch { return null; }
  }
  function captureInspect(el) {
    const cs = getComputedStyle(el);
    const styles = {};
    INSPECT_PROPS.forEach((p) => { styles[p] = cs.getPropertyValue(p); });
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: [...el.classList],
      styles,
      props: reactPropsOf(el),
      componentPath: componentPathOf(el),
      text: (el.textContent || "").trim().slice(0, 80),
      viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x`,
    };
  }

  // ---- element screenshots (html-to-image, lazy) ---------------------------
  // html-to-image renders through the browser itself (SVG foreignObject), so
  // modern CSS — Tailwind v4 oklch() colors etc. — works. html2canvas parses
  // CSS in JS and throws `unsupported color function "oklch"` on these apps.
  let h2iPromise = null;
  function loadHtmlToImage() {
    if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
    if (h2iPromise) return h2iPromise;
    const sources = [
      API + "/vendor/html-to-image.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.13/html-to-image.min.js",
    ];
    h2iPromise = sources.reduce(
      (p, src) => p.catch(() => new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => (window.htmlToImage ? res(window.htmlToImage) : rej(new Error("html-to-image missing")));
        s.onerror = () => rej(new Error("html-to-image load failed"));
        document.head.appendChild(s);
      })),
      Promise.reject(new Error("start")),
    );
    return h2iPromise;
  }
  async function captureElementShot(el) {
    try {
      const h2i = await loadHtmlToImage();
      const blob = await h2i.toBlob(el, {
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      });
      if (!blob) return null;
      const fd = new FormData();
      fd.append("image", blob, "element.png");
      const r = await (await api("/api/upload", { method: "POST", body: fd })).json();
      return r.imageUrl || null;
    } catch (e) {
      console.warn("[DQA] element screenshot failed:", e && e.message);
      return null;
    }
  }

  // ---- element highlight ------------------------------------------------
  let treeHoverEl = null; // element hovered in the DevDrawer element tree
  function renderHighlight() {
    const el = pinnedEl || treeHoverEl || (commentMode ? hoverEl : null);
    if (!el || !el.getBoundingClientRect) { hlBox.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { hlBox.style.display = "none"; return; }
    hlBox.style.display = "block";
    hlBox.style.left = r.left + "px"; hlBox.style.top = r.top + "px";
    hlBox.style.width = r.width + "px"; hlBox.style.height = r.height + "px";
    const path = componentPathOf(el);
    hlLabel.textContent = path ? path.split(" › ").pop() : buildSelector(el).label;
  }

  // ---- pins -------------------------------------------------------------
  function renderPins() {
    pinsLayer.innerHTML = "";
    comments.forEach((c, i) => {
      if (!c.anchor) return;
      if (c.status === "resolved" && !showResolved) return;
      const pos = resolveAnchor(c.anchor);
      const pin = document.createElement("div");
      pin.className = "pin" + (c.status === "resolved" ? " resolved" : "");
      pin.style.left = pos.x + "px"; pin.style.top = pos.y + "px";
      pin.textContent = c.status === "resolved" ? "✓" : i + 1;
      pin.title = c.body;
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        activeCommentId = c.id;
        notifyState();
        openThread(c, resolveAnchor(c.anchor));
      });
      pinsLayer.appendChild(pin);
    });
  }
  function reposition() { if (comments.length) renderPins(); if (outlineAll) renderOutlineAll(); renderHighlight(); }
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);

  // ---- highlight-all: outline every commentable element at once ----------
  // Helps find elements that are hard to hover (transparent, behind others,
  // zero-size until interacted with). Click any outline to comment on it.
  let outlineAll = false;
  function commentableElements() {
    const seen = new Set();
    const out = [];
    // Prefer elements with a stable anchor or a React component identity.
    for (const el of document.body.querySelectorAll("*")) {
      if (out.length >= 500) break;
      if (el.closest("[data-dqa-ignore]") || el.getRootNode() === root) continue;
      const hasStable = STABLE_ATTRS.some((a) => el.hasAttribute(a));
      const comp = hasStable ? null : componentPathOf(el);
      if (!hasStable && !comp) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 && r.height < 4) continue; // skip truly zero-size
      if (seen.has(el)) continue;
      seen.add(el);
      out.push({ el, rect: r, label: comp ? comp.split(" › ").pop() : buildSelector(el).label });
    }
    return out;
  }
  function renderOutlineAll() {
    outlineLayer.innerHTML = "";
    if (!outlineAll) return;
    for (const { el, label } of commentableElements()) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue; // only what's on screen
      const box = document.createElement("div");
      box.className = "outline-all";
      box.style.left = r.left + "px"; box.style.top = r.top + "px";
      box.style.width = r.width + "px"; box.style.height = r.height + "px";
      const tag = document.createElement("span");
      tag.className = "oa-tag"; tag.textContent = label;
      box.appendChild(tag);
      box.addEventListener("click", (e) => {
        e.stopPropagation(); e.preventDefault();
        setOutlineAll(false);
        const cx = r.left + r.width / 2, cy = r.top + Math.min(20, r.height / 2);
        openCompose(captureAnchor(el, cx, cy), cx, cy);
      });
      outlineLayer.appendChild(box);
    }
  }
  function setOutlineAll(on) {
    outlineAll = !!on;
    outlineLayer.style.pointerEvents = outlineAll ? "auto" : "none";
    renderOutlineAll();
    notifyState();
  }

  // ---- element tree (DevTools-style hierarchy for the DevDrawer) ---------
  // Builds a nested tree of "meaningful" elements (stable attrs, semantic tags,
  // or a React component identity), collapsing anonymous wrapper divs. Each
  // node gets a uid the drawer uses to hover-highlight or start a comment —
  // so invisible / hard-to-hover elements are reachable from the list.
  const SEMANTIC = /^(main|header|nav|footer|section|article|aside|form|button|a|h1|h2|h3|h4|h5|h6|ul|ol|li|table|img|svg|input|select|textarea|label|dialog|summary|details)$/i;
  const uidMap = new Map(); // uid -> element
  let uidSeq = 0;
  function isMeaningful(el) {
    if (el.getRootNode() === root) return false;
    if (el.closest && el.closest("[data-dqa-ignore]")) return false;
    if (STABLE_ATTRS.some((a) => el.hasAttribute(a))) return true;
    if (SEMANTIC.test(el.tagName)) return true;
    return !!componentPathOf(el);
  }
  function buildTree(el, depth) {
    const nodes = [];
    for (const child of el.children) {
      if (uidMap.size >= 1000) break;
      if (child.getRootNode() === root || (child.closest && child.closest("[data-dqa-ignore]"))) continue;
      if (isMeaningful(child)) {
        const uid = ++uidSeq;
        uidMap.set(uid, child);
        const comp = componentPathOf(child);
        const r = child.getBoundingClientRect();
        const hidden = (r.width < 2 && r.height < 2) || getComputedStyle(child).display === "none" || getComputedStyle(child).visibility === "hidden";
        nodes.push({
          uid,
          tag: child.tagName.toLowerCase(),
          label: comp ? comp.split(" › ").pop() : buildSelector(child).label,
          component: comp || null,
          hidden,
          children: depth < 14 ? buildTree(child, depth + 1) : [],
        });
      } else {
        // Anonymous wrapper — surface its meaningful descendants inline.
        nodes.push(...buildTree(child, depth));
      }
    }
    return nodes;
  }
  function getElementTree() {
    uidMap.clear();
    uidSeq = 0;
    return buildTree(document.body, 0);
  }
  function hoverElement(uid) {
    const el = uidMap.get(uid);
    if (!el) return;
    treeHoverEl = el;
    renderHighlight();
  }
  function clearHoverElement() { treeHoverEl = null; renderHighlight(); }
  function commentOnElement(uid) {
    const el = uidMap.get(uid);
    if (!el) return;
    treeHoverEl = null;
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + Math.min(20, r.height / 2);
    openCompose(captureAnchor(el, cx, cy), cx, cy);
  }

  // ---- compose ----------------------------------------------------------
  function openCompose(anchor, x, y) {
    closePopover();
    const el = resolveAnchor(anchor).el;
    pinnedEl = el; renderHighlight();
    const inspect = el ? captureInspect(el) : null;
    const styleEdits = new Map(); // prop -> { from, to } (live-preview edits)
    const origInline = el ? el.getAttribute("style") : null;
    const origClass = el ? el.getAttribute("class") : null;
    draft = {
      anchor, x, y,
      // Live edits are previews only — always restore the element on close.
      revert: () => {
        if (!el) return;
        if (origInline == null) el.removeAttribute("style"); else el.setAttribute("style", origInline);
        if (origClass == null) el.removeAttribute("class"); else el.setAttribute("class", origClass);
      },
    };
    const pop = document.createElement("div");
    pop.className = "popover"; placePopover(pop, x, y);
    const headLabel = (inspect && inspect.componentPath) || anchor.label;
    pop.innerHTML = `
      <div class="head"><span>New comment</span><span class="sel" title="${esc(headLabel)}">${esc(headLabel)}</span><button class="head-x" data-act="cancel" title="Close" aria-label="Close">✕</button></div>
      <div class="body">
        <textarea placeholder="What's off? (size, spacing, copy, behaviour…)"></textarea>
        ${inspect ? `
        <div class="inspect">
          <div class="i-tabs">
            <button class="i-tab active" data-itab="styles">Styles</button>
            <button class="i-tab" data-itab="classes">Classes</button>
            <button class="i-tab" data-itab="props">Props</button>
          </div>
          <div class="i-body" data-ibody></div>
          <div class="i-note">Style edits apply to the page live (like devtools) and attach as suggestions.</div>
        </div>` : ""}
        <div class="row"><input class="file" type="file" accept="image/*" /></div>
        <div class="row">
          <label class="opt"><input type="checkbox" data-act="shot" checked /> Element screenshot</label>
          <label class="opt"><input type="checkbox" data-act="tolinear" /> Send to Linear</label>
        </div>
        <div class="row actions">
          <span class="spacer"></span>
          <button class="btn ghost" data-act="cancel">Cancel</button>
          <button class="btn primary" data-act="save">Comment</button>
        </div>
      </div>`;
    ui.appendChild(pop); activePopover = pop;
    makeDraggable(pop);
    if (inspect && el) wireInspector(pop, el, inspect, styleEdits);
    const ta = pop.querySelector("textarea"); ta.focus();
    pop.querySelectorAll('[data-act="cancel"]').forEach((b) => { b.onclick = closePopover; });
    const saveBtn = pop.querySelector('[data-act="save"]');
    saveBtn.onclick = async () => {
      const body = ta.value.trim(); if (!body) return ta.focus();
      saveBtn.textContent = "Saving…"; saveBtn.disabled = true;
      const file = pop.querySelector(".file").files[0];
      const wantShot = pop.querySelector('[data-act="shot"]')?.checked;
      const toLinear = pop.querySelector('[data-act="tolinear"]')?.checked;
      const edits = [...styleEdits.entries()]
        .filter(([, v]) => v.from !== v.to)
        .map(([prop, v]) => ({ prop, from: v.from, to: v.to }));
      let imageUrl = null, afterImageUrl = null;
      if (file) imageUrl = await uploadImage(file);
      if (wantShot && el) {
        // With live edits applied, capture the suggested ("after") state first,
        // then revert and capture the current ("before") state.
        if (edits.length) afterImageUrl = await captureElementShot(el);
        if (draft && draft.revert) { try { draft.revert(); } catch {} }
        if (!imageUrl) imageUrl = await captureElementShot(el);
      }
      const created = await postComment({ body, anchor, imageUrl, afterImageUrl, inspect, styleEdits: edits });
      await loadComments();
      // If "Send to Linear" was ticked, keep the popover open and show the
      // ticket picker for the comment we just created.
      if (toLinear && created && created.id) openPicker(created);
      else closePopover();
    };
  }

  // --- style-edit input helpers -----------------------------------------
  const COLOR_PROPS = new Set(["color", "background-color", "border-color"]);
  // Reject anything that could smuggle a CSS payload (url() trackers, imports,
  // extra declarations). Typed inputs already constrain most of this; this is
  // defense-in-depth and mirrors the server-side check.
  function isSafeCssValue(v) {
    return typeof v === "string" && v.length <= 200 &&
      !/[<>{};]|url\(|expression|javascript:|@import|\\/i.test(v);
  }
  // Resolve any CSS colour string to #rrggbb for the native colour input.
  function colorToHex(input) {
    try {
      const d = document.createElement("div");
      d.style.color = "";
      d.style.color = String(input);
      if (!d.style.color) return null; // invalid colour
      d.style.position = "absolute"; d.style.opacity = "0"; d.style.pointerEvents = "none";
      document.body.appendChild(d);
      const cs = getComputedStyle(d).color;
      document.body.removeChild(d);
      const m = cs.match(/\d+(\.\d+)?/g);
      if (!m || m.length < 3) return null;
      return "#" + m.slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, "0")).join("");
    } catch { return null; }
  }
  // Single length like "60px" / "1.5" / "50%" → { num, unit }, else null.
  function parseSingleLength(v) {
    const m = String(v).trim().match(/^(-?\d*\.?\d+)(px|rem|em|%|vh|vw|)$/);
    return m ? { num: parseFloat(m[1]), unit: m[2] } : null;
  }

  // Inspector tabs: editable computed styles (live preview), Tailwind class
  // list (editable as one line), and React props read from the fiber.
  function wireInspector(pop, el, inspect, styleEdits) {
    const body = pop.querySelector("[data-ibody]");
    const tabs = [...pop.querySelectorAll(".i-tab")];
    function show(tabKey) {
      tabs.forEach((t) => t.classList.toggle("active", t.dataset.itab === tabKey));
      body.innerHTML = "";
      if (tabKey === "styles") {
        Object.entries(inspect.styles).forEach(([prop, val]) => {
          const row = document.createElement("div"); row.className = "i-row";
          const label = document.createElement("label"); label.textContent = prop;
          row.appendChild(label);
          const cur = (styleEdits.get(prop) && styleEdits.get(prop).to) || val;
          const applyEdit = (next) => {
            if (!isSafeCssValue(next)) return;
            try { el.style.setProperty(prop, next); } catch {}
            styleEdits.set(prop, { from: inspect.styles[prop], to: next });
            renderHighlight();
          };
          if (COLOR_PROPS.has(prop)) {
            // Native colour picker + a text field (for transparent/currentColor/etc).
            const color = document.createElement("input");
            color.type = "color"; color.className = "i-color";
            color.value = colorToHex(cur) || "#000000";
            const text = document.createElement("input");
            text.className = "i-textval"; text.value = cur;
            text.classList.toggle("edited", cur !== val);
            color.oninput = () => { text.value = color.value; text.classList.add("edited"); applyEdit(color.value); };
            text.oninput = () => { const h = colorToHex(text.value); if (h) color.value = h; text.classList.toggle("edited", text.value !== val); applyEdit(text.value); };
            row.append(color, text);
          } else {
            const parsed = parseSingleLength(cur);
            if (parsed) {
              // Number + unit for single lengths (font-size, gap, width…).
              const num = document.createElement("input");
              num.type = "number"; num.step = "any"; num.className = "i-num"; num.value = String(parsed.num);
              const unit = document.createElement("select"); unit.className = "i-unit";
              for (const u of ["px", "rem", "em", "%", "vh", "vw", ""]) {
                const o = document.createElement("option"); o.value = u; o.textContent = u || "—";
                if (u === parsed.unit) o.selected = true; unit.appendChild(o);
              }
              const emit = () => {
                const next = num.value === "" ? "" : num.value + unit.value;
                const edited = next !== val;
                num.classList.toggle("edited", edited); unit.classList.toggle("edited", edited);
                applyEdit(next);
              };
              num.oninput = emit; unit.onchange = emit;
              row.append(num, unit);
            } else {
              const input = document.createElement("input");
              input.className = "i-textval"; input.value = cur;
              input.classList.toggle("edited", cur !== val);
              input.oninput = () => { input.classList.toggle("edited", input.value !== val); applyEdit(input.value); };
              row.appendChild(input);
            }
          }
          body.appendChild(row);
        });
      } else if (tabKey === "classes") {
        body.innerHTML = inspect.classes.length
          ? inspect.classes.map((cl) => `<span class="chip">${esc(cl)}</span>`).join("")
          : '<div class="i-empty">No classes on this element.</div>';
        const input = document.createElement("input");
        input.className = "class-input";
        input.placeholder = "Edit class list (live preview)";
        input.value = (styleEdits.get("class") && styleEdits.get("class").to) || inspect.classes.join(" ");
        input.oninput = () => {
          const next = input.value.slice(0, 300);
          try { el.setAttribute("class", next); } catch {}
          styleEdits.set("class", { from: inspect.classes.join(" "), to: next });
          renderHighlight();
        };
        body.appendChild(input);
      } else {
        body.innerHTML = inspect.props
          ? Object.entries(inspect.props)
              .map(([k, v]) => `<div class="i-kv"><b>${esc(k)}</b>: ${esc(v)}</div>`)
              .join("")
          : '<div class="i-empty">No React props found on this element.</div>';
      }
    }
    tabs.forEach((t) => { t.onclick = () => show(t.dataset.itab); });
    show("styles");
  }

  // ---- thread -----------------------------------------------------------
  function openThread(c, pos) {
    closePopover();
    activeCommentId = c.id;
    pinnedEl = resolveAnchor(c.anchor).el; renderHighlight();
    const pop = document.createElement("div");
    pop.className = "popover"; placePopover(pop, pos.x, pos.y);
    const replies = (c.replies || []).map((r) => messageRow(r.author, r.body, r.createdAt)).join("");
    const target = c.issueRef ? `Send to ${esc(c.issueRef)}` : "Send to Linear";
    const linearRow = c.linearDeleted
      ? `<span class="badge" style="text-decoration:line-through" title="This comment/issue was deleted in Linear">${esc(c.linear?.identifier || "Linear")} deleted</span>`
      : c.linear
        ? `<a class="badge done" href="${esc(c.linear.url)}" target="_blank">${esc(c.linear.identifier)} ↗</a>`
        : `<button class="btn link" data-act="linear">${target}</button>`;
    const compName = (c.inspect && c.inspect.componentPath) || (c.inspect && c.inspect.tag) || c.anchor?.label || "";
    const manyClasses = c.inspect && c.inspect.classes && c.inspect.classes.length > 8;
    const inspectHtml = c.inspect ? `
      <details class="i-details"${manyClasses ? "" : " open"}>
        <summary>Component · ${esc(compName)}</summary>
        <div class="i-inner">
          <div class="i-kv"><b>${esc(c.inspect.tag)}</b>${c.inspect.id ? "#" + esc(c.inspect.id) : ""}${c.inspect.viewport ? ` · ${esc(c.inspect.viewport)}` : ""}</div>
          ${c.inspect.classes && c.inspect.classes.length
            ? `<div style="margin-top:4px">${c.inspect.classes.map((cl) => `<span class="chip">${esc(cl)}</span>`).join("")}</div>`
            : ""}
        </div>
      </details>` : "";
    const editsHtml = c.styleEdits && c.styleEdits.length ? `
      <details class="i-details" open>
        <summary>Suggested changes · ${c.styleEdits.length}</summary>
        <div class="i-inner">
          ${c.styleEdits.map((e2) => `<div class="i-edit">${esc(e2.prop)}: <s>${esc(e2.from)}</s> → <b>${esc(e2.to)}</b></div>`).join("")}
        </div>
      </details>` : "";
    pop.innerHTML = `
      <div class="head"><span>Comment</span><span class="sel" title="${esc(compName)}">${esc(compName)}</span><button class="head-x" data-act="close" title="Close" aria-label="Close">✕</button></div>
      <div class="body body-thread">
        <div class="context">
          ${inspectHtml}
          ${editsHtml}
        </div>
        <div class="thread-scroll">
          <div class="thread">
            ${messageRow(c.author, c.body, c.createdAt, {
              first: true,
              extraHtml:
                (c.imageUrl ? `${c.afterImageUrl ? '<div class="shot-label">Current</div>' : ""}<img class="thumb" src="${API}${esc(c.imageUrl)}" />` : "") +
                (c.afterImageUrl ? `<div class="shot-label">Suggested</div><img class="thumb" src="${API}${esc(c.afterImageUrl)}" />` : ""),
            })}
            ${replies}
          </div>
        </div>
        <div class="reply-area">
          <div class="row"><textarea placeholder="Reply…"></textarea></div>
          <div class="row">
            ${c.status === "resolved" ? '<span class="badge done">Resolved</span>' : '<button class="btn ghost" data-act="resolve">Resolve</button>'}
            <button class="btn ghost" data-act="delete" title="Delete this DQA comment">Delete</button>
            ${linearRow}
          </div>
          <div class="row actions">
            <span class="spacer"></span>
            <button class="btn ghost" data-act="close">Close</button>
            <button class="btn primary" data-act="reply">Reply</button>
          </div>
        </div>
      </div>`;
    ui.appendChild(pop); activePopover = pop;
    makeDraggable(pop);
    // Scroll to the newest message (chat-style).
    const threadEl = pop.querySelector(".thread-scroll");
    if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;
    pop.querySelectorAll('[data-act="close"]').forEach((b) => { b.onclick = closePopover; });
    pop.querySelector('[data-act="reply"]').onclick = async () => {
      const body = pop.querySelector("textarea").value.trim(); if (!body) return;
      await api(`/api/comments/${c.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      await loadComments();
      closePopover();
    };
    const resolveBtn = pop.querySelector('[data-act="resolve"]');
    if (resolveBtn) resolveBtn.onclick = async () => { await api(`/api/comments/${c.id}/resolve`, { method: "POST" }); await loadComments(); closePopover(); };
    const deleteBtn = pop.querySelector('[data-act="delete"]');
    if (deleteBtn) deleteBtn.onclick = async () => {
      if (!window.confirm("Delete this DQA comment? (does not touch Linear)")) return;
      await api(`/api/comments/${c.id}`, { method: "DELETE" });
      await loadComments();
      closePopover();
    };
    const linearBtn = pop.querySelector('[data-act="linear"]');
    if (linearBtn) linearBtn.onclick = () => openPicker(c);
    if (EMBED) notifyState();
  }

  // ---- Linear ticket picker --------------------------------------------
  function openPicker(c) {
    const pop = activePopover; if (!pop) return;
    const title = pop.querySelector(".head span"); if (title) title.textContent = "Send to Linear";
    const body = pop.querySelector(".body");
    body.innerHTML = `
      <div class="action-row">
        <label class="opt"><input type="radio" name="dqa-action" value="comment" checked /> Comment</label>
        <label class="opt"><input type="radio" name="dqa-action" value="subissue" /> Sub-issue</label>
        <label class="opt"><input type="radio" name="dqa-action" value="issue" /> Triage issue</label>
        <select class="prio" title="Priority (for created issues)">
          <option value="0">No priority</option>
          <option value="1">Urgent</option>
          <option value="2">High</option>
          <option value="3" selected>Medium</option>
          <option value="4">Low</option>
        </select>
      </div>
      <input class="picker-search" placeholder="Search tickets…" />
      <div class="picker-list"><div class="picker-empty">Loading…</div></div>
      <div class="row">
        <button class="btn ghost" data-act="back">Back</button>
        <span class="spacer"></span>
        <button class="btn primary" data-act="create" style="display:none">Create triage issue</button>
        ${ISSUE_REF ? `<button class="btn link" data-act="default">Use ${esc(ISSUE_REF)}</button>` : ""}
      </div>`;
    const search = body.querySelector(".picker-search");
    const list = body.querySelector(".picker-list");
    const prio = body.querySelector(".prio");
    const createBtn = body.querySelector('[data-act="create"]');
    const currentAction = () => body.querySelector('input[name="dqa-action"]:checked').value;
    const opts = () => ({ action: currentAction(), priority: Number(prio.value) });
    // "Triage issue" needs no target ticket — swap list interaction for a create button.
    body.querySelectorAll('input[name="dqa-action"]').forEach((r) => {
      r.onchange = () => {
        const isNew = currentAction() === "issue";
        createBtn.style.display = isNew ? "" : "none";
        search.style.display = isNew ? "none" : "";
        list.style.display = isNew ? "none" : "";
      };
    });
    createBtn.onclick = () => sendToLinear(c, null, opts());
    body.querySelector('[data-act="back"]').onclick = () => openThread(c, resolveAnchor(c.anchor));
    const def = body.querySelector('[data-act="default"]');
    if (def) def.onclick = () => sendToLinear(c, ISSUE_REF, opts());
    let t;
    async function load(term) {
      try {
        const res = await api(`/api/linear/issues?term=${encodeURIComponent(term || "")}`);
        if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) {
          list.innerHTML = `<div class="picker-empty">Couldn't load tickets (HTTP ${res.status}). Is the DQA service up to date? Try restarting it.</div>`;
          return;
        }
        const data = await res.json();
        if (data.dev) { list.innerHTML = `<div class="picker-empty">Dev mode — sign in with Linear to list tickets.</div>`; return; }
        const issues = data.issues || [];
        if (!issues.length) { list.innerHTML = `<div class="picker-empty">No tickets found.</div>`; return; }
        list.innerHTML = "";
        issues.forEach((it) => {
          const row = document.createElement("div");
          row.className = "picker-item";
          row.innerHTML = `<span class="pid">${esc(it.identifier)}</span><span class="pt">${esc(it.title)}</span>`;
          row.onclick = () => sendToLinear(c, it.identifier, opts());
          list.appendChild(row);
        });
      } catch (e) { list.innerHTML = `<div class="picker-empty">Error: ${esc(e.message)}</div>`; }
    }
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => load(search.value.trim()), 250); });
    search.focus();
    load("");
  }

  async function sendToLinear(c, issueRef, opts) {
    try {
      const data = await (await api(`/api/comments/${c.id}/linear`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueRef, action: opts && opts.action, priority: opts && opts.priority }),
      })).json();
      if (data.issue) alert(`Linear (${data.mode || "comment"}): ${data.issue.identifier}\n${data.issue.url}${data.dryRun ? "\n\n(dry run)" : ""}`);
      else alert("Linear error: " + (data.error || "unknown"));
    } catch (e) { alert("Linear error: " + e.message); }
    closePopover();
  }

  function placePopover(pop, x, y) {
    pop.style.left = Math.max(8, Math.min(x + 16, window.innerWidth - 364)) + "px";
    pop.style.top = Math.max(8, Math.min(y, window.innerHeight - 320)) + "px";
  }

  // Popovers are draggable by their header (they can cover the element under
  // review, or open partly off-screen near the viewport edges).
  function makeDraggable(pop) {
    const head = pop.querySelector(".head");
    if (!head) return;
    head.style.cursor = "move";
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest && e.target.closest("button, a, input, select, textarea")) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const rect = pop.getBoundingClientRect();
      const move = (ev) => {
        pop.style.left = Math.max(4, Math.min(rect.left + (ev.clientX - startX), window.innerWidth - 80)) + "px";
        pop.style.top = Math.max(4, Math.min(rect.top + (ev.clientY - startY), window.innerHeight - 40)) + "px";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }
  function closePopover() {
    if (activePopover) { activePopover.remove(); activePopover = null; }
    if (draft && draft.revert) { try { draft.revert(); } catch {} }
    draft = null; pinnedEl = null; activeCommentId = null; renderHighlight();
    if (EMBED) notifyState();
  }

  function focusCommentById(id) {
    const c = comments.find((x) => x.id === id);
    if (!c || !c.anchor) return;
    const pos = resolveAnchor(c.anchor);
    if (pos.el && pos.el.scrollIntoView) {
      try { pos.el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
    }
    activeCommentId = id;
    notifyState();
    openThread(c, pos);
  }

  // ---- network ----------------------------------------------------------
  async function loadComments() {
    try {
      const res = await api(`/api/comments?url=${encodeURIComponent(PAGE_URL)}`);
      comments = await res.json(); renderPins();
      if (EMBED) notifyState();
    } catch {}
  }
  async function postComment({ body, anchor, imageUrl, afterImageUrl, inspect, styleEdits }) {
    const res = await api("/api/comments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: PAGE_URL, body, anchor, imageUrl, afterImageUrl, issueRef: ISSUE_REF, inspect, styleEdits }),
    });
    return res.json();
  }
  async function uploadImage(file) {
    const fd = new FormData(); fd.append("image", file);
    return (await (await api("/api/upload", { method: "POST", body: fd })).json()).imageUrl;
  }

  // ---- click-to-comment -------------------------------------------------
  // The overlay itself and anything marked data-dqa-ignore (the DevDrawer,
  // its trigger, other devtools chrome) are never commentable.
  function inOverlayOrIgnored(e) {
    return e.composedPath().some(
      (n) => n === host || (n && n.nodeType === 1 && n.hasAttribute && n.hasAttribute("data-dqa-ignore")),
    );
  }
  document.addEventListener("click", (e) => {
    if (!commentMode) return;
    if (inOverlayOrIgnored(e)) return;
    e.preventDefault(); e.stopPropagation();
    openCompose(captureAnchor(e.target, e.clientX, e.clientY), e.clientX, e.clientY);
    setMode(false);
  }, true);

  // ---- websocket --------------------------------------------------------
  const cursorEls = new Map();
  function connect() {
    if (!TOKEN) return;
    ws = new WebSocket(WS_URL);
    ws.onopen = () => ws.send(JSON.stringify({ type: "join", url: PAGE_URL, token: TOKEN }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "unauthorized") return signOut();
      if (msg.type === "cursor") moveCursor(msg.user, msg.x, msg.y);
      else if (msg.type === "presence") { msg.users.forEach((u) => ensureCursor(u)); renderPresence(); }
      else if (msg.type === "join") { ensureCursor(msg.user); renderPresence(); }
      else if (msg.type === "leave") { removeCursor(msg.user); renderPresence(); }
      else if (msg.type === "comment:new" || msg.type === "comment:update" || msg.type === "comment:delete") loadComments();
    };
    ws.onclose = () => { if (TOKEN) setTimeout(connect, 2000); };
  }

  // ---- SPA route changes ------------------------------------------------
  // Client-side navigations (TanStack Router etc.) don't reload, so we must
  // re-scope to the new path: reload that page's comments and re-join the WS
  // room. Otherwise the previous page's pins linger.
  function onRouteMaybeChanged() {
    const next = location.origin + location.pathname;
    if (next === PAGE_URL) return;
    PAGE_URL = next;
    closePopover();
    comments = [];
    renderPins();
    activeCommentId = null;
    if (outlineAll) renderOutlineAll();
    if (USER) {
      loadComments();
      // Re-join the room for the new page (server rooms are keyed by url).
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "join", url: PAGE_URL, token: TOKEN }));
    }
    notifyState();
  }
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function (...args) {
      const r = orig.apply(this, args);
      queueMicrotask(onRouteMaybeChanged);
      return r;
    };
  }
  window.addEventListener("popstate", onRouteMaybeChanged);
  window.addEventListener("hashchange", onRouteMaybeChanged);

  function ensureCursor(user) {
    if (!user || cursorEls.has(user.id)) return cursorEls.get(user.id);
    const c = document.createElement("div"); c.className = "cursor";
    c.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="${user.color || "#2563eb"}" d="M3 2l7 18 2.5-7.5L20 10z"/></svg><span class="tag" style="background:${user.color || "#2563eb"}">${esc(user.name)}</span>`;
    cursorsLayer.appendChild(c); cursorEls.set(user.id, c); return c;
  }
  function moveCursor(user, x, y) {
    const c = ensureCursor(user);
    c.style.transform = `translate(${x * window.innerWidth}px, ${y * window.innerHeight}px)`;
  }
  function removeCursor(user) { const c = user && cursorEls.get(user.id); if (c) { c.remove(); cursorEls.delete(user.id); } }

  // ---- mousemove: cursor broadcast + highlight --------------------------
  let lastSend = 0;
  document.addEventListener("mousemove", (e) => {
    const now = Date.now();
    if (ws && ws.readyState === 1 && now - lastSend >= 40) {
      lastSend = now;
      ws.send(JSON.stringify({ type: "cursor", x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }));
    }
    if (commentMode && !inOverlayOrIgnored(e)) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.closest && el.closest("[data-dqa-ignore]")) return;
      if (el && el !== hoverEl) { hoverEl = el; renderHighlight(); }
    }
  });

  // ---- toolbar (legacy floating chrome — disabled in DevDrawer embed mode) ----
  function renderToolbar() {
    if (!USER) return;
    if (EMBED) { notifyState(); return; }
    let tb = root.querySelector(".toolbar");
    if (!tb) { tb = document.createElement("div"); tb.className = "toolbar"; ui.appendChild(tb); }
    const open = getOpenCount();
    tb.innerHTML = `
      <button class="mode${commentMode ? " active" : ""}" data-act="mode">${commentMode ? "Pick an element" : "Inspect"}</button>
      <div class="presence"></div>
      <span class="count">${open} open</span>
      <button class="icon-btn" data-act="signout" title="Sign out (${esc(USER.name)})">⏻</button>`;
    tb.querySelector('[data-act="mode"]').onclick = () => setMode(!commentMode);
    tb.querySelector('[data-act="signout"]').onclick = signOut;
    renderPresence(tb);
  }
  function renderPresence(tb) {
    tb = tb || root.querySelector(".toolbar"); if (!tb) return;
    const box = tb.querySelector(".presence"); if (!box || !USER) return;
    box.innerHTML = "";
    const av = document.createElement("div");
    av.className = "avatar"; av.style.background = USER.color || "#111827";
    av.textContent = (USER.name || "?").slice(0, 1).toUpperCase(); av.title = USER.name + " (you)";
    box.appendChild(av);
    cursorEls.forEach((el) => {
      const tag = el.querySelector(".tag");
      const a = document.createElement("div"); a.className = "avatar";
      a.style.background = tag ? tag.style.background : "#777";
      a.textContent = (tag ? tag.textContent : "?").slice(0, 1).toUpperCase();
      a.title = tag ? tag.textContent : "";
      box.appendChild(a);
    });
    if (EMBED) notifyState();
  }
  // Inspect mode: crosshair cursor page-wide (like picking in devtools).
  let cursorStyleEl = null;
  function setPageCursor(on) {
    if (on && !cursorStyleEl) {
      cursorStyleEl = document.createElement("style");
      cursorStyleEl.textContent = "*, *::before, *::after { cursor: crosshair !important; }";
      document.head.appendChild(cursorStyleEl);
    } else if (!on && cursorStyleEl) {
      cursorStyleEl.remove();
      cursorStyleEl = null;
    }
  }
  function setMode(on) { commentMode = on; if (!on) hoverEl = null; renderToolbar(); renderHighlight(); showHint(on); setPageCursor(on); }
  let hintEl;
  function showHint(on) {
    if (hintEl) { hintEl.remove(); hintEl = null; }
    if (on) { hintEl = document.createElement("div"); hintEl.className = "hint"; hintEl.textContent = "Inspect — click any element to comment · Esc to cancel"; ui.appendChild(hintEl); }
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { setMode(false); closePopover(); } });

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // Deterministic avatar colour + initial from a name (matches the drawer's palette).
  const AVATAR_COLORS = ["#2563eb", "#0f766e", "#7c3aed", "#be123c", "#b45309", "#0891b2", "#4d7c0f", "#c026d3"];
  function avatarColor(name) {
    let h = 0;
    for (const ch of String(name || "?")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function initial(name) { return (String(name || "?").trim()[0] || "?").toUpperCase(); }

  // Short relative time ("just now", "5m", "3h", "2d") with an absolute title.
  function relTime(iso) {
    const t = Date.parse(iso);
    if (!t) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return Math.round(s / 60) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    if (s < 604800) return Math.round(s / 86400) + "d";
    return new Date(t).toLocaleDateString();
  }
  function absTime(iso) {
    const t = Date.parse(iso);
    return t ? new Date(t).toLocaleString() : "";
  }

  // One chat message row: coloured avatar + author · time + body (+ optional images).
  function messageRow(author, body, createdAt, { first = false, extraHtml = "" } = {}) {
    return `
      <div class="msg${first ? " first" : ""}">
        <div class="av" style="background:${avatarColor(author)}">${esc(initial(author))}</div>
        <div class="bubble">
          <div class="meta"><span class="who">${esc(author)}</span><span class="when" title="${esc(absTime(createdAt))}">${esc(relTime(createdAt))}</span></div>
          <div class="txt">${esc(body)}</div>
          ${extraHtml}
        </div>
      </div>`;
  }

  // refresh toolbar counts periodically (only when signed in)
  setInterval(() => {
    if (!USER) return;
    if (EMBED) notifyState();
    else renderToolbar();
  }, 1500);

  window.__DQA__ = {
    subscribe(cb) {
      listeners.add(cb);
      cb(getState());
      return () => listeners.delete(cb);
    },
    getState,
    setCommentMode(on) { setMode(!!on); },
    signOut,
    startLinearLogin,
    switchLinearAccount,
    devLogin,
    fetchAuthConfig,
    focusComment(id) { focusCommentById(id); },
    setActiveComment(id) { activeCommentId = id || null; notifyState(); },
    setTheme,
    async resolveComment(id) {
      await api(`/api/comments/${id}/resolve`, { method: "POST" });
      await loadComments();
    },
    async deleteComment(id) {
      await api(`/api/comments/${id}`, { method: "DELETE" });
      await loadComments();
    },
    setShowResolved(on) {
      showResolved = !!on;
      try { localStorage.setItem("dqa_show_resolved", showResolved ? "1" : "0"); } catch {}
      renderPins();
      notifyState();
    },
    setHighlightAll(on) { setOutlineAll(on); },
    getElementTree() { return getElementTree(); },
    hoverElement(uid) { hoverElement(uid); },
    clearHoverElement() { clearHoverElement(); },
    commentOnElement(uid) { commentOnElement(uid); },
    async getPages() {
      try { return await (await api("/api/pages")).json(); } catch { return []; }
    },
    navigateTo(url) {
      try {
        const u = new URL(url, location.href);
        if (u.origin !== location.origin) return; // same-origin only
        // Full navigation — reliable across any router; the overlay re-inits
        // on load and scopes to the new page.
        location.assign(u.href);
      } catch {}
    },
  };

  init();
  console.log("%c[DQA] overlay ready", "color:#111827;font-weight:bold", "→", API);
})();
