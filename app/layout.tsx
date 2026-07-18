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
  // LinkedIn Insight Tag partner id — defaults to the AI Central Media tag so
  // it works on deploy; override/disable via NEXT_PUBLIC_LINKEDIN_PARTNER_ID.
  const liPartnerId = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID || '5552676'
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
        {/* LinkedIn Insight Tag: enables conversion tracking + retargeting for
            LinkedIn Ads that drive to the quiz. Conversion EVENTS are fired from
            lib/track.ts (e.g. result_view → quiz-completed) once the matching
            NEXT_PUBLIC_LI_CONV_* env var holds the Campaign Manager id. */}
        {liPartnerId && (
          <Script id="linkedin-insight" strategy="afterInteractive">
            {`window._linkedin_partner_id="${liPartnerId}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(window._linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`}
          </Script>
        )}
      </body>
    </html>
  )
}
