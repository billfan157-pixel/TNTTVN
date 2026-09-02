const VALID_MC_OPTIONS = new Set(['A', 'B', 'C', 'D'])

/**
 * Phân tích chuỗi đáp án gõ nhanh hoặc dán (VD: "1A 2B 3C", "1.A 2.B", "ABCDABCD...").
 * Hỗ trợ cả chuỗi ký tự liền và các cặp số:đáp án.
 */
export function parseQuickAnswerString(text: string, maxCount: number): Record<number, 'A' | 'B' | 'C' | 'D'> {
  const result: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
  const trimmed = text.trim()
  if (!trimmed) return result

  // Pattern 1: Numbered pairs like "1A 2B", "1.A, 2.B", "1:A", "câu 1: A"
  const pairRegex = /(?:câu\s*)?(\d+)[\s.:=–-]*([A-Da-d])/gi
  let match: RegExpExecArray | null
  let foundPairs = 0
  while ((match = pairRegex.exec(trimmed)) !== null) {
    const qNum = parseInt(match[1], 10)
    const opt = match[2].toUpperCase() as 'A' | 'B' | 'C' | 'D'
    if (qNum >= 1 && qNum <= maxCount && VALID_MC_OPTIONS.has(opt)) {
      result[qNum] = opt
      foundPairs++
    }
  }

  if (foundPairs > 0) return result

  // Pattern 2: Continuous or delimiter-separated letters "ABCDABCD..." or "A B C D"
  const letters = trimmed.replace(/[^a-dA-D]/g, '').toUpperCase()
  for (let i = 0; i < Math.min(letters.length, maxCount); i++) {
    const opt = letters[i] as 'A' | 'B' | 'C' | 'D'
    if (VALID_MC_OPTIONS.has(opt)) {
      result[i + 1] = opt
    }
  }
  return result
}
