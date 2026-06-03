import {
  Clock,
  Image as ImageIcon,
  Languages,
  List,
  MapPin,
  Smile,
} from 'lucide-react'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface EditProfileDialogProps {
  name: string
}

const tabs = [
  { label: 'General', value: 'general' },
  { label: 'Contact', value: 'contact' },
  { label: 'Addresses', value: 'addresses' },
  { label: 'Links', value: 'links' },
  { label: 'Appearance', value: 'appearance' },
] as const

const generalShortcuts = [
  { label: 'Profile Picture', icon: Smile, muted: true },
  { label: 'Header', icon: ImageIcon, muted: true },
  { label: 'Description', icon: List, muted: true },
  { label: 'Location', icon: MapPin, muted: false },
  { label: 'Timezone', icon: Clock, muted: false },
  { label: 'Language', icon: Languages, muted: false },
] as const

export const EditProfileDialog = ({ name }: EditProfileDialogProps) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button className="w-full">Edit Profile (New)</Button>
    </DialogTrigger>
    <DialogContent
      className="h-[min(86dvh,900px)] max-h-[calc(100dvh-4rem)] w-[min(84vw,1280px)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border border-border bg-white p-0 shadow-lg sm:max-w-[calc(100vw-8rem)]"
      overlayClassName="bg-black/20 backdrop-blur-[2px]"
      showCloseButton={false}
    >
      <Tabs
        className="min-h-0 flex-1 gap-0"
        defaultValue="general"
        orientation="vertical"
      >
        <div className="flex h-24 shrink-0 items-center justify-between px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-10 shrink-0 overflow-hidden rounded-sm">
              <PatternAvatar
                className="border-none p-0 shadow-none"
                name={name}
              />
            </div>
            <DialogTitle className="max-w-[26rem] truncate rounded-sm border border-ens-blue bg-white px-3 py-1 font-mono text-2xl text-ens-blue leading-tight">
              {name}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-3">
            <DialogClose asChild>
              <Button
                className="w-auto text-muted-foreground uppercase tracking-[0.18em]"
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="h-11 w-auto px-6 py-0 uppercase tracking-[0.18em]"
              type="button"
            >
              Save Profile
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 px-8 pb-8">
          <TabsList className="h-full w-44 shrink-0 flex-col items-stretch justify-start gap-1 rounded-none border-border border-r bg-transparent p-0 pt-3 pr-4">
            {tabs.map(({ label, value }) => (
              <TabsTrigger
                className="h-12 w-full flex-none justify-start rounded-md px-4 font-normal text-base text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
                key={value}
                value={value}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex min-w-0 flex-1 flex-col pt-3 pl-8">
            <TabsContent
              className="min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              value="general"
            >
              <div className="space-y-6">
                <div>
                  <h2 className="font-semibold text-xl">General</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {generalShortcuts.map(({ icon: Icon, label, muted }) => (
                      <Button
                        className={cn(
                          'h-9 w-auto rounded-full px-3',
                          muted && 'text-muted-foreground',
                        )}
                        key={label}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Icon className="size-4" />
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-3 pt-2">
                  <Button
                    className="size-24 rounded-md border-dashed text-muted-foreground"
                    type="button"
                    variant="outline"
                  >
                    <Smile className="size-10" />
                  </Button>
                  <Button
                    className="w-auto text-muted-foreground"
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Add a profile picture
                    <span>+</span>
                  </Button>
                </div>

                <Button
                  className="h-40 w-full rounded-md border-dashed text-muted-foreground"
                  type="button"
                  variant="outline"
                >
                  Add a banner image
                  <span>+</span>
                </Button>

                <div className="space-y-4">
                  <Input
                    className="rounded-md"
                    placeholder="Full name"
                    size="lg"
                  />
                  <Textarea
                    className="min-h-32 resize-none rounded-md"
                    placeholder="Description"
                  />
                </div>
              </div>
            </TabsContent>

            {tabs
              .filter(({ value }) => value !== 'general')
              .map(({ value }) => (
                <TabsContent
                  className="flex min-h-0 flex-1 items-center justify-center text-base text-muted-foreground"
                  key={value}
                  value={value}
                >
                  WIP
                </TabsContent>
              ))}
          </div>
        </div>
      </Tabs>
    </DialogContent>
  </Dialog>
)
