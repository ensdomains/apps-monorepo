// Linear integration.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Comment, LinearPushMode, LinearRef } from "./types.ts";

const LINEAR_API = "https://api.linear.app/graphql";
const UPLOAD_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../data/uploads");

const FILE_UPLOAD = `
  mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
    fileUpload(contentType: $contentType, filename: $filename, size: $size) {
      success
      uploadFile { uploadUrl assetUrl headers { key value } }
    }
  }`;

const CONTENT_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

/**
 * Upload a local screenshot to Linear's file storage and return its assetUrl.
 * Required because DQA often runs on localhost/private hosts that Linear's
 * image proxy cannot reach — embedding our own URL renders a broken image.
 */
async function uploadImageToLinear(token: string, localUrl: string | null): Promise<string | null> {
  try {
    if (!localUrl || !localUrl.startsWith("/uploads/")) return null;
    const file = resolve(UPLOAD_DIR, basename(localUrl));
    if (!existsSync(file)) return null;
    const contentType = CONTENT_TYPES[extname(file).toLowerCase()] || "image/png";
    const size = statSync(file).size;
    const data = await gql(FILE_UPLOAD, token, { contentType, filename: basename(file), size });
    const uf = data.fileUpload?.uploadFile;
    if (!data.fileUpload?.success || !uf?.uploadUrl) {
      console.warn("[linear] fileUpload mutation refused:", JSON.stringify(data.fileUpload ?? null));
      return null;
    }
    // Content-Length is set automatically by fetch from the body.
    const headers: Record<string, string> = { "Content-Type": contentType };
    for (const h of uf.headers || []) headers[h.key] = h.value;
    const put = await fetch(uf.uploadUrl, { method: "PUT", headers, body: readFileSync(file) });
    if (!put.ok) {
      console.warn("[linear] upload PUT failed:", put.status, (await put.text().catch(() => "")).slice(0, 200));
      return null;
    }
    console.log("[linear] uploaded", basename(file), "→", uf.assetUrl);
    return uf.assetUrl;
  } catch (e) {
    console.warn("[linear] image upload failed:", (e as Error).message);
    return null;
  }
}

// Resolve a comment's screenshot to a URL Linear can render: prefer Linear's
// own storage, fall back to an absolute URL on our host (works when hosted
// publicly; never works for localhost).
async function resolveMediaUrl(token: string | null, localUrl: string | null, baseUrl?: string): Promise<string | null> {
  if (!localUrl) return null;
  const uploaded = token ? await uploadImageToLinear(token, localUrl) : null;
  if (uploaded) return uploaded;
  return baseUrl ? `${baseUrl}${localUrl}` : localUrl;
}

const ISSUE_CREATE = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) { success issue { id identifier url title } }
  }`;

const COMMENT_CREATE = `
  mutation CommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) { success comment { id url } }
  }`;

const ISSUE_BY_KEY_NUMBER = `
  query($key: String!, $number: Float!) {
    issues(filter: { team: { key: { eq: $key } }, number: { eq: $number } }, first: 1) {
      nodes { id identifier url title team { id } }
    }
  }`;

const ISSUES_LIST = `
  query($filter: IssueFilter) {
    issues(first: 25, orderBy: updatedAt, filter: $filter) {
      nodes { id identifier title }
    }
  }`;

// List recent issues, optionally filtered by a search term (matches title).
export async function searchIssues(term: string, token: string | null): Promise<any[]> {
  if (!token) return [];
  const variables = term ? { filter: { title: { containsIgnoreCase: term } } } : {};
  const data = await gql(ISSUES_LIST, token, variables);
  return data.issues?.nodes || [];
}

function buildBody(comment: Comment, media: { before?: string | null; after?: string | null } = {}): string {
  const inspect = comment.inspect || null;
  const component = inspect?.componentPath || inspect?.tag || comment.anchor?.label || null;
  const lines = [comment.body, "", "---", "", "### DQA context", ""];
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Reviewer | ${comment.author} |`);
  lines.push(`| Page | ${comment.url} |`);
  if (component) lines.push(`| Component | \`${component}\` |`);
  lines.push(`| Element | \`${comment.anchor?.selector ?? "n/a"}\` |`);
  if (inspect?.viewport) lines.push(`| Viewport | ${inspect.viewport} |`);
  if (inspect?.text) lines.push(`| Text | ${inspect.text} |`);
  if (inspect?.classes?.length) {
    lines.push("", "**Classes**", "", "```", inspect.classes.join(" "), "```");
  }
  if (comment.styleEdits?.length) {
    lines.push("", "### Suggested style changes", "");
    lines.push(`| Property | Current | Suggested |`);
    lines.push(`|---|---|---|`);
    for (const edit of comment.styleEdits) {
      lines.push(`| \`${edit.prop}\` | ${edit.from} | **${edit.to}** |`);
    }
  } else if (inspect?.styles && Object.keys(inspect.styles).length) {
    // No suggestions — still include the key computed styles for context.
    const keep = ["font-size", "font-weight", "line-height", "color", "padding", "margin"];
    const rows = keep.filter((k) => inspect.styles[k]).map((k) => `| \`${k}\` | ${inspect.styles[k]} |`);
    if (rows.length) lines.push("", "**Computed styles**", "", "| Property | Value |", "|---|---|", ...rows);
  }
  const before = media.before || null;
  const after = media.after || null;
  if (before && after) {
    lines.push("", "**Current**", "", `![current](${before})`, "", "**Suggested**", "", `![suggested](${after})`);
  } else if (before) {
    lines.push("", `![screenshot](${before})`);
  }
  return lines.join("\n");
}

