import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import '../styles/globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '700', '800', '900'] })
// Plus Jakarta Sans — inherited from the craftyourcohort template, scoped
// to the result page via the `--font-jakarta` CSS variable.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-jakarta',
})

export const metadata: Metadata = {
  title: 'Find Your AI Type - AI Central',
  description: 'Take the 2-minute quiz to get personalized AI insights for your role and goals. Join 45,000+ professionals.',
  openGraph: {
    title: 'Find Your AI Type - AI Central',
    description: 'Take the 2-minute quiz to get personalized AI insights for your role and goals.',
    siteName: 'AI Central',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${jakarta.variable} bg-baby-powder min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
