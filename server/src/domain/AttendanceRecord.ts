export type AttendanceStatus = 'Present' | 'AbsentExcused' | 'AbsentUnexcused'
export type AttendanceSessionType = 'SundayMass' | 'CatechismClass' | 'Retreat' | 'SpecialEvent'

export interface AttendanceRecordProps {
  id: string
  studentId: string
  parishId: string
  date: string // YYYY-MM-DD
  type: AttendanceSessionType
  status: AttendanceStatus
  note?: string | null
  version: number
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  updatedBy?: string | null
}

export class AttendanceRecord {
  public readonly id: string
  public readonly studentId: string
  public readonly parishId: string
  public readonly date: string
  public readonly type: AttendanceSessionType
  private _status: AttendanceStatus
  private _note: string | null
  private _version: number
  private _createdAt: string
  private _updatedAt: string
  private _updatedBy: string | null

  constructor(props: AttendanceRecordProps) {
    if (!props.id || !props.studentId || !props.date) {
      throw new Error('AttendanceRecord requires id, studentId, and date.')
    }
    this.id = props.id
    this.studentId = props.studentId
    this.parishId = props.parishId || 'gia-ton'
    this.date = props.date
    this.type = props.type
    this._status = props.status
    this._note = props.note ?? null
    this._version = props.version || 1
    this._createdAt = props.createdAt || new Date().toISOString()
    this._updatedAt = props.updatedAt || new Date().toISOString()
    this._updatedBy = props.updatedBy ?? null
  }

  public get status(): AttendanceStatus {
    return this._status
  }

  public get note(): string | null {
    return this._note
  }

  public get version(): number {
    return this._version
  }

  public get createdAt(): string {
    return this._createdAt
  }

  public get updatedAt(): string {
    return this._updatedAt
  }

  public get updatedBy(): string | null {
    return this._updatedBy
  }

  /**
   * Domain Invariant: Correct attendance status and increment version for Optimistic Locking
   */
  public updateStatus(newStatus: AttendanceStatus, note?: string | null, userId: string = 'system'): void {
    if (this._status === newStatus && this._note === (note ?? null)) {
      return // No change
    }

    const now = new Date().toISOString()
    this._status = newStatus
    this._note = note ?? null
    this._version = this._version + 1
    this._updatedAt = now
    this._updatedBy = userId
  }

  /**
   * ADR-016 (S20): JSON.stringify(entity) trước đây xuất các field nội bộ
   * `_status`/`_version` (không serialize getter) khiến response API thiếu
   * status/version — client không áp dụng được trạng thái server (đặc biệt
   * quan trọng khi nhận bản ghi sau xung đột version).
   */
  public toJSON(): AttendanceRecordProps {
    return {
      id: this.id,
      studentId: this.studentId,
      parishId: this.parishId,
      date: this.date,
      type: this.type,
      status: this._status,
      note: this._note,
      version: this._version,
      createdBy: undefined,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      updatedBy: this._updatedBy,
    }
  }
}
