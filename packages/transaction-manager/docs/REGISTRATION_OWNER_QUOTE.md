# Mainnet registration owner quote

Review follow-up for PR #1703, checked on 2026-11-04 with Rhinestone SDK 1.22.0.

## Live quote

Authenticated production `POST /intents/route` requests returned HTTP 200 for a
fresh mainnet HCA. Mainnet RPC initialization confirmed `alreadyDeployed: false`;
the SDK included the manifest's factory deployment in `account.setupOps`.
Both the prepared-route check and the registration pre-approval adapter accepted
the actual response after this fix.

The request used `sourceChains: [mainnet]`, `targetChain: mainnet`, no session
signer, `sponsored: { gas: false, bridging: false, swaps: false }`,
`feeAsset: 'USDC'`, `tokenRequests: []`, and
`auxiliaryFunds: { 1: { [mainnetUsdc]: 15_000_000 } }`. The locally requested
calls were USDC `transferFrom(fixtureOwner, fixtureHca, 15_000_000)` followed by
the manifest's ETH registrar `commit` with a fresh nonzero fixture commitment.
The original session's refund caps were quoted independently before preparing
this owner setup; the setup response did not determine its own limits.

The response used `INTENT_EXECUTOR`, `NO_FUNDING`, and ERC-7579/ERC-1271
execution. Its destination operations were:

1. USDC `approve(mainnetPaymaster, quotedMaxRefund)`.
2. The exact requested USDC `transferFrom`.
3. The exact requested registrar `commit`.

The response also carried Permit2 token requirements, nonempty `idsAndAmounts`
and `spendTokens`, and a Permit2 approval in `preClaimOps`. The previous guard
refused both this metadata and the additional destination approval, making a
valid owner-funded quote unusable.

## Authorization boundary

The installed SDK's `getTransactionMessages` chooses `SingleChainOps` for this
settlement layer. It signs the HCA, nonce, destination operations, and gas refund;
it does not sign the legacy claims or preclaim operations. The verified
[IntentExecutor implementation](https://etherscan.io/address/0x194DE341d4791e9b8922eE1bC018DFd1fD1b115A#code)
consumes precisely those signed fields in
`executeSinglechainOpsWithGasRefund_ERC20`, verifies the account signature,
executes the operations, and caps the calculated token refund. The
[mainnet Paymaster](https://etherscan.io/address/0x1d7df6ddc7328ac827eb4d7f171c60afb7f9a599#code)
allows only its immutable IntentExecutor to settle that refund. This is a
user-paid gas refund, not sponsored execution.

The pure owner-route guard now supports this mainnet-USDC response only with
an independent check of the SDK's actual signing messages:

- Pin the IntentExecutor domain, version, chain, and verifying contract.
- Reconstruct `SingleChainOps` locally from the requested HCA and calls, the
  quote nonce, and the validated refund.
- Allow only the pinned Paymaster's USDC approval, for exactly the quoted
  maximum refund, before the original calls. Preserve call count, order,
  targets, values, calldata, same-chain execution, and all three retained fee
  ceilings.
- Require exactly one origin authorization, and require both origin and
  destination typed-data hashes to equal the local hash. A changed domain,
  message type, extra authorization, or substituted operation is refused.

Only this verified signing form can carry the unsigned legacy claim metadata.
Without the signing witness, the original empty-claim and exact-call guard
still applies. Unsupported chains, refund tokens, modes, swaps, and extra
destination operations remain refused.

Before requesting a new paid funding approval, registration quotes this exact
setup and applies the same validation as transport. A failed or unsupported
quote stops before consent, wallet submission, or a new approval-recovery
record. Transport prepares and validates a fresh quote again before signing;
the pre-approval quote is not a reservation. Compatible and inconclusive
permit preflights keep their existing permit path.

## Mainnet fork execution

The accepted live quote was executed locally against Ethereum block
**26,341,181**, using the real factory, HCA owner validator, IntentExecutor,
Paymaster, USDC, and registrar. The fixture owner was delegated to
`0x69007702764179f14f51cdce752f4f775d74e139` on the fork only. Local fixture
funds supplied exactly 15 USDC and ETH for gas.

After an exact owner-to-HCA approval, one atomic local transaction deployed the
HCA and invoked the executor with the SDK's owner signature, destination
operations, and quoted refund. Results from that execution:

| Check | Result |
| --- | --- |
| Receipt | success |
| Wallet debit | 15,000,000 USDC base units |
| Remaining wallet-to-HCA allowance | 0 |
| HCA balance after settlement | 14,929,349 USDC base units |
| Actual gas refund | 70,651 USDC base units |
| Signed maximum gas refund | 894,063 USDC base units |
| HCA-to-Permit2 allowance | 0 |
| Owner nonce | consumed |
| Registrar `commitmentAt` | nonzero |
| Changed approval spender with original signature | rejected |
| Replay of consumed owner nonce | rejected |

The original operation also passed simulation before the substituted-spender
negative control. Thus the control's rejection was not an undeployed-account
or malformed-call failure. The local transaction hash was
`0x2ce7f9696b25dc5827fd26cd1fce2a6a4f4bd5fcef5ec52604aa4b267bcbed09`;
it is a fork artifact and has no mainnet explorer receipt.

Live quote requests used a public fixture owner whose signing methods throw.
The fixture key signed only for the local fork. The upstream RPC proxy refused
send/sign/wallet methods, and no signed payload was sent to Rhinestone.
Authentication material was not recorded. These checks establish live quote
compatibility and real-contract execution on a local fork. Production relayer
fill and extension-wallet signing remain unverified.
