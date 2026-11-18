# Registry upgrade: expected behaviour

This file lists what the Explorer does with a UserRegistry running an older implementation, and the test that holds each rule. A change to any rule below is a product change: it needs the product owner's agreement, and the PR must name the rule and the test it changes.

Sources, in order of authority:

1. The tickets: WEB-2165 (scope), WEB-2166 (subname creation), WEB-2168 (Case A upgrade), WEB-2169 (Case B), WEB-2170 (Case C).
2. The decisions recorded on WEB-2165 and agreed with product and protocol while building it (November 2026), listed under each rule.

Paths are relative to this folder unless they start with `packages/`, which are from the repo root.

## Which implementations need an upgrade

| Rule | Held by |
| --- | --- |
| A registry needs an upgrade when its implementation is in the per-chain list in `utils/pendingUpgradeRegistry.ts`. The implementation new registries deploy on (`ensUserRegistryImpl` from ensjs) is never in it. An address counts only on its own chain. | `utils/pendingUpgradeRegistry.test.ts` (`isPendingUpgradeImplementation`) |
| An answer that failed to load, or whose refresh failed, counts as unknown. Unknown never unlocks anything. A cached answer is trusted during a refetch, so a focus refetch doesn't unmount a form or sheet in use. | `utils/pendingUpgradeRegistry.test.ts` (`settledData`, `getUpgradeGate`) |

## Subname creation and roles

| Rule | Held by |
| --- | --- |
| Subnames can be created only once the name's registry is confirmed not to need an upgrade. If it needs one, the action is paused with "This registry must be upgraded before new subnames can be created."; while the check loads or has failed, it stays paused with the "temporarily disabled" wording. ENSv1 names are not gated. | `../../routes/$name/create-subname.test.tsx` "pauses creation while the registry %s", `../../routes/$name/subnames.test.tsx` "offers subname creation once the registry is not pending an upgrade", `../names/components/SubnamesTable.test.tsx` "explains that an older registry must be upgraded before creating subnames" |
| A pasted registry can't be used as a subregistry until it is confirmed not to need an upgrade. | `utils/pendingUpgradeRegistry.test.ts` (`isPastedRegistryBlocked`) |
| Roles can't change on a registry that needs an upgrade: the registry's Roles page and a name's Roles page are read-only, and admins see "Upgrade required". The Case A controller sees the upgrade card there instead, only while the name still points at that registry. A failed check keeps them read-only without the note. | `../roles/components/RoleContractGate.test.tsx` "keeps an outdated registry read-only and says it must be upgraded", "stays read-only when the update check fails after an earlier answer"; `utils/pendingUpgradeRegistry.test.ts` (`getRoleEditing`), `utils/registryRepairCase.test.ts` (`isUpgradeCardForPage`) |
| The transfer flow doesn't revoke other accounts' roles on a registry that needs an upgrade: the option is hidden, the form says everyone else keeps their permissions, and the transfer goes ahead with them in place. While that isn't known yet, the transfer waits. | `../transfer/components/SendNameForm.test.tsx` "leaves the grants in place on a registry that must be upgraded first", "waits while it isn't known whether the registry must be upgraded" |

## Who sees what

The cases are decided in `utils/registryRepairCase.ts`.

