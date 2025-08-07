import { ClipboardCopyIcon } from "lucide-react"

export const CopyableRecord = ({ value }: { value: string }) => {
  return (
    <div className="flex flex-row justify-between">
      <span className="font-mono underline decoration-dashed underline-offset-4 max-w-[336px] truncate">
        {value}
      </span>
      <button
        className="cursor-pointer"
        type="button"
        onClick={() => navigator.clipboard.writeText(value)}
      >
        <ClipboardCopyIcon height={16} width={16} />
      </button>
    </div>
  )
}