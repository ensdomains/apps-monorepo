

import { Button } from "@/components/ui/button"
import { type ColumnDef } from "@tanstack/react-table"

import { ArrowUpDown } from "lucide-react"

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Record = {
  type: string
  key: string
  value: string
}

export const columns: ColumnDef<Record>[] = [
  {
    accessorKey: "type",
    header: "Type",
  },
  {
    accessorKey: "key",
      header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Key
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "value",
    header: "Value",
  },
]