'use client'

interface QuestionCardProps {
  label: string
  sublabel?: string
  children: React.ReactNode
}

export default function QuestionCard({ label, sublabel, children }: QuestionCardProps) {
  return (
    <div className="slide-in w-full">
      <h2 className="text-xl font-bold text-jet-black mb-1 leading-tight text-balance">
        {label}
      </h2>
      {sublabel && (
        <p className="text-sm text-battleship-grey mb-6">{sublabel}</p>
      )}
      {!sublabel && <div className="mb-6" />}
      {children}
    </div>
  )
}
