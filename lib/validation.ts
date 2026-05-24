export interface QuizFormData {
  name: string
  email: string
  aiLevel: string
  workArea: string
  learningStyle: string
  timeCommitment: string
  mainGoal: string
  aiTools: string
  jobLevel: string
}

export interface ValidationResult {
  valid: boolean
  errors: Partial<Record<keyof QuizFormData, string>>
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'throwaway.email',
  'tempmail.com', 'sharklasers.com', 'guerrillamailblock.com',
  'yopmail.com', 'trashmail.com', 'maildrop.cc', 'dispostable.com',
])

export const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'icloud.com', 'hotmail.com', 'outlook.com',
  'live.com', 'msn.com', 'aol.com', 'protonmail.com', 'me.com',
  'mail.com', 'ymail.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
  'googlemail.com',
])

export function validateQuizSubmission(data: Partial<QuizFormData>): ValidationResult {
  const errors: Partial<Record<keyof QuizFormData, string>> = {}

  if (!data.name?.trim()) errors.name = 'Name is required'

  if (!data.email?.trim()) {
    errors.email = 'Email is required'
  } else if (!EMAIL_REGEX.test(data.email)) {
    errors.email = 'Please enter a valid email address'
  } else {
    const domain = data.email.split('@')[1]?.toLowerCase()
    if (domain && DISPOSABLE_DOMAINS.has(domain)) {
      errors.email = 'Please use a real email address'
    }
  }

  if (!data.aiLevel) errors.aiLevel = 'Please select your AI familiarity level'
  if (!data.workArea) errors.workArea = 'Please select at least one work area'
  if (!data.learningStyle) errors.learningStyle = 'Please select your learning preference'
  if (!data.timeCommitment) errors.timeCommitment = 'Please select your time commitment'
  if (!data.mainGoal) errors.mainGoal = 'Please select your main goal'
  if (!data.jobLevel) errors.jobLevel = 'Please select your job level'

  return { valid: Object.keys(errors).length === 0, errors }
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(ip: string): boolean {
  if (process.env.NODE_ENV === 'development') return true

  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  const maxRequests = 10

  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= maxRequests) return false

  entry.count++
  return true
}
