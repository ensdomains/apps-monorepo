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
import {
  createSmartAccountClient,
  toOwner
} from "permissionless";
import {
  toSafeSmartAccount
} from "permissionless/accounts";
import {
  createPimlicoClient
} from "permissionless/clients/pimlico";
import {
  http,
  encodeFunctionData
} from "viem";
import { sepolia } from "viem/chains";

// src/contracts/ens-sepolia.ts
var ENS_SEPOLIA_CONTRACTS = {
  // ENS Registry
  registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  // ETH Registrar Controller (for .eth domains)
  ethRegistrarController: "0xfed6a969aaa60e4961fcd3ebf1a2e8913ac65b72",
  // Base Registrar Implementation
  baseRegistrar: "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85",
  // Public Resolver
  publicResolver: "0x9010A27463717360cAD99CEA8bD39b8705CCA238",
  // Reverse Registrar
  reverseRegistrar: "0xa58e81fe9b61b5c3fe2afd33cf304c454abfc7cb",
  // Name Wrapper
  nameWrapper: "0x0635513f179d50a207757e05759cbd106d7dfce8"
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
var ENTRYPOINT_ADDRESS_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
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
      sponsorshipPolicyId: config?.sponsorshipPolicyId
    };
    if (this.config.bundlerUrl) {
      this.pimlicoClient = createPimlicoClient({
        chain: this.config.chain,
        transport: http(this.config.bundlerUrl),
        entryPoint: {
          address: ENTRYPOINT_ADDRESS_V07,
          version: "0.7"
        }
      });
    }
  }
  async initializeSmartAccount() {
    try {
      if (!this.walletClient) {
        return err(new RhinestoneAccountError("No wallet client available"));
      }
      const owner = await toOwner({
        owner: this.walletClient
      });
      const safeAccount = await toSafeSmartAccount({
        client: this.publicClient,
        owners: [owner],
        entryPoint: {
          address: ENTRYPOINT_ADDRESS_V07,
          version: "0.7"
        },
        version: "1.4.1"
      });
      const clientConfig = {
        account: safeAccount,
        chain: this.config.chain,
        bundlerTransport: http(this.config.bundlerUrl)
      };
      if (this.config.paymasterUrl) {
        clientConfig.paymaster = this.pimlicoClient;
        clientConfig.userOperation = {
          estimateFeesPerGas: async () => {
            const gasPrices = await this.pimlicoClient.getUserOperationGasPrice();
            return gasPrices.fast;
          }
        };
      }
      this.smartAccountClient = createSmartAccountClient(clientConfig);
      return ok(this.smartAccountClient);
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to initialize smart account: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }
  async getSmartAccountAddress() {
    if (!this.smartAccountClient) {
      const initResult = await this.initializeSmartAccount();
      if (initResult.isErr()) return err(initResult.error);
    }
    try {
      const address = this.smartAccountClient.account?.address;
      if (!address) {
        return err(new RhinestoneAccountError("No smart account address available"));
      }
      return ok(address);
    } catch (error) {
      return err(
        new RhinestoneAccountError(`Failed to get smart account address: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  }
  async getRenewalPrice(name, duration) {
    try {
      const price = await this.publicClient.readContract({
        address: ENS_SEPOLIA_CONTRACTS.ethRegistrarController,
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [name, duration]
      });
      return ok(price.base + price.premium);
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to get renewal price: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }
  async prepareENSRenewalTransaction(params) {
    try {
      const priceResult = await this.getRenewalPrice(params.name, params.duration);
      if (priceResult.isErr()) return err(priceResult.error);
      const price = priceResult.value;
      const valueWithBuffer = price * 110n / 100n;
      const data = encodeFunctionData({
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "renew",
        args: [params.name, params.duration]
      });
      return ok({
        to: ENS_SEPOLIA_CONTRACTS.ethRegistrarController,
        data,
        value: valueWithBuffer
      });
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to prepare ENS renewal transaction: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }
  async executeENSRenewal(params) {
    try {
      if (!this.pimlicoClient) {
        return err(new RhinestoneAccountError("Bundler URL is required for smart account operations. Please provide bundlerUrl in the config."));
      }
      if (!this.smartAccountClient) {
        const initResult = await this.initializeSmartAccount();
        if (initResult.isErr()) return err(initResult.error);
      }
      const txResult = await this.prepareENSRenewalTransaction(params);
      if (txResult.isErr()) return err(txResult.error);
      const { to, data, value } = txResult.value;
      const allGasPrices = await this.pimlicoClient.getUserOperationGasPrice();
      const tier = params.gasPriceTier || "fast";
      const gasPrices = allGasPrices[tier];
      const userOpHash = await this.smartAccountClient.sendTransaction({
        account: this.smartAccountClient.account,
        to,
        data,
        value,
        maxFeePerGas: gasPrices.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas
      });
      return ok(userOpHash);
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to execute ENS renewal: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }
  async waitForUserOperationReceipt(hash) {
    try {
      if (!this.smartAccountClient) {
        return err(new RhinestoneAccountError("Smart account not initialized"));
      }
      return ok({
        userOpHash: hash,
        success: true,
        actualGasCost: 0n,
        actualGasUsed: 0n
      });
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to get user operation receipt: ${error instanceof Error ? error.message : String(error)}`
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
      if (context.auditService) {
        context.auditService.addAuditEntry(
          "error",
          "Transaction error occurred",
          {
            error: params.error,
            hash: context.hash,
            request: context.request
          }
        );
      }
      console.error("Transaction error:", params.error);
    },
    logCritical: ({ context }, params) => {
      if (context.auditService) {
        context.auditService.addAuditEntry(
          "critical",
          "Critical transaction failure",
          {
            error: params.error,
            hash: context.hash,
            request: context.request,
            retryCount: context.retryCount
          }
        );
      }
      console.error("CRITICAL:", params.error);
    }
  }
}).createMachine({
  id: "transaction",
  initial: "preparing",
  context: ({ input }) => ({
    request: input.request,
    options: input.options || {},
    retryCount: 0,
    fallbackChecks: 0,
    transactionService: input.transactionService,
    auditService: input.auditService
  }),
  states: {
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
      type: "final",
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
      ]
    },
    error: {
      initial: "unknown",
      states: {
        submission: {
          type: "final",
          entry: "recordTransition"
        },
        timeout: {
          type: "final",
          entry: "recordTransition"
        },
        reverted: {
          type: "final",
          entry: "recordTransition"
        },
        cancelled: {
          type: "final",
          entry: "recordTransition"
        },
        unknown: {
          type: "final",
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
        }
      }
    }
  }
});

