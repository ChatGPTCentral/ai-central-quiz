'use client'

interface QuizProgressProps {
  currentStep: number
  totalSteps: number
}

export default function QuizProgress({ currentStep, totalSteps }: QuizProgressProps) {
  const percent = Math.round((currentStep / totalSteps) * 100)

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-battleship-grey uppercase tracking-wider">
          Question {currentStep} of {totalSteps}
        </span>
        <span className="text-xs font-medium text-battleship-grey">{percent}%</span>
      </div>
      <div className="w-full h-1 bg-[#E8E4DF] rounded-full overflow-hidden">
        <div
          className="h-full bg-fulvous rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
        />
      </div>
    </div>
  )
}
