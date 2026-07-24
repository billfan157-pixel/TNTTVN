import { useStudentStore } from './studentStore'
import { useGradeStore } from './gradeStore'
import { useAttendanceStore } from './attendanceStore'
import { MOCK_STUDENTS, MOCK_GRADES, MOCK_ATTENDANCE } from '../data/mockParishData'

export function resetAllStoresToDefault() {
  useStudentStore.getState().setStudents(MOCK_STUDENTS)
  useGradeStore.getState().setGrades(MOCK_GRADES)
  useAttendanceStore.getState().setAttendance(MOCK_ATTENDANCE)
}