// src/hooks/useTransaction.ts
import { useCallback, useState, useEffect } from "react";
import { createActor } from "xstate";
import { usePublicClient, useWalletClient } from "wagmi";
var globalAuditService = null;
function useTransaction() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [actor, setActor] = useState(null);
  const [snapshot, setSnapshot] = useState({ value: "idle", context: {} });
  useEffect(() => {
    if (actor) {
      const subscription = actor.subscribe((state2) => {
        setSnapshot(state2);
      });
      return () => subscription.unsubscribe();
    }
  }, [actor]);
  const send = useCallback((event) => {
    if (actor) {
      actor.send(event);
    }
  }, [actor]);
  useEffect(() => {
    if (!globalAuditService && typeof window !== "undefined") {
      globalAuditService = new AuditTrailService();
    }
  }, []);
  const execute = useCallback((request, options) => {
    if (!publicClient) {
      console.error("No public client available");
      return;
    }
    const transactionService = new TransactionService(publicClient, walletClient || void 0);
    const newActor = createActor(transactionMachine, {
      input: {
        request,
        options: options || {},
        transactionService,
        auditService: globalAuditService || void 0
      }
    });
    newActor.start();
    setActor(newActor);
  }, [publicClient, walletClient]);
  const retry = useCallback(() => {
    send({ type: "RETRY" });
  }, [send]);
  const cancel = useCallback(() => {
    send({ type: "CANCEL" });
  }, [send]);
  const forceSuccess = useCallback(() => {
    send({ type: "FORCE_SUCCESS" });
  }, [send]);
  const debugReport = useCallback(() => {
    if (globalAuditService) {
      return globalAuditService.generateDebugReport(snapshot.context?.hash);
    }
    return null;
  }, [snapshot.context?.hash]);
  const state = typeof snapshot.value === "object" ? Object.keys(snapshot.value).join(".") : String(snapshot.value || "idle");
  return {
    execute,
    retry,
    cancel,
    forceSuccess,
    state,
    isIdle: state === "idle",
    isLoading: state === "submitting" || state === "preparing",
    isPending: state === "pending" || state === "confirming" || state === "checkingFallback",
    isSuccess: state === "success",
    isError: state.startsWith("error"),
    hash: snapshot.context?.hash,
    receipt: snapshot.context?.receipt,
    error: snapshot.context?.error,
    debugReport
  };
}

