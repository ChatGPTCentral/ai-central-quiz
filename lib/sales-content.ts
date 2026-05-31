import type { ArchetypeKey } from './archetypes'

export interface SalesContent {
 planName: string
 planSubtitle: string
 truthHeading: string
 truthParagraphs: string[]
 part1Title: string
 part1Bullets: string[]
 part2Title: string
 part2Bullets: string[]
 feelingItems: { heading: string; body: string }[]
 ctaLabel: string
 bottomCtaHeading: string
 bottomCtaSubheading: string
}

export const SALES_CONTENT: Record<ArchetypeKey, SalesContent> = {
 executive_strategist: {
  planName: 'The Executive AI Playbook',
  planSubtitle: 'A plan built for executives and senior leaders',
  truthHeading: "Here's the truth",
  truthParagraphs: [
   "Your competitors are already using AI to cut decision time in half, prepare board materials in minutes, and spot market shifts before they happen. This is not a future problem -- it's a right-now gap.",
   "The executives winning with AI aren't the most technical people in the room. They're the ones who understand which problems AI solves, who to trust, and how to build it into their operating rhythm without turning it into a distraction.",
   "You already have the business instinct. What you need is a clear, senior-coded path forward -- one that skips the basics and gets straight to what actually matters at your level.",
   "Your plan is two parts. First, a foundation that respects your time. Then, five strategic briefings built specifically for leaders who need AI to compound, not just exist.",
  ],
  part1Title: 'Part 1: AI Leadership Foundations',
  part1Bullets: [
   'How top executives are integrating AI into decision-making (not just productivity)',
   'The frameworks that separate strategic AI use from tool-collecting',
   'The "Competitive Positioning" method for AI-driven market analysis',
   'How to evaluate AI vendors and tools without getting sold a demo',
   'The small habits that separate AI-fluent leaders from everyone else',
  ],
  part2Title: 'Part 2: 5 Executive Strategy Guides',
  part2Bullets: [
   'Build an AI-powered competitive intelligence system in under an hour',
   'Create board-ready reports with AI in 20 minutes, not 2 days',
   'Design an AI policy your team will actually follow',
   'Use Claude + Perplexity to monitor your market in real time',
   'Automate your weekly leadership briefing so it lands in your inbox',
  ],
  feelingItems: [
   { heading: 'The fog clears.', body: "You stop guessing and start knowing exactly which AI moves are worth your attention and which ones aren't." },
   { heading: 'You run sharper meetings.', body: 'You walk into every room with prepared context, synthesized data, and clear framing -- faster than anyone else on the call.' },
   { heading: 'Your team follows your lead.', body: "People look to you for direction on AI. Now you have the language, the frameworks, and the confidence to give it." },
   { heading: 'New opportunities find you.', body: "You're seen as the executive who gets AI -- and that opens doors that were previously closed." },
  ],
  ctaLabel: 'Build my executive AI plan',
  bottomCtaHeading: 'Become an AI-forward executive',
  bottomCtaSubheading: 'Join 12,000+ senior leaders already getting the strategic edge. Start today.',
 },

 growth_operator: {
  planName: 'The Growth Operator Playbook',
  planSubtitle: 'A plan built for growth-focused operators and founders',
  truthHeading: "Here's the truth",
  truthParagraphs: [
   "The teams automating their operations with AI right now aren't more technical than you. They just have cleaner systems and a clear path forward. The gap between where you are and where you want to be isn't effort -- it's a blueprint.",
   "You already know it matters. But between the constant fires, the limited bandwidth, and the noise from every AI tool fighting for your attention, actually building the thing keeps getting pushed.",
   "Your plan cuts through that. It gives you the foundational AI knowledge you need to move with confidence, and then five step-by-step workflow guides built specifically for operators who need to see ROI -- not just possibilities.",
   "This is about getting AI working in your business this week -- not eventually.",
  ],
  part1Title: 'Part 1: AI Operations Foundations',
  part1Bullets: [
   'Why most teams are using AI wrong (and the 4 ways that actually work)',
   'How to evaluate any AI tool against your actual business needs',
   'The "ROI-first" prompting method used by high-output operators',
   'The workflows that actually save hours every week',
   'The small moves that separate fast operators from slow ones',
  ],
  part2Title: 'Part 2: 5 Growth Workflow Guides',
  part2Bullets: [
   'Build an AI email agent that books meetings on autopilot',
   'Create a competitive analysis system that runs itself every week',
   'Automate your content pipeline from idea to published in 30 minutes',
   'Use Claude + Make to eliminate your most repetitive reporting tasks',
   'Build a lead qualification workflow that runs 24/7 without you',
  ],
  feelingItems: [
   { heading: 'The anxiety of falling behind disappears.', body: "You stop worrying about what your competitors are doing with AI. You're actually doing it." },
   { heading: 'Everything you do is faster and better.', body: "You've learned to set things up the right way, so you're always doing better work at less time." },
   { heading: 'Your team starts ratcheting up.', body: "You're the person who always knows what to do. The right people come to you with questions." },
   { heading: 'New opportunities start opening up.', body: 'People are using AI to freelance clients, launch side-businesses, do work that used to require a whole team.' },
  ],
  ctaLabel: 'Start my growth plan',
  bottomCtaHeading: 'Start automating smarter today',
  bottomCtaSubheading: 'Join 8,000+ growth operators using AI to do more with less. Start today.',
 },

 technical_pioneer: {
  planName: "The Builder's AI Playbook",
  planSubtitle: 'A plan built for power users and AI builders',
  truthHeading: "Here's the truth",
  truthParagraphs: [
   "You're already ahead of most people. But there's a difference between using AI tools and building systems that compound over time. The builders who stay ahead aren't just keeping up with releases -- they're wiring AI into everything they do.",
   "The challenge at your level isn't getting started. It's knowing which rabbit holes are worth going down, which APIs are actually production-ready, and which patterns will still work six months from now.",
   "Your plan is built for someone who already has context. It skips the fundamentals and goes straight to the advanced material -- API integrations, multi-agent orchestration, and the workflow patterns that serious builders are actually shipping.",
   "Part 1 gives you the mental models. Part 2 gives you the hands-on systems. Both are designed for someone who wants to build, not just learn.",
  ],
  part1Title: 'Part 1: Advanced AI Systems Foundations',
  part1Bullets: [
   'The architecture patterns behind production AI systems (not toy demos)',
   'How to evaluate models, APIs, and frameworks against real-world constraints',
   'The "compound system" approach -- building AI that improves itself over time',
   'Prompt engineering at the system level -- beyond single-turn interactions',
   'The edge cases that break AI systems and how to design around them',
  ],
  part2Title: 'Part 2: 5 Builder Workflow Guides',
  part2Bullets: [
   'Build a multi-agent research system using Claude + Perplexity API',
   'Create an AI-powered data pipeline that runs on schedule without you',
   'Use the Claude API to build a custom document Q&A in under 2 hours',
   'Wire Make.com + OpenAI to automate any repeatable knowledge task',
   'Build and ship your first AI micro-tool to production',
  ],
  feelingItems: [
   { heading: 'You stop context-switching.', body: "Your systems run in the background. You focus on the work that actually needs your brain." },
   { heading: 'You ship faster than ever.', body: "You've internalized the patterns. New AI tasks that used to take days now take hours." },
   { heading: 'You become the go-to builder.', body: "People come to you with problems. You already have half the solution architected in your head." },
   { heading: 'You see what\'s coming.', body: "You understand the underlying systems well enough to spot where the field is moving before everyone else." },
  ],
  ctaLabel: 'Access my builder plan',
  bottomCtaHeading: 'Join the builders pushing AI to its limits',
  bottomCtaSubheading: 'Join 5,000+ technical pioneers shipping AI-powered systems. Start today.',
 },

 practical_learner: {
  planName: 'The AI Quick Start Plan',
  planSubtitle: 'A plan built for professionals learning AI step by step',
  truthHeading: "Here's the truth",
  truthParagraphs: [
   "Most AI content online is either too basic ('here's how to open ChatGPT') or assumes you already know what you're doing. There's very little for people who want to learn properly -- without the hype, without the jargon, without wasting hours on things that don't work.",
   "The gap isn't intelligence. It's not even effort. It's that nobody has ever given you a structured path that starts where you are, respects that you have a job and a life, and gets you to results that actually matter.",
   "Your plan does that. It starts with the foundations that everyone should know but almost nobody teaches clearly. Then it gives you five practical guides -- each one designed to deliver a real, usable win by the time you finish it.",
   "By the end, you won't just know what AI can do. You'll be doing it.",
  ],
  part1Title: 'Part 1: AI Foundations Course',
  part1Bullets: [
   'How most people use AI wrong (and the 4 approaches that actually work)',
   'Why you get generic answers -- and the straight fix for it',
   'The "3-Round Loop" prompting method used by power users',
   'The workflows that actually save you hours every single week',
   'The small moves that separate beginners from power users in 30 days',
  ],
  part2Title: 'Part 2: 5 Quick Win Workflow Guides',
  part2Bullets: [
   'Build an AI email system that drafts responses in your voice',
   'Create a weekly summary agent that reads and synthesizes for you',
   'Build a Claude + Notion system to organize anything in minutes',
   'Use AI to cut your meeting prep time by 80%',
   'Build your first personal AI assistant -- step by step',
  ],
  feelingItems: [
   { heading: "The 'I don't know where to start' feeling disappears.", body: "You have a plan. A clear, step-by-step path that starts where you are and moves you forward." },
   { heading: 'Small wins stack fast.', body: "Each guide delivers something you can actually use. The confidence builds with every one you finish." },
   { heading: 'You stop feeling left behind.', body: "You know what the tools can do, what they can't, and exactly how to get value from them -- today." },
   { heading: 'People start coming to you.', body: "You become the person in your team, your network, or your family who 'gets AI.' That has real career value." },
  ],
  ctaLabel: 'Start my learning plan',
  bottomCtaHeading: "AI doesn't have to be complicated",
  bottomCtaSubheading: 'Join 20,000+ professionals learning AI one practical step at a time. Start today.',
 },
}

