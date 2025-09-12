import { type Database, getDatabase } from "@/database";
import { createMiddleware } from "hono/factory";
import type { BaseEnv, Variables } from "../utils/hono";

export type InjectDbContext = Variables<{
    db: Database;
}>;

export const injectDb = createMiddleware<BaseEnv & InjectDbContext>(
    async (c, next) => {
        const db = getDatabase(c.env);

        c.set("db", db);

        await next();
    }
);