| Rule | Held by |
| --- | --- |
| Case A: on the name's Registry page, an account that can point the name at another registry (`ROLE_SET_SUBREGISTRY` on the name, from the name or the parent's root) and owns every subname in the registry sees "Upgrade required" with an "Upgrade registry" button. The card says how many subnames carry over (no number while the count is unknown) and asks them to tell the registry's other users to use the new registry. Holding the registry's root roles is not required (see "Who becomes an admin"). | `utils/registryRepairCase.test.ts` (`getRegistryRepairCase`, `upgradeCardText`) |
| When other names also point at the registry (from the indexer's `referencedBy`), the card lists up to three of them and says the upgrade only moves this name: the others keep the old registry until their owners upgrade it themselves (they get the card on their own name) or point their name at this name's new registry. | `utils/registryRepairCase.test.ts` (`sharedRegistryText`) |
| Ownership that can't be confirmed (still loading, or the indexer can't count it) shows nothing. Once shown, the card stays up while the case briefly reads as unknown, so an upgrade in progress isn't torn down. | `utils/registryRepairCase.test.ts` (`getRegistryRepairCase`, `shouldShowUpgradeCard`) |
| Case B: when someone else owns at least one subname, the card is shown only while `IS_CASE_B_UPGRADE_OFFERED` is on; it stays off until every known Case B registry has passed the rehearsal (WEB-2169). The card then says how many of the subnames others own and that their owners don't need to do anything (wording approved for WEB-2169). | `utils/registryRepairCase.test.ts` "someone else owning a subname (Case B)" row, `shouldShowUpgradeCard` "a Case B account, not offered yet" row, "offers the card to a Case B account once Case B is offered", `upgradeCardText` |
| Case C: on a subname's profile, its connected owner sees "Upgrade required" when the registry holding the subname needs an upgrade and they can't upgrade it themselves. The notice names the parent name and asks them to contact its owner. It is hidden for ENSv1 names, 2LDs, other visitors, a registry that is current or unchecked, an unread role, and the account that can upgrade (it gets the Case A card instead). | `utils/registryRepairCase.test.ts` (`shouldShowSubnameOwnerNotice`), `components/v2/SubnameOwnerNotice.test.tsx` |

## What the upgrade does

There is no in-place upgrade: the registry is copied into a new one and the name is pointed at the copy.

| Rule | Held by |
| --- | --- |
| Order: deploy a new UserRegistry on the current implementation, set its parent, register every live subname with its owner, subregistry, resolver, expiry and roles, then re-parent the child registries the account can move, and only then switch the parent name to the new registry. The switch is last. | `packages/migration/src/service/registryRepair.test.ts` "deploys with the root roles, sets the parent, copies each name, then switches the parent name", "re-parents the children it can move before the switch, and reports the ones left behind" |
| Roles copied are the explicit ones: replayed from the registry's role-change events (the last write per account on the name's current resource). Roles an account has only through an owner's approval-for-all are not copied, and neither are the approvals. | `packages/migration/src/service/registryRepairState.test.ts` (`explicitGrantsAt`) |
| On a name, only the regular roles behind admin roles the account holds can be granted; admin roles come only with `register`, so they go to the name's owner. The planner refuses up front, before anything is sent, when a grant can't be made. | `packages/migration/src/service/registryRepair.test.ts` "refuses to grant admin roles to anyone but the owner...", "refuses a name whose roles the account can't grant", "lets an admin role grant the regular role it implies" |
| Expired and unregistered names are not copied; they are listed on the first confirmation, as are the child registries that stay behind. | `packages/migration/src/service/registryRepairState.test.ts` (`splitRepairNames`), `utils/registryUpdate.test.ts` (`getRegistryUpdateDetails`) |
| A child registry is moved when it still points at the old registry (or a copy an earlier attempt left) and the account can set its parent; one whose parent can't be read, or that the account can't move, stays and is listed; one that already belongs elsewhere is skipped. | `packages/migration/src/service/registryRepairChildren.test.ts` (`toRegistryChildren`) |

## Who becomes an admin

