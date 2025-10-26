"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AccountProvider: () => AccountProvider,
  ENS_SEPOLIA_CONTRACTS: () => ENS_SEPOLIA_CONTRACTS,
  ETH_REGISTRAR_CONTROLLER_ABI: () => ETH_REGISTRAR_CONTROLLER_ABI,
  EthCallFallbackError: () => EthCallFallbackError,
  GasEstimationError: () => GasEstimationError,
  GlobalTransactionToasts: () => GlobalTransactionToasts,
  ImportError: () => ImportError,
  PaymentSelector: () => PaymentSelector,
  PersistenceError: () => PersistenceError,
  RhinestoneAccountError: () => RhinestoneAccountError,
  TransactionActorManagerProvider: () => TransactionActorManagerProvider,
  TransactionDetails: () => TransactionDetails,
  TransactionManagerProvider: () => TransactionActorManagerProvider,
  TransactionModal: () => TransactionModal,
  TransactionModalHeader: () => TransactionModalHeader,
  TransactionRecoveryNotification: () => TransactionRecoveryNotification,
  TransactionRegistryProvider: () => TransactionActorManagerProvider,
  TransactionRevertedError: () => TransactionRevertedError,
  TransactionStatusPanel: () => TransactionStatusPanel,
  TransactionSteps: () => TransactionSteps,
  TransactionSubmissionError: () => TransactionSubmissionError,
  TransactionTimeoutError: () => TransactionTimeoutError,
  UserOperationError: () => UserOperationError,
  addAuditEntry: () => addAuditEntry,
  archiveTransaction: () => archiveTransaction,
  clearActiveTransactions: () => clearActiveTransactions,
  clearAuditTrail: () => clearAuditTrail,
  clearTransactionHistory: () => clearTransactionHistory,
  executeENSRenewal: () => executeENSRenewal,
  exportAllData: () => exportAllData,
  exportToJson: () => exportToJson,
  generateDebugReport: () => generateDebugReport,
  getActiveCount: () => getActiveCount,
  getActiveTransaction: () => getActiveTransaction,
  getActiveTransactions: () => getActiveTransactions,
  getENSRenewalPrice: () => getENSRenewalPrice2,
  getHistoryCount: () => getHistoryCount,
  getRhinestoneAccountAddress: () => getRhinestoneAccountAddress,
  getRhinestoneRenewalPrice: () => getENSRenewalPrice,
  getRhinestoneSmartAccountAddress: () => getRhinestoneSmartAccountAddress,
  getTransactionHistory: () => getTransactionHistory,
  getTransitionHistory: () => getTransitionHistory,
  importFromJson: () => importFromJson,
  initializeRhinestoneAccount: () => initializeRhinestoneAccount,
  isEOASigner: () => isEOASigner,
  isERC4337Signer: () => isERC4337Signer,
  isRhinestoneSigner: () => isRhinestoneSigner,
  prepareENSRenewal: () => prepareENSRenewal,
  prepareENSRenewalTransaction: () => prepareENSRenewalTransaction,
  recordTransition: () => recordTransition,
  removeActiveTransaction: () => removeActiveTransaction,
  saveActiveTransaction: () => saveActiveTransaction,
  transactionMachine: () => transactionMachine,
  transactionManager: () => transactionManager,
  useAccount: () => useAccount,
  useActiveTransactions: () => useActiveTransactions,
  useRecoveredTransactions: () => useRecoveredTransactions,
  useTransaction: () => useTransaction,
  useTransactionActorManager: () => useTransactionActorManager,
  useTransactionManager: () => useTransactionManager,
  useTransactionRegistry: () => useTransactionRegistry
});
module.exports = __toCommonJS(index_exports);

// src/types/signer.types.ts
function isEOASigner(signer) {
  return signer.type === "eoa";
}
function isRhinestoneSigner(signer) {
  return signer.type === "rhinestone";
}
function isERC4337Signer(signer) {
  return signer.type === "erc4337";
}

// src/services/transactionManager.ts
var import_xstate2 = require("xstate");

// src/machines/transaction.machine.ts
var import_xstate = require("xstate");
var import_neverthrow5 = require("@ens-apps/utils/xstate/neverthrow");
var import_neverthrow6 = require("neverthrow");
var import_neverthrow7 = require("neverthrow");

// src/actors/eoa-transport.actor.ts
var import_neverthrow = require("neverthrow");

// src/errors/transaction.errors.ts
var TransactionError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = this.constructor.name;
  }
};
var TransactionSubmissionError = class extends TransactionError {
  constructor(request, cause) {
    super("Failed to submit transaction", cause);
    this.request = request;
  }
};
var TransactionTimeoutError = class extends TransactionError {
  constructor(hash, timeout) {
    super(`Transaction timed out after ${timeout}ms`);
    this.hash = hash;
    this.timeout = timeout;
  }
};
var TransactionRevertedError = class extends TransactionError {
  constructor(hash, reason) {
    super(`Transaction reverted: ${reason || "unknown reason"}`);
    this.hash = hash;
    this.reason = reason;
  }
};
var GasEstimationError = class extends TransactionError {
  constructor(request, cause) {
    super("Failed to estimate gas", cause);
    this.request = request;
  }
};
var EthCallFallbackError = class extends TransactionError {
  constructor(request, cause) {
    super("eth_call fallback failed", cause);
    this.request = request;
  }
};
var UserOperationError = class extends TransactionError {
  constructor(userOp, cause) {
    super("User operation failed", cause);
    this.userOp = userOp;
  }
};
var PersistenceError = class extends TransactionError {
  constructor(operation, cause) {
    super(`Persistence ${operation} failed`, cause);
    this.operation = operation;
  }
};
var ImportError = class extends TransactionError {
  constructor(cause) {
    super("Failed to import data", cause);
  }
};

// src/actors/eoa-transport.actor.ts
function submitEOATransaction(input) {
  const { request, signer } = input;
  const { walletClient } = signer;
  const eoaRequest = request;
  console.log("\u{1F527} [EOA TRANSPORT] Submitting EOA transaction:", {
    from: eoaRequest.from,
    to: eoaRequest.to,
    value: eoaRequest.value?.toString(),
    hasData: !!eoaRequest.data
  });
  const txParams = {
    account: eoaRequest.from,
    to: eoaRequest.to,
    value: eoaRequest.value,
    data: eoaRequest.data,
    gas: eoaRequest.gas,
    nonce: eoaRequest.nonce,
    chain: walletClient.chain
  };
  if (eoaRequest.maxFeePerGas !== void 0) {
    txParams.maxFeePerGas = eoaRequest.maxFeePerGas;
    txParams.maxPriorityFeePerGas = eoaRequest.maxPriorityFeePerGas;
  } else if (eoaRequest.gasPrice !== void 0) {
    txParams.gasPrice = eoaRequest.gasPrice;
  }
  console.log("\u{1F527} [EOA TRANSPORT] Transaction params prepared:", {
    hasMaxFeePerGas: !!txParams.maxFeePerGas,
    hasGasPrice: !!txParams.gasPrice,
    gas: txParams.gas?.toString()
  });
  return (0, import_neverthrow.fromPromise)(
    walletClient.sendTransaction(txParams),
    (error) => {
      console.error("\u274C [EOA TRANSPORT] Transaction submission failed:", error);
      return new TransactionSubmissionError(eoaRequest, error);
    }
  );
}

// src/actors/rhinestone-transport.actor.ts
var import_neverthrow3 = require("neverthrow");

// src/helpers/rhinestone-account.helpers.ts
var import_neverthrow2 = require("neverthrow");
var import_sdk = require("@rhinestone/sdk");
var import_viem = require("viem");
var import_chains = require("viem/chains");

// src/contracts/ens-sepolia.ts
var ENS_SEPOLIA_CONTRACTS = {
  // ENS Registry
  Registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  // ETH Registrar Controller (for .eth domains)
  ETHRegistrarController: "0xfed6a969aaa60e4961fcd3ebf1a2e8913ac65b72",
  // Base Registrar Implementation
  BaseRegistrar: "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85",
  // Public Resolver
  PublicResolver: "0x9010A27463717360cAD99CEA8bD39b8705CCA238",
  // Reverse Registrar
  ReverseRegistrar: "0xa58e81fe9b61b5c3fe2afd33cf304c454abfc7cb",
  // Name Wrapper
  NameWrapper: "0x0635513f179d50a207757e05759cbd106d7dfce8"
};
var ETH_REGISTRAR_CONTROLLER_ABI = [
  {
    inputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "uint256", name: "duration", type: "uint256" }
    ],
    name: "renew",
    outputs: [{ internalType: "uint256", name: "cost", type: "uint256" }],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "uint256", name: "duration", type: "uint256" }
    ],
    name: "rentPrice",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "base", type: "uint256" },
          { internalType: "uint256", name: "premium", type: "uint256" }
        ],
        internalType: "struct IPriceOracle.Price",
        name: "price",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
];

