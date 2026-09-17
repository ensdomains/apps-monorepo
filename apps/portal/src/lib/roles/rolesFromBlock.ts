// Earliest block any v2 registry can hold a role event: the root registry's
// deployment, and it is the ancestor of every other registry. Confirmed with
// `eth_getCode` on Sepolia for the 2026-09-15 redeploy (contracts-v2
// `deployments/sepolia` @ 71a3b733); the .eth registry follows at 11709066.
// Registries from earlier deployments hang off a root nothing resolves
// through any more, so their events are deliberately out of range.
export const ROLES_FROM_BLOCK = 11_708_988n