| Rule | Held by |
| --- | --- |
| The new registry keeps the old registry's root roles exactly. | `packages/migration/src/service/registryRepair.test.ts` "deploys with the root roles..." |
| An account that can switch the name but doesn't hold the root roles the copy needs (`ROLE_REGISTRAR` and `ROLE_SET_PARENT`) is added as an admin of the new registry with every root role the old registry's admins hold, next to them. Example: Alice set up the registry, then transferred the parent name to Bob; Bob runs the upgrade and both are admins of the new registry; the card asks Bob to let Alice know (product decision, November 2026). | `packages/migration/src/service/registryRepair.test.ts` "an account without root roles on the registry" |
| In Case B, an account added as an admin that way gives those roles back with `revokeRootRoles` after the copy and child moves, before the switch, keeping only what it held on the old registry (protocol finding, WEB-2167). When the old registry's admins hold a role without its admin role, the upgrader couldn't give it back, so the upgrade is refused up front. A run stopped after giving them back only switches; one stopped with the copy incomplete starts a fresh copy. In Case A the account keeps them. | `packages/migration/src/service/registryRepair.test.ts` "Case B: an account without root roles, with subnames others own" |
| The upgrade is refused when the old registry has no root roles at all, or when its admins between them lack `ROLE_REGISTRAR` and `ROLE_SET_PARENT`. | `packages/migration/src/service/registryRepair.test.ts` "refuses a registry with no root roles", "refuses an account with %s on the registry" |

## Sending, stopping and resuming

The flow runs in `state/registryUpgrade.machine.ts`; the hook only supplies the plan and send functions.

| Rule | Held by |
| --- | --- |
| Wallets that batch atomically send the deploy and copy in bundles of up to 10 calls per confirmation (the same cap as the manager migration), so a small registry is one confirmation; others send one call per confirmation. The finishing steps (child moves and the switch) are their own steps, after the copy. Batching is read at each start. | `utils/registryUpdate.test.ts` (`getRegistryUpdateSteps`), `state/registryUpgrade.machine.test.ts` "splits the steps by the batching support given at each start, not at mount" |
| When the switch lands, a toast says the subnames now resolve through the new registry and to open any of them to check its records. | No test (copy) |
| Before every finishing step, also on resume and retry, the plan is rebuilt from the chain. It continues only when the copy is complete and still the same copy; otherwise it stops and offers to continue. | `state/registryUpgrade.machine.test.ts` "re-checks before every finishing step, not just the first", "stops before the switch when the re-check finds the copy isn't whole", "stops instead of switching when another attempt has replaced the copy being finished", "re-checks before a resume whose first step is the switch" |
| Closing the modal while a step is in flight keeps waiting for it, so starting again never sends it twice. If it lands, the user can continue; if it fails, they can start again; if it was the switch, the upgrade finishes. | `state/registryUpgrade.machine.test.ts` (closing the modal) |
| The copy's address comes from the old registry's address and an attempt number, so a stopped upgrade finds its copy and plans only what is missing, including unregistering names the original has dropped since. When the original changed in a way a resume can't follow, the next attempt starts a fresh copy. There are at most 16 attempts. The salt is pinned: changing it would lose stopped upgrades. | `packages/migration/src/service/registryRepair.test.ts` (resuming a copy), `utils/registryUpdate.test.ts` (`computeRegistryUpdateSalt`, `shouldStartFreshCopy`) |
| Before planning, the upgrade is refused when the name no longer points at this registry, its label is only known by hash, the account can't switch the name, or the target implementation itself needs an upgrade. When planning fails the card says why (missing roles, the name now on another registry, an unknown label, unavailable, or a read that can be retried). | `utils/registryUpdate.test.ts` (`getRegistryUpdateBlocker`, `getRegistryUpdateFailure`) |

## Known limits

- Reserved labels, ERC1155 approvals and a custom metadata URI are not copied.
- Case B (someone else owns a subname) is built but not offered until its rehearsal passes (WEB-2169).

## Before changing anything here

1. Read the rule and its test. If an existing test fails after your change, the change is wrong unless the ticket changes that rule.
2. Run `pnpm exec vitest run --maxWorkers=4 src/features/registry src/routes/\$name src/features/roles` and `pnpm typecheck` from `apps/portal`, and `pnpm exec vitest run` in `packages/migration`.
3. The manager migration follows a parent's current registry after an upgrade; its rules are in WEB-2237 (#1814). Check them when you change who the copy belongs to or where it lives.