export const TESTIMONIALS = [
 {
  stars: 5,
  quote: "Finally, AI tutorials that actually work! Saved 15 hours this week alone. Best investment I've made for my career. The step-by-step approach makes everything so clear.",
  name: 'Rachel Thompson',
  role: 'Operations Director · Portland, OR',
 },
 {
  stars: 5,
  quote: 'Implemented 3 AI automations in my first week. Productivity increased 200%!',
  name: 'Alex Martinez',
  role: 'Product Manager',
 },
 {
  stars: 5,
  quote: 'Transformed our client reporting process. What took days now takes hours. ROI was immediate and massive.',
  name: 'James Wilson',
  role: 'Business Consultant · Denver, CO',
 },
 {
  stars: 5,
  quote: 'Zero tech background, built my first ChatGPT workflow in 30 minutes!',
  name: 'Mike Chen',
  role: 'Sales Manager',
 },
 {
  stars: 5,
  quote: 'My team thinks I hired an AI consultant. These guides are incredibly practical!',
  name: 'Emma Rodriguez',
  role: 'Marketing Lead',
 },
 {
  stars: 5,
  quote: 'Data analysis that used to take me weeks now takes days. The AI automation tutorials are phenomenal - - clear, practical, and immediately actionable.',
  name: 'Jessica Parker',
  role: 'Data Analyst · Seattle, WA',
 },
 {
  stars: 5,
  quote: 'Became the go-to AI person at my company in 2 weeks!',
  name: 'Sophie Anderson',
  role: 'HR Director',
 },
 {
  stars: 5,
  quote: 'Content creation: 8 hours → 2 hours. Efficiency gains are unbelievable!',
  name: 'Carlos Mendez',
  role: 'Content Strategist',
 },
 {
  stars: 5,
  quote: "My sales team's productivity increased 180% after implementing these AI workflows. Deal closure rate improved dramatically.",
  name: 'Marcus Johnson',
  role: 'VP of Sales · Atlanta, GA',
 },
 {
  stars: 5,
  quote: 'Contract review automation saved our firm 40 hours per week!',
  name: 'Amanda Wright',
  role: 'Legal Counsel',
 },
 {
  stars: 5,
  quote: 'Dashboard automation that would have taken our team 3 months was completed in 2 weeks. Executive reporting has never been this compelling.',
  name: 'David Park',
  role: 'BI Lead · San Francisco, CA',
 },
 {
  stars: 5,
  quote: 'Bootstrap startup, limited resources. This library gave me enterprise-level AI capabilities!',
  name: 'Ryan Foster',
  role: 'Startup Founder',
 },
]

export const FAQ = [
 {
  q: 'How is this different from the AI Central newsletter?',
  a: "The newsletter gives you the latest AI news and insights -- great for staying informed. This plan gives you a structured learning path and hands-on workflow guides. They work together, but the plan is where the transformation actually happens.",
 },
 {
  q: "Is this just another AI course I'll never finish?",
  a: "We designed against that. Part 1 is self-paced video broken into short modules. The workflow guides are step-by-step -- you follow along and end up with something real. Most people finish a guide in one sitting.",
 },
 {
  q: 'I already use ChatGPT. Will I actually get value from this?',
  a: "Yes -- if you're already using AI, the gap is usually in structure and systems, not exposure. Most of our members who use AI daily say Part 2 changed how they work more than anything else they've done.",
 },
 {
  q: 'How long will this take to finish?',
  a: "Part 1 runs about 3 hours total. Each workflow guide takes 45-90 minutes to complete end-to-end. You can do the whole plan in a weekend or spread it over a few weeks.",
 },
 {
  q: "What if it's not for me?",
  a: "There's a 30-day money-back guarantee, no questions asked. If you work through it and don't feel it was worth it, email us and we'll refund you same day.",
 },
]
