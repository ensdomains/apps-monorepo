#!/usr/bin/env python3
"""
Register pre-seeded test names on the Anvil fork.

These names are used by E2E tests that navigate directly to a hardcoded name
(no makeV2Name fixture).  All names are owned by Anvil account 0 — the same
address makeV2Name uses for owner='other', so tests exercise the unowned path.

Run after bake-contracts.py and fund-account.sh have completed.
"""
import os
import subprocess
import sys
import time

RPC_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8545"

# Addresses
FAST_TEST_REGISTRAR = "0xbbf892aea9bb883b36bab2adc7831a6c63ef1e39"
ETH_REGISTRY        = "0x796fff2e907449be8d5921bcc215b1b76d89d080"
PUBLIC_RESOLVER     = "0x640294a2b2d87e7f522db3e3e3e876764bce170d"
MOCK_USDC           = "0x302edecc2b8d1f3f4625b8a825a42f9adc102e65"
ZERO_ADDRESS        = "0x0000000000000000000000000000000000000000"

# Anvil account 0 — true EOA (no code), used as the "other" owner
OWNER       = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ANVIL_KEY0  = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

ZERO32  = "0x" + "0" * 64
# 2 years — long enough that no test will hit expiry during CI
DURATION = str(2 * 365 * 24 * 3600)

env = {**os.environ, "FOUNDRY_DISABLE_NIGHTLY_WARNING": "1"}


def cast(*args, key=None, quiet=False):
    cmd = ["cast", *args, "--rpc-url", RPC_URL]
    if key:
        cmd += ["--private-key", key]
    if quiet:
        cmd += ["--quiet"]
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise RuntimeError(f"cast failed: {' '.join(args[:3])}: {r.stderr.strip()[:300]}")
    return r.stdout.strip()


def register_name(label: str):
    """Register a single .eth label owned by Anvil account 0."""
    print(f"  registering {label}.eth ...")

    # Check if already available (skip if taken — supports re-runs)
    available = cast("call", FAST_TEST_REGISTRAR, "isAvailable(string)(bool)", label)
    if available.startswith("false"):
        print(f"    ⚠  {label}.eth already taken — skipping")
        return

    # Mint USDC (idempotent — just adds more tokens)
    cast("send", MOCK_USDC, "mint(address,uint256)", OWNER, "10000000000",
         key=ANVIL_KEY0, quiet=True)

    # Get price and approve
    price_out = cast("call", FAST_TEST_REGISTRAR,
                     "rentPrice(string,address,uint64,address)(uint256,uint256)",
                     label, OWNER, DURATION, MOCK_USDC)
    base = int(price_out.split("\n")[0].split()[0])
    cast("send", MOCK_USDC, "approve(address,uint256)", FAST_TEST_REGISTRAR,
         str(base * 3), key=ANVIL_KEY0, quiet=True)

    # makeCommitment → commit → register
    # subregistry = ZERO_ADDRESS so the name is a leaf (no sub-registry).
    # resolver = PUBLIC_RESOLVER so the app can look up records.
    commitment = cast("call", FAST_TEST_REGISTRAR,
                      "makeCommitment(string,address,bytes32,address,address,uint64,bytes32)(bytes32)",
                      label, OWNER, ZERO32, ZERO_ADDRESS, PUBLIC_RESOLVER, DURATION, ZERO32)

    cast("send", FAST_TEST_REGISTRAR, "commit(bytes32)", commitment,
         key=ANVIL_KEY0, quiet=True)

    cast("send", FAST_TEST_REGISTRAR,
         "register(string,address,bytes32,address,address,uint64,address,bytes32)",
         label, OWNER, ZERO32, ZERO_ADDRESS, PUBLIC_RESOLVER, DURATION, MOCK_USDC, ZERO32,
         key=ANVIL_KEY0, quiet=True)

    print(f"    ✓  {label}.eth registered (owner={OWNER})")


# ── Names required by E2E tests ────────────────────────────────────────────
# "extend unowned name by 28 days" in profile.spec.ts navigates directly to
# tester-other.eth without going through makeV2Name.
NAMES_TO_REGISTER = [
    "tester-other",
]

for label in NAMES_TO_REGISTER:
    try:
        register_name(label)
    except RuntimeError as e:
        print(f"  ✗  {label}.eth: {e}")
        sys.exit(1)

print("Done.")
