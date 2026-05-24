'use client'

interface TextInputProps {
  type?: 'text' | 'email'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  autoFocus?: boolean
  id: string
  label: string
}

export default function TextInput({
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  autoFocus,
  id,
  label,
}: TextInputProps) {
  return (
    <div className="w-full">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={type === 'email' ? 'email' : 'given-name'}
        className={`
          w-full px-4 py-3.5 text-base font-medium bg-white rounded-xl outline-none
          placeholder:text-[#CCCCCC] text-black transition-all duration-150
          ${error
            ? 'border-2 border-red-400 focus:border-red-500'
            : 'border-2 border-[#E8E8E8] focus:border-black'
          }
        `}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
