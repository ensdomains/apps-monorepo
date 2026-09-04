// Earliest block any v2 registry can hold a role event: the root registry's
// deployment, and it is the ancestor of every other registry. Found by binary
// searching `eth_getCode` on Sepolia; the .eth registry follows at 11383897
// and the repo already pins `verifiableFactoryDeployBlock: 11_383_823n` from
// the same 2026-07-30 deployment.
export const ROLES_FROM_BLOCK = 11_383_818n
