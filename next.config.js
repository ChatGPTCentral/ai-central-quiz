/** @type {import('next').NextConfig} */
const nextConfig = {
  // Canonicalize the raw Vercel host to the custom domain. ~26% of sessions
  // were landing on ai-central-quiz.vercel.app — a different registrable domain
  // than quiz.thecentral.ai — so their cookies / anon-id / experiment bucket /
  // analytics never carried across. 308 every path on it to the custom domain,
  // preserving path + query, so a session lives on one domain end to end.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'ai-central-quiz.vercel.app' }],
        destination: 'https://quiz.thecentral.ai/:path*',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
      // Embed routes (and /quiz with ?embed=1) MUST be iframable from any
      // origin. Strip the default X-Frame-Options and set a permissive CSP.
      {
        source: '/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
      {
        source: '/quiz',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
      {
        source: '/quiz-v2',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
      // The embed JS snippet must be CORS-friendly so it can be loaded
      // from any third-party page via <script src=...>.
      {
        source: '/embed/v1.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=300' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
