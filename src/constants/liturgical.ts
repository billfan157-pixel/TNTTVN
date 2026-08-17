import type { LiturgicalColor, LiturgicalRank, LiturgicalSeason } from '../types/liturgical'

/**
 * Định nghĩa màu sắc phụng vụ và CSS Theme tokens
 */
export const LITURGICAL_COLORS: Record<
  LiturgicalColor,
  { name: string; hex: string; bgClass: string; textClass: string; borderClass: string; badgeBg: string }
> = {
  WHITE: {
    name: 'Trắng',
    hex: '#F8FAFC',
    bgClass: 'bg-amber-500/10 dark:bg-amber-400/15',
    textClass: 'text-amber-700 dark:text-amber-300',
    borderClass: 'border-amber-400/40',
    badgeBg: '#FEF3C7',
  },
  RED: {
    name: 'Đỏ',
    hex: '#EF4444',
    bgClass: 'bg-rose-500/15 dark:bg-rose-500/20',
    textClass: 'text-rose-700 dark:text-rose-400',
    borderClass: 'border-rose-500/40',
    badgeBg: '#FEE2E2',
  },
  GREEN: {
    name: 'Xanh Lá',
    hex: '#10B981',
    bgClass: 'bg-emerald-500/15 dark:bg-emerald-500/20',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-500/40',
    badgeBg: '#DCFCE7',
  },
  PURPLE: {
    name: 'Tím',
    hex: '#8B5CF6',
    bgClass: 'bg-purple-500/15 dark:bg-purple-500/20',
    textClass: 'text-purple-700 dark:text-purple-400',
    borderClass: 'border-purple-500/40',
    badgeBg: '#F3E8FF',
  },
  ROSE: {
    name: 'Hồng',
    hex: '#F472B6',
    bgClass: 'bg-pink-500/15 dark:bg-pink-500/20',
    textClass: 'text-pink-700 dark:text-pink-400',
    borderClass: 'border-pink-400/40',
    badgeBg: '#FCE7F3',
  },
  BLACK: {
    name: 'Đen',
    hex: '#334155',
    bgClass: 'bg-slate-500/15 dark:bg-slate-500/20',
    textClass: 'text-slate-700 dark:text-slate-300',
    borderClass: 'border-slate-400/40',
    badgeBg: '#F1F5F9',
  },
}

/**
 * Tên tiếng Việt và thuộc tính của các Mùa Phụng Vụ
 */
export const LITURGICAL_SEASONS: Record<LiturgicalSeason, { name: string; defaultColor: LiturgicalColor }> = {
  ADVENT: { name: 'Mùa Vọng', defaultColor: 'PURPLE' },
  CHRISTMAS: { name: 'Mùa Giáng Sinh', defaultColor: 'WHITE' },
  LENT: { name: 'Mùa Chay', defaultColor: 'PURPLE' },
  EASTER_TRIDUUM: { name: 'Tam Nhật Vượt Qua', defaultColor: 'RED' },
  EASTER: { name: 'Mùa Phục Sinh', defaultColor: 'WHITE' },
  ORDINARY_TIME: { name: 'Mùa Thường Niên', defaultColor: 'GREEN' },
}

/**
 * Bậc lễ và tên hiển thị tiếng Việt
 */
export const LITURGICAL_RANKS: Record<LiturgicalRank, { name: string; weight: number }> = {
  SOLEMNITY: { name: 'Lễ Trọng', weight: 1 },
  FEAST: { name: 'Lễ Kính', weight: 2 },
  MEMORIAL: { name: 'Lễ Nhớ Buộc', weight: 3 },
  OPTIONAL_MEMORIAL: { name: 'Lễ Nhớ Tùy Ý', weight: 4 },
  WEEKDAY: { name: 'Ngày Trong Tuần', weight: 5 },
}

export interface FixedLiturgicalEntry {
  month: number // 1 - 12
  day: number   // 1 - 31
  title: string
  rank: LiturgicalRank
  color: LiturgicalColor
  isHolyDayOfObligation?: boolean
  isVietnameseProper?: boolean
  gospelRef?: string
  gospelVerse?: string
}

