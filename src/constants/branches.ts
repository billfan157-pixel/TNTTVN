import React from 'react'
import type { BranchInfo } from '../types';

export const BRANCHES: Record<string, BranchInfo> = {
  ChienCon: {
    id: 'ChienCon',
    name: 'Chiên Con',
    scarfColor: '#Ec4899', // Pink
    bgColor: '#FDF2F8',
    badgeBg: '#FCE7F3',
    textColor: '#9D174D',
    description: 'Độ tuổi mầm chồi, tập làm quen với Chúa Giê-su',
    ageRange: '4 - 6 tuổi'
  },
  AuNhi: {
    id: 'AuNhi',
    name: 'Ấu Nhi',
    scarfColor: '#16A34A', // Green
    bgColor: '#F0FDF4',
    badgeBg: '#DCFCE7',
    textColor: '#15803D',
    description: 'Chúa Giê-su Ngoan Ngoãn, học sống hiếu thảo',
    ageRange: '7 - 9 tuổi'
  },
  ThieuNhi: {
    id: 'ThieuNhi',
    name: 'Thiếu Nhi',
    scarfColor: '#2563EB', // Blue
    bgColor: '#EFF6FF',
    badgeBg: '#DBEAFE',
    textColor: '#1D4ED8',
    description: 'Chúa Giê-su Hy Sinh, nhiệt thành tham dự Thánh Lễ',
    ageRange: '10 - 12 tuổi'
  },
  NghiaSi: {
    id: 'NghiaSi',
    name: 'Nghĩa Sĩ',
    scarfColor: '#EAB308', // Yellow
    bgColor: '#FEFCE8',
    badgeBg: '#FEF08A',
    textColor: '#A16207',
    description: 'Chúa Giê-su Chinh Phục, sống chứng nhân Tin Mừng',
    ageRange: '13 - 15 tuổi'
  },
  HiepSi: {
    id: 'HiepSi',
    name: 'Hiệp Sĩ',
    scarfColor: '#854D0E', // Brown/Dark
    bgColor: '#FFFBEB',
    badgeBg: '#FDE68A',
    textColor: '#78350F',
    description: 'Dấn thân phục vụ Giáo hội và Xã hội',
    ageRange: '16 - 18 tuổi'
  }
};
