// Augment Express's Request with the DQA session attached by requireAuth().
import type { Session } from "./types.ts"

declare global {
  namespace Express {
    interface Request {
      session: Session
    }
  }
}

export {}
