export const getTxHashResult = (result: any) => {
    // Extract transaction hash if available
    if (result && typeof result === "object") {
        if ("fillTransactionHash" in result) {
            return result.fillTransactionHash;
        } else if ("transactionHash" in result) {
            return result.transactionHash;
        }
    }
    return null;
}

export interface RhinestoneTransactionResult {
    transaction: any;
    result: any;
    fillTransactionHash: string | null;
}