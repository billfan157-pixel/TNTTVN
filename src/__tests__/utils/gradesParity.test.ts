import { describe, it, expect } from 'vitest'
import {
  calculateGradeAverage,
  calculateYearlyGpa,
  roundToDecimal,
  DEFAULT_GRADE_WEIGHTS,
  getClassificationLabel as clientGetClassificationLabel,
  calculateAttendanceRate,
  countAttendancePresent,
} from '../../utils/grades'
import {
  computeWeightedGpa,
  getClassificationLabel as serverGetClassificationLabel,
} from '../../../server/src/utils/gradeCalculation'
import { attendanceRateSpecification } from '../../../server/src/domain/AttendanceRateSpecification'

describe('GPA Calculation Parity (Client vs Server)', () => {
  it('produces identical 1-decimal-place rounded GPA for typical scores', () => {
    const input = {
      scoreOral: 7,
      score15m: 8,
      score1Period: 9,
      scoreMidterm: 8,
      scoreFinal: 9,
    }

    const clientRes = calculateGradeAverage(input)
    const serverGpa = computeWeightedGpa(input)

    // Weighted = (7*1 + 8*1 + 9*2 + 8*2 + 9*3) / 9 = 76/9 = 8.4444...
    // Both must round to 8.4
    expect(clientRes.score).toBe(8.4)
    expect(serverGpa).toBe(8.4)
    expect(clientRes.score).toBe(serverGpa)
  })

  it('produces identical rounded GPA at threshold boundaries', () => {
    const inputBoundary = {
      scoreOral: 9,
      score15m: 9,
      score1Period: 9,
      scoreMidterm: 8.9,
      scoreFinal: 9,
    }

    const clientRes = calculateGradeAverage(inputBoundary)
    const serverGpa = computeWeightedGpa(inputBoundary)

    // (9+9+18+17.8+27)/9 = 80.8/9 = 8.9777... -> 9.0
    expect(clientRes.score).toBe(9)
    expect(serverGpa).toBe(9)
  })

  it('handles score clamping [0, 10] identically', () => {
    const inputOut = {
      scoreOral: 15,
      score15m: -5,
      score1Period: 10,
      scoreMidterm: 10,
      scoreFinal: 10,
    }

    const clientRes = calculateGradeAverage(inputOut)
    const serverGpa = computeWeightedGpa(inputOut)

    // Clamped: Oral=10, 15m=0, 1Period=10, Midterm=10, Final=10 -> sum = (10*1 + 0*1 + 10*2 + 10*2 + 10*3)/9 = 80/9 = 8.888... -> 8.9
    expect(clientRes.score).toBe(8.9)
    expect(serverGpa).toBe(8.9)
  })

  it('yearly GPA parity: avg of rounded semester GPAs matches server evaluate formula', () => {
    // Cùng công thức server (evaluateStudentWithData): round(avg(gpa_hk1, gpa_hk2))
    // — mọi tổ hợp phải trùng tuyệt đối, kể cả ngưỡng biên 0.05 và fallback 1 HK.
    const pairs: Array<[number | null, number | null]> = [
      [9.0, 7.1], // avg 8.05 → ngưỡng biên làm tròn
      [8.5, 8.5],
      [7.95, 8.0],
      [9.0, null],
      [null, 7.4],
      [null, null],
    ]

    for (const [a, b] of pairs) {
      const client = calculateYearlyGpa(a, b).gpa
      let server: number | null = null
      if (a !== null && b !== null) server = Math.round(((a + b) / 2) * 10) / 10
      else server = a ?? b
      expect(client).toBe(server)
    }

    // Fallback 1 học kỳ → dùng đúng GPA học kỳ đó, có cờ "tạm tính"
    const single = calculateYearlyGpa(null, 7.4)
    expect(single.gpa).toBe(7.4)
    expect(single.isProvisional).toBe(true)
    const none = calculateYearlyGpa(null, null)
    expect(none.gpa).toBe(null)
    expect(none.isProvisional).toBe(false)

    // roundingDecimal = 2 khớp công thức server (Math.round(x*100)/100)
    const cfg2 = { ...DEFAULT_GRADE_WEIGHTS, roundingDecimal: 2 }
    const client2 = calculateYearlyGpa(9.0, 7.1, cfg2).gpa
    const server2 = Math.round(((9.0 + 7.1) / 2) * 100) / 100
    expect(client2).toBe(server2)
    expect(client2).toBe(8.05)

    // roundToDecimal public = Math.round(x*f)/f (không phải hardcode 1 số thập phân)
    expect(roundToDecimal(7.25, 1)).toBe(7.3)
    expect(roundToDecimal(8.75, 1)).toBe(8.8)
    expect(roundToDecimal(7.95, 2)).toBe(7.95)
  })
})

