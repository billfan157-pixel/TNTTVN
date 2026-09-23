/**
 * Thông tin chính thức Giáo Xứ Gia Tôn — Giáo Phận Xuân Lộc
 * Trích xuất và đồng bộ từ Cổng thông tin Giáo phận Xuân Lộc:
 * https://pi.thongtinxuanloc.com/giao-xu/45
 */

export interface ParishPriestHistory {
  order: number
  holyName: string
  fullName: string
  role: 'Đặc trách' | 'Quản nhiệm' | 'Chánh xứ'
  period: string
  profileUrl?: string
}

export interface ParishYearlyStatistic {
  year: number
  parishioners: string
  families: string
  religious: string
}

export interface ParishMilestone {
  time: string
  title: string
  detail: string
}

export interface ParishOfficialData {
  parishId: string
  name: string
  diocese: string
  deanery: string
  patronSaint: {
    name: string
    feastDay: string
    adorationDay: string
  }
  youthUnit: {
    name: string
    patronName: string
    feastDay: string
    motto: string
  }
  address: string
  locationDescription: string
  coordinates: {
    lat: number
    lng: number
  }
  googleMapsUrl: string
  areaKm2: number
  boundaries: {
    east: string
    west: string
    south: string
    north: string
  }
  currentPastor: {
    holyName: string
    fullName: string
    title: string
    period: string
    profileUrl: string
  }
  religiousOrder: {
    name: string
    community: string
  }
  currentStats: {
    population: number
    parishioners: number
    families: number
    religious: number
  }
  historicalStats: ParishYearlyStatistic[]
  massSchedule: {
    weekday: string[]
    sunday: string[]
    description: string
  }
  historySummary: {
    foundingYear: number
    establishedParishYear: number
    overview: string
    milestones: ParishMilestone[]
  }
  priestHistory: ParishPriestHistory[]
  officialSourceUrl: string
}