async function gql(query: string, token: string, variables?: Record<string, unknown>): Promise<any> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: any; errors?: unknown };
  if (json.errors) throw new Error("Linear API error: " + JSON.stringify(json.errors));
  return json.data;
}

/**
 * Check whether a pushed comment/issue still exists in Linear.
 * Returns "ok", "deleted", or "unknown" (network/auth trouble — don't flag).
 */
export async function checkLinearStatus(linearRef: LinearRef | null, token: string | null): Promise<"ok" | "deleted" | "unknown"> {
  if (!token || !linearRef) return "unknown";
  try {
    if (linearRef.commentId) {
      const data = await gql(`query($id: String!){ comment(id: $id){ id } }`, token, { id: linearRef.commentId });
      return data.comment?.id ? "ok" : "deleted";
    }
    if (linearRef.issueId || linearRef.id) {
      const data = await gql(`query($id: String!){ issue(id: $id){ id trashed } }`, token, { id: linearRef.issueId || linearRef.id });
      if (!data.issue?.id) return "deleted";
      return data.issue.trashed ? "deleted" : "ok";
    }
    return "unknown";
  } catch (e) {
    // Linear answers "Entity not found" as a GraphQL error for deleted ids.
    if (/not found|could not find/i.test((e as Error).message)) return "deleted";
    return "unknown";
  }
}

// The signed-in reviewer's Linear user id (actor=user tokens only).
async function viewerId(token: string): Promise<string | null> {
  try {
    const data = await gql(`query { viewer { id } }`, token);
    return data.viewer?.id || null;
  } catch {
    return null;
  }
}