describe('Classification Label Parity (client vs server getClassificationLabel)', () => {
  const boundaryValues = [10, 9.0, 8.99, 8.0, 7.99, 6.5, 6.49, 5.0, 4.99, 0]
  const expectedLabels = [
    'Xuất Sắc', 'Xuất Sắc', 'Giỏi', 'Giỏi', 'Khá',
    'Khá', 'Trung Bình', 'Trung Bình', 'Yếu', 'Yếu',
  ]

  it('maps identical thresholds and labels at every classification boundary', () => {
    boundaryValues.forEach((avg, i) => {
      const client = clientGetClassificationLabel(avg)
      const server = serverGetClassificationLabel(avg)
      expect(client).toBe(server)
      expect(client).toBe(expectedLabels[i])
    })
  })

  it('respects parish-customized thresholds identically', () => {
    const clientConfig = {
      weightOral: 1,
      weight15m: 1,
      weight1Period: 2,
      weightMidterm: 2,
      weightFinal: 3,
      xuatSacThreshold: 8.5,
      gioiThreshold: 6.0,
      khaThreshold: 4.0,
      trungBinhThreshold: 2.0,
      roundingDecimal: 1,
    }
    const serverThresholds = { xuatSac: 8.5, gioi: 6.0, kha: 4.0, trungBinh: 2.0 }
    for (const avg of [9.0, 8.5, 8.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.9]) {
      expect(clientGetClassificationLabel(avg, clientConfig)).toBe(serverGetClassificationLabel(avg, serverThresholds))
    }
  })

  it('labels calculated GPAs identically end-to-end (average + classification)', () => {
    const inputs = [
      { scoreOral: 9, score15m: 9, score1Period: 9, scoreMidterm: 9, scoreFinal: 9 }, // 9.0 → Xuất Sắc
      { scoreOral: 7, score15m: 8, score1Period: 9, scoreMidterm: 8, scoreFinal: 9 }, // 8.4 → Giỏi
      { scoreOral: 6, score15m: 6, score1Period: 6, scoreMidterm: 6, scoreFinal: 7 }, // 6.3 → Khá
      { scoreOral: 5, score15m: 5, score1Period: 5, scoreMidterm: 5, scoreFinal: 5 }, // 5.0 → Trung Bình
      { scoreOral: 4, score15m: 4, score1Period: 4, scoreMidterm: 4, scoreFinal: 4 }, // 4.0 → Yếu
    ]
    for (const input of inputs) {
      const clientRes = calculateGradeAverage(input)
      const serverGpa = computeWeightedGpa(input)
      const serverLabel = serverGetClassificationLabel(serverGpa ?? 0)
      expect(clientRes.score).toBe(serverGpa)
      expect(clientRes.label).toBe(serverLabel)
    }
  })
})

describe('Attendance Rate Parity (client vs server AttendanceRateSpecification)', () => {
  type Rec = { status: 'Present' | 'AbsentUnexcused' | 'AbsentExcused' }
  const clientRate = (records: readonly Rec[], excusedWeight?: number) =>
    calculateAttendanceRate(countAttendancePresent(records, excusedWeight), records.length).rate
  const serverRate = (records: Rec[], excusedWeight?: number) =>
    attendanceRateSpecification.calculateRate({ records, excusedWeight })

  it('matches for empty records (default 100%)', () => {
    expect(clientRate([])).toBe(100)
    expect(serverRate([])).toBe(100)
  })

  it('matches for plain present/absent sessions (3/5 = 60.0)', () => {
    const records: Rec[] = [
      { status: 'Present' },
      { status: 'AbsentUnexcused' },
      { status: 'Present' },
      { status: 'AbsentUnexcused' },
      { status: 'Present' },
    ]
    expect(clientRate(records)).toBe(60)
    expect(serverRate(records)).toBe(60)
  })

  it('matches rounding at .x45 decimal boundary (35/44 = 79.5)', () => {
    const records: Rec[] = Array.from({ length: 44 }, (_, i) => ({
      status: (i < 35 ? 'Present' : 'AbsentUnexcused') as Rec['status'],
    }))
    expect(clientRate(records)).toBe(79.5)
    expect(serverRate(records)).toBe(79.5)
  })

  it('matches repeating decimal (1/3 = 33.3)', () => {
    const records: Rec[] = [{ status: 'Present' }, { status: 'AbsentUnexcused' }, { status: 'AbsentUnexcused' }]
    expect(clientRate(records)).toBe(33.3)
    expect(serverRate(records)).toBe(33.3)
  })

  it('matches excusedWeight 0.5 counting (1 + 0.5 + 0.5 of 4 = 50.0)', () => {
    const records: Rec[] = [
      { status: 'Present' },
      { status: 'AbsentUnexcused' },
      { status: 'AbsentExcused' },
      { status: 'AbsentExcused' },
    ]
    expect(clientRate(records, 0.5)).toBe(50)
    expect(serverRate(records, 0.5)).toBe(50)
  })

  it('clamps excusedWeight above 1.0 identically (2/2 = 50.0)', () => {
    const records: Rec[] = [{ status: 'AbsentExcused' }, { status: 'AbsentUnexcused' }]
    expect(clientRate(records, 2)).toBe(50)
    expect(serverRate(records, 2)).toBe(50)
  })

  it('isSatisfiedBy threshold parity (>= 80.0)', () => {
    const near = Array.from({ length: 44 }, () => ({ status: 'Present' as const }))
    const under80 = Array.from({ length: 44 }, (_, i) => ({ status: (i < 35 ? 'Present' : 'AbsentUnexcused') as Rec['status'] }))
    expect(attendanceRateSpecification.isSatisfiedBy(clientRate(near), 80)).toBe(true)
    expect(attendanceRateSpecification.isSatisfiedBy(clientRate(under80), 80)).toBe(false)
  })
})
