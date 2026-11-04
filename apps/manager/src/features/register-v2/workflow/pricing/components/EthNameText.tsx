/** A `.eth` name whose TLD never wraps on its own, so a long label breaks before the dot. */
export const EthNameText = ({ label }: { readonly label: string }) => (
  <>
    {label}
    <span className="whitespace-nowrap">.eth</span>
  </>
)