// "ENG-123" → { key: "ENG", number: 123 }
function parseIdentifier(ref: string | null | undefined): { key: string; number: number } | null {
  const m = String(ref || "").trim().match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
  return m ? { key: m[1].toUpperCase(), number: Number(m[2]) } : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Accept either a team UUID or the short team key (e.g. "EDA") and resolve to the UUID.
async function resolveTeamId(ref: string, token: string): Promise<string | null> {
  if (UUID_RE.test(ref)) return ref;
  const data = await gql(
    `query($key:String!){ teams(filter:{ key:{ eq:$key } }, first:1){ nodes { id } } }`,
    token,
    { key: String(ref).toUpperCase() }
  );
  return data.teams?.nodes?.[0]?.id || null;
}

async function resolveIssueId(ref: string, token: string): Promise<any> {
  const parsed = parseIdentifier(ref);
  if (!parsed) return null;
  const data = await gql(ISSUE_BY_KEY_NUMBER, token, parsed);
  return data.issues?.nodes?.[0] || null;
}

/**
 * Push a DQA comment to Linear.
 * @param comment   the stored comment (may carry comment.issueRef like "ENG-123")
 * @param userToken the reviewer's Linear OAuth token (preferred), or null
 * @param baseUrl   service base url, to absolutize the screenshot link
 */
type PushOpts = { userToken?: string | null; baseUrl?: string; action?: LinearPushMode | null; priority?: number | null };
export async function pushToLinear(comment: Comment & { issueRef: string | null }, { userToken, baseUrl, action, priority }: PushOpts = {}): Promise<any> {
  const appKey = process.env.LINEAR_API_KEY;
  const token = userToken || appKey;
  const dryRun = !token || (!userToken && (process.env.LINEAR_DRY_RUN ?? "true") !== "false");
  // Screenshots: upload to Linear's file storage so they render regardless of
  // where the DQA server runs (skipped in dry-run — no token to upload with).
  const media = dryRun
    ? { before: comment.imageUrl, after: comment.afterImageUrl }
    : {
        before: await resolveMediaUrl(token, comment.imageUrl, baseUrl),
        after: await resolveMediaUrl(token, comment.afterImageUrl, baseUrl),
      };
  const body = buildBody(comment, media);
  // Resolve the requested action: comment on the ticket (default), create a
  // sub-issue under it, or create a standalone issue (lands in Triage when
  // the team has triage enabled).
  const mode = action || (comment.issueRef ? "comment" : "issue");

  // ---- DRY RUN (dev / no real token) ----
  if (dryRun) {
    console.log(`[linear] DRY RUN — would create ${mode}${comment.issueRef ? ` (ref ${comment.issueRef})` : ""}`);
    return {
      dryRun: true,
      mode,
      issue: {
        identifier: comment.issueRef || "DQA-DRYRUN",
        url: "https://linear.app/ (dry run — sign in with Linear or set LINEAR_DRY_RUN=false)",
        title: comment.body.slice(0, 70),
      },
    };
  }

  const issueTitle = `[DQA] ${(comment.inspect?.componentPath || comment.anchor?.label || "").split(" › ").pop() || "review"}: ${comment.body.slice(0, 60)}`;

  // ---- comment onto the mapped/chosen ticket ----
  if (mode === "comment") {
    if (!comment.issueRef) throw new Error("No target ticket for comment.");
    const issue = await resolveIssueId(comment.issueRef, token);
    if (!issue) throw new Error(`Could not find Linear issue ${comment.issueRef}`);
    const data = await gql(COMMENT_CREATE, token, { input: { issueId: issue.id, body } });
    if (!data.commentCreate?.success) throw new Error("commentCreate failed");
    return {
      dryRun: false,
      mode,
      issue: {
        ...issue,
        url: data.commentCreate.comment.url || issue.url,
        // Stored so we can later detect the comment being deleted in Linear.
        commentId: data.commentCreate.comment.id,
      },
    };
  }

  // Auto-assign created issues to the reviewer (their own OAuth token), so
  // DQA findings land on the person who reported them.
  const assigneeId = userToken ? await viewerId(token) : null;

  // ---- sub-issue under the chosen ticket ----
  if (mode === "subissue") {
    if (!comment.issueRef) throw new Error("No parent ticket for sub-issue.");
    const parent = await resolveIssueId(comment.issueRef, token);
    if (!parent) throw new Error(`Could not find Linear issue ${comment.issueRef}`);
    const input: Record<string, unknown> = { teamId: parent.team.id, parentId: parent.id, title: issueTitle, description: body };
    if (priority != null) input.priority = priority;
    if (assigneeId) input.assigneeId = assigneeId;
    if (process.env.LINEAR_LABEL_ID) input.labelIds = [process.env.LINEAR_LABEL_ID];
    const data = await gql(ISSUE_CREATE, token, { input });
    if (!data.issueCreate?.success) throw new Error("issueCreate failed");
    return { dryRun: false, mode, issue: data.issueCreate.issue };
  }

  // ---- standalone issue (team triage) ----
  // Team: env LINEAR_TEAM_ID, else the team of the page's mapped ticket.
  let teamId = null;
  if (process.env.LINEAR_TEAM_ID) teamId = await resolveTeamId(process.env.LINEAR_TEAM_ID, token);
  if (!teamId && comment.issueRef) {
    const ref = await resolveIssueId(comment.issueRef, token);
    teamId = ref?.team?.id || null;
  }
  if (!teamId) throw new Error("Set LINEAR_TEAM_ID (or map a page ticket) for issue creation.");
  const input: Record<string, unknown> = { teamId, title: issueTitle, description: body };
  if (priority != null) input.priority = priority;
  if (assigneeId) input.assigneeId = assigneeId;
  if (process.env.LINEAR_LABEL_ID) input.labelIds = [process.env.LINEAR_LABEL_ID];
  const data = await gql(ISSUE_CREATE, token, { input });
  if (!data.issueCreate?.success) throw new Error("issueCreate failed");
  return { dryRun: false, mode, issue: data.issueCreate.issue };
}
