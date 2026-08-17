import { randomInt } from 'node:crypto'

export function generateStudentCodeSuffix(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}
