import { mainnet, sepolia } from "viem/chains";

import { createPublicClient, http } from "viem";
import { error } from "./result";
import { ok, Result } from "neverthrow";
import { extendChainWithEns  } from "@ensdomains/ensjs/chain";

const chains = {
    mainnet: extendChainWithEns(mainnet),
    sepolia: extendChainWithEns(sepolia),
};

export type ViemClient = ReturnType<typeof createEnsClient> extends Result<infer T, infer E> ? T : never;

export const createEnsClient = (env: CloudflareBindings) => {
    const chain = chains[env.CHAIN as keyof typeof chains];

    if (!chain) {
        return error({
            code: "INVALID_CHAIN",
            message: `Invalid chain: ${env.CHAIN}`,
        });
    }

    const client = createPublicClient({
        chain: chain,
        transport: http(),
    });

    return ok(client);
};
