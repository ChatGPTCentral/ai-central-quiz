interface AICentralLogoProps {
  className?: string
  variant?: 'dark' | 'light' // dark = logo for light bg, light = logo for dark bg
  height?: number
}

export default function AICentralLogo({
  className = '',
  variant = 'dark',
  height = 28,
}: AICentralLogoProps) {
  const src = variant === 'dark' ? '/logo-full-light-bg.png' : '/logo-full-dark-bg.png'

  return (
    <img
      src={src}
      alt="AI Central"
      height={height}
      style={{ height: `${height}px`, width: 'auto' }}
      className={className}
    />
  )
}
