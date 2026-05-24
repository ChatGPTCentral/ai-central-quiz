export function calculateAIScore(
  aiLevel: string,
  timeCommitment: string,
  aiToolsCount: number,
): number {
  let score = 0

  if (aiLevel === 'Intermediate') score += 2
  else if (aiLevel === 'Advanced') score += 3
  else score += 1 // Beginner

  if (timeCommitment === '30 minutes') score += 2
  else if (timeCommitment === '1-2 hours') score += 3
  else if (timeCommitment === '3+ hours') score += 4
  else score += 1 // Less than 20 minutes

  if (aiToolsCount === 1) score += 1
  else if (aiToolsCount === 2) score += 2
  else if (aiToolsCount >= 3) score += 3

  // Max score = 10, map to 5–92 percentile range
  return Math.round((score / 10) * 87) + 5
}

export function scoreLabel(percentile: number): string {
  if (percentile >= 80) return 'Power User'
  if (percentile >= 60) return 'Active Adopter'
  if (percentile >= 35) return 'Early Explorer'
  return 'Just Starting'
}
