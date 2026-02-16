type RegisterNameFormProps = {
  name: string
}

export const RegisterNameForm = ({ name }: RegisterNameFormProps) => {
  return (
    <div className="p-6 col-span-2">
      <h1>Register {name}</h1>
    </div>
  )
}
