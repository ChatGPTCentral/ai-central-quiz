import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '../styles/globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '700', '800', '900'] })

export const metadata: Metadata = {
  title: 'Find Your AI Type - AI Central',
  description: 'Take the 2-minute quiz to get personalized AI insights for your role and goals. Join 45,000+ professionals.',
  icons: {
    icon: [{ url: '/logo-square.svg', type: 'image/svg+xml' }],
    shortcut: '/logo-square.svg',
    apple: '/logo-square.svg',
  },
  openGraph: {
    title: 'Find Your AI Type - AI Central',
    description: 'Take the 2-minute quiz to get personalized AI insights for your role and goals.',
    siteName: 'AI Central',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-baby-powder min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
