// Dead-simple JSON-file store. Zero native deps so `pnpm install` never fails on a
// teammate's machine. Swap for Postgres/SQLite when this graduates past v0.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Comment, Reply } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");
const DB_FILE = resolve(DATA_DIR, "comments.json");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

let state: { comments: Comment[] } = { comments: [] };
if (existsSync(DB_FILE)) {
  try {
    state = JSON.parse(readFileSync(DB_FILE, "utf8"));
  } catch {
    state = { comments: [] };
  }
}

function persist(): void {
  writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

export function listComments(url?: string): Comment[] {
  if (!url) return state.comments;
  return state.comments.filter((c) => c.url === url);
}

export function addComment(comment: Comment): Comment {
  state.comments.push(comment);
  persist();
  return comment;
}

export function addReply(commentId: string, reply: Reply): Comment | null {
  const c = state.comments.find((x) => x.id === commentId);
  if (!c) return null;
  c.replies = c.replies || [];
  c.replies.push(reply);
  persist();
  return c;
}

export function updateComment(commentId: string, patch: Partial<Comment>): Comment | null {
  const c = state.comments.find((x) => x.id === commentId);
  if (!c) return null;
  Object.assign(c, patch);
  persist();
  return c;
}

export function removeComment(commentId: string): Comment | null {
  const idx = state.comments.findIndex((x) => x.id === commentId);
  if (idx === -1) return null;
  const [removed] = state.comments.splice(idx, 1);
  persist();
  return removed ?? null;
}
