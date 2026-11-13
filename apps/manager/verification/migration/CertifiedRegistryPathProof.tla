---------------------- MODULE CertifiedRegistryPathProof ----------------------
(***************************************************************************)
(* STUB. Placeholder for the contracts-level proof that MigrationContract  *)
(* relies on via CertifiedRegistryPathAssumption (behavior B6, MM-032).    *)
(*                                                                         *)
(* Property to prove (against the v2 registry contracts, not the frontend):*)
(*   Every registry reachable from the root registry only links            *)
(*   subregistries that are certified ENS registries, so a traversal from  *)
(*   root to any name never passes through a foreign subregistry.          *)
(*                                                                         *)
(* Owner: TBD (contracts team). Artifact: TBD.                             *)
(* Until replaced, CertifiedRegistryPath is ASSUMED, not proved.           *)
(***************************************************************************)
EXTENDS FiniteSets

CONSTANTS Registries, RootRegistry, Certified, SubregistryOf

\* Stub: the real proof must establish this from the contracts' semantics.
CertifiedRegistryPath ==
  \A r \in Registries : \A s \in SubregistryOf[r] : s \in Certified

THEOREM CertifiedRegistryPathHolds == CertifiedRegistryPath
  \* PROOF OMITTED (stub) -- requires contracts-level formal verification.
================================================================================
