interface StepIndicatorProps {
  currentStep: number
  totalSteps: number
  completedSteps: number[]
}

export const StepIndicator = ({
  currentStep,
  totalSteps,
  completedSteps,
}: StepIndicatorProps) => {
  return (
    <div className="flex items-center justify-center space-x-4">
      {Array.from({ length: totalSteps }, (_, index) => {
        const stepNumber = index + 1
        const isCurrent = stepNumber === currentStep
        const isCompleted = completedSteps.includes(stepNumber)

        return (
          <div className="flex items-center" key={stepNumber}>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
                isCurrent
                  ? 'bg-blue-600 text-white'
                  : isCompleted
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-300 text-gray-600'
              }`}
            >
              {stepNumber}
            </div>
            {index < totalSteps - 1 && (
              <div className="ml-4 h-0.5 w-8 bg-gray-300" />
            )}
          </div>
        )
      })}
    </div>
  )
}
