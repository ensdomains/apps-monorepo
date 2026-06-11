#!/usr/bin/env python3
"""
Bake required contracts into the local Anvil fork state so they survive
anvil_dumpState. anvil_dumpState only serialises accounts that were written
locally; accounts only read via the fork cache are excluded.

For each contract we:
  1. anvil_setCode  — write bytecode into the modified-accounts set
  2. Scan storage slots 0-127 — picks up all sequentially-laid-out variables
  3. Compute and copy critical hash-addressed mapping slots (payment ratios,
     role bitmaps) so the contracts are fully functional without a fork URL.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from typing import Optional

RPC_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8545"

# ── General EVM infrastructure ─────────────────────────────────────────────
# Multicall3: used by viem's batch.multicall — every readContract call goes
# through this. Without it all publicClient.readContract calls fail silently.
INFRA_CONTRACTS = [
    ("0xcA11bde05977b3631167028862bE2a173976CA11", "Multicall3"),
]

# ── ERC-4337 contracts (code only — no meaningful storage needed) ──────────
ERC4337_CONTRACTS = [
    ("0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789", "EntryPoint v0.6"),
    ("0x0000000071727De22E5E9d8BAf0edAc6f37da032", "EntryPoint v0.7"),
    ("0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108", "EntryPoint v0.8"),
    ("0x8e1128803171F1F04b00C783fd19DC0d7711001F", "EntryPoint sim v7"),
    ("0x469a6Cc4206B7d49a7a3b7CC917aFefA514A752e", "EntryPoint sim v8"),
    ("0x71b5A95992B3B1C1e9D2160eAfaA0f1C0ad5A310", "EntryPoint sim v9"),
    ("0x9Bd3B766d8F8cFf18520c4D05EddDf0F0EA078Ae", "Pimlico sim"),
]

# ── ENS contracts (code + storage) ────────────────────────────────────────
# Addresses from the current ensjs Sepolia chain config
# (@ensdomains/ensjs/chain → ensL1Contracts[sepolia]) and ens-sepolia.ts.
# These must stay in sync with the ensjs catalog version in pnpm-workspace.yaml.
ETH_REGISTRY    = "0xdedb92913a25abe1f7bcdd85d8a344a43b398b67"  # ensRegistry
ETH_REGISTRAR   = "0x8c2e866b439358c41ae05de9cbe8a00bfefaffca"  # ensEthRegistrar
# FastTestETHRegistrar was removed in #774 — no longer deployed on Sepolia.
REG_DATASTORE   = "0x5a9236e72a66d3e08b83dcf489b4d850792b6009"  # ensRegistryDatastore (unverified — check if redeployed)
PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"  # ensPublicResolver
REV_REGISTRAR   = "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6"  # ensReverseRegistrar
ENS_REGISTRY    = "0x7e89b563f936c68c31a360840eb7f9a4aacaf014"  # ENS Registry (v1) — bake_with_storage skips gracefully if absent
NAME_WRAPPER    = "0x0635513f179D50A207757E05759CbD106d7dFcE8"  # ensNameWrapper
HCA_FACTORY              = "0x358680728dedb552adaa9f5eb5d4395b291cf943"  # ensHcaFactory
VERIFIABLE_FACTORY       = "0xd2a632d8a8b67c2c4398c255cbd7af8dd7236198"  # ensVerifiableFactory
DEDICATED_RESOLVER_IMPL  = "0xdce5205a553573ffd47629327dddf36186022ffa"  # ensPermissionedResolverImpl
UNIVERSAL_RESOLVER       = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe"  # ensUniversalResolver
STANDARD_RENT_PRICE_ORACLE    = "0xe19d37839f42f7d2694d8c5712f412c66a218161"  # ensStandardRentPriceOracle
LOCKED_MIGRATION_CONTROLLER   = "0xf91c34ed840889ed96f806f882fd50506a336edb"  # ensLockedMigrationController
UNLOCKED_MIGRATION_CONTROLLER = "0x056138ef5660f7113a3b0adc08ac3683310e7fbc"  # ensUnlockedMigrationController
MIGRATION_HELPER              = "0x11cfa7e034dafb7439cc1cc8b6e547f5c82ad021"  # ensMigrationHelper
DEFAULT_REVERSE_REGISTRAR     = "0xeb8269fb39290f31c4c29cec548807ca2133abb4"  # DefaultReverseRegistrar (ens-sepolia.ts)

# BatchGatewayProvider is an immutable embedded in the Universal Resolver bytecode.
# Verify with: cast call <UR> "batchGatewayProvider()(address)" --rpc-url <SEPOLIA>
BATCH_GATEWAY_PROVIDER   = "0xdd618e84bfdbe3f8c4bf70ad000493977d824ab9"  # unverified — check against current UR

# Root Registry is discovered dynamically from the Universal Resolver at bake time
# (see discover_root_registry below). The fallback is the last known address.
ROOT_REGISTRY_FALLBACK   = "0x3a3e15a5d27ff6f05c844313312f2e72096d3ed3"
USER_REGISTRY_IMPL       = "0x0f99e7ea74903afcb7224d0354fd7428a6f92917"  # ensUserRegistryImpl

# Storage slots for Root Registry's "eth" subregistry entry.
# These hash-addressed slots hold the (ETH Registry address, flags) struct for
# the "eth" label. Found via debug_traceCall with prestateTracer on getSubregistry("eth").
# If ROOT_REGISTRY has been redeployed at a new address, re-derive these slots
# by running the same prestateTracer trace against the live Sepolia fork.
ROOT_REGISTRY_ETH_SLOTS = [
    "0x400313669055dc4990165771718a1ce8d73da104df8da41a522793dae4bac649",
    "0x400313669055dc4990165771718a1ce8d73da104df8da41a522793dae4bac64a",
]

# ── Safe / Rhinestone infrastructure ──────────────────────────────────────
# Required for Rhinestone smart account deployment and execution in snapshot mode.
# These are deterministic CREATE2 deployments present on Sepolia.
SAFE_PROXY_FACTORY    = "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67"
SAFE_SINGLETON        = "0x29fcb43b46531bca003ddc8fcb67ffe91900c762"
SAFE_7579_LAUNCHPAD_V1 = "0x7579011ab74c46090561ea277ba79d510c6c00ff"
SAFE_7579_ADAPTER_V1   = "0x7579ee8307284f293b1927136486880611f20002"
SAFE_7579_LAUNCHPAD_V2 = "0x75798463024bda64d83c94a64bc7d7eab41300ef"
SAFE_7579_ADAPTER_V2   = "0x7579f2ad53b01c3d8779fe17928e0d48885b0003"

# ── Rhinestone module contracts ────────────────────────────────────────────
# All module/validator/policy contracts referenced by @rhinestone/sdk v1.7.0.
# Addresses sourced from node_modules/@rhinestone/sdk/dist/src/.
RHINESTONE_MODULES = [
    ("0x000000000032ddc454c3bdcba80484ad5a798705", "Nexus Implementation"),
    ("0xad568b3f825a8d5ffc06dd3253526b64d810ae89", "SmartSession Emissary"),
    ("0x000000000052e9685932845660777DF43C2dC496", "SmartSession Compat Fallback"),
    ("0x000000000013fdb5234e4e3162a810f54d9f7e98", "OwnableValidator"),
    ("0x5049ecBd4d961aE6DFEED9b7ccCe7f026454970E", "ENS HCA Module"),  # SDK 1.7.0: validators/core.js ENS_HCA_MODULE
    ("0x0000000000578c4cb0e472a5462da43c495c3f33", "WebAuthn Validator"),
    ("0x0000000000e9e6e96bcaa3c113187cdb7e38aed9", "OwnableBeta Validator"),
    ("0x000000333034E9f539ce08819E12c1b8Cb29084d", "Rhinestone Attester"),
    ("0x0000000000f6Ed8Be424d673c63eeFF8b9267420", "Hook"),
    ("0x000000000043ff16d5776c7F0f65Ec485C17Ca04", "SameChain Module"),
    ("0x00000000005aD9ce1f5035FD62CA96CEf16AdAAF", "Intent Executor"),
    ("0x00000088d48cf102a8cdb0137a9b173f957c6343", "SpendingLimits Policy"),
    ("0x0000003111cd8e92337c100f22b7a9dbf8dee301", "Sudo Policy"),
    ("0x0000006dda6c463511c4e9b05cfc34c1247fcf1f", "UniversalAction Policy"),
    ("0x8177451511de0577b911c254e9551d981c26dc72", "TimeFrame Policy"),
    ("0x1f34ef8311345a3a4a4566af321b313052f51493", "UsageLimit Policy"),
    ("0x730da93267e7e513e932301b47f2ac7d062abc83", "ValueLimit Policy"),
    ("0xe9eA54d063975cDee9e06b7636d5563d95a7A23C", "IntentExecution Policy"),
]

# ── Rhinestone proxy implementation contracts ──────────────────────────────
# Several Rhinestone module contracts are proxies that delegatecall to a
# separate implementation contract whose address is hardcoded as an immutable.
# These impl contracts are NOT listed in the SDK constants but must be baked
# or every call to the proxy reverts with empty data.
RHINESTONE_MODULE_IMPLS = [
    ("0x7c2cC1e499a87ab480Df154e05164cD56D05d570", "HCA Implementation"),  # SDK 1.7.0: accounts/hca.js HCA_IMPLEMENTATION_ADDRESS
    ("0xe1b629162b08b8baefa2b30ee34d6cab63580320", "SmartSession Emissary impl"),
    ("0xfd0732dc9e303f09fcef3a7388ad10a83459ec99", "Rhinestone Attester impl"),
    ("0x4da168397ba7872ea14efb0787ce4ebfc3f5b3c5", "Hook impl"),
    ("0x69b80e6ca11554ea6834b032068932c1cbace9be", "Hook impl v2"),
    ("0x5dc6eecb038ea0130fe3ce38a101e5e2cd93ce15", "SameChain Module impl"),
    ("0x194de341d4791e9b8922ee1bc018dfd1fd1b115a", "Intent Executor impl"),
]

# EIP-1967 transparent proxy implementation slot
EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"

# Known Rhinestone smart account addresses to bake with full storage.
# These are counterfactual Safe proxies that are deterministically deployed
# based on the owner EOA + Rhinestone SDK config. Baking code + EIP-1967
# implementation slot ensures the delegatecall target is correct in snapshot mode.
RHINESTONE_SMART_ACCOUNTS = [
    ("0x38Baa0d0240d293723dC9C4C9732f1792297A8aF", "Rhinestone SA (ensjs-v2 / test1)"),
    ("0xC9dDA331341ffE42E6377E35EEbaCC5d4fe24e74", "Rhinestone SA (testing-2)"),
]

ENS_CONTRACTS = [
    (ETH_REGISTRY,    "ETH Registry (PermissionedRegistry)"),
    (ETH_REGISTRAR,   "ETH Registrar"),
    (REG_DATASTORE,   "Registry Datastore"),
    (PUBLIC_RESOLVER, "Public Resolver"),
    (REV_REGISTRAR,   "Reverse Registrar"),
    (ENS_REGISTRY,    "ENS Registry (v1)"),
    (NAME_WRAPPER,    "Name Wrapper"),
    (HCA_FACTORY,     "HCA Factory"),
]

# Payment tokens whose _paymentRatios slots we need to copy (for the oracle)
PAYMENT_TOKENS = [
    ("0xba11ebdb3f9a2c5946d8629517f06364e53a2e10", "MockUSDC"),  # ensjs: usdc
    ("0x2922bcd677af690fcd1ecc699519e4bfabc73ff8", "MockDAI"),   # ensjs: dai
]
# _paymentRatios mapping is at storage slot 5 in StandardRentPriceOracle
# (sequential slots 3 and 4 are dynamic arrays whose elements live at
# keccak256(slot) + i — also baked by bake_oracle below)
PAYMENT_RATIOS_SLOT = 5

ZERO32 = "0x" + "0" * 64


# ── Helpers ────────────────────────────────────────────────────────────────

def rpc(method: str, params: list, retries: int = 3):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC_URL, data=body, headers={"Content-Type": "application/json"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req) as r:
                return json.load(r)
        except Exception:
            if attempt < retries - 1:
                time.sleep(0.5 * (attempt + 1))
            else:
                raise


def keccak256(hex_data: str) -> str:
    """Compute keccak256 using the `cast` binary (Foundry)."""
    result = subprocess.run(
        ["cast", "keccak", hex_data],
        capture_output=True, text=True,
    )
    return result.stdout.strip()


def mapping_slot(key_hex: str, base_slot: int) -> str:
    """keccak256(abi.encode(key, base_slot)) — storage slot for mapping[key]."""
    key = key_hex.replace("0x", "").lower().zfill(64)
    base = hex(base_slot)[2:].zfill(64)
    return keccak256(f"0x{key}{base}")


def nested_mapping_slot(outer_key: str, inner_key: str, base_slot: int) -> str:
    """Storage slot for mapping[outer][inner] at base_slot."""
    intermediate = mapping_slot(outer_key, base_slot)
    return mapping_slot(inner_key, int(intermediate, 16))


def get_code(addr: str) -> Optional[str]:
    resp = rpc("eth_getCode", [addr, "latest"])
    code = resp.get("result", "0x")
    return code if code and code != "0x" else None


def set_code(addr: str, code: str):
    rpc("anvil_setCode", [addr, code])


def get_storage(addr: str, slot: str) -> str:
    resp = rpc("eth_getStorageAt", [addr, slot, "latest"])
    return resp.get("result", ZERO32)


def set_storage(addr: str, slot: str, val: str):
    rpc("anvil_setStorageAt", [addr, slot, val])


def copy_slot(addr: str, slot: str) -> bool:
    """Read slot from fork and write it locally. Returns True if non-zero."""
    val = get_storage(addr, slot)
    if val == ZERO32:
        return False
    set_storage(addr, slot, val)
    return True


def scan_sequential_slots(addr: str, count: int = 128) -> int:
    """Copy non-zero sequential storage slots 0..count-1."""
    copied = 0
    for i in range(count):
        slot = "0x" + hex(i)[2:].zfill(64)
        if copy_slot(addr, slot):
            copied += 1
    return copied


# ── Discovery helpers ───────────────────────────────────────────────────────

def discover_root_registry() -> Optional[str]:
    """Call findRegistries('eth') on the Universal Resolver to get root registry.

    'eth' in DNS wire format (ENSIP-10 packet encoding): \\x03eth\\x00 = 0x0365746800
    findRegistries returns address[] where [0] = ETH registry, [1] = root registry.
    """
    env = {**os.environ, "FOUNDRY_DISABLE_NIGHTLY_WARNING": "1"}
    result = subprocess.run(
        ["cast", "call", UNIVERSAL_RESOLVER,
         "findRegistries(bytes)(address[])",
         "0x0365746800",
         "--rpc-url", RPC_URL],
        capture_output=True, text=True, env=env,
    )
    output = result.stdout.strip()
    if not output:
        return None
    addrs = re.findall(r'0x[0-9a-fA-F]{40}', output)
    if len(addrs) >= 2:
        return addrs[1]
    return None


# ── Baking ─────────────────────────────────────────────────────────────────

def bake_code_only(addr: str, label: str):
    code = get_code(addr)
    if not code:
        print(f"  ⚠  no code at {label} ({addr}) — skipping")
        return
    set_code(addr, code)
    print(f"  ✓  {label}: code ({len(code)//2 - 1} bytes)")


def bake_with_storage(addr: str, label: str, extra_slots: list[str] | None = None):
    code = get_code(addr)
    if not code:
        print(f"  ⚠  no code at {label} ({addr}) — skipping")
        return
    set_code(addr, code)

    seq = scan_sequential_slots(addr, 128)

    extra = 0
    for slot in (extra_slots or []):
        if copy_slot(addr, slot):
            extra += 1

    print(f"  ✓  {label}: code ({len(code)//2 - 1} bytes), "
          f"{seq} sequential slots, {extra} extra mapping slots")


def normalize_hex32(h: str) -> str:
    """Normalize to lowercase 0x-prefixed 64-char hex string."""
    h = h.lower()
    if h.startswith("0x"):
        h = h[2:]
    return "0x" + h.zfill(64)


def trace_contract_storage(addr: str, calldata: str) -> dict:
    """Run debug_traceCall with prestateTracer; return {slot: val} for addr.

    prestateTracer captures the state that was READ during the call (with Sepolia
    values when Anvil is running in fork mode). Filtering to addr ensures we only
    copy the oracle's slots, not those of any contracts it calls into.
    """
    resp = rpc("debug_traceCall", [
        {"to": addr, "data": calldata, "gas": "0x7a120"},
        "latest",
        {"tracer": "prestateTracer"},
    ])
    if resp.get("error"):
        return {}
    result = resp.get("result") or {}
    addr_lower = addr.lower()
    for key in [addr_lower, addr_lower.lstrip("0x"), addr_lower.replace("0x", "")]:
        if key in result:
            return result[key].get("storage") or {}
    return {}


def bake_oracle(addr: str):
    """Bake price oracle by tracing view functions with prestateTracer.

    Replaces hardcoded slot numbers (old slots 3, 4, 5) with trace-based
    discovery. This handles any storage layout — OZ upgradeable __gap arrays
    push state to slot 100+, far beyond the sequential 0-127 scan range.
    """
    code = get_code(addr)
    if not code:
        print(f"  ⚠  no code at Price Oracle ({addr}) — skipping")
        return
    set_code(addr, code)

    env = {**os.environ, "FOUNDRY_DISABLE_NIGHTLY_WARNING": "1"}

    def get_selector(sig: str) -> str:
        r = subprocess.run(["cast", "sig", sig], capture_output=True, text=True, env=env)
        return r.stdout.strip()  # e.g. "0xd13f7d09"

    sel_base_rates   = get_selector("getBaseRates()")
    sel_discount     = get_selector("getDiscountPoints()")
    sel_is_token     = get_selector("isPaymentToken(address)")
    sel_token_ratio  = get_selector("getPaymentTokenRatio(address)")

    calls = [
        (sel_base_rates, "getBaseRates()"),
        (sel_discount,   "getDiscountPoints()"),
    ]
    for token_addr, token_name in PAYMENT_TOKENS:
        padded = token_addr[2:].lower().zfill(64)
        calls.append((sel_is_token    + padded, f"isPaymentToken({token_name})"))
        calls.append((sel_token_ratio + padded, f"getPaymentTokenRatio({token_name})"))

    baked: set[str] = set()
    for calldata, label in calls:
        storage = trace_contract_storage(addr, calldata)
        for slot, val in storage.items():
            s = normalize_hex32(slot)
            v = normalize_hex32(val)
            if v != ZERO32 and s not in baked:
                set_storage(addr, s, v)
                baked.add(s)
        if not storage:
            print(f"       ℹ  no prestate returned for {label}")

    if not baked:
        # Fallback: oracle may not be initialized on-chain yet; scan wide range
        print("       ℹ  trace found no slots — falling back to sequential scan (512 slots)")
        scan_sequential_slots(addr, 512)

    print(f"  ✓  Price Oracle ({addr}): code ({len(code)//2 - 1} bytes), {len(baked)} traced slots baked")


def get_oracle_address() -> Optional[str]:
    """Call rentPriceOracle() on ETH Registrar — it's an immutable, not in storage."""
    env = {**os.environ, "FOUNDRY_DISABLE_NIGHTLY_WARNING": "1"}
    result = subprocess.run(
        ["cast", "call", ETH_REGISTRAR, "rentPriceOracle()(address)", "--rpc-url", RPC_URL],
        capture_output=True, text=True, env=env,
    )
    addr = result.stdout.strip()
    if addr and addr != "0x0000000000000000000000000000000000000000":
        return addr
    return None


