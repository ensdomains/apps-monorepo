import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const DidYouKnowSection = () => (
  <Card className="border bg-white/90">
    <CardHeader>
      <CardTitle className="font-semibold font-serif text-lg">
        Did you know?
      </CardTitle>
      <CardDescription>
        ENS names are more than just .eth usernames. Use them across apps,
        networks, and wallets.
      </CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 rounded-xl bg-ens-blue/5 p-4">
        <div className="font-semibold text-ens-blue text-xs uppercase">
          One username, many places
        </div>
        <p className="text-muted-foreground text-sm">
          Set a primary name once and use it across compatible apps, wallets,
          and dapps instead of copying long addresses.
        </p>
      </div>
      <div className="space-y-2 rounded-xl bg-pink-50 p-4">
        <div className="font-semibold text-pink-600 text-xs uppercase">
          Stay safe
        </div>
        <p className="text-muted-foreground text-sm">
          Always double-check links and transactions before signing. ENS names
          help you recognise trusted accounts more easily.
        </p>
      </div>
    </CardContent>
  </Card>
)
