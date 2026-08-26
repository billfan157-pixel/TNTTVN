import { describe, it, expect } from 'vitest'
import {
  parseClassHierarchy,
  sortClassesByHierarchy,
  sortStudentsByClassHierarchy,
} from '../../utils/classSort'
import type { Student } from '../../types'

describe('classSort Utility Engine Unit Tests', () => {
  it('parseClassHierarchy trích xuất đúng ngành, số khối lớp và hậu tố chữ cái', () => {
    expect(parseClassHierarchy('Ấu Nhi 1A', 'AuNhi')).toEqual({
      branchWeight: 2,
      gradeNumber: 1,
      sectionSuffix: 'A',
      normalizedName: 'Ấu Nhi 1A',
    })

    expect(parseClassHierarchy('Ấu 1B', 'AuNhi')).toEqual({
      branchWeight: 2,
      gradeNumber: 1,
      sectionSuffix: 'B',
    normalizedName: 'Ấu 1B',
    })

    expect(parseClassHierarchy('Thiếu Nhi 2C', 'ThieuNhi')).toEqual({
      branchWeight: 3,
      gradeNumber: 2,
      sectionSuffix: 'C',
      normalizedName: 'Thiếu Nhi 2C',
    })

    expect(parseClassHierarchy('Chiên Con 1', 'ChienCon')).toEqual({
      branchWeight: 1,
      gradeNumber: 1,
      sectionSuffix: '',
      normalizedName: 'Chiên Con 1',
    })

    expect(parseClassHierarchy('Hiệp Sĩ 2', 'HiepSi')).toEqual({
      branchWeight: 5,
      gradeNumber: 2,
      sectionSuffix: '',
      normalizedName: 'Hiệp Sĩ 2',
    })
  })

  it('sortClassesByHierarchy sắp xếp tăng dần từ thấp đến cao (Chiên -> Ấu 1A -> Ấu 1B -> Ấu 2 -> Thiếu 1 -> Hiệp 2)', () => {
    const rawClasses = [
      { id: '1', name: 'Nghĩa Sĩ 2A', branchId: 'NghiaSi' },
      { id: '2', name: 'Ấu Nhi 1B', branchId: 'AuNhi' },
      { id: '3', name: 'Chiên Con 1', branchId: 'ChienCon' },
      { id: '4', name: 'Hiệp Sĩ 2', branchId: 'HiepSi' },
      { id: '5', name: 'Ấu Nhi 1A', branchId: 'AuNhi' },
      { id: '6', name: 'Thiếu Nhi 3', branchId: 'ThieuNhi' },
      { id: '7', name: 'Ấu Nhi 2', branchId: 'AuNhi' },
    ]

    const sortedAsc = sortClassesByHierarchy(rawClasses, 'asc')
    expect(sortedAsc.map((c) => c.name)).toEqual([
      'Chiên Con 1',
      'Ấu Nhi 1A',
      'Ấu Nhi 1B',
      'Ấu Nhi 2',
      'Thiếu Nhi 3',
      'Nghĩa Sĩ 2A',
      'Hiệp Sĩ 2',
    ])

    const sortedDesc = sortClassesByHierarchy(rawClasses, 'desc')
    expect(sortedDesc.map((c) => c.name)).toEqual([
      'Hiệp Sĩ 2',
      'Nghĩa Sĩ 2A',
      'Thiếu Nhi 3',
      'Ấu Nhi 2',
      'Ấu Nhi 1B',
      'Ấu Nhi 1A',
      'Chiên Con 1',
    ])
  })

  it('sortStudentsByClassHierarchy sắp xếp học sinh theo thứ tự lớp và hậu tố', () => {
    const classesMap: Record<string, { name: string; branchId: string }> = {
      'C-AU1A': { name: 'Ấu Nhi 1A', branchId: 'AuNhi' },
      'C-AU1B': { name: 'Ấu Nhi 1B', branchId: 'AuNhi' },
      'C-TN2': { name: 'Thiếu Nhi 2', branchId: 'ThieuNhi' },
      'C-CC1': { name: 'Chiên Con 1', branchId: 'ChienCon' },
    }

    const students: Student[] = [
      { id: 'S1', fullName: 'Văn Nam', holyName: 'Giuse', code: 'TN1', gender: 'Nam', dateOfBirth: '2015-01-01', address: '', branch: 'ThieuNhi', classId: 'C-TN2', status: 'Đang học', parentName: '', parentPhone: '', createdAt: '', updatedAt: '' },
      { id: 'S2', fullName: 'Thị Mai', holyName: 'Maria', code: 'TN2', gender: 'Nữ', dateOfBirth: '2016-01-01', address: '', branch: 'AuNhi', classId: 'C-AU1B', status: 'Đang học', parentName: '', parentPhone: '', createdAt: '', updatedAt: '' },
      { id: 'S3', fullName: 'Đức An', holyName: 'Phaolo', code: 'TN3', gender: 'Nam', dateOfBirth: '2016-01-01', address: '', branch: 'AuNhi', classId: 'C-AU1A', status: 'Đang học', parentName: '', parentPhone: '', createdAt: '', updatedAt: '' },
      { id: 'S4', fullName: 'Bé Tí', holyName: 'Anna', code: 'TN4', gender: 'Nữ', dateOfBirth: '2019-01-01', address: '', branch: 'ChienCon', classId: 'C-CC1', status: 'Đang học', parentName: '', parentPhone: '', createdAt: '', updatedAt: '' },
    ]

    const sorted = sortStudentsByClassHierarchy(students, (id) => classesMap[id], 'asc')
    expect(sorted.map((s) => s.id)).toEqual(['S4', 'S3', 'S2', 'S1'])

    const sortedDesc = sortStudentsByClassHierarchy(students, (id) => classesMap[id], 'desc')
    expect(sortedDesc.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4'])
  })
})
