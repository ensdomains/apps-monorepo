# PR #1640 Safe renewal route model

This model covers Safe detection, signer resolution, smart-session gating, and
the existing L2 pre-bridge path.

It checks that:

- renewal cannot submit while Safe detection is pending;
- smart-session controls stay hidden until Safe detection resolves;
- a connected Safe can proceed on the wallet route without an HCA client;
- a Safe with a wallet client uses the wallet route;
- a Safe without a client has no route;
- a non-Safe HCA retains the intent route;
- a non-Safe EOA retains the wallet route;
- single-v2 intent submission passes the smart-session gate;
- single-v1 and bulk-v2 renewals bypass the session gate;
- an L2-funded intent bridges before submission.

`Current.cfg` represents the PR head and finds the pending-session-control
counterexample. A separate configuration finds the wallet route's incorrect HCA
connectivity dependency. `Hardened.cfg` enables both missing guards and must
pass. Each sensitivity configuration removes one guard and must produce a counterexample for its
named invariant, with TLC's safety-violation exit code (12). Configuration,
parser, JVM, and unrelated invariant failures do not count as sensitivity.

The workflow enumerates single-v1, single-v2, and bulk-v2 separately. The gate
models the pricing prerequisite in the single-v2 payment card; renewal intents
are owner-signed, including in the flows that bypass that prerequisite. The
bridge requirement applies to L2-funded intent submissions across these flows.
This is an abstract workflow check, not execution of the React or IO layers.

Run:

```sh
bash formal/verify-pr-1640.sh
```

The runner uses mise to provision its pinned tools unless both `JAVA_BIN` and
`TLC_JAR` point to existing tools. `FORMAL_OUT_DIR` selects the parent log
directory; each run creates a unique child directory and preserves existing
files and earlier runs.

Run the focused runner regression tests with installed tools (no provisioning):

```sh
python3 formal/verify-pr-1640.test.py
```
