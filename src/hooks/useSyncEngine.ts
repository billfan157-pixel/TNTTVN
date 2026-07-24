import { useEffect, useRef } from 'react'
import { useSyncStore } from '../stores/syncStore'
import { api, loadTokens, setTokens, clearTokens, getAccessToken } from '../lib/api'
import { getDB } from '../lib/db'
import { processOperation, getBackoffMs, isNetworkError } from '../lib/syncProcessor'
import { useStudentStore } from '../stores/studentStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'

const SYNC_INTERVAL_MS = 30000

export function useSyncEngine() {
  const initialized = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const sync = useSyncStore.getState()
    sync.initDevice().then(() => {
      loadTokens()

      if (getAccessToken()) {
        sync.setStatus('syncing')
        doFullSync().catch(() => {})
      }
    })

    const handleOnline = () => {
      const s = useSyncStore.getState()
      s.setStatus('syncing')
      processQueue().catch(() => {})
    }

    const handleOffline = () => {
      useSyncStore.getState().setStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    intervalRef.current = setInterval(() => {
      if (navigator.onLine && getAccessToken()) {
        processQueue().catch(() => {})
      }
    }, SYNC_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])
}

let processingQueue = false

async function processQueue() {
  if (processingQueue) return
  processingQueue = true

  try {
    const store = useSyncStore.getState()
    await store.compactQueue()

    let ops = await store.getPendingOps()
    while (ops.length > 0) {
      const op = ops[0]
      await store.updateOp(op.id, { status: 'processing' })

      const result = await processOperation(op)
      if (result.ok) {
        await store.removeOp(op.id)
      } else if (result.recoverable) {
        const retryCount = op.retryCount + 1
        await store.updateOp(op.id, {
          status: 'retrying',
          retryCount,
          lastError: result.error,
        })
        store.setStatus('retrying')
        store.setLastError(result.error)

        if (retryCount >= 5) {
          await store.updateOp(op.id, { status: 'failed' })
        }

        const backoff = getBackoffMs(retryCount)
        await new Promise(r => setTimeout(r, backoff))
      } else {
        await store.updateOp(op.id, { status: 'failed', lastError: result.error })
        store.setLastError(result.error)
      }

      ops = await store.getPendingOps()
    }

    const s = useSyncStore.getState()
    if (s.pendingCount === 0) {
      s.setLastSync(new Date().toISOString())
      s.setStatus(navigator.onLine ? 'idle' : 'offline')
      s.setLastError(null)
    }
  } catch (err) {
    if (!isNetworkError(err)) {
      useSyncStore.getState().setLastError(String(err))
    }
  } finally {
    processingQueue = false
  }
}

async function doFullSync() {
  const store = useSyncStore.getState()
  try {
    store.setStatus('syncing')

    const s = useStudentStore.getState()
    const g = useGradeStore.getState()
    const a = useAttendanceStore.getState()

    const [students, grades, attendance] = await Promise.all([
      api.getStudents().catch(() => null),
      api.getGrades().catch(() => null),
      api.getAttendance().catch(() => null),
    ])

    if (students) s.setStudents(students.map(mapStudent))
    if (grades) g.setGrades(grades.map(mapGrade))
    if (attendance) a.setAttendance(attendance.map(mapAttendance))

    store.setLastSync(new Date().toISOString())
    store.setStatus(navigator.onLine ? 'idle' : 'offline')
    store.setLastError(null)
  } catch (err) {
    if (!isNetworkError(err)) {
      store.setLastError(String(err))
    }
    store.setStatus('idle')
  }
}

function mapStudent(data: any): any {
  return {
    id: data.id,
    code: data.code,
    holyName: data.holyName,
    fullName: data.fullName,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth,
    baptismDate: data.baptismDate,
    firstCommunionDate: data.firstCommunionDate,
    confirmationDate: data.confirmationDate,
    parentName: data.parentName,
    parentPhone: data.parentPhone,
    address: data.address,
    branch: data.branch,
    classId: data.classId,
    avatarUrl: data.avatarUrl,
    status: data.status,
    notes: data.notes,
  }
}

function mapGrade(data: any): any {
  return {
    id: data.id,
    studentId: data.studentId,
    academicYear: data.academicYear,
    semester: data.semester,
    scoreOral: data.scoreOral,
    score15m: data.score15m,
    score1Period: data.score1Period,
    scoreMidterm: data.scoreMidterm,
    scoreFinal: data.scoreFinal,
    comments: data.comments,
  }
}

function mapAttendance(data: any): any {
  return {
    id: data.id,
    studentId: data.studentId,
    date: data.date,
    type: data.type,
    status: data.status,
    note: data.note,
  }
}

export function useTriggerFullSync() {
  return doFullSync
}

export function useTriggerProcessQueue() {
  return processQueue
}
