import { useStudentStore } from './studentStore'
import { useGradeStore } from './gradeStore'
import { useAttendanceStore } from './attendanceStore'
import { useDailyGradeStore } from './dailyGradeStore'
import { useSacramentStore } from './sacramentStore'
import { useClassStore } from './classStore'
import { useFilterStore } from './filterStore'
import { MOCK_STUDENTS, MOCK_GRADES, MOCK_ATTENDANCE } from '../data/mockParishData'
import { db } from '../lib/db'

export async function resetAllStoresToDefault() {
  useStudentStore.getState().setStudents(MOCK_STUDENTS)
  useGradeStore.getState().setGrades(MOCK_GRADES)
  useAttendanceStore.getState().setAttendance(MOCK_ATTENDANCE)
  
  useDailyGradeStore.getState().setEntries([])
  useSacramentStore.setState({ promotionQueue: [] })
  useClassStore.setState({ classes: [], branches: [], academicYears: [] })
  useFilterStore.setState({
    selectedClassId: 'all',
    selectedBranchId: 'all',
    searchQuery: '',
    selectedSemester: 1,
    viewMode: 'auto',
  })

  try {
    await db.stores.clear()
    await db.syncQueue.clear()
    await db.syncMeta.clear()
  } catch (err) {
    console.error('Failed to clear Dexie DB:', err)
  }
}