// src/helpers/rhinestone-account.helpers.ts
var RhinestoneAccountError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RhinestoneAccountError";
  }
};
async function initializeRhinestoneAccount(walletClient, config) {
  try {
    console.log("\u{1F510} Initializing Rhinestone smart account...", {
      hasWalletClient: !!walletClient,
      hasAccount: !!walletClient?.account,
      accountAddress: walletClient?.account?.address,
      hasApiKey: !!config.rhinestoneApiKey,
      chain: config.chain?.name || import_chains.sepolia.name
    });
    if (!walletClient?.account) {
      console.error("\u274C No wallet client available for smart account initialization");
      return (0, import_neverthrow2.err)(new RhinestoneAccountError("No wallet client available"));
    }
    const rhinestone = new import_sdk.RhinestoneSDK({
      apiKey: config.rhinestoneApiKey
    });
    console.log("\u{1F4DD} [SIGNATURE REQUEST 1/2] Creating Rhinestone account with ECDSA owner - this may request a signature...");
    const account = (0, import_sdk.walletClientToAccount)(walletClient);
    console.log("\u{1F4DD} [SIGNATURE REQUEST 2/2] Calling rhinestone.createAccount() - this may request a signature...");
    const rhinestoneAccount = await rhinestone.createAccount({
      owners: {
        type: "ecdsa",
        accounts: [account]
      }
    });
    console.log("\u2705 Rhinestone account created successfully:", {
      address: rhinestoneAccount?.getAddress?.()
    });
    return (0, import_neverthrow2.ok)(rhinestoneAccount);
  } catch (error) {
    console.error("\u274C Failed to initialize smart account:", error);
    return (0, import_neverthrow2.err)(
      new RhinestoneAccountError(
        `Failed to initialize smart account: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }
}
function getRhinestoneAccountAddress(rhinestoneAccount) {
  try {
    const address = rhinestoneAccount.getAddress();
    return (0, import_neverthrow2.ok)(address);
  } catch (error) {
    return (0, import_neverthrow2.err)(
      new RhinestoneAccountError(
        `Failed to get smart account address: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }
}
async function getENSRenewalPrice(publicClient, name, duration) {
  try {
    const price = await publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
      abi: ETH_REGISTRAR_CONTROLLER_ABI,
      functionName: "rentPrice",
      args: [name, duration]
    });
    const totalPrice = price.base + price.premium;
    return (0, import_neverthrow2.ok)(totalPrice);
  } catch (error) {
    return (0, import_neverthrow2.err)(
      new RhinestoneAccountError(
        `Failed to get renewal price: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }
}
async function prepareENSRenewalTransaction(publicClient, params) {
  try {
    const { name, duration } = params;
    console.log("\u{1F4CB} Preparing ENS renewal transaction...", { name, duration: duration.toString() });
    const priceResult = await getENSRenewalPrice(publicClient, name, duration);
    if (priceResult.isErr()) {
      console.error("\u274C Failed to get renewal price:", priceResult.error);
      return (0, import_neverthrow2.err)(priceResult.error);
    }
    const renewalPrice = priceResult.value;
    console.log("\u{1F4B0} Renewal price:", renewalPrice.toString());
    const data = (0, import_viem.encodeFunctionData)({
      abi: ETH_REGISTRAR_CONTROLLER_ABI,
      functionName: "renew",
      args: [name, duration]
    });
    const txData = {
      to: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
      data,
      value: renewalPrice
    };
    console.log("\u2705 Transaction prepared:", {
      to: txData.to,
      value: txData.value.toString(),
      dataLength: txData.data.length
    });
    return (0, import_neverthrow2.ok)(txData);
  } catch (error) {
    console.error("\u274C Failed to prepare ENS renewal transaction:", error);
    return (0, import_neverthrow2.err)(
      new RhinestoneAccountError(
        `Failed to prepare ENS renewal transaction: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }
}
async function executeENSRenewal(rhinestoneAccount, publicClient, params, config) {
  try {
    console.log("\u{1F680} Executing ENS renewal...", params);
    console.log("\u2705 Using Rhinestone account:", {
      address: rhinestoneAccount.getAddress?.()
    });
    const txResult = await prepareENSRenewalTransaction(publicClient, params);
    if (txResult.isErr()) {
      return (0, import_neverthrow2.err)(txResult.error);
    }
    const { to, data, value } = txResult.value;
    const chain = config.chain || import_chains.sepolia;
    console.log("\u{1F4E4} Calling rhinestoneAccount.sendTransaction()...", {
      targetChain: chain.name,
      to,
      value: value.toString()
    });
    const transaction = await rhinestoneAccount.sendTransaction({
      sourceChains: [chain],
      targetChain: chain,
      calls: [
        {
          to,
          data,
          value
        }
      ]
    });
    console.log("\u2705 Transaction response:", transaction);
    const txHash = transaction.hash || transaction.id;
    console.log("\u2705 Transaction hash/id:", txHash);
    console.log("\u2705 Transaction type:", transaction.type);
    if (!transaction || !transaction.hash && !transaction.id) {
      console.error("\u274C No transaction hash or ID returned!", transaction);
      return (0, import_neverthrow2.err)(new RhinestoneAccountError("No transaction hash or ID returned from Rhinestone SDK"));
    }
    const hashAsHex = typeof txHash === "bigint" ? `0x${txHash.toString(16).padStart(64, "0")}` : txHash;
    console.log("\u2705 Final hash:", hashAsHex);
    return (0, import_neverthrow2.ok)(hashAsHex);
  } catch (error) {
    console.error("\u274C Failed to execute ENS renewal:", error);
    return (0, import_neverthrow2.err)(
      new RhinestoneAccountError(
        `Failed to execute ENS renewal: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }
}

// src/actors/rhinestone-transport.actor.ts
function submitRhinestoneTransaction(input) {
  const { request, signer, publicClient } = input;
  const { account, config } = signer;
  const rhinestoneRequest = request;
  console.log("\u{1F527} [RHINESTONE TRANSPORT] Submitting Rhinestone intent transaction:", {
    accountAddress: account?.getAddress?.(),
    hasParams: !!rhinestoneRequest.rhinestoneParams
  });
  if (!rhinestoneRequest.rhinestoneParams) {
    console.error("\u274C [RHINESTONE TRANSPORT] Missing rhinestoneParams");
    return (0, import_neverthrow3.errAsync)(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error("rhinestoneParams required for Rhinestone transactions")
      )
    );
  }
  console.log("\u{1F527} [RHINESTONE TRANSPORT] Executing with Rhinestone account:", {
    accountAddress: account?.getAddress?.(),
    targetChain: rhinestoneRequest.rhinestoneParams.chain?.id
  });
  return import_neverthrow3.ResultAsync.fromSafePromise(
    executeENSRenewal(account, publicClient, rhinestoneRequest.rhinestoneParams, config)
  ).andThen((result) => result).mapErr((error) => {
    console.error("\u274C [RHINESTONE TRANSPORT] Transaction submission failed:", error);
    return new TransactionSubmissionError(rhinestoneRequest, error);
  });
}

// src/services/audit-trail.service.ts
var import_neverthrow4 = require("neverthrow");
var MAX_TRANSITIONS = 1e3;
var MAX_AGE = 24 * 60 * 60 * 1e3;
var STORAGE_KEY = "@ens/audit-trail";
function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function getSessionId() {
  if (typeof window === "undefined") return "server";
  let sessionId = sessionStorage.getItem("ens-session-id");
  if (!sessionId) {
    sessionId = generateUUID();
    sessionStorage.setItem("ens-session-id", sessionId);
  }
  return sessionId;
}
function loadFromStorage() {
  if (typeof window === "undefined" || !localStorage) {
    return { transitions: [], auditLog: [] };
  }
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return { transitions: [], auditLog: [] };
    const parsed = JSON.parse(data);
    return {
      transitions: parsed.transitions || [],
      auditLog: parsed.auditLog || []
    };
  } catch (error) {
    console.warn("Failed to load audit trail from storage:", error);
    return { transitions: [], auditLog: [] };
  }
}
function saveToStorage(data) {
  if (typeof window === "undefined" || !localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, (key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    }));
  } catch (error) {
    console.warn("Failed to save audit trail to storage:", error);
  }
}
function recordTransition(transition) {
  try {
    const data = loadFromStorage();
    const entry = {
      ...transition,
      id: generateUUID(),
      timestamp: Date.now()
    };
    data.transitions.push(entry);
    if (data.transitions.length > MAX_TRANSITIONS) {
      data.transitions.shift();
    }
    saveToStorage(data);
  } catch (error) {
    console.warn("Audit service error (non-fatal):", error);
  }
}
function addAuditEntry(level, message, details) {
  try {
    const data = loadFromStorage();
    const entry = {
      transitionId: data.transitions[data.transitions.length - 1]?.id || "unknown",
      timestamp: Date.now(),
      level,
      message,
      details,
      stackTrace: level === "error" || level === "critical" ? new Error().stack : void 0
    };
    data.auditLog.push(entry);
    if (level === "critical") {
      console.error("[CRITICAL]", message, details);
    }
    saveToStorage(data);
  } catch (error) {
    console.warn("Audit service error (non-fatal):", error);
  }
}
function getTransitionHistory(filters) {
  try {
    const data = loadFromStorage();
    let history = [...data.transitions];
    if (filters?.machineId) {
      history = history.filter((t) => t.machineId === filters.machineId);
    }
    if (filters?.fromTime !== void 0) {
      const fromTime = filters.fromTime;
      history = history.filter((t) => t.timestamp >= fromTime);
    }
    if (filters?.toTime !== void 0) {
      const toTime = filters.toTime;
      history = history.filter((t) => t.timestamp <= toTime);
    }
    if (filters?.includeErrors === false) {
      history = history.filter((t) => !t.error);
    }
    return history;
  } catch (error) {
    console.warn("Audit service error (non-fatal):", error);
    return [];
  }
}
function generateDebugReport(transactionId) {
  try {
    const data = loadFromStorage();
    const relevantTransitions = transactionId ? data.transitions.filter(
      (t) => t.metadata?.transactionHash === transactionId || t.context.transactionId === transactionId
    ) : data.transitions.slice(-50);
    const relevantAuditLog = transactionId ? data.auditLog.filter(
      (entry) => relevantTransitions.some((t) => t.id === entry.transitionId)
    ) : data.auditLog.slice(-100);
    return {
      generatedAt: Date.now(),
      systemInfo: {
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Node.js",
        timestamp: Date.now(),
        sessionId: getSessionId()
      },
      transitions: relevantTransitions,
      auditLog: relevantAuditLog,
      errorSummary: generateErrorSummary(relevantTransitions),
      stateDistribution: calculateStateDistribution(relevantTransitions),
      performanceMetrics: calculatePerformanceMetrics(relevantTransitions)
    };
  } catch (error) {
    console.warn("Audit service error (non-fatal):", error);
    return null;
  }
}
function exportToJson() {
  try {
    const data = loadFromStorage();
    return JSON.stringify({
      transitions: data.transitions,
      auditLog: data.auditLog,
      exported: Date.now()
    }, null, 2);
  } catch (error) {
    console.warn("Audit service error (non-fatal):", error);
    return JSON.stringify({ transitions: [], auditLog: [], exported: Date.now() }, null, 2);
  }
}
function importFromJson(json) {
  try {
    const parsed = JSON.parse(json);
    const data = {
      transitions: parsed.transitions || [],
      auditLog: parsed.auditLog || []
    };
    saveToStorage(data);
    return (0, import_neverthrow4.ok)(void 0);
  } catch (error) {
    return (0, import_neverthrow4.err)(new ImportError({ cause: error }));
  }
}
function clearAuditTrail() {
  try {
    if (typeof window !== "undefined" && localStorage) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Audit service error (non-fatal):", error);
  }
}
function calculateStateDistribution(transitions) {
  return transitions.reduce((acc, t) => {
    acc[t.toState] = (acc[t.toState] || 0) + 1;
    return acc;
  }, {});
}
function calculatePerformanceMetrics(transitions) {
  if (transitions.length < 2) {
    return {
      avgTransitionTime: 0,
      maxTransitionTime: 0,
      minTransitionTime: 0,
      totalTransitions: transitions.length
    };
  }
  const durations = [];
  for (let i = 1; i < transitions.length; i++) {
    durations.push(transitions[i].timestamp - transitions[i - 1].timestamp);
  }
  return {
    avgTransitionTime: durations.reduce((a, b) => a + b, 0) / durations.length,
    maxTransitionTime: Math.max(...durations),
    minTransitionTime: Math.min(...durations),
    totalTransitions: transitions.length
  };
}
function generateErrorSummary(transitions) {
  const errors = transitions.filter((t) => t.error);
  const errorTypes = errors.reduce((acc, t) => {
    const errorType = t.error?.name || "Unknown";
    acc[errorType] = (acc[errorType] || 0) + 1;
    return acc;
  }, {});
  return {
    totalErrors: errors.length,
    errorRate: transitions.length > 0 ? errors.length / transitions.length * 100 : 0,
    errorTypes,
    lastError: errors[errors.length - 1]?.error
  };
}
if (typeof window !== "undefined") {
  setInterval(() => {
    try {
      const data = loadFromStorage();
      const cutoff = Date.now() - MAX_AGE;
      data.transitions = data.transitions.filter((t) => t.timestamp > cutoff);
      data.auditLog = data.auditLog.filter((e) => e.timestamp > cutoff);
      saveToStorage(data);
    } catch (error) {
      console.warn("Audit cleanup error (non-fatal):", error);
    }
  }, 60 * 60 * 1e3);
}

// src/machines/transaction.machine.ts
var transactionMachine = (0, import_xstate.setup)({
  types: {
    context: {},
    input: {},
    events: {}
  },
  actors: {
    /**
     * Submit Transaction Actor
     *
     * Routes to the appropriate transport actor based on request.type:
     * - eoa → submitEOATransaction
     * - rhinestone-intent → submitRhinestoneTransaction
     * - erc4337 → (not yet implemented)
     */
    submitTransaction: (0, import_neverthrow5.fromResultAsync)(
      ({
        request,
        signer,
        publicClient
      }) => {
        console.log("\u{1F527} [TRANSACTION] submitTransaction actor invoked:", {
          requestType: request?.type,
          signerType: signer?.type
        });
        if (!request) {
          return (0, import_neverthrow6.errAsync)(
            new TransactionSubmissionError(
              {},
              new Error("No transaction request provided")
            )
          );
        }
        if (!signer) {
          return (0, import_neverthrow6.errAsync)(
            new TransactionSubmissionError(
              request,
              new Error("No signer provided")
            )
          );
        }
        switch (signer.type) {
          case "eoa":
            return submitEOATransaction({ request, signer });
          case "rhinestone":
            return submitRhinestoneTransaction({ request, signer, publicClient });
          case "erc4337":
            return (0, import_neverthrow6.errAsync)(
              new TransactionSubmissionError(
                request,
                new Error("ERC-4337 transactions not yet implemented")
              )
            );
          default:
            return (0, import_neverthrow6.errAsync)(
              new TransactionSubmissionError(request, new Error(`Unknown signer type: ${signer.type}`))
            );
        }
      }
    ),
    /**
     * Wait for Transaction Receipt
     */
    waitForReceipt: (0, import_neverthrow5.fromResultAsync)(
      ({
        hash,
        options,
        publicClient
      }) => {
        const confirmations = options?.confirmations || 1;
        const timeout = options?.timeout || 6e4;
        console.log("\u23F3 [TRANSACTION] Waiting for receipt:", {
          hash,
          confirmations,
          timeout
        });
        return (0, import_neverthrow7.fromPromise)(
          publicClient.waitForTransactionReceipt({
            hash,
            confirmations,
            timeout
          }),
          (error) => new TransactionTimeoutError(hash, timeout)
        );
      }
    ),
    /**
     * Check transaction with eth_call fallback
     */
    checkWithEthCall: (0, import_neverthrow5.fromResultAsync)(
      ({
        request,
        publicClient
      }) => {
        if (!request) {
          return (0, import_neverthrow6.errAsync)(new EthCallFallbackError({}, new Error("No request provided")));
        }
        if (request.type === "erc4337" || request.type === "rhinestone-intent") {
          return import_neverthrow6.ResultAsync.fromSafePromise(Promise.resolve({ wouldSucceed: true }));
        }
        const eoaRequest = request;
        return (0, import_neverthrow7.fromPromise)(
          publicClient.call({
            account: eoaRequest.from,
            to: eoaRequest.to,
            data: eoaRequest.data,
            value: eoaRequest.value,
            gas: eoaRequest.gas
          }).then((result) => ({
            wouldSucceed: !result.data?.includes("0x08c379a0"),
            // Check for revert
            result: result.data
          })),
          (error) => new EthCallFallbackError(request, error)
        );
      }
    ),
    /**
     * Wait utility actor
     */
    wait: (0, import_xstate.fromPromise)(({ input }) => new Promise((resolve) => setTimeout(resolve, input)))
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < (context.options.retryCount || 3),
    shouldCheckFallback: ({ context }) => context.fallbackChecks < 3,
    wouldSucceed: (_, params) => params.wouldSucceed === true,
    isReverted: ({ context }) => context.receipt?.status === "reverted"
  },
  actions: {
    recordTransition: ({ context, self, event }) => {
      try {
        const state = self.getSnapshot();
        recordTransition({
          machineId: "transaction",
          fromState: state.status === "active" ? String(state.value) : "unknown",
          toState: String(state.value),
          event: event?.type || "unknown",
          context: {
            hash: context.hash,
            request: context.request,
            retryCount: context.retryCount
          },
          metadata: {
            chainId: context.request?.chainId,
            transactionHash: context.hash
          }
        });
      } catch (auditError) {
        console.warn("Audit service error (non-fatal):", auditError);
      }
    },
    logError: ({ context }, params) => {
      const error = params?.error || params || "Unknown error";
      try {
        addAuditEntry("error", "Transaction error occurred", {
          error,
          hash: context.hash,
          request: context.request
        });
      } catch (auditError) {
        console.warn("Audit service error (non-fatal):", auditError);
      }
      console.error("\u274C [TRANSACTION] Error:", error);
    },
    logCritical: ({ context }, params) => {
      const error = params?.error || params || "Unknown critical error";
      try {
        addAuditEntry("critical", "Critical transaction failure", {
          error,
          hash: context.hash,
          request: context.request,
          retryCount: context.retryCount
        });
      } catch (auditError) {
        console.warn("Audit service error (non-fatal):", auditError);
      }
      console.error("\u{1F525} [TRANSACTION] CRITICAL:", error);
    }
  }
}).createMachine({
  id: "transaction",
  initial: "idle",
  context: ({ input }) => {
    console.log("\u{1F3D7}\uFE0F [TRANSACTION] Initializing context:", {
      hasRequest: !!input.request,
      requestType: input.request?.type,
      hasPublicClient: !!input.publicClient,
      signerType: input.signer?.type
    });
    return {
      publicClient: input.publicClient,
      signer: input.signer,
      request: input.request,
      options: input.options || {},
      retryCount: 0,
      fallbackChecks: 0,
      modal: {
        isOpen: false,
        flowType: "single",
        currentStepIndex: 0,
        ...input.options?.modal || {}
      }
    };
  },
  on: {
    CLOSE_MODAL: {
      actions: (0, import_xstate.assign)({
        modal: ({ context }) => ({
          ...context.modal,
          isOpen: false
        })
      })
    },
    UPDATE_MODAL_DATA: {
      actions: (0, import_xstate.assign)({
        modal: ({ event, context }) => ({
          ...context.modal,
          ...event.data
        })
      })
    }
  },
  states: {
    idle: {
      entry: ({ context }) => {
        console.log("\u{1F535} [TRANSACTION] Entered idle state:", {
          hasRequest: !!context.request,
          requestType: context.request?.type
        });
      },
      always: {
        guard: ({ context }) => !!context.request && !!context.publicClient,
        target: "submitting"
      },
      on: {
        EXECUTE: {
          target: "submitting",
          actions: (0, import_xstate.assign)({
            request: ({ event }) => event.request,
            options: ({ event }) => event.options || {},
            retryCount: 0,
            fallbackChecks: 0,
            hash: void 0,
            userOpHash: void 0,
            receipt: void 0,
            error: void 0,
            modal: ({ event, context }) => ({
              ...context.modal,
              ...event.modal || {},
              isOpen: true
            })
          })
        },
        OPEN_MODAL: {
          actions: (0, import_xstate.assign)({
            modal: ({ event, context }) => ({
              ...context.modal,
              ...event.data || {},
              isOpen: true
            })
          })
        }
      }
    },
    submitting: {
      entry: [
        "recordTransition",
        ({ context }) => {
          console.log("\u{1F4E4} [TRANSACTION] Submitting transaction:", {
            requestType: context.request?.type,
            signerType: context.signer?.type
          });
        }
      ],
      invoke: {
        src: "submitTransaction",
        input: ({ context }) => ({
          request: context.request,
          signer: context.signer,
          publicClient: context.publicClient
        }),
        onDone: {
          target: "pending",
          actions: [
            (0, import_xstate.assign)({
              hash: ({ event }) => event.output,
              userOpHash: ({ event, context }) => context.request?.type === "erc4337" ? event.output : void 0
            }),
            "recordTransition",
            ({ event }) => {
              console.log("\u2705 [TRANSACTION] Transaction submitted:", {
                hash: event.output
              });
            }
          ]
        },
        onError: [
          {
            guard: "canRetry",
            target: "retrying",
            actions: [
              (0, import_xstate.assign)({
                error: ({ event }) => event.error,
                retryCount: ({ context }) => context.retryCount + 1
              }),
              "logError",
              "recordTransition"
            ]
          },
          {
            target: "error.submission",
            actions: [
              (0, import_xstate.assign)({
                error: ({ event }) => event.error
              }),
              "logCritical",
              "recordTransition"
            ]
          }
        ]
      }
    },
    pending: {
      entry: [
        "recordTransition",
        ({ context }) => {
          console.log("\u23F3 [TRANSACTION] Transaction pending:", {
            hash: context.hash
          });
        }
      ],
      invoke: {
        src: "waitForReceipt",
        input: ({ context }) => ({
          hash: context.hash,
          options: context.options,
          publicClient: context.publicClient
        }),
        onDone: {
          target: "confirming",
          actions: [
            (0, import_xstate.assign)({
              receipt: ({ event }) => event.output
            }),
            "recordTransition"
          ]
        },
        onError: [
          {
            guard: "shouldCheckFallback",
            target: "checkingFallback",
            actions: [
              (0, import_xstate.assign)({
                fallbackChecks: ({ context }) => context.fallbackChecks + 1
              }),
              "recordTransition"
            ]
          },
          {
            target: "error.timeout",
            actions: [
              (0, import_xstate.assign)({
                error: ({ event }) => event.error
              }),
              "logError",
              "recordTransition"
            ]
          }
        ]
      },
      on: {
        FORCE_SUCCESS: {
          target: "success",
          actions: "recordTransition"
        }
      }
    },
    checkingFallback: {
      entry: [
        "recordTransition",
        () => {
          console.log("\u{1F50D} [TRANSACTION] Checking with eth_call fallback");
        }
      ],
      invoke: {
        src: "checkWithEthCall",
        input: ({ context }) => ({
          request: context.request,
          publicClient: context.publicClient
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.wouldSucceed,
            target: "success",
            actions: [
              ({ context }) => {
                try {
                  addAuditEntry("warning", "Transaction succeeded via eth_call fallback", {
                    hash: context.hash,
                    request: context.request
                  });
                } catch (auditError) {
                  console.warn("Audit service error (non-fatal):", auditError);
                }
              },
              "recordTransition"
            ]
          },
          {
            target: "pending",
            actions: "recordTransition"
          }
        ],
        onError: {
          target: "pending",
          actions: "recordTransition"
        }
      }
    },
    confirming: {
      entry: [
        "recordTransition",
        ({ context }) => {
          console.log("\u2714\uFE0F [TRANSACTION] Confirming transaction:", {
            hash: context.hash,
            status: context.receipt?.status
          });
        }
      ],
      always: [
        {
          guard: "isReverted",
          target: "error.reverted",
          actions: [
            (0, import_xstate.assign)({
              error: ({ context }) => new TransactionRevertedError(`Transaction ${context.hash} reverted`)
            }),
            "logError",
            "recordTransition"
          ]
        },
        {
          target: "success",
          actions: "recordTransition"
        }
      ]
    },
    retrying: {
      entry: [
        "recordTransition",
        ({ context }) => {
          console.log("\u{1F504} [TRANSACTION] Retrying transaction (attempt ${context.retryCount})");
        }
      ],
      invoke: {
        src: "wait",
        input: ({ context }) => context.options.retryDelay || 2e3,
        onDone: {
          target: "submitting",
          actions: "recordTransition"
        }
      },
      on: {
        CANCEL: {
          target: "error.cancelled",
          actions: "recordTransition"
        }
      }
    },
    success: {
      entry: [
        "recordTransition",
        ({ context }) => {
          try {
            addAuditEntry("info", "Transaction completed successfully", {
              hash: context.hash,
              receipt: context.receipt,
              gasUsed: context.receipt?.gasUsed?.toString()
            });
          } catch (auditError) {
            console.warn("Audit service error (non-fatal):", auditError);
          }
          console.log("\u2705 [TRANSACTION] Transaction successful:", {
            hash: context.hash
          });
        }
      ],
      on: {
        EXECUTE: {
          target: "submitting",
          actions: (0, import_xstate.assign)({
            request: ({ event }) => event.request,
            options: ({ event }) => event.options || {},
            retryCount: 0,
            fallbackChecks: 0,
            hash: void 0,
            userOpHash: void 0,
            receipt: void 0,
            error: void 0
          })
        }
      }
    },
    error: {
      initial: "unknown",
      states: {
        validation: {
          entry: "recordTransition"
        },
        submission: {
          entry: "recordTransition"
        },
        timeout: {
          entry: "recordTransition"
        },
        reverted: {
          entry: "recordTransition"
        },
        cancelled: {
          entry: "recordTransition"
        },
        unknown: {
          entry: "recordTransition"
        }
      },
      on: {
        RETRY: {
          target: "submitting",
          actions: [
            (0, import_xstate.assign)({
              retryCount: ({ context }) => context.retryCount + 1,
              error: void 0
            }),
            "recordTransition"
          ]
        },
        EXECUTE: {
          target: "submitting",
          actions: (0, import_xstate.assign)({
            request: ({ event }) => event.request,
            options: ({ event }) => event.options || {},
            retryCount: 0,
            fallbackChecks: 0,
            hash: void 0,
            userOpHash: void 0,
            receipt: void 0,
            error: void 0
          })
        }
      }
    }
  }
});

// src/services/transaction-registry.service.ts
var STORAGE_PREFIX = "tx-";
function serializeTransaction(transaction) {
  return JSON.stringify(transaction, (key, value) => {
    if (typeof value === "bigint") {
      return { __bigint: value.toString() };
    }
    return value;
  });
}
function deserializeTransaction(json) {
  return JSON.parse(json, (key, value) => {
    if (value && typeof value === "object" && "__bigint" in value) {
      return BigInt(value.__bigint);
    }
    return value;
  });
}
function saveTransaction(id, transaction) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, serializeTransaction(transaction));
    console.log("\u{1F4BE} [REGISTRY] Saved transaction:", id);
  } catch (error) {
    console.error("\u274C [REGISTRY] Failed to save transaction:", error);
  }
}
function getAllTransactions() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
    return keys.map((k) => {
      const data = localStorage.getItem(k);
      return data ? deserializeTransaction(data) : null;
    }).filter(Boolean);
  } catch (error) {
    console.error("\u274C [REGISTRY] Failed to get all transactions:", error);
    return [];
  }
}
function getPendingTransactions() {
  const all = getAllTransactions();
  return all.filter(
    (tx) => tx.state === "pending" || tx.state === "submitting" || tx.state === "preparing"
  );
}
function removeTransaction(id) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
    console.log("\u{1F5D1}\uFE0F [REGISTRY] Removed transaction:", id);
  } catch (error) {
    console.error("\u274C [REGISTRY] Failed to remove transaction:", error);
  }
}

// src/services/transactionManager.ts
var TransactionManager = class {
  constructor() {
    this.transactions = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
  }
  /**
   * Start a new transaction
   *
   * SSR-safe: publicClient is passed per-transaction, not stored globally.
   *
   * @param request - Unsigned transaction request
   * @param signer - Signer capability (EOA, Rhinestone, etc.)
   * @param options - Transaction options (modal, description, publicClient, etc.)
   * @returns Transaction ID
   */
  startTransaction(request, signer, options) {
    const { publicClient, ...transactionOptions } = options;
    if (!publicClient) {
      throw new Error("publicClient is required in options");
    }
    const txId = transactionOptions.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    console.log("\u{1F680} [TRANSACTION MANAGER] Starting transaction:", {
      id: txId,
      type: request.type,
      signerType: signer.type
    });
    const actor = (0, import_xstate2.createActor)(transactionMachine, {
      input: {
        request,
        signer,
        publicClient,
        // From options, not global state
        options: transactionOptions
      }
    });
    actor.start();
    console.log("\u2705 [TRANSACTION MANAGER] Actor started:", txId);
    actor.subscribe((snapshot) => {
      const state = snapshot.value;
      const ctx = snapshot.context;
      console.log(`\u{1F4CA} [TRANSACTION MANAGER] Transaction ${txId} state:`, state);
      const persisted = {
        id: txId,
        hash: ctx.hash,
        state,
        context: {
          request,
          error: ctx.error?.message
        },
        timestamp: Date.now(),
        updatedAt: Date.now()
      };
      if (state === "success" || state === "error") {
        console.log(`\u2705 [TRANSACTION MANAGER] Removing completed transaction ${txId}`);
        removeTransaction(txId);
      } else {
        saveTransaction(txId, persisted);
      }
    });
    this.transactions.set(txId, actor);
    this.notifyListeners();
    return txId;
  }
  /**
   * Cancel a transaction
   */
  cancelTransaction(id) {
    console.log(`\u{1F6D1} [TRANSACTION MANAGER] Cancelling transaction ${id}`);
    const actor = this.transactions.get(id);
    if (actor) {
      actor.send({ type: "CANCEL" });
    }
    this.transactions.delete(id);
    this.notifyListeners();
    removeTransaction(id);
  }
  /**
   * Get a specific transaction actor by ID
   */
  getTransaction(id) {
    return this.transactions.get(id);
  }
  /**
   * Get all active transactions
   */
  getTransactions() {
    return new Map(this.transactions);
  }
  /**
   * Subscribe to transaction changes (for React integration)
   *
   * @param listener - Callback fired when transactions change
   * @returns Unsubscribe function
   */
  onTransactionsChange(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /**
   * Notify all listeners of transaction changes
   */
  notifyListeners() {
    const txCopy = this.getTransactions();
    this.listeners.forEach((listener) => listener(txCopy));
  }
  /**
   * Clear all transactions (for testing)
   */
  clear() {
    this.transactions.forEach((actor) => actor.stop());
    this.transactions.clear();
    this.notifyListeners();
  }
};
var transactionManager = new TransactionManager();

// src/providers/TransactionActorManagerProvider.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var TransactionActorManagerContext = (0, import_react.createContext)(null);
function TransactionActorManagerProvider({
  children,
  publicClient
}) {
  const [transactions, setTransactions] = (0, import_react.useState)(
    /* @__PURE__ */ new Map()
  );
  (0, import_react.useEffect)(() => {
    const unsubscribe = transactionManager.onTransactionsChange((txMap) => {
      setTransactions(txMap);
    });
    return unsubscribe;
  }, []);
  (0, import_react.useEffect)(() => {
    const pending = getPendingTransactions();
    if (pending.length === 0) {
      console.log("\u{1F535} [PROVIDER] No pending transactions to recover");
      return;
    }
    console.log(`\u{1F504} [PROVIDER] Found ${pending.length} pending transactions to recover`);
    pending.forEach((persisted) => {
      console.log("\u{1F4E6} [PROVIDER] Pending transaction:", {
        id: persisted.id,
        state: persisted.state,
        hash: persisted.hash
      });
    });
  }, []);
  const contextValue = {
    transactions
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransactionActorManagerContext.Provider, { value: contextValue, children });
}
function useTransactionActorManager() {
  const context = (0, import_react.useContext)(TransactionActorManagerContext);
  if (!context) {
    throw new Error("useTransactionActorManager must be used within TransactionActorManagerProvider");
  }
  return context;
}
function useTransactionManager() {
  return useTransactionActorManager();
}
function useTransactionRegistry() {
  return useTransactionActorManager();
}
function useTransaction(id) {
  return transactionManager.getTransaction(id);
}
function useActiveTransactions() {
  const { transactions } = useTransactionActorManager();
  return transactions;
}
function useRecoveredTransactions() {
  const [recovered, setRecovered] = (0, import_react.useState)([]);
  (0, import_react.useEffect)(() => {
    const pending = getPendingTransactions();
    setRecovered(pending);
  }, []);
  return recovered;
}

// src/providers/AccountProvider.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var AccountContext = (0, import_react2.createContext)(null);
function AccountProvider({
  children,
  walletClient,
  publicClient,
  address,
  isConnected
}) {
  const [rhinestoneAccount, setRhinestoneAccount] = (0, import_react2.useState)(void 0);
  const [isInitializingAccount, setIsInitializingAccount] = (0, import_react2.useState)(false);
  const [accountError, setAccountError] = (0, import_react2.useState)(void 0);
  (0, import_react2.useEffect)(() => {
    if (!isConnected) {
      setRhinestoneAccount(void 0);
      setAccountError(void 0);
    }
  }, [isConnected]);
  const initializeRhinestone = async (walletClient2, config) => {
    if (rhinestoneAccount) {
      console.log("\u{1F510} [ACCOUNT] Rhinestone account already initialized");
      return;
    }
    setIsInitializingAccount(true);
    setAccountError(void 0);
    console.log("\u{1F510} [ACCOUNT] Initializing Rhinestone account...");
    const result = await initializeRhinestoneAccount(walletClient2, config);
    if (result.isErr()) {
      console.error("\u274C [ACCOUNT] Failed to initialize Rhinestone account:", result.error);
      setAccountError(result.error);
      setIsInitializingAccount(false);
      return;
    }
    console.log("\u2705 [ACCOUNT] Rhinestone account initialized:", {
      address: result.value?.getAddress?.()
    });
    setRhinestoneAccount(result.value);
    setIsInitializingAccount(false);
  };
  const clearAccount = () => {
    console.log("\u{1F9F9} [ACCOUNT] Clearing Rhinestone account");
    setRhinestoneAccount(void 0);
    setAccountError(void 0);
  };
  const contextValue = {
    address,
    isConnected,
    walletClient,
    publicClient,
    rhinestoneAccount,
    isInitializingAccount,
    accountError,
    initializeRhinestone,
    clearAccount
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AccountContext.Provider, { value: contextValue, children });
}
function useAccount() {
  const context = (0, import_react2.useContext)(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return context;
}

// src/helpers/ens-renewal.helpers.ts
var import_neverthrow8 = require("neverthrow");
async function prepareENSRenewal(params) {
  const {
    publicClient,
    walletClient,
    name,
    duration,
    chainId,
    useSmartAccount,
    rhinestoneConfig
  } = params;
  try {
    if (!walletClient?.account?.address) {
      return (0, import_neverthrow8.err)(new Error("Wallet client with account address is required"));
    }
    const from = walletClient.account.address;
    const txResult = await prepareENSRenewalTransaction(publicClient, {
      name,
      duration
    });
    if (txResult.isErr()) {
      return (0, import_neverthrow8.err)(txResult.error);
    }
    const { to, data, value } = txResult.value;
    if (useSmartAccount && rhinestoneConfig) {
      return (0, import_neverthrow8.ok)({
        request: {
          type: "rhinestone-intent",
          to,
          data,
          value,
          from,
          chainId,
          rhinestoneParams: { name, duration }
        },
        options: {
          rhinestoneConfig
        }
      });
    } else {
      return (0, import_neverthrow8.ok)({
        request: {
          type: "eoa",
          to,
          data,
          value,
          from,
          chainId
        }
      });
    }
  } catch (error) {
    return (0, import_neverthrow8.err)(
      error instanceof Error ? error : new Error("Failed to prepare ENS renewal")
    );
  }
}
async function getENSRenewalPrice2(publicClient, name, duration) {
  const result = await prepareENSRenewalTransaction(publicClient, { name, duration });
  return result.map((tx) => tx.value).mapErr((err4) => err4);
}
async function getRhinestoneSmartAccountAddress(publicClient, walletClient, rhinestoneConfig) {
  if (!rhinestoneConfig) {
    return (0, import_neverthrow8.err)(new Error("Rhinestone config required"));
  }
  const accountResult = await initializeRhinestoneAccount(walletClient, rhinestoneConfig);
  if (accountResult.isErr()) {
    return (0, import_neverthrow8.err)(accountResult.error);
  }
  return getRhinestoneAccountAddress(accountResult.value).mapErr((err4) => err4);
}

// src/components/TransactionModal/TransactionModal.tsx
var import_react3 = require("react");

// src/components/TransactionModal/TransactionModalHeader.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function TransactionModalHeader({
  title,
  ensName,
  avatarUrl,
  status
}) {
  const getStatusLabel = () => {
    if (status === "success") return "Done";
    if (status?.startsWith("error")) return "Failed";
    if (status === "submitting" || status === "pending" || status === "retrying") {
      return "In Progress";
    }
    if (status === "preparing" || status === "idle") return "Not started";
    return status;
  };
  const statusLabel = getStatusLabel();
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { textAlign: "center" }, children: [
    ensName && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginBottom: "16px" }, children: [
      avatarUrl ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "img",
        {
          src: avatarUrl,
          alt: ensName,
          style: {
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            objectFit: "cover",
            marginBottom: "12px"
          }
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "div",
        {
          style: {
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "32px",
            color: "white",
            fontWeight: "bold",
            marginBottom: "12px"
          },
          children: ensName.charAt(0).toUpperCase()
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "div",
        {
          style: {
            fontSize: "20px",
            fontWeight: "600",
            color: "#333",
            marginBottom: "4px"
          },
          children: ensName
        }
      )
    ] }),
    title && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "8px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "span",
        {
          style: {
            fontSize: "14px",
            color: "#666",
            background: "#f5f5f5",
            padding: "4px 8px",
            borderRadius: "4px"
          },
          children: "[title]"
        }
      ),
      statusLabel && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "span",
        {
          style: {
            fontSize: "12px",
            color: "#666",
            padding: "2px 6px",
            borderRadius: "4px",
            background: "#f5f5f5"
          },
          children: statusLabel
        }
      )
    ] })
  ] });
}

// src/components/TransactionModal/TransactionSteps.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function TransactionSteps({ steps, currentStepIndex }) {
  if (!steps || steps.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { marginTop: "20px" }, children: steps.map((step, index) => {
    const isActive = index === currentStepIndex;
    const isCompleted = step.status === "completed";
    const isFailed = step.status === "failed";
    const isInProgress = step.status === "in_progress";
    const getStepIcon = () => {
      if (isCompleted) return "\u2713";
      if (isFailed) return "\u2717";
      if (isInProgress) return "\u27F3";
      return "\u2192";
    };
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          padding: "12px",
          marginBottom: index < steps.length - 1 ? "8px" : 0,
          background: isActive ? "#f5f5f5" : "transparent",
          borderRadius: "8px",
          borderLeft: `3px solid ${isCompleted ? "#4CAF50" : isFailed ? "#F44336" : isInProgress ? "#2196F3" : "#E0E0E0"}`
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "div",
            {
              style: {
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                background: isCompleted ? "#4CAF50" : isFailed ? "#F44336" : isInProgress ? "#2196F3" : "#E0E0E0",
                color: isCompleted || isFailed || isInProgress ? "white" : "#666",
                flexShrink: 0
              },
              children: getStepIcon()
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "div",
              {
                style: {
                  fontSize: "14px",
                  fontWeight: isActive ? "600" : "500",
                  color: isFailed ? "#F44336" : "#333",
                  marginBottom: step.description ? "4px" : 0
                },
                children: step.title
              }
            ),
            step.description && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: "12px", color: "#666" }, children: step.description }),
            step.hash && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "a",
              {
                href: `https://sepolia.etherscan.io/tx/${step.hash}`,
                target: "_blank",
                rel: "noopener noreferrer",
                style: {
                  fontSize: "12px",
                  color: "#2196F3",
                  textDecoration: "none",
                  display: "inline-block",
                  marginTop: "4px"
                },
                children: "View transaction \u2197"
              }
            ),
            isFailed && step.error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "div",
              {
                style: {
                  fontSize: "12px",
                  color: "#F44336",
                  marginTop: "4px",
                  padding: "8px",
                  background: "#FFEBEE",
                  borderRadius: "4px"
                },
                children: step.error
              }
            )
          ] })
        ]
      },
      step.id
    );
  }) });
}

