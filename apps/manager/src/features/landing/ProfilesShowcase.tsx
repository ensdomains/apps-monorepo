import { GithubIcon, GlobeIcon, MailIcon, TwitterIcon } from 'lucide-react'
import { ProfileCard } from './components/ProfileCard'

export const ProfilesShowcase = () => {
  return (
    <div className="mx-auto mt-20 mb-28 w-full-[4rem] max-w-6xl">
      <div className="space-y-6">
        <h2 className="font-medium text-ens-lapis-core text-temp-32px leading-ens-none">
          Look at these profiles
        </h2>
        <p className="max-w-md font-serif text-lg leading-ens-normal">
          Lorem ipsum, dolor sit amet consectetur adipisicing elit.
          Exercitationem, accusantium tenetur quasi aspernatur quos vero nostrum
          veritatis. Nemo nesciunt debitis ducimus nihil exercitationem, vero et
          earum maxime officiis quod sit.
        </p>
      </div>

      <div className="mt-20 flex gap-11 max-md:flex-col">
        <ProfileCard
          name="vitalik.eth"
          avatarUrl="https://enstate.rs/i/vitalik.eth"
          registeredDate={new Date('2020-02-04')}
          description="mi pinxe lo crino tcati"
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/vitalikbuterin',
              title: '@VitalikButerin',
            },
            {
              icon: <GithubIcon className="size-full" />,
              href: 'https://github.com/vbuterin',
              title: 'vButerin',
            },
            {
              icon: <GlobeIcon className="size-full" />,
              href: 'https://vitalik.eth.limo',
              title: 'vitalik.eth.limo',
            },
          ]}
          variant="peridot"
        />
        <ProfileCard
          name="nick.eth"
          avatarUrl="https://enstate.rs/i/nick.eth"
          registeredDate={new Date('2020-02-04')}
          description="Lead developer of ENS & Ethereum Foundation alum. Certified rat tickler. he/him."
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/nicksdjohnson',
              title: '@nicksdjohnson',
            },
            {
              icon: <GithubIcon className="size-full" />,
              href: 'https://github.com/arachnid',
              title: 'arachnid',
            },
            {
              icon: <MailIcon className="size-full" />,
              href: 'mailto:arachnied@notdot',
              title: 'arachnied@notdot',
            },
          ]}
          variant="lapis"
        />
        <ProfileCard
          name="erni.eth"
          avatarUrl="https://enstate.rs/i/erni.eth"
          registeredDate={new Date('2020-02-04')}
          description="This is placeholder. Maybe I could make my profile really educational and it would make sense. Put Paris Hilton on here instead fr. "
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/erni_eth',
              title: '@erni_eth',
            },
            {
              icon: <MailIcon className="size-full" />,
              href: 'mailto:myemail.me.com',
              title: 'myemail.me.com',
            },
          ]}
          variant="garnet"
        />
      </div>
    </div>
  )
}
