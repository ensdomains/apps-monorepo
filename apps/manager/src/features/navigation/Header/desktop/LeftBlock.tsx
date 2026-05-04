import { Link } from '@tanstack/react-router'
import ensLogo from '@/assets/icons/ens.svg'
import ensMobileLogo from '@/assets/icons/ens-mobile.svg'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/base-ui/popover'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { MSymbol } from '@/components/ui/material-symbol'
import { FloatingWrapper } from './FloatingWrapper'

type BlockProps = {
  isDesktop: boolean
  isConnected: boolean
  shouldShowSearch: boolean
}

export const LeftBlock = ({
  isDesktop,
  isConnected,
  shouldShowSearch,
}: BlockProps) => {
  return (
    <FloatingWrapper className="w-full max-w-xl">
      <Popover>
        <PopoverTrigger
          className="group flex shrink-0 items-center gap-4"
          openOnHover
        >
          <Link
            // Be part of the hover trigger but don't trigger the popover
            onClick={(e) => e.stopPropagation()}
            to={isConnected ? '/dashboard' : '/'}
          >
            <img
              alt="ENS Logo"
              className="h-6.5 shrink-0"
              src={isDesktop ? ensLogo : ensMobileLogo}
            />
          </Link>
          <MSymbol
            className="group-data-popup-open:-rotate-180 ms-opsz-32 text-ens-blue-midnight"
            // className="group-data-[state=open]:-rotate-180 size-4 shrink-0 text-gray-500 transition-transform duration-200 md:size-5"
            symbol="arrow_drop_down"
          />
        </PopoverTrigger>
        <PopoverContent>
          <div>
            <h1>Hello</h1>
          </div>
        </PopoverContent>
      </Popover>
      {shouldShowSearch && <SearchInput />}
    </FloatingWrapper>
  )
}

const SearchInput = () => {
  return (
    <InputGroup className="h-full rounded-sm border-ens-gray-two bg-white">
      <InputGroupAddon>
        <MSymbol className="ms-opsz-24 text-[#4B4B4B]" symbol="search" />
      </InputGroupAddon>
      <InputGroupInput
        className="placeholder:text-[#8C8C8C]"
        placeholder="Search name, address..."
        type="text"
      />
    </InputGroup>
  )
}