export const GIA_TON_PARISH_INFO: ParishOfficialData = {
  parishId: 'gia-ton',
  name: 'Giáo Xứ Gia Tôn',
  diocese: 'Giáo Phận Xuân Lộc',
  deanery: 'Giáo Hạt Gia Kiệm',
  patronSaint: {
    name: 'Thánh Giuse',
    feastDay: '19/03',
    adorationDay: 'Chúa Nhật trước ngày 19/03',
  },
  youthUnit: {
    name: 'Xứ Đoàn Thiếu Nhi Thánh Thể Đức Mẹ Fatima',
    patronName: 'Đức Mẹ Fatima',
    feastDay: '13/05',
    motto: 'Cầu nguyện – Rước lễ – Hy sinh – Làm tông đồ',
  },
  address: 'Phường Trảng Bom, Khu Phố Sông Trầu 1, Ðồng Nai',
  locationDescription: 'Cây số 7 của đoạn đường vào Cây Gáo, Trảng Bom, Đồng Nai',
  coordinates: {
    lat: 11.0025,
    lng: 107.04768365742,
  },
  googleMapsUrl: 'https://www.google.com/maps?q=11.0025,107.04768365742',
  areaKm2: 49,
  boundaries: {
    east: 'Giáo xứ Lộc Hòa',
    west: 'Giáo xứ Thạch An và Giáo xứ Thuận An',
    south: 'Giáo xứ Vườn Ngô',
    north: 'Giáo xứ Bình Minh',
  },
  currentPastor: {
    holyName: 'Đaminh',
    fullName: 'Nguyễn Khắc Tuyên',
    title: 'Linh mục Chánh xứ',
    period: '10/2023 – hiện tại',
    profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/201132',
  },
  religiousOrder: {
    name: 'Dòng Đaminh Tam Hiệp',
    community: 'Tu xá Thánh Catarina',
  },
  currentStats: {
    population: 20000,
    parishioners: 2435,
    families: 650,
    religious: 6,
  },
  historicalStats: [
    { year: 2003, parishioners: '1.222', families: '214', religious: '—' },
    { year: 2005, parishioners: '1.336', families: '241', religious: '—' },
    { year: 2007, parishioners: '1.346', families: '234', religious: '3' },
    { year: 2013, parishioners: '1.655', families: '416', religious: '5' },
    { year: 2026, parishioners: '2.435', families: '650', religious: '6' },
  ],
  massSchedule: {
    weekday: ['04:30', '17:00'],
    sunday: ['04:30', '17:00'],
    description: 'Thánh Lễ mỗi ngày: Sáng 04:30 · Chiều 17:00. Chúa Nhật: Sáng 04:30 · Chiều 17:00',
  },
  historySummary: {
    foundingYear: 1975,
    establishedParishYear: 2007,
    overview:
      'Năm 1975, khoảng 350 giáo dân từ Tam Hiệp, Hố Nai, Trảng Bom và Bàu Cá vào khai hoang lập nghiệp tại cây số 7 đoạn đường vào Cây Gáo. Trải qua những năm tháng tá túc dự lễ tại các giáo xứ lân cận, cộng đoàn được Đức Cha Đaminh Nguyễn Văn Lãng thành lập Giáo họ Lộc Thiên (1987), Đức Cha Phaolô Maria Nguyễn Minh Nhật nâng lên Giáo họ Biệt Lập Gia Tôn (1989), và Đức Cha Đaminh Nguyễn Chu Trinh nâng lên thành Giáo xứ Gia Tôn (2007).',
    milestones: [
      {
        time: '1975',
        title: 'Khai hoang lập nghiệp',
        detail:
          'Khoảng 350 giáo dân từ Tam Hiệp, Hố Nai, Trảng Bom và Bàu Cá vào khai hoang tại cây số 7 đường vào Cây Gáo. Ban đầu tá túc tham dự thánh lễ tại các xứ Vườn Ngô, Lộc Hòa, Quảng Biên và Đồng Phát.',
      },
      {
        time: 'Tháng 02/1987',
        title: 'Thành lập Giáo họ Lộc Thiên',
        detail:
          'Đức Cha Đaminh Nguyễn Văn Lãng quy tụ giáo dân sống tại cây số 7, thành lập Giáo họ Lộc Thiên và bổ nhiệm Cha Gioan Baotixita Nguyễn Cao Lộc coi sóc.',
      },
      {
        time: '1988',
        title: 'Dựng nhà nguyện đầu tiên',
        detail:
          'Cộng đoàn Lộc Thiên chung tay dựng nhà nguyện bằng tre lá diện tích 5m x 9m làm nơi kinh hạt sớm tối.',
      },
      {
        time: '19/05/1989',
        title: 'Thành lập Giáo họ Biệt Lập Gia Tôn',
        detail:
          'Đức Cha Phaolô Maria Nguyễn Minh Nhật nâng Giáo họ Lộc Thiên lên hàng GHBL và chính thức đặt tên là GHBL Gia Tôn.',
      },
      {
        time: '2006',
        title: 'Xây dựng nhà nguyện kiên cố & Nhà xứ',
        detail:
          'Cộng đoàn khởi công và khánh thành nhà nguyện kiên cố cùng nhà xứ, tạo nền tảng vững chắc cho sinh hoạt mục vụ.',
      },
      {
        time: '2007',
        title: 'Nâng lên hàng Giáo Xứ Gia Tôn',
        detail:
          'Đức Cha Đaminh Nguyễn Chu Trinh quyết định nâng GHBL Gia Tôn lên hàng Giáo xứ, bổ nhiệm Cha Đaminh Lê Văn Thông làm Cha xứ tiên khởi.',
      },
      {
        time: '2011',
        title: 'Khánh thành Thánh Đường & Nhà Giáo Lý',
        detail:
          'Khánh thành nhà thờ và nhà giáo lý kiên cố, khang trang phục vụ việc phụng tự và giảng dạy giáo lý đức tin.',
      },
      {
        time: '09/2011 – 2020',
        title: 'Thời kỳ Cha Philipphê Phạm Duy Linh',
        detail:
          'Cha Philipphê Phạm Duy Linh kế nhiệm phụ trách giáo xứ, hoàn thiện cơ sở vật chất và phát triển đời sống đạo đức.',
      },
      {
        time: '10/2020 – 10/2022',
        title: 'Thời kỳ Cha Đaminh Trần Gia Long',
        detail: 'Cha Đaminh Trần Gia Long đảm nhiệm sứ vụ Chánh xứ Gia Tôn.',
      },
      {
        time: '10/2023 – nay',
        title: 'Cha Đaminh Nguyễn Khắc Tuyên Chánh xứ',
        detail:
          'Cha Đaminh Nguyễn Khắc Tuyên chính thức nhận sứ vụ Chánh xứ Gia Tôn, dẫn dắt giáo xứ và đoàn thể ngày càng thăng tiến.',
      },
    ],
  },
  priestHistory: [
    {
      order: 1,
      holyName: 'Gioan Bt.',
      fullName: 'Nguyễn Cao Lộc',
      role: 'Đặc trách',
      period: '1987 – 1989',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/194501',
    },
    {
      order: 2,
      holyName: 'Đaminh',
      fullName: 'Nguyễn Đính',
      role: 'Quản nhiệm',
      period: '1989 – 1990',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/197302',
    },
    {
      order: 3,
      holyName: 'Phêrô',
      fullName: 'Vũ Công Bình',
      role: 'Quản nhiệm',
      period: '1990 – 1996',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/199001',
    },
    {
      order: 4,
      holyName: 'Đaminh',
      fullName: 'Vũ Đình Thái, Pss',
      role: 'Quản nhiệm',
      period: '1996 – 1998',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/199606',
    },
    {
      order: 5,
      holyName: 'Giacôbê',
      fullName: 'Trần Chính Thành',
      role: 'Quản nhiệm',
      period: '1998 – 2006',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/199708',
    },
    {
      order: 6,
      holyName: 'Đaminh',
      fullName: 'Lê Văn Thông',
      role: 'Chánh xứ',
      period: '2006 – 2011',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/200544',
    },
    {
      order: 7,
      holyName: 'Philipphê',
      fullName: 'Phạm Duy Linh',
      role: 'Chánh xứ',
      period: '09/2011 – 28/09/2020',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/200813',
    },
    {
      order: 8,
      holyName: 'Đaminh',
      fullName: 'Trần Gia Long',
      role: 'Chánh xứ',
      period: '02/10/2020 – 08/10/2022',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/200620',
    },
    {
      order: 9,
      holyName: 'Đaminh',
      fullName: 'Nguyễn Khắc Tuyên',
      role: 'Chánh xứ',
      period: '10/2023 – hiện tại',
      profileUrl: 'https://pt.thongtinxuanloc.com/linh-muc/201132',
    },
  ],
  officialSourceUrl: 'https://pi.thongtinxuanloc.com/giao-xu/45',
}
