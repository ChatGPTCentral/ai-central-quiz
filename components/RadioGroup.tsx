'use client'

import type { QuestionOption } from '@/lib/questions'

interface RadioGroupProps {
  options: QuestionOption[]
  value: string
  onChange: (value: string) => void
  name: string
}

export default function RadioGroup({ options, value, onChange, name }: RadioGroupProps) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`
              inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl
              border text-[13px] font-medium transition-all duration-100
              active:scale-[0.97] cursor-pointer
              ${selected
                ? 'border-black border-[1.5px] bg-[#F5F5F5] text-black'
                : 'border-[#E0E0E0] bg-white text-[#333333] hover:border-[#AAAAAA]'
              }
            `}
          >
            {option.emoji && <span>{option.emoji}</span>}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
