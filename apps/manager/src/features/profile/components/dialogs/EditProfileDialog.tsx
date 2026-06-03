import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface EditProfileDialogProps {
  name: string
}

export const EditProfileDialog = ({ name }: EditProfileDialogProps) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button className="w-full">Edit Profile (New)</Button>
    </DialogTrigger>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Profile (New)</DialogTitle>
      </DialogHeader>
      <div className="rounded-md border bg-muted/40 px-4 py-3">
        <p className="break-all font-mono text-sm">{name}</p>
      </div>
    </DialogContent>
  </Dialog>
)
