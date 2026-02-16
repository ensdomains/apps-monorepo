type RegisterNameCheckoutProps = {
  name: string
}

export const RegisterNameCheckout = ({ name }: RegisterNameCheckoutProps) => {
  return (
    <div className="py-6 lg:border-l lg:border-border p-6 col-span-1">
      <h1>Register {name} Checkout</h1>
    </div>
  )
}
