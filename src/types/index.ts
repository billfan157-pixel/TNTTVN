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
}

export interface GradeRecord {
  id: string;
  studentId: string;
  academicYear: string;
  semester: 1 | 2;
  scoreOral: number | null; // Điểm miệng
  score15m: number | null; // Điểm 15 phút
  score1Period: number | null; // Điểm 1 tiết
  scoreMidterm: number | null; // Điểm giữa kỳ
  scoreFinal: number | null; // Điểm thi cuối kỳ
  comments?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  type: 'SundayMass' | 'CatechismClass'; // Đi Lễ CN hoặc Học Giáo Lý
  status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused';
  note?: string;
}

export interface ParishNotice {
  id: string;
  title: string;
  content: string;
  date: string;
  author: string;
  priority: 'normal' | 'important' | 'urgent';
  targetBranch?: BranchType | 'All';
}

export type ViewMode = 'auto' | 'desktop' | 'mobile';
