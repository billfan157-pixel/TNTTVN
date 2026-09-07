/**
 * Ý Nghĩa Logo Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn
 * Trích từ tài liệu huấn quyền & căn tính phụng vụ của Xứ Đoàn.
 */

export interface BranchColorMeaning {
  id: string
  name: string
  ageRange: string
  colorToken: string
  badgeClass: string
  motto: string
  meaning: string
}

export interface LogoSymbolItem {
  id: string
  title: string
  /** Nhãn ngắn cho thanh điều hướng khám phá trong modal */
  shortLabel: string
  subtitle: string
  iconName: 'boat' | 'colors' | 'patron' | 'church'
  description: string
  highlights?: string[]
  /** Lời Kinh Thánh soi sáng biểu tượng (nghiên cứu linh đạo đi kèm logo) */
  scripture?: string
  scriptureRef?: string
}

export interface ParishLogoMeaningData {
  parishName: string
  diocese: string
  deanery: string
  unitName: string
  title: string
  overview: string
  symbols: LogoSymbolItem[]
  branches: BranchColorMeaning[]
}

export const PARISH_LOGO_MEANING: ParishLogoMeaningData = {
  parishName: 'Giáo Xứ Gia Tôn',
  diocese: 'Giáo Phận Xuân Lộc',
  deanery: 'Hạt Gia Kiệm',
  unitName: 'Xứ Đoàn Thiếu Nhi Thánh Thể Đức Mẹ Fatima',
  title: 'Ý Nghĩa Logo Xứ Đoàn',
  overview:
    'Logo Xứ đoàn Thiếu Nhi Thánh Thể Đức Mẹ Fatima diễn tả hình ảnh một con thuyền đức tin lấy Chúa Giêsu Thánh Thể làm kim chỉ nam. Trong sự quan phòng, được Đức Mẹ Fatima yêu thương chở che và dẫn dắt, đoàn sinh thuộc mọi ngành cùng nhau hiệp nhất nên một.',
  symbols: [
    {
      id: 'boat',
      title: 'Con Thuyền Đức Tin & Thánh Giá',
      shortLabel: 'Thuyền Đức Tin',
      subtitle: 'Hành trình rẽ sóng ra khơi — Chúa luôn dẫn lối',
      iconName: 'boat',
      description:
        'Con thuyền tượng trưng cho hành trình rẽ sóng ra khơi của Xứ Đoàn. Sắc đỏ của thuyền biểu trưng cho Máu Thánh Chúa Kitô, tinh thần nhiệt thành và lòng kiên cường. Đồng thời, màu đỏ còn gợi hình ảnh người Huynh Trưởng - Giáo Lý Viên đang đồng hành, nâng đỡ các Thiếu Nhi.',
      highlights: [
        'Sắc đỏ: Máu Thánh Chúa Kitô, tinh thần nhiệt thành và người Huynh Trưởng - GLV nâng đỡ thiếu nhi.',
        'Thánh Giá trên thuyền: Diễn tả Chúa luôn dẫn đường, giúp con thuyền đức tin vững vàng giữa mọi phong ba thử thách.',
      ],
      scripture: 'Hãy ra khơi và thả lưới mà bắt cá.',
      scriptureRef: 'Lc 5,4',
    },
    {
      id: 'colors',
      title: 'Năm Sắc Màu Ngành',
      shortLabel: 'Năm Sắc Màu',
      subtitle: 'Tình huynh đệ & Tấm ván con thuyền hiệp nhất',
      iconName: 'colors',
      description:
        'Các màu sắc theo 5 ngành được đặt liền kề nhau, tượng trưng cho sự đoàn kết và tình huynh đệ giữa mọi thành phần trong Xứ Đoàn. Hình ảnh ấy còn gợi lên những tấm ván ghép thành một con thuyền vững chắc, thể hiện sự gắn bó và đồng hành trên hành trình sống đức tin.',
      highlights: [
        '5 màu sắc tượng trưng cho 5 ngành TNTT: Chiên Con, Ấu Nhi, Thiếu Nhi, Nghĩa Sĩ và Hiệp Sĩ.',
        'Những tấm ván ghép nên con thuyền vững chắc: Sự hiệp nhất không thể tách rời giữa các thế hệ thiếu nhi trong xứ đoàn.',
      ],
      scripture: 'Tất cả anh em hãy đồng tâm nhất trí với nhau.',
      scriptureRef: '1 Cr 1,10',
    },
    {
      id: 'patron',
      title: 'Đức Mẹ Fatima — Đấng Bổn Mạng',
      shortLabel: 'Mẹ Fatima',
      subtitle: 'Nữ Vương Thiên Quốc & Tràng Chuỗi Mân Côi',
      iconName: 'patron',
      description:
        'Đức Mẹ Fatima là bổn mạng của Xứ đoàn Thiếu Nhi Thánh Thể Giáo Xứ Gia Tôn. Trên đầu Mẹ đội vương miện tượng trưng cho quyền tước Nữ Vương Thiên Quốc của Mẹ. Mẹ trong tư thế chắp tay cầu nguyện, tay cầm tràng chuỗi Mân Côi nhắc nhớ đến biến cố Fatima.',
      highlights: [
        'Vương miện: Tôn vinh quyền tước Nữ Vương Thiên Quốc và sự che chở mẫu tử của Mẹ.',
        'Tràng chuỗi Mân Côi & Tư thế cầu nguyện: Lời kêu gọi hoán cải, siêng năng lần hạt Mân Côi và tôn sùng Trái Tim Vẹn Sạch Mẹ.',
        'Mẹ là người chuyển cầu và dẫn lối mọi đoàn sinh đến với Chúa Giêsu Thánh Thể.',
      ],
      scripture: 'Vâng, tôi đây là nữ tỳ của Chúa, xin Chúa cứ làm cho tôi như lời sứ thần nói.',
      scriptureRef: 'Lc 1,38',
    },
    {
      id: 'church',
      title: 'Tòa Nhà Giáo Đường Gia Tôn',
      shortLabel: 'Nhà Thờ Gia Tôn',
      subtitle: 'Ngôi nhà chung — Cội nguồn đức tin',
      iconName: 'church',
      description:
        'Đại diện cụ thể cho ngôi nhà thờ thực tế của Giáo xứ Gia Tôn. Đây là biểu tượng của ngôi nhà chung có ý hướng là cội nguồn đức tin, nơi giáo xứ và đoàn sinh gặp gỡ Chúa, kín múc nguồn ơn lành để sống và dấn thân mỗi ngày.',
      highlights: [
        'Biểu tượng ngôi nhà thờ thực tế của Giáo xứ Gia Tôn.',
        'Cội nguồn đức tin: Nơi đoàn sinh gặp gỡ Chúa qua Thánh lễ và kín múc nguồn ân sủng dấn thân.',
      ],
      scripture: 'Anh là Phêrô, nghĩa là Tảng Đá, trên tảng đá này, Thầy sẽ xây Hội Thánh của Thầy.',
      scriptureRef: 'Mt 16,18',
    },
  ],
  branches: [
    {
      id: 'ChienCon',
      name: 'Chiên Con',
      ageRange: '4 - 6 tuổi',
      colorToken: 'var(--color-branch-chiencon)',
      badgeClass: 'bg-branch-chiencon',
      motto: 'Hiền Lành',
      meaning: 'Ngây thơ, hiền lành và đơn sơ trong tình yêu Chúa',
    },
    {
      id: 'AuNhi',
      name: 'Ấu Nhi',
      ageRange: '7 - 9 tuổi',
      colorToken: 'var(--color-branch-aunhi)',
      badgeClass: 'bg-branch-aunhi',
      motto: 'Vâng Lời',
      meaning: 'Ngoan ngoãn, vâng lời cha mẹ và thầy cô noi gương Chúa Hài Đồng',
    },
    {
      id: 'ThieuNhi',
      name: 'Thiếu Nhi',
      ageRange: '10 - 12 tuổi',
      colorToken: 'var(--color-branch-thieunhi)',
      badgeClass: 'bg-branch-thieunhi',
      motto: 'Hy Sinh',
      meaning: 'Nhiệt thành tham dự Thánh Lễ và phụng sự Thánh Thể Chúa',
    },
    {
      id: 'NghiaSi',
      name: 'Nghĩa Sĩ',
      ageRange: '13 - 15 tuổi',
      colorToken: 'var(--color-branch-nghiasi)',
      badgeClass: 'bg-branch-nghiasi',
      motto: 'Chinh Phục',
      meaning: 'Chinh phục chính mình và các linh hồn về cho Chúa',
    },
    {
      id: 'HiepSi',
      name: 'Hiệp Sĩ',
      ageRange: '16 - 18 tuổi',
      colorToken: 'var(--color-branch-hiepsi)',
      badgeClass: 'bg-branch-hiepsi',
      motto: 'Dấn Thân',
      meaning: 'Nên muối men, ánh sáng giữa trần gian và phụng sự Giáo Hội',
    },
  ],
}