// src/hooks/useAuditTrail.ts
import { useCallback as useCallback2, useState as useState2, useEffect as useEffect2 } from "react";
var globalAuditService2 = null;
function useAuditTrail() {
  const [auditService] = useState2(() => {
    if (!globalAuditService2 && typeof window !== "undefined") {
      globalAuditService2 = new AuditTrailService();
    }
    return globalAuditService2;
  });
  useEffect2(() => {
    return () => {
      if (auditService) {
        auditService.cleanup();
      }
    };
  }, [auditService]);
  const getDebugReport = useCallback2((transactionId) => {
    if (!auditService) return null;
    return auditService.generateDebugReport(transactionId);
  }, [auditService]);
  const exportAudit = useCallback2(() => {
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
  const importAudit = useCallback2(async (file) => {
    if (!auditService) return;
    const text = await file.text();
    const result = await auditService.importFromJson(text);
    if (result.isErr()) {
      console.error("Failed to import audit data:", result.error);
      throw result.error;
    }
  }, [auditService]);
  const addEntry = useCallback2((level, message, details) => {
    if (!auditService) return;
    auditService.addAuditEntry(level, message, details);
  }, [auditService]);
  const getTransitionHistory = useCallback2((filters) => {
    if (!auditService) return [];
    return auditService.getTransitionHistory(filters);
  }, [auditService]);
  const clearAudit = useCallback2(() => {
    if (!auditService || typeof window === "undefined") return;
    localStorage.removeItem("@ens/audit-trail");
    globalAuditService2 = new AuditTrailService();
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

// src/hooks/useENSRenewal.ts
import { useCallback as useCallback3 } from "react";
import { usePublicClient as usePublicClient2, useWalletClient as useWalletClient2 } from "wagmi";
import { sepolia as sepolia2 } from "viem/chains";
function useENSRenewal(options) {
  const publicClient = usePublicClient2({ chainId: sepolia2.id });
  const { data: walletClient } = useWalletClient2();
  const transaction = useTransaction();
  const renewName = useCallback3(
    async (name, duration, transactionOptions) => {
      if (!publicClient) {
        console.error("No public client available");
        return;
      }
      if (options?.useSmartAccount) {
        const rhinestoneService = new RhinestoneAccountService(
          publicClient,
          walletClient || void 0,
          {
            chain: sepolia2,
            bundlerUrl: options.bundlerUrl,
            paymasterUrl: options.paymasterUrl,
            sponsorshipPolicyId: options.sponsorshipPolicyId
          }
        );
        const result = await rhinestoneService.executeENSRenewal({
          name,
          duration
        });
        if (result.isErr()) {
          console.error("Failed to execute ENS renewal:", result.error);
          return;
        }
        console.log("UserOperation sent:", result.value);
      } else {
        const rhinestoneService = new RhinestoneAccountService(publicClient);
        const txResult = await rhinestoneService.prepareENSRenewalTransaction({
          name,
          duration
        });
        if (txResult.isErr()) {
          console.error("Failed to prepare ENS renewal:", txResult.error);
          return;
        }
        const { to, data, value } = txResult.value;
        transaction.execute(
          {
            type: "eoa",
            to,
            data,
            value,
            from: walletClient?.account?.address
          },
          transactionOptions
        );
      }
    },
    [publicClient, walletClient, options, transaction]
  );
  const getRenewalPrice = useCallback3(
    async (name, duration) => {
      if (!publicClient) {
        console.error("No public client available");
        return null;
      }
      const rhinestoneService = new RhinestoneAccountService(publicClient);
      const result = await rhinestoneService.getRenewalPrice(name, duration);
      if (result.isErr()) {
        console.error("Failed to get renewal price:", result.error);
        return null;
      }
      return result.value;
    },
    [publicClient]
  );
  const getSmartAccountAddress = useCallback3(
    async () => {
      if (!publicClient || !walletClient) {
        console.error("No public or wallet client available");
        return null;
      }
      const rhinestoneService = new RhinestoneAccountService(
        publicClient,
        walletClient || void 0,
        {
          chain: sepolia2,
          bundlerUrl: options?.bundlerUrl,
          paymasterUrl: options?.paymasterUrl,
          sponsorshipPolicyId: options?.sponsorshipPolicyId
        }
      );
      const result = await rhinestoneService.getSmartAccountAddress();
      if (result.isErr()) {
        console.error("Failed to get smart account address:", result.error);
        return null;
      }
      return result.value;
    },
    [publicClient, walletClient, options]
  );
  return {
    renewName,
    getRenewalPrice,
    getSmartAccountAddress,
    ...transaction
  };
}
export {
  AuditTrailService,
  ENS_SEPOLIA_CONTRACTS,
  ETH_REGISTRAR_CONTROLLER_ABI,
  EthCallFallbackError,
  GasEstimationError,
  ImportError,
  PersistenceError,
  RhinestoneAccountError,
  RhinestoneAccountService,
  TransactionRevertedError,
  TransactionService,
  TransactionSubmissionError,
  TransactionTimeoutError,
  UserOperationError,
  transactionMachine,
  useAuditTrail,
  useENSRenewal,
  useTransaction
};
//# sourceMappingURL=index.mjs.map