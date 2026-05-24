export type QuestionType = 'text' | 'email' | 'chips' | 'multi-chips'

export interface QuestionOption {
  label: string
  value: string
  emoji?: string
  logo?: string
}

export interface Question {
  id: string
  step: number
  type: QuestionType
  label: string
  sublabel?: string
  options?: QuestionOption[]
  required: boolean
  placeholder?: string
}

export const QUESTIONS: Question[] = [
  {
    id: 'name',
    step: 1,
    type: 'text',
    label: "First, what's your name?",
    required: true,
    placeholder: 'Type your answer here...',
  },
  {
    id: 'email',
    step: 2,
    type: 'email',
    label: "What's your email address?",
    sublabel: 'We use this to send you your personalized AI plan',
    required: true,
    placeholder: 'name@example.com',
  },
  {
    id: 'aiLevel',
    step: 3,
    type: 'chips',
    label: 'How familiar are you with AI right now?',
    required: true,
    options: [
      { label: 'Beginner', value: 'Beginner' },
      { label: 'Intermediate', value: 'Intermediate' },
      { label: 'Advanced', value: 'Advanced' },
    ],
  },
  {
    id: 'workArea',
    step: 4,
    type: 'multi-chips',
    label: 'What area of work do you want AI to help with most?',
    sublabel: 'Select all that apply',
    required: true,
    options: [
      { label: 'Business operations', value: 'Business operations', emoji: '⚙️' },
      { label: 'Coding', value: 'Coding', emoji: '💻' },
      { label: 'Consulting', value: 'Consulting', emoji: '🧭' },
      { label: 'Data analytics', value: 'Data analytics', emoji: '📊' },
      { label: 'Finance', value: 'Finance', emoji: '💰' },
      { label: 'Government', value: 'Government', emoji: '🏛️' },
      { label: 'Legal', value: 'Legal', emoji: '⚖️' },
      { label: 'Marketing', value: 'Marketing', emoji: '📣' },
      { label: 'Project management', value: 'Project management', emoji: '🗂️' },
      { label: 'Reading / UX', value: 'Reading/UX', emoji: '📖' },
      { label: 'Research', value: 'Research', emoji: '🔬' },
      { label: 'Sales', value: 'Sales', emoji: '🤝' },
      { label: 'Student', value: 'Student', emoji: '🎓' },
      { label: 'Writing', value: 'Writing', emoji: '✍️' },
    ],
  },
  {
    id: 'learningStyle',
    step: 5,
    type: 'multi-chips',
    label: 'Together with AI Central, how else how else would you like to learn new AI skills?',
    sublabel: 'Select all that apply',
    required: true,
    options: [
      { label: 'Live, hands-on workshops', value: 'Live workshops' },
      { label: 'Courses and guides', value: 'Courses and guides' },
      { label: '1-on-1 navigation support', value: '1-on-1 support' },
    ],
  },
  {
    id: 'timeCommitment',
    step: 6,
    type: 'chips',
    label: 'Realistically, how much time do you have each week for learning AI?',
    required: true,
    options: [
      { label: 'Less than 20 min', value: 'Less than 20 minutes' },
      { label: '30 minutes', value: '30 minutes' },
      { label: '1–2 hours', value: '1-2 hours' },
      { label: '3+ hours', value: '3+ hours' },
    ],
  },
  {
    id: 'mainGoal',
    step: 7,
    type: 'chips',
    label: "What's your main goal for learning AI?",
    required: true,
    options: [
      { label: 'Stay informed', value: 'Stay informed' },
      { label: 'Professional growth', value: 'Professional growth' },
      { label: 'Career transition', value: 'Career transition' },
      { label: 'Grow my business', value: 'Grow my business' },
    ],
  },
  {
    id: 'aiTools',
    step: 8,
    type: 'multi-chips',
    label: 'Which AI tools do you already have subscriptions to?',
    sublabel: 'Select all that apply',
    required: true,
    options: [
      { label: 'ChatGPT', value: 'ChatGPT', logo: '/logos/chatgpt_logo.svg' },
      { label: 'Copilot', value: 'Copilot', logo: '/logos/copilot-icon.svg' },
      { label: 'Gemini', value: 'Gemini', logo: '/logos/gemini-color.svg' },
      { label: 'Claude', value: 'Claude', logo: '/logos/claude_logo.svg' },
      { label: 'Perplexity', value: 'Perplexity', logo: '/logos/perplexity_logo.svg' },
      { label: 'Midjourney', value: 'Midjourney', logo: '/logos/midjourney.svg' },
      { label: 'Zapier', value: 'Zapier', logo: '/logos/zapier_logo.webp' },
      { label: 'n8n', value: 'n8n', logo: '/logos/n8n-color.svg' },
      { label: 'NotebookLM', value: 'NotebookLM', logo: '/logos/notebooklm.svg' },
      { label: 'Cursor', value: 'Cursor', logo: '/logos/cursor.svg' },
      { label: 'KLING', value: 'KLING', logo: '/logos/kling-color.svg' },
      { label: 'HeyGen', value: 'HeyGen', logo: '/logos/heygen_logo.svg' },
      { label: 'Runway', value: 'Runway', logo: '/logos/runway.svg' },
      { label: 'Notion AI', value: 'Notion AI', logo: '/logos/notion.svg' },
      { label: 'ElevenLabs', value: 'ElevenLabs', logo: '/logos/elevenlabs_logo.svg' },
      { label: 'Canva AI', value: 'Canva AI', logo: '/logos/canva-icon.svg' },
      { label: 'Lovable', value: 'Lovable', logo: '/logos/lovable-color.svg' },
      { label: 'None yet', value: 'None', emoji: '🚫' },
    ],
  },
  {
    id: 'jobLevel',
    step: 9,
    type: 'chips',
    label: 'What is your current job level?',
    required: true,
    options: [
      { label: 'Founder', value: 'Founder' },
      { label: 'C-Suite', value: 'C-Suite' },
      { label: 'VP / Director', value: 'VP/Director' },
      { label: 'Manager', value: 'Manager' },
      { label: 'Individual contributor', value: 'Individual contributor' },
      { label: 'Student or intern', value: 'Student or intern' },
      { label: 'Other', value: 'Other' },
    ],
  },
]