/**
 * Danh mục các Ngày Lễ Cố Định Chuẩn Phụng Vụ & Lịch Riêng Giáo Hội Việt Nam (HĐGMVN)
 */
export const FIXED_LITURGICAL_CALENDAR: FixedLiturgicalEntry[] = [
  // Tháng 1
  { month: 1, day: 1, title: 'Đức Maria, Mẹ Thiên Chúa', rank: 'SOLEMNITY', color: 'WHITE', isHolyDayOfObligation: true, gospelRef: 'Lc 2, 16-21', gospelVerse: 'Còn bà Maria thì hằng ghi nhớ mọi kỷ niệm ấy, và suy đi nghĩ lại trong lòng.' },
  { month: 1, day: 2, title: 'Thánh Basiliô Cả và Thánh Grêgôriô Nazianzên', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 1, day: 17, title: 'Thánh Antôn, Viện phụ', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 1, day: 21, title: 'Thánh Anê, Trinh nữ tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 1, day: 24, title: 'Thánh Phanxicô Salêsiô, Giám mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 1, day: 25, title: 'Thánh Phaolô Tông Đồ Trở Lại', rank: 'FEAST', color: 'WHITE' },
  { month: 1, day: 26, title: 'Thánh Timôthê và Thánh Titô, Giám mục', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 1, day: 28, title: 'Thánh Tôma Aquinô, Linh mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 1, day: 31, title: 'Thánh Gioan Bosco, Linh mục (Quan thầy giới trẻ)', rank: 'MEMORIAL', color: 'WHITE' },

  // Tháng 2
  { month: 2, day: 2, title: 'Dâng Chúa Trong Đền Thánh (Lễ Nến)', rank: 'FEAST', color: 'WHITE', gospelRef: 'Lc 2, 22-40' },
  { month: 2, day: 5, title: 'Thánh Agata, Trinh nữ tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 2, day: 6, title: 'Thánh Phaolô Miki và các bạn tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 2, day: 10, title: 'Thánh Scholastica, Trinh nữ', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 2, day: 11, title: 'Đức Mẹ Lộ Đức (Ngày Quốc Tế Bệnh Nhân)', rank: 'OPTIONAL_MEMORIAL', color: 'WHITE' },
  { month: 2, day: 14, title: 'Thánh Syrilô và Thánh Mêthôđiô', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 2, day: 22, title: 'Lập Tông Tòa Thánh Phêrô', rank: 'FEAST', color: 'WHITE', gospelRef: 'Mt 16, 13-19' },

  // Tháng 3
  { month: 3, day: 7, title: 'Thánh Perpêtua và Thánh Fêlicita, Tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 3, day: 8, title: 'Thánh Gioan Thiên Chúa, Tu sĩ', rank: 'OPTIONAL_MEMORIAL', color: 'WHITE' },
  { month: 3, day: 17, title: 'Thánh Patriciô, Giám mục', rank: 'OPTIONAL_MEMORIAL', color: 'WHITE' },
  { month: 3, day: 19, title: 'Thánh Giuse, Bạn Trăm Năm Đức Maria (Bổn Mạng Giáo Hội Việt Nam)', rank: 'SOLEMNITY', color: 'WHITE', isHolyDayOfObligation: true, isVietnameseProper: true, gospelRef: 'Mt 1, 16. 18-21. 24a', gospelVerse: 'Ông Giuse làm như sứ thần Chúa dạy và đón vợ về nhà.' },
  { month: 3, day: 25, title: 'Lễ Truyền Tin Của Chúa', rank: 'SOLEMNITY', color: 'WHITE', gospelRef: 'Lc 1, 26-38', gospelVerse: 'Vâng, tôi đây là nữ tỳ của Chúa, xin Người thực hiện cho tôi như lời sứ thần nói.' },

  // Tháng 4
  { month: 4, day: 25, title: 'Thánh Marcô, Tác viên Tin Mừng', rank: 'FEAST', color: 'RED' },
  { month: 4, day: 29, title: 'Thánh Catarina Siêna, Trinh nữ TSHT', rank: 'MEMORIAL', color: 'WHITE' },

  // Tháng 5
  { month: 5, day: 1, title: 'Thánh Giuse Thợ', rank: 'MEMORIAL', color: 'WHITE', isVietnameseProper: true },
  { month: 5, day: 2, title: 'Thánh Athanasiô, Giám mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 5, day: 3, title: 'Thánh Philipphê và Thánh Giacôbê, Tông đồ', rank: 'FEAST', color: 'RED' },
  { month: 5, day: 13, title: 'Đức Mẹ Fatima', rank: 'OPTIONAL_MEMORIAL', color: 'WHITE' },
  { month: 5, day: 14, title: 'Thánh Mátthêu, Tông đồ', rank: 'FEAST', color: 'RED' },
  { month: 5, day: 24, title: 'Đức Maria Phù Hộ Các Tín Hữu', rank: 'OPTIONAL_MEMORIAL', color: 'WHITE' },
  { month: 5, day: 26, title: 'Thánh Philipphê Nêri, Linh mục', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 5, day: 31, title: 'Đức Mẹ Thăm Viếng Bà Êlisabét', rank: 'FEAST', color: 'WHITE', gospelRef: 'Lc 1, 39-56', gospelVerse: 'Linh hồn tôi ngợi khen Đức Chúa, thần trí tôi hớn hở vui mừng vì Thiên Chúa, Đấng cứu độ tôi.' },

  // Tháng 6
  { month: 6, day: 1, title: 'Thánh Giustinô, Tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 6, day: 3, title: 'Thánh Carôlô Lwanga và các bạn tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 6, day: 5, title: 'Thánh Bônifaciô, Giám mục tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 6, day: 11, title: 'Thánh Barnaba, Tông đồ', rank: 'MEMORIAL', color: 'RED' },
  { month: 6, day: 13, title: 'Thánh Antôn Pađôva, Linh mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 6, day: 21, title: 'Thánh Aloisiô Gonzaga, Tu sĩ', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 6, day: 24, title: 'Sinh Nhật Thánh Gioan Tẩy Giả', rank: 'SOLEMNITY', color: 'WHITE', gospelRef: 'Lc 1, 57-66. 80' },
  { month: 6, day: 28, title: 'Thánh Irênê, Giám mục tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 6, day: 29, title: 'Thánh Phêrô và Thánh Phaolô, Tông Đồ', rank: 'SOLEMNITY', color: 'RED', isHolyDayOfObligation: true, gospelRef: 'Mt 16, 13-19', gospelVerse: 'Thầy bảo cho anh biết: anh là Phêrô, nghĩa là Tảng Đá, trên tảng đá này, Thầy sẽ xây Hội Thánh của Thầy.' },

  // Tháng 7
  { month: 7, day: 3, title: 'Thánh Tôma, Tông đồ', rank: 'FEAST', color: 'RED' },
  { month: 7, day: 11, title: 'Thánh Biển Đức, Viện phụ', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 7, day: 15, title: 'Thánh Bônaventura, Giám mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 7, day: 22, title: 'Thánh Maria Mađalêna', rank: 'FEAST', color: 'WHITE' },
  { month: 7, day: 25, title: 'Thánh Giacôbê, Tông đồ', rank: 'FEAST', color: 'RED' },
  { month: 7, day: 26, title: 'Thánh Gioakim và Thánh Anna, Song thân Đức Maria', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 7, day: 29, title: 'Thánh Mácta, Thánh Maria và Thánh Lazarô', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 7, day: 31, title: 'Thánh Inhaxiô Loyôla, Linh mục', rank: 'MEMORIAL', color: 'WHITE' },

  // Tháng 8
  { month: 8, day: 1, title: 'Thánh Anphongxô Maria Liguôri, Giám mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 4, title: 'Thánh Gioan Maria Vianney, Linh mục (Bổn Mạng các Cha Sở)', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 6, title: 'Chúa Biến Hình Trên Núi', rank: 'FEAST', color: 'WHITE', gospelRef: 'Mt 17, 1-9' },
  { month: 8, day: 8, title: 'Thánh Đaminh, Linh mục', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 10, title: 'Thánh Laurensô, Phó tế tử đạo', rank: 'FEAST', color: 'RED' },
  { month: 8, day: 11, title: 'Thánh Clara, Trinh nữ', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 14, title: 'Thánh Măcximilianô Maria Kolbe, Linh mục tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 8, day: 15, title: 'Đức Mẹ Hồn Xác Lên Trời (và Đức Mẹ La Vang)', rank: 'SOLEMNITY', color: 'WHITE', isHolyDayOfObligation: true, isVietnameseProper: true, gospelRef: 'Lc 1, 39-56', gospelVerse: 'Đấng Toàn Năng đã làm cho tôi biết bao điều cao cả, danh Người thật chí thánh chí tôn!' },
  { month: 8, day: 20, title: 'Thánh Bênađô, Viện phụ TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 21, title: 'Thánh Piô X, Giáo hoàng', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 22, title: 'Đức Maria Nữ Vương', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 24, title: 'Thánh Batôlômêô, Tông đồ', rank: 'FEAST', color: 'RED' },
  { month: 8, day: 27, title: 'Thánh Mônica', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 28, title: 'Thánh Augustinô, Giám mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 8, day: 29, title: 'Thánh Gioan Tẩy Giả Bị Trảm Quyết', rank: 'MEMORIAL', color: 'RED' },

  // Tháng 9
  { month: 9, day: 3, title: 'Thánh Grêgôriô Cả, Giáo hoàng TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 9, day: 8, title: 'Sinh Nhật Đức Trinh Nữ Maria', rank: 'FEAST', color: 'WHITE', gospelRef: 'Mt 1, 1-16. 18-23' },
  { month: 9, day: 13, title: 'Thánh Gioan Kim Khẩu, Giám mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 9, day: 14, title: 'Suy Tôn Thánh Giá', rank: 'FEAST', color: 'RED', gospelRef: 'Ga 3, 13-17' },
  { month: 9, day: 15, title: 'Đức Mẹ Sầu Bi', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 9, day: 16, title: 'Thánh Cornêliô và Thánh Sýprianô, Tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 9, day: 21, title: 'Thánh Mátthêu, Tông đồ & Tác viên Tin Mừng', rank: 'FEAST', color: 'RED' },
  { month: 9, day: 23, title: 'Thánh Piô Pietrelcina (Cha Piô Năm Dấu)', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 9, day: 27, title: 'Thánh Vinh Sơn Phaolô, Linh mục', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 9, day: 29, title: 'Các Tổng Lãnh Thiên Thần Micae, Gabrien và Raphaen', rank: 'FEAST', color: 'WHITE' },
  { month: 9, day: 30, title: 'Thánh Giêrônimô, Linh mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },

  // Tháng 10
  { month: 10, day: 1, title: 'Thánh Têrêxa Hài Đồng Giêsu (Bổn Mạng Các Xứ Truyền Giáo)', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 10, day: 2, title: 'Các Thiên Thần Hộ Thủ (Thiên Thần Bản Mệnh)', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 10, day: 4, title: 'Thánh Phanxicô Assisi', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 10, day: 7, title: 'Đức Mẹ Mân Côi', rank: 'MEMORIAL', color: 'WHITE', gospelRef: 'Lc 1, 26-38' },
  { month: 10, day: 15, title: 'Thánh Têrêxa Avila, Trinh nữ TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 10, day: 17, title: 'Thánh Inhaxiô Antiôkia, Giám mục tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 10, day: 18, title: 'Thánh Luca, Tác viên Tin Mừng', rank: 'FEAST', color: 'RED' },
  { month: 10, day: 22, title: 'Thánh Gioan Phaolô II, Giáo hoàng', rank: 'OPTIONAL_MEMORIAL', color: 'WHITE' },
  { month: 10, day: 28, title: 'Thánh Simon và Thánh Giuđa, Tông đồ', rank: 'FEAST', color: 'RED' },

  // Tháng 11
  { month: 11, day: 1, title: 'Lễ Các Thánh Nam Nữ', rank: 'SOLEMNITY', color: 'WHITE', isHolyDayOfObligation: true, gospelRef: 'Mt 5, 1-12a', gospelVerse: 'Phúc thay ai có tâm hồn nghèo khó, vì Nước Trời là của họ.' },
  { month: 11, day: 2, title: 'Cầu Cho Các Tín Hữu Đã Qua Đời (Lễ Các Đẳng)', rank: 'SOLEMNITY', color: 'PURPLE', gospelRef: 'Ga 6, 37-40' },
  { month: 11, day: 4, title: 'Thánh Carôlô Bôrômêô, Giám mục', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 11, day: 9, title: 'Cung Hiến Vương Cung Thánh Đường Latêranô', rank: 'FEAST', color: 'WHITE' },
  { month: 11, day: 10, title: 'Thánh Lêô Cả, Giáo hoàng TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 11, day: 11, title: 'Thánh Martinô Tour, Giám mục', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 11, day: 12, title: 'Thánh Giôxaphat, Giám mục tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 11, day: 17, title: 'Thánh Elizabeth Hungari, Nữ tu', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 11, day: 21, title: 'Đức Mẹ Dâng Mình Trong Đền Thờ', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 11, day: 22, title: 'Thánh Cêcilia, Trinh nữ tử đạo (Bổn Mạng Ca Đoàn)', rank: 'MEMORIAL', color: 'RED' },
  { month: 11, day: 24, title: 'Các Thánh Tử Đạo Việt Nam (Lễ Trọng tại Việt Nam)', rank: 'SOLEMNITY', color: 'RED', isHolyDayOfObligation: true, isVietnameseProper: true, gospelRef: 'Lc 9, 23-26', gospelVerse: 'Ai muốn theo Tôi, phải từ bỏ chính mình, vác thập giá mình hằng ngày mà theo.' },
  { month: 11, day: 30, title: 'Thánh Anrê, Tông đồ (Bổn Mạng Giới Trưởng Thành)', rank: 'FEAST', color: 'RED' },

  // Tháng 12
  { month: 12, day: 3, title: 'Thánh Phanxicô Xaviê, Linh mục (Bổn Mạng Các Xứ Truyền Giáo)', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 12, day: 7, title: 'Thánh Ambrôsiô, Giám mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 12, day: 8, title: 'Đức Mẹ Vô Nhiễm Nguyên Tội', rank: 'SOLEMNITY', color: 'WHITE', isHolyDayOfObligation: true, gospelRef: 'Lc 1, 26-38', gospelVerse: 'Mừng vui lên, hỡi Đấng đầy ân sủng, Đức Chúa ở cùng bà.' },
  { month: 12, day: 12, title: 'Đức Mẹ Guađalupê', rank: 'OPTIONAL_MEMORIAL', color: 'WHITE' },
  { month: 12, day: 13, title: 'Thánh Lucia, Trinh nữ tử đạo', rank: 'MEMORIAL', color: 'RED' },
  { month: 12, day: 14, title: 'Thánh Gioan Thánh Giá, Linh mục TSHT', rank: 'MEMORIAL', color: 'WHITE' },
  { month: 12, day: 25, title: 'Chúa Giáng Sinh (Lễ Mừng Ngôi Lời Nhập Thể)', rank: 'SOLEMNITY', color: 'WHITE', isHolyDayOfObligation: true, gospelRef: 'Ga 1, 1-18', gospelVerse: 'Ngôi Lời đã trở nên người phàm và cư ngụ giữa chúng ta.' },
  { month: 12, day: 26, title: 'Thánh Têphanô, Tử đạo tiên khởi', rank: 'FEAST', color: 'RED' },
  { month: 12, day: 27, title: 'Thánh Gioan, Tông đồ & Tác viên Tin Mừng', rank: 'FEAST', color: 'WHITE' },
  { month: 12, day: 28, title: 'Các Thánh Anh Hài, Tử đạo', rank: 'FEAST', color: 'RED' },
]
