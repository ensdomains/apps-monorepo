// src/services/transaction.service.ts
import { ok as ok2, err as err2, fromPromise } from "neverthrow";

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

// src/services/rhinestone-account.service.ts
import { err, ok } from "neverthrow";
import { RhinestoneSDK, walletClientToAccount } from "@rhinestone/sdk";
import {
  encodeFunctionData
} from "viem";
import { sepolia } from "viem/chains";

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

// src/services/rhinestone-account.service.ts
var RhinestoneAccountError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RhinestoneAccountError";
  }
};
var RhinestoneAccountService = class {
  constructor(publicClient, walletClient, config) {
    this.walletClient = walletClient;
    this.publicClient = publicClient;
    this.config = {
      chain: config?.chain || sepolia,
      bundlerUrl: config?.bundlerUrl,
      paymasterUrl: config?.paymasterUrl,
      rhinestoneApiKey: config?.rhinestoneApiKey
    };
    this.rhinestone = new RhinestoneSDK({
      apiKey: config?.rhinestoneApiKey
    });
  }
  async initializeSmartAccount() {
    try {
      console.log("\u{1F510} Initializing Rhinestone smart account...", {
        hasWalletClient: !!this.walletClient,
        hasAccount: !!this.walletClient?.account,
        accountAddress: this.walletClient?.account?.address,
        hasApiKey: !!this.config.rhinestoneApiKey,
        chain: this.config.chain?.name
      });
      if (!this.walletClient?.account) {
        console.error("\u274C No wallet client available for smart account initialization");
        return err(new RhinestoneAccountError("No wallet client available"));
      }
      console.log("\u{1F4DD} Creating Rhinestone account with ECDSA owner...");
      const account = walletClientToAccount(this.walletClient);
      this.rhinestoneAccount = await this.rhinestone.createAccount({
        owners: {
          type: "ecdsa",
          accounts: [account]
        }
      });
      console.log("\u2705 Rhinestone account created successfully:", {
        address: this.rhinestoneAccount?.getAddress?.()
      });
      return ok(this.rhinestoneAccount);
    } catch (error) {
      console.error("\u274C Failed to initialize smart account:", error);
      return err(
        new RhinestoneAccountError(
          `Failed to initialize smart account: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  }
  async getSmartAccountAddress() {
    try {
      if (!this.rhinestoneAccount) {
        const initResult = await this.initializeSmartAccount();
        if (initResult.isErr()) {
          return err(initResult.error);
        }
      }
      const address = this.rhinestoneAccount.getAddress();
      return ok(address);
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to get smart account address: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  }
  async getRenewalPrice(name, duration) {
    try {
      const price = await this.publicClient.readContract({
        address: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [name, duration]
      });
      const totalPrice = price.base + price.premium;
      return ok(totalPrice);
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to get renewal price: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  }
  async prepareENSRenewalTransaction(params) {
    try {
      const { name, duration } = params;
      console.log("\u{1F4CB} Preparing ENS renewal transaction...", { name, duration: duration.toString() });
      const priceResult = await this.getRenewalPrice(name, duration);
      if (priceResult.isErr()) {
        console.error("\u274C Failed to get renewal price:", priceResult.error);
        return err(priceResult.error);
      }
      const renewalPrice = priceResult.value;
      console.log("\u{1F4B0} Renewal price:", renewalPrice.toString());
      const data = encodeFunctionData({
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
      return ok(txData);
    } catch (error) {
      console.error("\u274C Failed to prepare ENS renewal transaction:", error);
      return err(
        new RhinestoneAccountError(
          `Failed to prepare ENS renewal transaction: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  }
  async executeENSRenewal(params) {
    try {
      console.log("\u{1F680} Executing ENS renewal...", params);
      if (!this.rhinestoneAccount) {
        console.log("\u2699\uFE0F Smart account not initialized, initializing now...");
        const initResult = await this.initializeSmartAccount();
        if (initResult.isErr()) {
          return err(initResult.error);
        }
      }
      const txResult = await this.prepareENSRenewalTransaction(params);
      if (txResult.isErr()) {
        return err(txResult.error);
      }
      const { to, data, value } = txResult.value;
      console.log("\u{1F4E4} Sending transaction via Rhinestone SDK...", {
        targetChain: this.config.chain?.name || "sepolia",
        to,
        value: value.toString()
      });
      const transaction = await this.rhinestoneAccount.sendTransaction({
        sourceChains: [this.config.chain || sepolia],
        targetChain: this.config.chain || sepolia,
        calls: [
          {
            to,
            data,
            value
          }
        ]
      });
      console.log("\u2705 Transaction sent:", transaction.hash);
      return ok(transaction.hash);
    } catch (error) {
      console.error("\u274C Failed to execute ENS renewal:", error);
      return err(
        new RhinestoneAccountError(
          `Failed to execute ENS renewal: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  }
};

// src/services/transaction.service.ts
var TransactionService = class {
  constructor(publicClient, walletClient, rhinestoneConfig) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    if (rhinestoneConfig) {
      this.rhinestoneService = new RhinestoneAccountService(
        publicClient,
        walletClient,
        rhinestoneConfig
      );
    }
  }
  submitTransaction(request, options) {
    if (request.type === "rhinestone-intent") {
      return this.submitRhinestoneIntent(request);
    }
    if (request.type === "erc4337") {
      return this.submitUserOperation(request);
    }
    return this.submitEOATransaction(request, options);
  }
  submitEOATransaction(request, options) {
    if (!this.walletClient) {
      return err2(new TransactionSubmissionError(
        request,
        new Error("No wallet client available")
      ));
    }
    if (options?.usePrivateMempool) {
      return this.submitToPrivateMempool(request);
    }
    return fromPromise(
      this.walletClient.sendTransaction({
        account: request.from,
        to: request.to,
        value: request.value,
        data: request.data,
        gas: request.gas,
        gasPrice: request.gasPrice,
        maxFeePerGas: request.maxFeePerGas,
        maxPriorityFeePerGas: request.maxPriorityFeePerGas,
        nonce: request.nonce,
        chain: this.walletClient.chain
      }),
      (error) => new TransactionSubmissionError(request, error)
    );
  }
  submitRhinestoneIntent(request) {
    console.log("\u{1F4E4} Submitting Rhinestone intent transaction...");
    if (!this.rhinestoneService) {
      console.error("\u274C No Rhinestone service configured");
      return err2(new TransactionSubmissionError(
        request,
        new Error("Rhinestone service not configured. Please provide rhinestoneConfig.")
      ));
    }
    if (!request.rhinestoneParams) {
      console.error("\u274C No Rhinestone params provided");
      return err2(new TransactionSubmissionError(
        request,
        new Error("rhinestoneParams required for Rhinestone transactions")
      ));
    }
    return fromPromise(
      this.rhinestoneService.executeENSRenewal(request.rhinestoneParams).then((result) => {
        if (result.isErr()) {
          throw result.error;
        }
        return result.value;
      }),
      (error) => new TransactionSubmissionError(request, error)
    );
  }
  submitUserOperation(userOp) {
    return fromPromise(
      this.submit4337Operation(userOp),
      (error) => new UserOperationError(userOp, error)
    );
  }
  async submit4337Operation(userOp) {
    const bundlerUrl = process.env.VITE_BUNDLER_URL || "http://localhost:4337";
    const response = await fetch(`${bundlerUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_sendUserOperation",
        params: [
          {
            sender: userOp.from,
            nonce: "0x0",
            // Should get from entrypoint
            initCode: "0x",
            callData: userOp.callData,
            callGasLimit: userOp.callGasLimit.toString(),
            verificationGasLimit: userOp.verificationGasLimit.toString(),
            preVerificationGas: userOp.preVerificationGas.toString(),
            maxFeePerGas: userOp.maxFeePerGas.toString(),
            maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
            paymasterAndData: userOp.paymasterAndData || "0x",
            signature: userOp.signature || "0x"
          },
          userOp.entryPoint
        ],
        id: 1
      })
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.result;
  }
  submitToPrivateMempool(request) {
    return this.submitEOATransaction(request);
  }
  waitForReceipt(hash, options) {
    const confirmations = options?.confirmations || 1;
    const timeout = options?.timeout || 6e4;
    return fromPromise(
      this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations,
        timeout
      }),
      (error) => new TransactionTimeoutError(hash, timeout)
    );
  }
  checkWithEthCall(request) {
    if (request.type === "erc4337") {
      return ok2({ wouldSucceed: true });
    }
    const eoaRequest = request;
    return fromPromise(
      this.publicClient.call({
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
  async getUserOperationReceipt(userOpHash) {
    const bundlerUrl = process.env.VITE_BUNDLER_URL || "http://localhost:4337";
    const response = await fetch(`${bundlerUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getUserOperationReceipt",
        params: [userOpHash],
        id: 1
      })
    });
    const data = await response.json();
    if (data.error || !data.result) {
      return null;
    }
    return {
      transactionHash: data.result.transactionHash,
      blockNumber: BigInt(data.result.blockNumber),
      status: data.result.success ? "success" : "reverted"
    };
  }
};

// src/services/audit-trail.service.ts
import { ResultAsync as ResultAsync2 } from "neverthrow";
var AuditTrailService = class {
  constructor(storage = typeof window !== "undefined" ? localStorage : null, enableRemoteLogging = false) {
    this.storage = storage;
    this.enableRemoteLogging = enableRemoteLogging;
    this.MAX_TRANSITIONS = 1e3;
    this.MAX_AGE = 24 * 60 * 60 * 1e3;
    // 24 hours
    this.STORAGE_KEY = "@ens/audit-trail";
    this.transitions = [];
    this.auditLog = [];
    if (this.storage) {
      this.loadFromStorage();
      this.setupCleanupInterval();
    }
  }
  // UUID generator with fallback for non-secure contexts (HTTP)
  generateUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  recordTransition(transition) {
    const entry = {
      ...transition,
      id: this.generateUUID(),
      timestamp: Date.now()
    };
    this.transitions.push(entry);
    if (this.transitions.length > this.MAX_TRANSITIONS) {
      this.transitions.shift();
    }
    this.saveToStorage();
    if (this.enableRemoteLogging && this.shouldLogRemotely(entry)) {
      this.logToRemote(entry).catch(console.error);
    }
  }
  addAuditEntry(level, message, details) {
    const entry = {
      transitionId: this.transitions[this.transitions.length - 1]?.id || "unknown",
      timestamp: Date.now(),
      level,
      message,
      details,
      stackTrace: level === "error" || level === "critical" ? new Error().stack : void 0
    };
    this.auditLog.push(entry);
    if (level === "critical") {
      console.error("[CRITICAL]", message, details);
      this.logToRemote(entry).catch(console.error);
    }
    this.saveToStorage();
  }
  getTransitionHistory(filters) {
    let history = [...this.transitions];
    if (filters?.machineId) {
      history = history.filter((t) => t.machineId === filters.machineId);
    }
    if (filters?.fromTime) {
      history = history.filter((t) => t.timestamp >= filters.fromTime);
    }
    if (filters?.toTime) {
      history = history.filter((t) => t.timestamp <= filters.toTime);
    }
    if (filters?.includeErrors === false) {
      history = history.filter((t) => !t.error);
    }
    return history;
  }
  generateDebugReport(transactionId) {
    const relevantTransitions = transactionId ? this.transitions.filter(
      (t) => t.metadata?.transactionHash === transactionId || t.context.transactionId === transactionId
    ) : this.transitions.slice(-50);
    const relevantAuditLog = transactionId ? this.auditLog.filter(
      (entry) => relevantTransitions.some((t) => t.id === entry.transitionId)
    ) : this.auditLog.slice(-100);
    return {
      generatedAt: Date.now(),
      systemInfo: {
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Node.js",
        timestamp: Date.now(),
        sessionId: this.getSessionId()
      },
      transitions: relevantTransitions,
      auditLog: relevantAuditLog,
      errorSummary: this.generateErrorSummary(relevantTransitions),
      stateDistribution: this.calculateStateDistribution(relevantTransitions),
      performanceMetrics: this.calculatePerformanceMetrics(relevantTransitions)
    };
  }
  exportToJson() {
    return JSON.stringify({
      transitions: this.transitions,
      auditLog: this.auditLog,
      exported: Date.now()
    }, null, 2);
  }
  importFromJson(json) {
    return ResultAsync2.fromPromise(
      Promise.resolve().then(() => {
        const data = JSON.parse(json);
        this.transitions = data.transitions || [];
        this.auditLog = data.auditLog || [];
        this.saveToStorage();
      }),
      (error) => new ImportError({ cause: error })
    );
  }
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
  calculateStateDistribution(transitions) {
    return transitions.reduce((acc, t) => {
      acc[t.toState] = (acc[t.toState] || 0) + 1;
      return acc;
    }, {});
  }
  calculatePerformanceMetrics(transitions) {
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
  generateErrorSummary(transitions) {
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
  setupCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.MAX_AGE;
      this.transitions = this.transitions.filter((t) => t.timestamp > cutoff);
      this.auditLog = this.auditLog.filter((e) => e.timestamp > cutoff);
      this.saveToStorage();
    }, 60 * 60 * 1e3);
  }
  saveToStorage() {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.STORAGE_KEY, JSON.stringify({
        transitions: this.transitions,
        auditLog: this.auditLog
      }, (key, value) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      }));
    } catch (error) {
      console.error("Failed to save audit trail:", error);
    }
  }
  loadFromStorage() {
    if (!this.storage) return;
    try {
      const data = this.storage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.transitions = parsed.transitions || [];
        this.auditLog = parsed.auditLog || [];
      }
    } catch (error) {
      console.error("Failed to load audit trail:", error);
    }
  }
  shouldLogRemotely(entry) {
    return !!("error" in entry && entry.error || "level" in entry && (entry.level === "error" || entry.level === "critical"));
  }
  async logToRemote(entry) {
    if (!this.enableRemoteLogging) return;
    try {
      await fetch("/api/audit-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });
    } catch (error) {
      console.error("Failed to send audit log to remote:", error);
    }
  }
  getSessionId() {
    if (typeof window === "undefined") return "server";
    let sessionId = sessionStorage.getItem("ens-session-id");
    if (!sessionId) {
      sessionId = this.generateUUID();
      sessionStorage.setItem("ens-session-id", sessionId);
    }
    return sessionId;
  }
};

// src/machines/transaction.machine.ts
import { setup, assign, fromPromise as fromPromise2 } from "xstate";
var transactionMachine = setup({
  types: {
    context: {},
    input: {},
    events: {}
  },
  actors: {
    submitTransaction: fromPromise2(async ({ input }) => {
      if (!input.request) {
        throw new Error("No transaction request provided");
      }
      const result = await input.service.submitTransaction(
        input.request,
        input.options
      );
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    }),
    waitForReceipt: fromPromise2(async ({ input }) => {
      const result = await input.service.waitForReceipt(
        input.hash,
        {
          confirmations: input.options?.confirmations,
          timeout: input.options?.timeout
        }
      );
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    }),
    checkWithEthCall: fromPromise2(async ({ input }) => {
      if (!input.request) {
        throw new Error("No transaction request provided");
      }
      const result = await input.service.checkWithEthCall(input.request);
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    }),
    wait: fromPromise2(
      ({ input }) => new Promise((resolve) => setTimeout(resolve, input))
    )
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < (context.options.retryCount || 3),
    shouldCheckFallback: ({ context }) => context.fallbackChecks < 3,
    wouldSucceed: (_, params) => params.wouldSucceed === true,
    isReverted: ({ context }) => context.receipt?.status === "reverted"
  },
  actions: {
    recordTransition: ({ context, self }) => {
      if (context.auditService) {
        const state = self.getSnapshot();
        context.auditService.recordTransition({
          machineId: "transaction",
          fromState: state.status === "active" ? String(state.value) : "unknown",
          toState: String(state.value),
          event: state.event?.type || "unknown",
          context: {
            hash: context.hash,
            request: context.request,
            retryCount: context.retryCount
          },
          metadata: {
            chainId: context.request.chainId,
            transactionHash: context.hash
          }
        });
      }
    },
    logError: ({ context }, params) => {
      const error = params?.error || params || "Unknown error";
      if (context.auditService) {
        context.auditService.addAuditEntry(
          "error",
          "Transaction error occurred",
          {
            error,
            hash: context.hash,
            request: context.request
          }
        );
      }
      console.error("Transaction error:", error);
    },
    logCritical: ({ context }, params) => {
      const error = params?.error || params || "Unknown critical error";
      if (context.auditService) {
        context.auditService.addAuditEntry(
          "critical",
          "Critical transaction failure",
          {
            error,
            hash: context.hash,
            request: context.request,
            retryCount: context.retryCount
          }
        );
      }
      console.error("CRITICAL:", error);
    }
  }
}).createMachine({
  id: "transaction",
  initial: "idle",
  context: ({ input }) => ({
    request: void 0,
    options: {},
    retryCount: 0,
    fallbackChecks: 0,
    transactionService: input.transactionService,
    auditService: input.auditService,
    modal: {
      isOpen: false,
      flowType: "single",
      currentStepIndex: 0
    }
  }),
  on: {
    CLOSE_MODAL: {
      actions: assign({
        modal: ({ context }) => ({
          ...context.modal,
          isOpen: false
        })
      })
    },
    UPDATE_MODAL_DATA: {
      actions: assign({
        modal: ({ event, context }) => ({
          ...context.modal,
          ...event.data
        })
      })
    }
  },
  states: {
    idle: {
      on: {
        EXECUTE: {
          target: "preparing",
          actions: assign({
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
          actions: assign({
            modal: ({ event, context }) => ({
              ...context.modal,
              ...event.data || {},
              isOpen: true
            })
          })
        }
      }
    },
    preparing: {
      entry: "recordTransition",
      always: "submitting"
    },
    submitting: {
      entry: "recordTransition",
      invoke: {
        src: "submitTransaction",
        input: ({ context }) => ({
          request: context.request,
          options: context.options,
          service: context.transactionService
        }),
        onDone: {
          target: "pending",
          actions: [
            assign({
              hash: ({ event }) => event.output,
              userOpHash: ({ event, context }) => context.request.type === "erc4337" ? event.output : void 0
            }),
            "recordTransition"
          ]
        },
        onError: [
          {
            guard: "canRetry",
            target: "retrying",
            actions: [
              assign({
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
              assign({
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
      entry: "recordTransition",
      invoke: {
        src: "waitForReceipt",
        input: ({ context }) => ({
          hash: context.hash,
          options: context.options,
          service: context.transactionService
        }),
        onDone: [
          {
            target: "confirming",
            actions: [
              assign({
                receipt: ({ event }) => event.output
              }),
              "recordTransition"
            ]
          }
        ],
        onError: [
          {
            guard: "shouldCheckFallback",
            target: "checkingFallback",
            actions: [
              assign({
                fallbackChecks: ({ context }) => context.fallbackChecks + 1
              }),
              "recordTransition"
            ]
          },
          {
            target: "error.timeout",
            actions: [
              assign({
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
      entry: "recordTransition",
      invoke: {
        src: "checkWithEthCall",
        input: ({ context }) => ({
          request: context.request,
          service: context.transactionService
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.wouldSucceed,
            target: "success",
            actions: [
              ({ context }) => {
                if (context.auditService) {
                  context.auditService.addAuditEntry(
                    "warning",
                    "Transaction succeeded via eth_call fallback",
                    {
                      hash: context.hash,
                      request: context.request
                    }
                  );
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
      entry: "recordTransition",
      always: [
        {
          guard: "isReverted",
          target: "error.reverted",
          actions: [
            assign({
              error: ({ context }) => new TransactionRevertedError({
                hash: context.hash,
                reason: "Transaction reverted"
              })
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
      entry: "recordTransition",
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
          if (context.auditService) {
            context.auditService.addAuditEntry(
              "info",
              "Transaction completed successfully",
              {
                hash: context.hash,
                receipt: context.receipt,
                gasUsed: context.receipt?.gasUsed?.toString()
              }
            );
          }
        }
      ],
      on: {
        EXECUTE: {
          target: "preparing",
          actions: assign({
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
            assign({
              retryCount: ({ context }) => context.retryCount + 1,
              error: void 0
            }),
            "recordTransition"
          ]
        },
        EXECUTE: {
          target: "preparing",
          actions: assign({
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

// src/hooks/useAuditTrail.ts
import { useCallback, useState, useEffect } from "react";
var globalAuditService = null;
function useAuditTrail() {
  const [auditService] = useState(() => {
    if (!globalAuditService && typeof window !== "undefined") {
      globalAuditService = new AuditTrailService();
    }
    return globalAuditService;
  });
  useEffect(() => {
    return () => {
      if (auditService) {
        auditService.cleanup();
      }
    };
  }, [auditService]);
  const getDebugReport = useCallback((transactionId) => {
    if (!auditService) return null;
    return auditService.generateDebugReport(transactionId);
  }, [auditService]);
  const exportAudit = useCallback(() => {
    if (!auditService) return;
    const json = auditService.exportToJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ens-audit-trail-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [auditService]);
  const importAudit = useCallback(async (file) => {
    if (!auditService) return;
    const text = await file.text();
    const result = await auditService.importFromJson(text);
    if (result.isErr()) {
      console.error("Failed to import audit data:", result.error);
      throw result.error;
    }
  }, [auditService]);
  const addEntry = useCallback((level, message, details) => {
    if (!auditService) return;
    auditService.addAuditEntry(level, message, details);
  }, [auditService]);
  const getTransitionHistory = useCallback((filters) => {
    if (!auditService) return [];
    return auditService.getTransitionHistory(filters);
  }, [auditService]);
  const clearAudit = useCallback(() => {
    if (!auditService || typeof window === "undefined") return;
    localStorage.removeItem("@ens/audit-trail");
    globalAuditService = new AuditTrailService();
  }, [auditService]);
  return {
    getDebugReport,
    exportAudit,
    importAudit,
    addEntry,
    getTransitionHistory,
    clearAudit
  };
}

// src/helpers/ens-renewal.helpers.ts
import { ok as ok4, err as err4 } from "neverthrow";
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
    const rhinestoneService = new RhinestoneAccountService(
      publicClient,
      walletClient,
      rhinestoneConfig
    );
    const txResult = await rhinestoneService.prepareENSRenewalTransaction({
      name,
      duration
    });
    if (txResult.isErr()) {
      return txResult;
    }
    const { to, data, value } = txResult.value;
    if (useSmartAccount && rhinestoneConfig) {
      return ok4({
        request: {
          type: "rhinestone-intent",
          to,
          data,
          value,
          from: walletClient?.account?.address,
          chainId,
          rhinestoneParams: { name, duration }
        },
        options: {
          rhinestoneConfig
        }
      });
    } else {
      return ok4({
        request: {
          type: "eoa",
          to,
          data,
          value,
          from: walletClient?.account?.address,
          chainId
        }
      });
    }
  } catch (error) {
    return err4(
      error instanceof Error ? error : new Error("Failed to prepare ENS renewal")
    );
  }
}
async function getENSRenewalPrice(publicClient, name, duration) {
  try {
    const rhinestoneService = new RhinestoneAccountService(publicClient);
    const result = await rhinestoneService.getRenewalPrice(name, duration);
    if (result.isErr()) {
      return err4(result.error);
    }
    return ok4(result.value);
  } catch (error) {
    return err4(
      error instanceof Error ? error : new Error("Failed to get renewal price")
    );
  }
}
async function getRhinestoneSmartAccountAddress(publicClient, walletClient, rhinestoneConfig) {
  try {
    const rhinestoneService = new RhinestoneAccountService(
      publicClient,
      walletClient,
      rhinestoneConfig
    );
    const result = await rhinestoneService.getSmartAccountAddress();
    if (result.isErr()) {
      return err4(result.error);
    }
    return ok4(result.value);
  } catch (error) {
    return err4(
      error instanceof Error ? error : new Error("Failed to get smart account address")
    );
  }
}

// src/components/TransactionModal/TransactionModal.tsx
import { useEffect as useEffect2 } from "react";

// src/components/TransactionModal/TransactionModalHeader.tsx
import { jsx, jsxs } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsxs("div", { style: { textAlign: "center" }, children: [
    ensName && /* @__PURE__ */ jsxs("div", { style: { marginBottom: "16px" }, children: [
      avatarUrl ? /* @__PURE__ */ jsx(
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
      ) : /* @__PURE__ */ jsx(
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
      /* @__PURE__ */ jsx(
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
    title && /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "8px" }, children: [
      /* @__PURE__ */ jsx(
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
      statusLabel && /* @__PURE__ */ jsx(
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
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function TransactionSteps({ steps, currentStepIndex }) {
  if (!steps || steps.length === 0) return null;
  return /* @__PURE__ */ jsx2("div", { style: { marginTop: "20px" }, children: steps.map((step, index) => {
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
    return /* @__PURE__ */ jsxs2(
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
          /* @__PURE__ */ jsx2(
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
          /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ jsx2(
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
            step.description && /* @__PURE__ */ jsx2("div", { style: { fontSize: "12px", color: "#666" }, children: step.description }),
            step.hash && /* @__PURE__ */ jsx2(
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
            isFailed && step.error && /* @__PURE__ */ jsx2(
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
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function TransactionDetails({
  network,
  estimatedCost,
  status
}) {
  return /* @__PURE__ */ jsxs3(
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
        /* @__PURE__ */ jsxs3(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: estimatedCost ? "12px" : 0
            },
            children: [
              /* @__PURE__ */ jsx3("span", { style: { fontSize: "14px", color: "#666" }, children: "Network" }),
              /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: "6px" }, children: [
                /* @__PURE__ */ jsx3(
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
                /* @__PURE__ */ jsx3("span", { style: { fontSize: "14px", fontWeight: "500", color: "#333" }, children: network })
              ] })
            ]
          }
        ),
        estimatedCost && /* @__PURE__ */ jsxs3(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            },
            children: [
              /* @__PURE__ */ jsx3("span", { style: { fontSize: "14px", color: "#666" }, children: "Est. cost" }),
              /* @__PURE__ */ jsx3("span", { style: { fontSize: "14px", fontWeight: "500", color: "#333" }, children: estimatedCost })
            ]
          }
        )
      ]
    }
  );
}

// src/components/TransactionModal/PaymentSelector.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function PaymentSelector({ options, selected, onSelect }) {
  if (!options || options.length === 0) return null;
  return /* @__PURE__ */ jsxs4("div", { style: { marginTop: "20px" }, children: [
    /* @__PURE__ */ jsx4(
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
    /* @__PURE__ */ jsx4("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: options.map((option) => {
      const isSelected = selected === option.method;
      return /* @__PURE__ */ jsxs4(
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
            /* @__PURE__ */ jsxs4("div", { style: { display: "flex", alignItems: "center", gap: "12px" }, children: [
              /* @__PURE__ */ jsx4(
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
                  children: isSelected && /* @__PURE__ */ jsx4(
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
              /* @__PURE__ */ jsx4(
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
              /* @__PURE__ */ jsxs4("div", { children: [
                /* @__PURE__ */ jsx4("div", { style: { fontSize: "14px", fontWeight: "500", color: "#333" }, children: option.label }),
                option.network && /* @__PURE__ */ jsx4("div", { style: { fontSize: "12px", color: "#666" }, children: option.network })
              ] })
            ] }),
            option.balance && /* @__PURE__ */ jsx4("div", { style: { fontSize: "14px", color: "#666" }, children: option.balance })
          ]
        },
        option.method
      );
    }) })
  ] });
}

// src/components/TransactionModal/TransactionModal.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
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
  useEffect2(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);
  useEffect2(() => {
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
  return /* @__PURE__ */ jsx5(
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
      children: /* @__PURE__ */ jsxs5(
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
            /* @__PURE__ */ jsx5(
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
            /* @__PURE__ */ jsxs5("div", { style: { padding: "24px" }, children: [
              /* @__PURE__ */ jsx5(
                TransactionModalHeader,
                {
                  title,
                  ensName,
                  avatarUrl,
                  status: machineState
                }
              ),
              isInProgress && /* @__PURE__ */ jsxs5(
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
              isSuccess && /* @__PURE__ */ jsx5(
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
              isError && /* @__PURE__ */ jsx5(
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
              /* @__PURE__ */ jsx5(
                TransactionDetails,
                {
                  network: network || "Mainnet",
                  estimatedCost,
                  status: machineState
                }
              ),
              steps && steps.length > 1 && /* @__PURE__ */ jsx5(
                TransactionSteps,
                {
                  steps,
                  currentStepIndex
                }
              ),
              showPaymentSelector && /* @__PURE__ */ jsx5(
                PaymentSelector,
                {
                  options: paymentOptions,
                  selected: selectedPayment,
                  onSelect: onPaymentSelect
                }
              ),
              /* @__PURE__ */ jsxs5("div", { style: { marginTop: "24px", display: "flex", gap: "12px" }, children: [
                onBack && currentStepIndex > 0 && /* @__PURE__ */ jsx5(
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
                buttonConfig.onClick && /* @__PURE__ */ jsx5(
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
export {
  AuditTrailService,
  ENS_SEPOLIA_CONTRACTS,
  ETH_REGISTRAR_CONTROLLER_ABI,
  EthCallFallbackError,
  GasEstimationError,
  ImportError,
  PaymentSelector,
  PersistenceError,
  RhinestoneAccountError,
  RhinestoneAccountService,
  TransactionDetails,
  TransactionModal,
  TransactionModalHeader,
  TransactionRevertedError,
  TransactionService,
  TransactionSteps,
  TransactionSubmissionError,
  TransactionTimeoutError,
  UserOperationError,
  getENSRenewalPrice,
  getRhinestoneSmartAccountAddress,
  prepareENSRenewal,
  transactionMachine,
  useAuditTrail
};
//# sourceMappingURL=index.mjs.map