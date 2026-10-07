export type V1Domain = {
  id: string
  labelName: string | null
  labelhash: string
  name: string
  resolver: { address: string } | null
  owner: { id: string }
  registrant: { id: string } | null
  wrappedOwner: { id: string } | null
  parent: {
    name: string
    wrappedDomain: { fuses: number } | null
  } | null
  registration: {
    expiryDate: string
  } | null
  wrappedDomain: {
    expiryDate: string
    fuses: number
  } | null
  /**
   * A `.eth` 2LD the index lists without a registrar lease. Absent in plans
   * saved before the flag existed.
   */
  isLeaseMissing?: true
  /**
   * The name holds no live ENSv2 reservation, which the migration controllers
   * claim. Absent in plans saved before the flag existed.
   */
  isUnreserved?: true
}
