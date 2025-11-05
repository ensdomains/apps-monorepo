import { useEffect, useState } from 'react'

export function useNameValidation(open: boolean, rowChanged: boolean) {
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const validateName = (value: string): boolean => {
    if (!value) {
      setNameError(null)
      return true
    }

    if (!value.endsWith('.eth')) {
      setNameError('Name must end with .eth')
      return false
    }

    setNameError(null)
    return true
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNameInput(value)
    validateName(value)
  }

  useEffect(() => {
    if (!open || rowChanged) {
      setNameInput('')
      setNameError(null)
    }
  }, [open, rowChanged])

  return {
    nameInput,
    nameError,
    handleNameChange,
    validateName,
  }
}
