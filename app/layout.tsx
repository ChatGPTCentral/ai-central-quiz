import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import PostHogProvider from '@/components/PostHogProvider.client'
import AnalyticsGate from '@/components/AnalyticsGate.client'
import '../styles/globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800', '900'] })

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
        {/* PostHog: session replay with an API, so recordings are readable
            programmatically instead of only by a human sitting in a dashboard.
            Runs ALONGSIDE Clarity on purpose - - nothing is removed until this
            has proved it is better. No-op until NEXT_PUBLIC_POSTHOG_KEY is set.
            Inputs are masked and /admin is never recorded, see the component. */}
        <PostHogProvider />
        {/* Clarity + the LinkedIn Insight Tag, behind the same per-device
            opt-out PostHog uses, so "exclude my laptop" means every tag rather
            than only the one we remembered. See lib/analytics-optout.ts. */}
        <AnalyticsGate />
      </body>
    </html>
  )
}