def bake_ens_contracts():
    # ETH Registrar — discover the price oracle via call (it's an immutable).
    # Also cross-check against the known oracle address from ensjs config.
    bake_with_storage(ETH_REGISTRAR, "ETH Registrar")

    oracle_addr = get_oracle_address()
    if oracle_addr:
        if oracle_addr.lower() != STANDARD_RENT_PRICE_ORACLE.lower():
            print(f"  ⚠  oracle mismatch: found {oracle_addr}, expected {STANDARD_RENT_PRICE_ORACLE}")
        bake_oracle(oracle_addr)
    else:
        print("  ⚠  rentPriceOracle() returned nothing — baking known oracle address")
        bake_oracle(STANDARD_RENT_PRICE_ORACLE)

    # ETH Registry — nested _roles mapping at slot 2.
    # Storage layout: ERC1155Singleton (_owners@0, _operatorApprovals@1) comes before
    # EnhancedAccessControl (_roles@2, _roleCount@3, __gap@4-259) in the C3 MRO.
    # ROOT_RESOURCE=0 is the resource used for root-level role grants (e.g. ROLE_REGISTRAR).
    # ETH_REGISTRAR needs ROLE_REGISTRAR here (FastTestETHRegistrar was removed in #774).
    role_slots = []
    for account in [ETH_REGISTRAR, PUBLIC_RESOLVER, REV_REGISTRAR]:
        role_slots.append(nested_mapping_slot(
            outer_key=hex(0),
            inner_key=account,
            base_slot=2,
        ))
    # _roleCount at slot 3 — bake the root-resource count entry
    role_slots.append(mapping_slot(hex(0), 3))
    bake_with_storage(ETH_REGISTRY, "ETH Registry", extra_slots=role_slots)

    # Remaining ENS contracts — sequential storage is sufficient
    for addr, label in [
        (REG_DATASTORE,   "Registry Datastore"),
        (PUBLIC_RESOLVER, "Public Resolver"),
        (REV_REGISTRAR,   "Reverse Registrar"),
        (ENS_REGISTRY,    "ENS Registry (v1)"),
        (NAME_WRAPPER,    "Name Wrapper"),
    ]:
        bake_with_storage(addr, label)

    # HCA Factory — code + storage (slots 1=implementation, 2=ENS HCA Module are critical)
    bake_with_storage(HCA_FACTORY,          "HCA Factory")
    bake_code_only(VERIFIABLE_FACTORY,      "Verifiable Factory")
    bake_code_only(DEDICATED_RESOLVER_IMPL, "Dedicated Resolver Impl")

    # Universal Resolver V2 — code only (root registry + batch gateway are immutables)
    bake_code_only(UNIVERSAL_RESOLVER, "Universal Resolver V2")

    # BatchGatewayProvider — code + sequential storage (gateway URL list)
    bake_with_storage(BATCH_GATEWAY_PROVIDER, "Batch Gateway Provider")

    # Root Registry (UserRegistry) — discover address via Universal Resolver.
    # Falls back to ROOT_REGISTRY_FALLBACK if discovery fails.
    root_registry = discover_root_registry()
    if root_registry:
        print(f"  ℹ  Root Registry discovered: {root_registry}")
    else:
        root_registry = ROOT_REGISTRY_FALLBACK
        print(f"  ⚠  Root Registry discovery failed — using fallback {root_registry}")

    # ROOT_REGISTRY_ETH_SLOTS are hash-addressed and not reachable by sequential scan.
    # If root_registry address differs from ROOT_REGISTRY_FALLBACK, re-derive these
    # slots via: debug_traceCall prestateTracer on getSubregistry("eth").
    bake_with_storage(root_registry, "Root Registry", extra_slots=ROOT_REGISTRY_ETH_SLOTS)

    # UserRegistry implementation contract — code only (logic for UserRegistry proxies)
    bake_code_only(USER_REGISTRY_IMPL, "UserRegistry Impl")

    # Migration contracts — code only (not yet active, but must exist for registration flow)
    bake_code_only(LOCKED_MIGRATION_CONTROLLER,   "Locked Migration Controller")
    bake_code_only(UNLOCKED_MIGRATION_CONTROLLER, "Unlocked Migration Controller")
    bake_code_only(MIGRATION_HELPER,              "Migration Helper")

    # Default Reverse Registrar — code + storage (sets primary name per coin type)
    bake_with_storage(DEFAULT_REVERSE_REGISTRAR, "Default Reverse Registrar")


