import React from 'react'
export type BranchType = 'ChienCon' | 'AuNhi' | 'ThieuNhi' | 'NghiaSi' | 'HiepSi';

export interface BranchInfo {
  id: BranchType;
  name: string;
  scarfColor: string;
  bgColor: string;
  badgeBg: string;
  textColor: string;
  description: string;
  ageRange: string;
}

export interface ClassInfo {
  id: string;
  code: string;
  name: string;
  branch: BranchType;
  catechistLeader: string; // Huynh trưởng chủ nhiệm
  catechistAssistants: string[]; // Huynh trưởng phụ tá
  room: string; // Phòng học
  academicYear: string;
}

export interface Student {
  id: string;
  code: string; // Mã Thiếu Nhi
  holyName: string; // Tên Thánh
  fullName: string; // Họ và Tên
  gender: 'Nam' | 'Nữ';
  dateOfBirth: string;
  baptismDate?: string;
  firstCommunionDate?: string;
  confirmationDate?: string;
  parentName: string; // Họ tên Phụ huynh
  parentPhone: string; // SĐT Phụ huynh
  address: string;
  branch: BranchType;
  classId: string;
  avatarUrl?: string;
  status: 'Đang học' | 'Nghỉ học' | 'Tạm vắng';
  notes?: string;
  deletedAt?: string;
  parishId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GradeRecord {
  id: string;
  studentId: string;
  academicYear: string;
  semester: 1 | 2;
  scoreOral: number | null;
  scoreOral_source: ScoreFieldSource | null;
  scoreOral_updated_at: string | null;
  score15m: number | null;
  score15m_source: ScoreFieldSource | null;
  score15m_updated_at: string | null;
  score1Period: number | null;
  score1Period_source: ScoreFieldSource | null;
  score1Period_updated_at: string | null;
  scoreMidterm: number | null;
  scoreMidterm_source: ScoreFieldSource | null;
  scoreMidterm_updated_at: string | null;
  scoreFinal: number | null;
  scoreFinal_source: ScoreFieldSource | null;
  scoreFinal_updated_at: string | null;
  scoreDaoDuc: number | null;
  comments?: string;
  version?: number;
  updatedAt?: string;
  updatedBy?: string | null;
}

export type AttendanceType = 'SundayMass' | 'CatechismClass' | 'EucharisticAdoration';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  type: AttendanceType; // Đi Lễ CN, Học Giáo Lý, hoặc Chầu Thánh Thể
  status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused';
  note?: string;
  /** ADR-016 (S21): Version bản ghi từ server — dùng để optimistic-lock khi điểm danh offline. */
  version?: number;
}

