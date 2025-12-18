import { sha256, toHex } from 'viem'
import { Button } from './ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'

const hash =
  '0x6337f5f46479e89c07cbe68b81705a654d86277ebf2d47d5bf7d04b7d3fd4c45'

export const PasswordModal = () => {
  return (
    <div className="h-screen flex items-center justify-center">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Enter password</Button>
        </DialogTrigger>
        <DialogContent>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              const fd = new FormData(e.currentTarget)
              e.preventDefault()

              const pass = fd.get('pass') as string
              if (sha256(toHex(pass)) === hash) {
                localStorage.setItem('pass-hash', hash)
                location.reload()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Enter password</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Label htmlFor="pass">Password</Label>
              <Input
                id="pass"
                name="pass"
                type="password"
                placeholder="Enter password here"
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit">Submit</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
