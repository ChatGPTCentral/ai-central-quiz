import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
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
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
  return (
    <html lang="en">
      <body className={`${inter.className} bg-baby-powder min-h-screen`}>
        {children}
        {/* Microsoft Clarity: heatmaps + session recordings + rage-click
            detection. No-op until NEXT_PUBLIC_CLARITY_PROJECT_ID is set. */}
        {clarityId && (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${clarityId}");`}
          </Script>
        )}
      </body>
    </html>
  )
}
