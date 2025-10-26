export const getTxHashResult = (result: any) => {
    // Extract transaction hash if available
    if (result && typeof result === "object") {
        // New structure: { fill: { hash: "0x...", chainId: 11155111 }, claims: [] }
        if ("fill" in result && result.fill && typeof result.fill === "object") {
            if ("hash" in result.fill) {
                return result.fill.hash;
            }
        }
        // Legacy structure: direct properties
        if ("fillTransactionHash" in result) {
            return result.fillTransactionHash;
        } else if ("transactionHash" in result) {
            return result.transactionHash;
        }
    }
    return null;
}

export type RhinestoneTransactionResult = {
    hash: `0x${string}`;
}