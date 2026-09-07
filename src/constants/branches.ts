import type { BranchInfo } from '../types';

export const BRANCHES: Record<string, BranchInfo> = {
  ChienCon: {
    id: 'ChienCon',
    name: 'Chiên Con',
    scarfColor: '#Ec4899', // Pink
    bgColor: '#FDF2F8',
    badgeBg: '#FCE7F3',
    textColor: '#9D174D',
    description: '“Hiền lành” — làm quen nhà thờ, sinh hoạt cộng đoàn và việc đạo đức',
    ageRange: '4 - 6 tuổi'
  },
  AuNhi: {
    id: 'AuNhi',
    name: 'Ấu Nhi',
    scarfColor: '#16A34A', // Green
    bgColor: '#F0FDF4',
    badgeBg: '#DCFCE7',
    textColor: '#15803D',
    description: '“Ngoan” — vâng lời, ngoan ngoãn, dễ dạy',
    ageRange: '7 - 9 tuổi'
  },
  ThieuNhi: {
    id: 'ThieuNhi',
    name: 'Thiếu Nhi',
    scarfColor: '#2563EB', // Blue
    bgColor: '#EFF6FF',
    badgeBg: '#DBEAFE',
    textColor: '#1D4ED8',
    description: '“Hy sinh” — nhiệt thành tham dự Thánh lễ',
    ageRange: '10 - 12 tuổi'
  },
  NghiaSi: {
    id: 'NghiaSi',
    name: 'Nghĩa Sĩ',
    scarfColor: '#EAB308', // Yellow
    bgColor: '#FEFCE8',
    badgeBg: '#FEF08A',
    textColor: '#854D0E',
    description: '“Chinh phục” — bình minh vào đời, chinh phục các linh hồn cho Chúa',
    ageRange: '13 - 15 tuổi'
  },
  HiepSi: {
    id: 'HiepSi',
    name: 'Hiệp Sĩ',
    scarfColor: '#8B4513', // Brown (Màu Nâu)
    bgColor: '#FAF5F0',
    badgeBg: '#EDE0D4',
    textColor: '#5C2E0B',
    description: '“Dấn thân” — nên muối men, ánh sáng giữa đời',
    ageRange: '16 - 18 tuổi'
  }
};
