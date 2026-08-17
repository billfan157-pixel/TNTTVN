import { describe, it, expect } from 'vitest'
import { AttendanceRecord } from '../../domain/AttendanceRecord.js'
import { AttendanceRateSpecification } from '../../domain/AttendanceRateSpecification.js'

describe('Attendance Domain & Specification Micro-Step A1.1 Unit Tests', () => {
  describe('AttendanceRecord Entity', () => {
    it('1. Initializes AttendanceRecord Entity with default version 1', () => {
      const record = new AttendanceRecord({
        id: 'ATT-001',
        studentId: 'ST-001',
        parishId: 'parish-1',
        date: '2026-02-15',
        type: 'SundayMass',
        status: 'Present',
        version: 1,
      })

      expect(record.id).toBe('ATT-001')
      expect(record.status).toBe('Present')
      expect(record.version).toBe(1)
    })

    it('2. Increments version and updates timestamp on status correction', () => {
      const record = new AttendanceRecord({
        id: 'ATT-001',
        studentId: 'ST-001',
        parishId: 'parish-1',
        date: '2026-02-15',
        type: 'SundayMass',
        status: 'AbsentUnexcused',
        version: 1,
      })

      record.updateStatus('AbsentExcused', 'Có đơn xin phép của phụ huynh', 'usr-teacher-1')

      expect(record.status).toBe('AbsentExcused')
      expect(record.note).toBe('Có đơn xin phép của phụ huynh')
      expect(record.version).toBe(2)
      expect(record.updatedBy).toBe('usr-teacher-1')
    })

    it('3. Does not increment version if status and note are unchanged', () => {
      const record = new AttendanceRecord({
        id: 'ATT-001',
        studentId: 'ST-001',
        parishId: 'parish-1',
        date: '2026-02-15',
        type: 'SundayMass',
        status: 'Present',
        version: 1,
      })

      record.updateStatus('Present', null, 'usr-teacher-1')
      expect(record.version).toBe(1)
    })
  })

  describe('AttendanceRateSpecification', () => {
    const spec = new AttendanceRateSpecification()

    it('1. Returns 100% default for zero recorded sessions (Division-by-zero guard)', () => {
      const rate = spec.calculateRate({ records: [] })
      expect(rate).toBe(100.0)
    })

    it('2. Calculates 100% when all sessions are Present', () => {
      const rate = spec.calculateRate({
        records: [{ status: 'Present' }, { status: 'Present' }],
      })
      expect(rate).toBe(100.0)
    })

    it('3. Calculates rate with AbsentExcused weight (default 1.0)', () => {
      const rate = spec.calculateRate({
        records: [{ status: 'Present' }, { status: 'AbsentExcused' }, { status: 'AbsentUnexcused' }, { status: 'AbsentUnexcused' }],
        excusedWeight: 1.0,
      })
      // (1 + 1) / 4 = 50.0%
      expect(rate).toBe(50.0)
    })

    it('4. Calculates rate with AbsentExcused weight = 0.5', () => {
      const rate = spec.calculateRate({
        records: [{ status: 'Present' }, { status: 'AbsentExcused' }, { status: 'AbsentUnexcused' }, { status: 'AbsentUnexcused' }],
        excusedWeight: 0.5,
      })
      // (1 + 0.5) / 4 = 37.5%
      expect(rate).toBe(37.5)
    })

    it('5. Clamps result between 0% and 100%', () => {
      const rate = spec.calculateRate({
        records: [{ status: 'AbsentUnexcused' }],
      })
      expect(rate).toBe(0.0)
      expect(spec.isSatisfiedBy(79.9, 80.0)).toBe(false)
      expect(spec.isSatisfiedBy(80.0, 80.0)).toBe(true)
    })
  })
})
