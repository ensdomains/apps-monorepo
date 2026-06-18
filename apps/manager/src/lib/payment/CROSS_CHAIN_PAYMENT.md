# Cross-chain stable payment

## Status

The registration intent is a same-chain Sepolia transaction. Cross-chain
funding is not implemented yet, so `VITE_FF_L2_STABLES` remains disabled.

## Root cause

The user holds Base Sepolia USDC in their EOA, but the registration intent uses
the HCA as its intent account. Warp funds an intent from the intent account's
balances.

`sourceAssets` restricts the eligible source chains and tokens; it does not
select a different balance owner. Adding Base Sepolia USDC to `sourceAssets`
therefore makes the orchestrator inspect the HCA's Base Sepolia USDC balance,
which is zero, resulting in `NO_PLAN_AVAILABLE`.

The separate destination recipient is not the problem. Warp supports using the
HCA as the intent account while delivering destination funds to the EOA.

## Destination payment requirements

`ETHRegistrar.register()` transfers payment from `_msgSender()`.
`HCAEquivalence` resolves an HCA caller to its registered EOA owner, so the
registration payment must be available in the EOA on Sepolia.

The destination flow therefore requires:

- Sepolia USDC delivered to the EOA.
- An EIP-2612 permit signed by the EOA for the registrar.
- The HCA intent executing `permit` followed by `register`.

Relevant contracts:

- [ETHRegistrar.sol](https://github.com/ensdomains/contracts-v2/blob/5677359db15edd8b7e2a7cda4798d801ab129c9d/contracts/src/registrar/ETHRegistrar.sol)
- [HCAEquivalence.sol](https://github.com/ensdomains/contracts-v2/blob/5677359db15edd8b7e2a7cda4798d801ab129c9d/contracts/src/hca/HCAEquivalence.sol)

## Implementation

The integration should use two intents:

1. Submit an EOA-funded Warp intent that bridges Base Sepolia USDC from the
   user's EOA to the same EOA on Sepolia.
2. Wait for the Sepolia USDC balance to be available.
3. Sign the EIP-2612 permit with the EOA.
4. Submit the existing HCA intent that executes `permit` and `register` on
   Sepolia.

`submitPermitAndRegistrationActor` implements the final step only. It uses
`paymentSource.destinationPaymentToken` to select the Sepolia payment token and
does not attach cross-chain routing parameters.

The L2 payment source must not be enabled in the UI until the EOA-funded bridge
step and its confirmation state are implemented.
