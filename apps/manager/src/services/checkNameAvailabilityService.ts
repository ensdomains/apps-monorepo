import { checkRealNameAvailability } from '@/features/register/services/nameChainContractService'

export interface NameAvailabilityResult {
  name: string
  isAvailable: boolean
  error?: string
}

export async function checkNameAvailability(
  name: string,
): Promise<NameAvailabilityResult> {
  try {
    // Use the real contract to check availability with FastTestETHRegistrar
    const result = await checkRealNameAvailability(name)
    
    if (result.isErr()) {
      return {
        name,
        isAvailable: false,
        error: result.error.message,
      }
    }

    return {
      name: result.value.name,
      isAvailable: result.value.isAvailable,
    }
  } catch (error) {
    return {
      name,
      isAvailable: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
