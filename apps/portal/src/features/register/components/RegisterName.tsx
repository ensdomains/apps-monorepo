import { RegisterNameCheckout } from './RegisterNameCheckout'
import { RegisterNameForm } from './RegisterNameForm'

type RegisterNameProps = {
  name: string
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  return (
    <main className="flex-1 mx-auto w-full max-w-6xl px-6 grid grid-cols-1 lg:grid-cols-3">
      <RegisterNameForm name={name} />
      <RegisterNameCheckout name={name} />
    </main>
  )
}