export type LeaveRequestSessionType = 'SundayMass' | 'CatechismClass' | 'EucharisticAdoration';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRequest {
  id: string;
  parishId?: string;
  studentId: string;
  classId?: string;
  studentName?: string;
  holyName?: string;
  studentCode?: string;
  className?: string;
  parentId?: string | null;
  parentName: string;
  parentPhone: string;
  date: string; // YYYY-MM-DD
  sessionTypes: LeaveRequestSessionType[];
  reason: string;
  status: LeaveRequestStatus;
  reviewedBy?: string | null;
  reviewerName?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ParishNotice {
  id: string;
  title: string;
  content: string;
  date: string;
  author: string;
  priority: 'normal' | 'important' | 'urgent';
  targetBranch?: BranchType | 'All';
  createdAt?: string;
  updatedAt?: string;
}

export type Role = 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh';

export type ScoreType = 'oral' | '15m' | '1period' | 'midterm' | 'final';
export type ScoreFieldSource = 'manual' | 'daily_avg' | 'excel_import' | 'exam_scan';

/** Loại điểm được phép nhập nhiều lần qua Nhập Điểm Hằng Ngày — Giữa Kỳ & Cuối Kỳ là điểm duy nhất, nhập trực tiếp (không qua daily). */
export type DailyScoreType = 'oral' | '15m' | '1period';

export interface DailyGradeEntry {
  id: string
  studentId: string
  academicYear: string
  semester: 1 | 2
  scoreType: DailyScoreType
  value: number
  date: string
  createdAt: string
}

// ─── Smart Exam Grading (Phase 1, exam grading plan (đã triển khai — xem ADR-023/024) §3-5) ───

export type ExamScoreType = 'oral' | '15m' | '1period' | 'midterm' | 'final';
export type ExamSessionStatus = 'draft' | 'completed';
export type ExamResultSource = 'qr_scan' | 'omr' | 'quick_entry';
export type ExamType = 'written' | 'multiple_choice';
export type MultipleChoiceOption = 'A' | 'B' | 'C' | 'D';

export interface ExamQuestion {
  index: number;
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctOption: MultipleChoiceOption;
  explanation?: string;
  points?: number;
}

export interface ExamSession {
  id: string;
  parishId: string;
  classId: string;
  subject: string;
  scoreType: ExamScoreType;
  maxScore: number;
  semester: 1 | 2;
  academicYear: string;
  status: ExamSessionStatus;
  createdBy: string;
  completedBy?: string | null;
  completedAt?: string | null;
  createdAt: string;
  examType?: ExamType;
  questionCount?: number;
  answerKey?: Record<number, MultipleChoiceOption>;
  questions?: ExamQuestion[] | string;
}

export interface ExamResult {
  id: string;
  examSessionId: string;
  studentId: string;
  score: number;
  source: ExamResultSource;
  createdAt: string;
  studentCode?: string;
  studentName?: string;
  holyName?: string;
  answers?: Record<number, MultipleChoiceOption | null>;
  scanMetadata?: {
    engineVersion?: string;
    protocolVersion?: number;
    templateMode?: 'integrated' | 'full_page';
    questionCount?: number;
    formChecksum?: string;
    detectionStatus?: 'accepted' | 'review_required' | 'rejected';
    correctedQuestions?: number[];
    quality?: Record<string, unknown>;
  };
}

export interface ExamConflict {
  studentId: string;
  studentName: string;
  existingSource: 'manual' | 'override' | 'excel_import';
  existingScore: number | null;
  scannedScore: number;
}

export interface ExamFinalizeResult {
  dailyCount: number;
  directCount: number;
  conflicts: ExamConflict[];
  skipped: number;
}

export type ViewMode = 'auto' | 'desktop' | 'mobile';

export type OverrideReasonCode =
  | 'TeacherAdjustment'
  | 'SpecialAssignment'
  | 'Appeal'
  | 'DataCorrection'
  | 'PrincipalApproval';

export interface GradeOverride {
  id: string;
  gradeId: string;
  scoreField: string;
  manualValue: number;
  reasonCode: OverrideReasonCode;
  reasonNote?: string | null;
  overriddenBy: string;
  overriddenAt: string;
  version: number;
  deletedAt?: string | null;
}

export type EffectiveGradeState =
  | 'AUTO'
  | 'PENDING_OVERRIDE'
  | 'MANUAL_OVERRIDDEN'
  | 'AUTO_UPDATED_WHILE_OVERRIDDEN'
  | 'SYNC_FAILED'
  | 'CONFLICT_NEEDS_RESOLUTION'
  | 'RESTORED';

export interface EffectiveGradeView {
  effectiveValue: number | null;
  autoCalculatedValue: number | null;
  manualValue: number | null;
  state: EffectiveGradeState;
  override?: GradeOverride | null;
  badge?: string;
  tooltip?: string;
}

// ─── Cổng Phụ Huynh (server ReportCardDTO — ReportCardProjectionRepository) ───
export interface ParentChild {
  id: string;
  code: string;
  holyName: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  branch: string;
  status: string;
  classId: string;
  className: string;
  classCode: string;
}

export interface ReportCardDTO {
  student: {
    id: string;
    code: string;
    holyName?: string | null;
    fullName: string;
    gender?: string | null;
    dateOfBirth?: string | null;
    className?: string | null;
  };
  academicYear: string;
  grades: Array<{
    semester: number;
    scoreOral?: number | null;
    score15m?: number | null;
    score1Period?: number | null;
    scoreMidterm?: number | null;
    scoreFinal?: number | null;
    gpa?: number | null;
  }>;
  attendanceSummary: {
    massPresentCount: number;
    massTotalCount: number;
    catechismPresentCount: number;
    catechismTotalCount: number;
    overallAttendanceRate: number;
  };
  promotion?: {
    status: string;
    gpa: number;
    attendanceRate: number;
    isOverridden: boolean;
    overrideReason?: string | null;
    approvedAt?: string | null;
  } | null;
}

export * from './finance'