def bake_rhinestone_infrastructure():
    """Bake Safe/Rhinestone infrastructure needed for smart account execution."""
    # Core Safe contracts — code only (logic contracts, storage lives in each proxy)
    for addr, label in [
        (SAFE_PROXY_FACTORY,     "SafeProxyFactory"),
        (SAFE_SINGLETON,         "Safe Singleton"),
        (SAFE_7579_LAUNCHPAD_V1, "Safe7579 Launchpad V1"),
        (SAFE_7579_ADAPTER_V1,   "Safe7579 Adapter V1"),
        (SAFE_7579_LAUNCHPAD_V2, "Safe7579 Launchpad V2"),
        (SAFE_7579_ADAPTER_V2,   "Safe7579 Adapter V2"),
    ]:
        bake_code_only(addr, label)

    # All Rhinestone module/validator/policy contracts (code only).
    for addr, label in RHINESTONE_MODULES:
        bake_code_only(addr, label)

    # Proxy implementation contracts (hardcoded immutables inside the proxies above).
    for addr, label in RHINESTONE_MODULE_IMPLS:
        bake_code_only(addr, label)

    # Known Rhinestone smart accounts — code + sequential slots + EIP-1967 impl pointer.
    # Without the EIP-1967 slot the proxy delegates to address(0) and every call fails.
    for addr, label in RHINESTONE_SMART_ACCOUNTS:
        bake_with_storage(addr, label, extra_slots=[EIP1967_IMPL_SLOT])


# ── Main ───────────────────────────────────────────────────────────────────

print("EVM infrastructure (code only):")
for addr, label in INFRA_CONTRACTS:
    bake_code_only(addr, label)

print("\nERC-4337 contracts (code only):")
for addr, label in ERC4337_CONTRACTS:
    bake_code_only(addr, label)

print("\nENS contracts (code + storage):")
bake_ens_contracts()

print("\nSafe / Rhinestone infrastructure:")
bake_rhinestone_infrastructure()

print("\nDone.")
