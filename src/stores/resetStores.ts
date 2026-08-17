import { useStudentStore } from './studentStore'
import { useGradeStore } from './gradeStore'
import { useAttendanceStore } from './attendanceStore'
import { useDailyGradeStore } from './dailyGradeStore'
import { useSacramentStore } from './sacramentStore'
import { useClassStore } from './classStore'
import { useFilterStore } from './filterStore'

import { db } from '../lib/db'

export async function resetAllStoresToDefault(options: { clearPersisted?: boolean } = {}) {
  const clearPersisted = options.clearPersisted !== false
  useStudentStore.setState({ students: [] })
  useGradeStore.setState({ grades: [] })
  useAttendanceStore.setState({ attendance: [] })
  
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

  if (!clearPersisted) return

  try {
    await db.stores.clear()
    // Protect pending/retrying offline sync items from being wiped on logout
    await db.syncQueue.where('status').equals('completed').delete()
    await db.syncMeta.clear()
  } catch (err) {
    console.error('Failed to clear Dexie DB:', err)
  }
}
