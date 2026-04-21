export function NetworkCard() {
  return (
    <div className="p-6 flex flex-row rounded-sm gap-6 items-center border border-border">
      <img src="/icons/eth.svg" alt="" className="w-10 h-10" />
      <div className="flex flex-col">
        <span className="font-medium">Network</span>
        <span>Sepolia</span>
      </div>
    </div>
  )
}
