import { type Database, getDatabase } from "@/database";
import { createMiddleware } from "hono/factory";
import type { BaseEnv, Variables } from "../utils/hono";
import { createEnsClient, ViemClient } from '@/utils/eth';

export type InjectEthClientContext = Variables<{
    ethClient: ViemClient;
}>;

export const injectEthClient = createMiddleware<
    BaseEnv & InjectEthClientContext
>(async (c, next) => {
    const ethClient = createEnsClient(c.env);

    if (ethClient.isErr()) {
        console.error("Failed to create ENS client", ethClient.error);
        return c.json(
            {
                error: "SERVER_NOT_AVAILABLE",
            },
            500
        );
    }

    c.set("ethClient", ethClient.value);

    await next();
});