// src/components/TransactionModal/TransactionDetails.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function TransactionDetails({
  network,
  estimatedCost,
  status
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      style: {
        marginTop: "20px",
        padding: "16px",
        background: "#f9f9f9",
        borderRadius: "8px",
        border: "1px solid #e0e0e0"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: estimatedCost ? "12px" : 0
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "14px", color: "#666" }, children: "Network" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "6px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "div",
                  {
                    style: {
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: network.toLowerCase().includes("sepolia") ? "#FFA726" : "linear-gradient(135deg, #627EEA 0%, #8A92B2 100%)"
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "14px", fontWeight: "500", color: "#333" }, children: network })
              ] })
            ]
          }
        ),
        estimatedCost && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "14px", color: "#666" }, children: "Est. cost" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "14px", fontWeight: "500", color: "#333" }, children: estimatedCost })
            ]
          }
        )
      ]
    }
  );
}

// src/components/TransactionModal/PaymentSelector.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function PaymentSelector({ options, selected, onSelect }) {
  if (!options || options.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { marginTop: "20px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "h3",
      {
        style: {
          fontSize: "16px",
          fontWeight: "600",
          color: "#333",
          marginBottom: "12px"
        },
        children: "Choose payment"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: options.map((option) => {
      const isSelected = selected === option.method;
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        "button",
        {
          onClick: () => onSelect?.(option.method),
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: isSelected ? "#E3F2FD" : "white",
            border: `2px solid ${isSelected ? "#2196F3" : "#E0E0E0"}`,
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s"
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "12px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "div",
                {
                  style: {
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    border: `2px solid ${isSelected ? "#2196F3" : "#ccc"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  },
                  children: isSelected && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                    "div",
                    {
                      style: {
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#2196F3"
                      }
                    }
                  )
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "div",
                {
                  style: {
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: option.method.includes("usdc") ? "#2775CA" : "linear-gradient(135deg, #627EEA 0%, #8A92B2 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "bold"
                  },
                  children: option.method.includes("usdc") ? "U" : "\u039E"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { fontSize: "14px", fontWeight: "500", color: "#333" }, children: option.label }),
                option.network && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { fontSize: "12px", color: "#666" }, children: option.network })
              ] })
            ] }),
            option.balance && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { fontSize: "14px", color: "#666" }, children: option.balance })
          ]
        },
        option.method
      );
    }) })
  ] });
}

// src/components/TransactionModal/TransactionModal.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function TransactionModal({
  isOpen,
  title,
  ensName,
  avatarUrl,
  network,
  estimatedCost,
  steps,
  currentStepIndex = 0,
  flowType = "single",
  selectedPayment,
  paymentOptions,
  machineState = "idle",
  onClose,
  onStart,
  onContinue,
  onDone,
  onRetry,
  onPaymentSelect,
  onBack
}) {
  (0, import_react3.useEffect)(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);
  (0, import_react3.useEffect)(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);
  if (!isOpen) return null;
  const isIdle = machineState === "idle" || machineState === "preparing";
  const isInProgress = machineState === "submitting" || machineState === "pending" || machineState === "confirming";
  const isSuccess = machineState === "success";
  const isError = machineState.startsWith("error");
  const isRetrying = machineState === "retrying";
  console.log("TransactionModal - machineState:", machineState, { isIdle, isInProgress, isSuccess, isError, isRetrying });
  const getButtonConfig = () => {
    if (isSuccess) {
      return {
        text: "Done",
        onClick: onDone,
        disabled: false
      };
    }
    if (isError) {
      return {
        text: "Retry",
        onClick: onRetry,
        disabled: false
      };
    }
    if (isInProgress || isRetrying) {
      return {
        text: isRetrying ? "Retrying..." : "Waiting...",
        onClick: void 0,
        disabled: true
      };
    }
    if (steps && steps.length > 1 && currentStepIndex < steps.length - 1) {
      return {
        text: "Continue",
        onClick: onContinue,
        disabled: false
      };
    }
    return {
      text: "Start",
      onClick: onStart,
      disabled: false
    };
  };
  const buttonConfig = getButtonConfig();
  const showPaymentSelector = isIdle && paymentOptions && paymentOptions.length > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
    "div",
    {
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1e3,
        padding: "20px"
      },
      onClick: onClose,
      children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
        "div",
        {
          style: {
            backgroundColor: "white",
            borderRadius: "12px",
            maxWidth: "420px",
            width: "100%",
            maxHeight: "90vh",
            overflow: "auto",
            position: "relative",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)"
          },
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "button",
              {
                onClick: onClose,
                style: {
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "transparent",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  padding: "4px 8px",
                  lineHeight: 1,
                  color: "#666"
                },
                "aria-label": "Close modal",
                children: "\xD7"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { padding: "24px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                TransactionModalHeader,
                {
                  title,
                  ensName,
                  avatarUrl,
                  status: machineState
                }
              ),
              isInProgress && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                "div",
                {
                  style: {
                    marginTop: "16px",
                    padding: "8px 12px",
                    background: "#FFF3E0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: "#F57C00",
                    textAlign: "center"
                  },
                  children: [
                    "\u23F3 ",
                    isRetrying ? "Retrying transaction..." : "Transaction in progress..."
                  ]
                }
              ),
              isSuccess && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                "div",
                {
                  style: {
                    marginTop: "16px",
                    padding: "8px 12px",
                    background: "#E8F5E9",
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: "#2E7D32",
                    textAlign: "center"
                  },
                  children: "\u2713 Transaction completed"
                }
              ),
              isError && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                "div",
                {
                  style: {
                    marginTop: "16px",
                    padding: "8px 12px",
                    background: "#FFEBEE",
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: "#C62828",
                    textAlign: "center"
                  },
                  children: "\u2717 Transaction failed"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                TransactionDetails,
                {
                  network: network || "Mainnet",
                  estimatedCost,
                  status: machineState
                }
              ),
              steps && steps.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                TransactionSteps,
                {
                  steps,
                  currentStepIndex
                }
              ),
              showPaymentSelector && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                PaymentSelector,
                {
                  options: paymentOptions,
                  selected: selectedPayment,
                  onSelect: onPaymentSelect
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { marginTop: "24px", display: "flex", gap: "12px" }, children: [
                onBack && currentStepIndex > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  "button",
                  {
                    onClick: onBack,
                    style: {
                      flex: 1,
                      padding: "12px 24px",
                      fontSize: "16px",
                      background: "#f5f5f5",
                      color: "#333",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: 500
                    },
                    children: "\u2190 Back"
                  }
                ),
                buttonConfig.onClick && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  "button",
                  {
                    onClick: buttonConfig.onClick,
                    disabled: buttonConfig.disabled,
                    style: {
                      flex: 1,
                      padding: "12px 24px",
                      fontSize: "16px",
                      background: buttonConfig.disabled ? "#ccc" : "#2196F3",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: buttonConfig.disabled ? "not-allowed" : "pointer",
                      fontWeight: 500
                    },
                    children: buttonConfig.text
                  }
                )
              ] })
            ] })
          ]
        }
      )
    }
  );
}

// src/components/TransactionRecoveryNotification.tsx
var import_react4 = __toESM(require("react"));
var import_jsx_runtime8 = require("react/jsx-runtime");
function TransactionRecoveryNotification({
  render,
  autoRecover = false
}) {
  const recoveredTransactions = useRecoveredTransactions();
  const [dismissed, setDismissed] = import_react4.default.useState(false);
  import_react4.default.useEffect(() => {
    if (autoRecover && recoveredTransactions.length > 0) {
      console.log("\u{1F504} [RECOVERY] Auto-recover not yet implemented");
    }
  }, [autoRecover, recoveredTransactions.length]);
  const handleRecover = () => {
    console.log("\u{1F504} [RECOVERY] Manual recover not yet implemented");
    setDismissed(true);
  };
  const handleDismiss = () => {
    console.log("\u{1F504} [RECOVERY] Clear recovered not yet implemented");
    setDismissed(true);
  };
  if (dismissed || recoveredTransactions.length === 0 || autoRecover) {
    return null;
  }
  if (render) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children: render({
      count: recoveredTransactions.length,
      onRecover: handleRecover,
      onDismiss: handleDismiss,
      transactions: recoveredTransactions
    }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    "div",
    {
      style: {
        position: "fixed",
        top: 20,
        right: 20,
        padding: "16px 24px",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 9999,
        maxWidth: 400
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { style: { margin: "0 0 8px 0", fontSize: 16, fontWeight: 600 }, children: "Pending Transactions Found" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { style: { margin: "0 0 16px 0", fontSize: 14, color: "#666" }, children: [
          recoveredTransactions.length,
          " pending transaction(s) were found from a previous session. Would you like to resume tracking them?"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
            "button",
            {
              onClick: handleRecover,
              style: {
                padding: "8px 16px",
                background: "#4CAF50",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 14
              },
              children: [
                "Resume (",
                recoveredTransactions.length,
                ")"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "button",
            {
              onClick: handleDismiss,
              style: {
                padding: "8px 16px",
                background: "#fff",
                color: "#666",
                border: "1px solid #ddd",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 14
              },
              children: "Dismiss"
            }
          )
        ] })
      ]
    }
  );
}

// src/components/GlobalTransactionToasts.tsx
var import_react5 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
function GlobalTransactionToasts({
  render,
  autoDismiss = 5e3,
  maxToasts = 5,
  enabled = true
}) {
  const transactions = useActiveTransactions();
  const [toasts, setToasts] = (0, import_react5.useState)([]);
  const [seenStates, setSeenStates] = (0, import_react5.useState)(/* @__PURE__ */ new Map());
  (0, import_react5.useEffect)(() => {
    if (!enabled) return;
    const subscriptions = [];
    transactions.forEach((actor, txId) => {
      const subscription = actor.subscribe((snapshot) => {
        const state = snapshot.value;
        const context = snapshot.context;
        const seen = seenStates.get(txId) || /* @__PURE__ */ new Set();
        if (seen.has(state)) return;
        let toast = null;
        switch (state) {
          case "submitting":
            toast = {
              id: `${txId}-submitting`,
              type: "info",
              message: "Submitting transaction...",
              txId,
              timestamp: Date.now()
            };
            break;
          case "pending":
            toast = {
              id: `${txId}-pending`,
              type: "info",
              message: `Transaction pending: ${context.hash?.slice(0, 10)}...`,
              txId,
              timestamp: Date.now()
            };
            break;
          case "confirmed":
            toast = {
              id: `${txId}-confirmed`,
              type: "success",
              message: "Transaction confirmed!",
              txId,
              timestamp: Date.now()
            };
            break;
          case "failed":
            toast = {
              id: `${txId}-failed`,
              type: "error",
              message: `Transaction failed: ${context.error?.message || "Unknown error"}`,
              txId,
              timestamp: Date.now()
            };
            break;
        }
        if (toast) {
          const updatedSeen = new Set(seen).add(state);
          setSeenStates((prev) => new Map(prev).set(txId, updatedSeen));
          setToasts((prev) => {
            const newToasts = [...prev, toast];
            return newToasts.slice(-maxToasts);
          });
          if (autoDismiss > 0) {
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }, autoDismiss);
          }
        }
      });
      subscriptions.push(subscription);
    });
    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [transactions, enabled, autoDismiss, maxToasts, seenStates]);
  const handleDismiss = (toastId) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };
  if (!enabled || toasts.length === 0) {
    return null;
  }
  if (render) {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_jsx_runtime9.Fragment, { children: render(toasts, handleDismiss) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
    "div",
    {
      style: {
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 400
      },
      children: [
        toasts.map((toast) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "div",
          {
            style: {
              padding: "12px 16px",
              background: getToastColor(toast.type),
              color: "#fff",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              animation: "slideIn 0.3s ease-out"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: { flex: 1, fontSize: 14 }, children: toast.message }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                "button",
                {
                  onClick: () => handleDismiss(toast.id),
                  style: {
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 20,
                    padding: 0,
                    lineHeight: 1
                  },
                  children: "\xD7"
                }
              )
            ]
          },
          toast.id
        )),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("style", { children: `
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      ` })
      ]
    }
  );
}
function getToastColor(type) {
  switch (type) {
    case "success":
      return "#4CAF50";
    case "error":
      return "#f44336";
    case "warning":
      return "#ff9800";
    case "info":
    default:
      return "#2196F3";
  }
}

// src/components/TransactionStatusPanel.tsx
var import_react6 = __toESM(require("react"));
var import_jsx_runtime10 = require("react/jsx-runtime");
function TransactionStatusPanel({
  render,
  filter,
  maxTransactions,
  position = "bottom-left",
  enabled = true
}) {
  const activeTransactions = useActiveTransactions();
  const transactions = import_react6.default.useMemo(() => {
    const txArray = [];
    activeTransactions.forEach((actor, id) => {
      const snapshot = actor.getSnapshot();
      const state = snapshot.value;
      const context = snapshot.context;
      if (filter && !filter.includes(state)) {
        return;
      }
      txArray.push({
        id,
        state,
        hash: context.hash,
        error: context.error?.message,
        canCancel: state !== "confirmed" && state !== "failed"
      });
    });
    const limited = maxTransactions ? txArray.slice(-maxTransactions) : txArray;
    return limited;
  }, [activeTransactions, filter, maxTransactions]);
  const handleCancel = (id) => {
    const actor = activeTransactions.get(id);
    if (actor) {
      actor.send({ type: "CANCEL" });
    }
  };
  if (!enabled || transactions.length === 0) {
    return null;
  }
  if (render) {
    return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_jsx_runtime10.Fragment, { children: render(transactions, handleCancel) });
  }
  const positionStyles = getPositionStyles(position);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
    "div",
    {
      style: {
        position: "fixed",
        ...positionStyles,
        width: 320,
        maxHeight: 400,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 9998,
        overflow: "hidden"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "div",
          {
            style: {
              padding: "12px 16px",
              borderBottom: "1px solid #ddd",
              background: "#f5f5f5"
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600 }, children: [
              "Active Transactions (",
              transactions.length,
              ")"
            ] })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "div",
          {
            style: {
              maxHeight: 350,
              overflowY: "auto"
            },
            children: transactions.map((tx) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
              "div",
              {
                style: {
                  padding: "12px 16px",
                  borderBottom: "1px solid #eee"
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
                    "div",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                          "span",
                          {
                            style: {
                              fontSize: 12,
                              fontWeight: 600,
                              color: getStateColor(tx.state),
                              textTransform: "uppercase"
                            },
                            children: tx.state
                          }
                        ),
                        tx.canCancel && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                          "button",
                          {
                            onClick: () => handleCancel(tx.id),
                            style: {
                              padding: "4px 8px",
                              fontSize: 11,
                              background: "transparent",
                              color: "#999",
                              border: "1px solid #ddd",
                              borderRadius: 4,
                              cursor: "pointer"
                            },
                            children: "Cancel"
                          }
                        )
                      ]
                    }
                  ),
                  tx.hash && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
                    "div",
                    {
                      style: {
                        fontSize: 11,
                        color: "#666",
                        fontFamily: "monospace",
                        marginBottom: 4
                      },
                      children: [
                        tx.hash.slice(0, 10),
                        "...",
                        tx.hash.slice(-8)
                      ]
                    }
                  ),
                  tx.error && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                    "div",
                    {
                      style: {
                        fontSize: 11,
                        color: "#f44336",
                        marginTop: 4
                      },
                      children: tx.error
                    }
                  )
                ]
              },
              tx.id
            ))
          }
        )
      ]
    }
  );
}
function getPositionStyles(position) {
  switch (position) {
    case "top-left":
      return { top: 20, left: 20 };
    case "top-right":
      return { top: 20, right: 20 };
    case "bottom-left":
      return { bottom: 20, left: 20 };
    case "bottom-right":
      return { bottom: 20, right: 20 };
    default:
      return { bottom: 20, left: 20 };
  }
}
function getStateColor(state) {
  switch (state) {
    case "confirmed":
      return "#4CAF50";
    case "failed":
      return "#f44336";
    case "pending":
      return "#ff9800";
    case "submitting":
    case "preparing":
      return "#2196F3";
    default:
      return "#666";
  }
}

// src/helpers/transaction-persistence.ts
var import_idb = require("idb");
var DB_NAME = "ens-transaction-manager";
var DB_VERSION = 1;
var ACTIVE_STORE = "active-transactions";
var HISTORY_STORE = "transaction-history";
var MAX_HISTORY_SIZE = 1e3;
async function initDB() {
  return (0, import_idb.openDB)(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(ACTIVE_STORE)) {
        const activeStore = db.createObjectStore(ACTIVE_STORE, { keyPath: "id" });
        activeStore.createIndex("status", "status");
        activeStore.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
        historyStore.createIndex("timestamp", "timestamp");
        historyStore.createIndex("status", "status");
      }
    }
  });
}
async function saveActiveTransaction(transaction) {
  const db = await initDB();
  await db.put(ACTIVE_STORE, {
    ...transaction,
    updatedAt: Date.now()
  });
}
async function getActiveTransactions() {
  const db = await initDB();
  return db.getAll(ACTIVE_STORE);
}
async function getActiveTransaction(id) {
  const db = await initDB();
  return db.get(ACTIVE_STORE, id);
}
async function removeActiveTransaction(id) {
  const db = await initDB();
  await db.delete(ACTIVE_STORE, id);
}
async function archiveTransaction(transaction) {
  const db = await initDB();
  await db.put(HISTORY_STORE, {
    ...transaction,
    updatedAt: Date.now()
  });
  await db.delete(ACTIVE_STORE, transaction.id);
  await pruneHistory(db);
}
async function pruneHistory(db) {
  const tx = db.transaction(HISTORY_STORE, "readwrite");
  const store = tx.objectStore(HISTORY_STORE);
  const index = store.index("timestamp");
  const allEntries = await index.getAll();
  if (allEntries.length > MAX_HISTORY_SIZE) {
    const entriesToDelete = allEntries.length - MAX_HISTORY_SIZE;
    const sortedByTimestamp = allEntries.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < entriesToDelete; i++) {
      await store.delete(sortedByTimestamp[i].id);
    }
  }
  await tx.done;
}
async function getTransactionHistory(limit) {
  const db = await initDB();
  const tx = db.transaction(HISTORY_STORE, "readonly");
  const index = tx.objectStore(HISTORY_STORE).index("timestamp");
  const allEntries = await index.getAll();
  const sorted = allEntries.sort((a, b) => b.timestamp - a.timestamp);
  return limit ? sorted.slice(0, limit) : sorted;
}
async function clearActiveTransactions() {
  const db = await initDB();
  await db.clear(ACTIVE_STORE);
}
async function clearTransactionHistory() {
  const db = await initDB();
  await db.clear(HISTORY_STORE);
}
async function getHistoryCount() {
  const db = await initDB();
  return db.count(HISTORY_STORE);
}
async function getActiveCount() {
  const db = await initDB();
  return db.count(ACTIVE_STORE);
}
async function exportAllData() {
  const db = await initDB();
  const [active, history] = await Promise.all([
    db.getAll(ACTIVE_STORE),
    db.getAll(HISTORY_STORE)
  ]);
  return { active, history };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AccountProvider,
  ENS_SEPOLIA_CONTRACTS,
  ETH_REGISTRAR_CONTROLLER_ABI,
  EthCallFallbackError,
  GasEstimationError,
  GlobalTransactionToasts,
  ImportError,
  PaymentSelector,
  PersistenceError,
  RhinestoneAccountError,
  TransactionActorManagerProvider,
  TransactionDetails,
  TransactionManagerProvider,
  TransactionModal,
  TransactionModalHeader,
  TransactionRecoveryNotification,
  TransactionRegistryProvider,
  TransactionRevertedError,
  TransactionStatusPanel,
  TransactionSteps,
  TransactionSubmissionError,
  TransactionTimeoutError,
  UserOperationError,
  addAuditEntry,
  archiveTransaction,
  clearActiveTransactions,
  clearAuditTrail,
  clearTransactionHistory,
  executeENSRenewal,
  exportAllData,
  exportToJson,
  generateDebugReport,
  getActiveCount,
  getActiveTransaction,
  getActiveTransactions,
  getENSRenewalPrice,
  getHistoryCount,
  getRhinestoneAccountAddress,
  getRhinestoneRenewalPrice,
  getRhinestoneSmartAccountAddress,
  getTransactionHistory,
  getTransitionHistory,
  importFromJson,
  initializeRhinestoneAccount,
  isEOASigner,
  isERC4337Signer,
  isRhinestoneSigner,
  prepareENSRenewal,
  prepareENSRenewalTransaction,
  recordTransition,
  removeActiveTransaction,
  saveActiveTransaction,
  transactionMachine,
  transactionManager,
  useAccount,
  useActiveTransactions,
  useRecoveredTransactions,
  useTransaction,
  useTransactionActorManager,
  useTransactionManager,
  useTransactionRegistry
});
//# sourceMappingURL=index.js.map