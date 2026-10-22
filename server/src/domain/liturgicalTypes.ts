/**
 * Liturgical Domain Types for Catholic Liturgical Calendar (HĐGMVN & IGMR Standard)
 */

export type LiturgicalSeason =
  | 'ADVENT'          // Mùa Vọng (Tím / Hồng)
  | 'CHRISTMAS'       // Mùa Giáng Sinh (Trắng)
  | 'LENT'            // Mùa Chay (Tím / Hồng)
  | 'EASTER_TRIDUUM'  // Tam Nhật Vượt Qua (Trắng / Đỏ)
  | 'EASTER'          // Mùa Phục Sinh (Trắng)
  | 'ORDINARY_TIME'   // Mùa Thường Niên (Xanh Lá)

export type LiturgicalColor =
  | 'WHITE'   // Trắng / Vàng kim (Lễ Chúa, Đức Mẹ, Thiên Thần, Thánh không Tử đạo)
  | 'RED'     // Đỏ (Chúa Thánh Thần, Thương Khó, Tử Đạo)
  | 'GREEN'   // Xanh Lá (Thường Niên)
  | 'PURPLE'  // Tím (Mùa Vọng, Mùa Chay, Cầu hồn)
  | 'ROSE'    // Hồng (Chúa Nhật Vui - Gaudete, Chúa Nhật Hân Hoan - Laetare)
  | 'BLACK'   // Đen (Lễ Cầu hồn cổ truyền)

export type LiturgicalRank =
  | 'SOLEMNITY'         // Lễ Trọng (Bậc 1)
  | 'SUNDAY'            // Chúa Nhật — bậc riêng, KHÔNG đồng nghĩa Lễ Trọng
  | 'FEAST'             // Lễ Kính (Bậc 2)
  | 'MEMORIAL'          // Lễ Nhớ Buộc (Bậc 3)
  | 'OPTIONAL_MEMORIAL' // Lễ Nhớ Tùy Ý (Bậc 4)
  | 'WEEKDAY'           // Ngày trong tuần (Bậc 5)

export type SundayCycle = 'A' | 'B' | 'C'
export type WeekdayCycle = 'I' | 'II'

export interface LiturgicalReadings {
  firstReading?: string      // Bài đọc 1 (ví dụ: Is 2, 1-5)
  psalm?: string             // Đáp ca (ví dụ: Tv 121, 1-2. 4-5. 6-7. 8-9)
  secondReading?: string     // Bài đọc 2 (Chúa Nhật & Lễ Trọng, ví dụ: Rm 13, 11-14)
  gospel?: string            // Phúc Âm / Tin Mừng (ví dụ: Mt 24, 37-44)
  gospelVerse?: string       // Câu Lời Chúa tâm niệm nổi bật trong ngày
}

export interface LiturgicalDay {
  date: string               // YYYY-MM-DD
  title: string              // Tên ngày lễ (ví dụ: "Chúa Nhật I Mùa Vọng", "Lễ Đức Mẹ Vô Nhiễm Nguyên Tội")
  subTitle?: string          // Tên phụ / Chú thích
  season: LiturgicalSeason   // Mùa phụng vụ
  seasonName: string         // Tên mùa hiển thị tiếng Việt (ví dụ: "Mùa Vọng")
  color: LiturgicalColor     // Màu sắc áo lễ
  colorName: string          // Tên màu tiếng Việt (ví dụ: "Tím")
  colorHex: string           // Mã màu CSS chuẩn Design System
  rank: LiturgicalRank       // Bậc lễ (Chúa Nhật có bậc riêng, không phải Lễ Trọng)
  rankName: string           // Tên bậc lễ tiếng Việt (ví dụ: "Lễ Trọng", "Chúa Nhật")
  rankWeight: number         // Trọng số ưu tiên (1 = cao nhất)
  isHolyDayOfObligation: boolean // Lễ Buộc — độc lập với rank
  isSunday: boolean          // Có phải ngày Chúa Nhật không — độc lập với rank
  /** Tuần phụng vụ (chỉ điền khi nguồn lịch xác nhận, vd "Chúa Nhật XXIX Thường Niên"). */
  liturgicalWeek?: string
  /** Nguồn lịch phụng vụ đang dùng (Ordo/HĐGMVN). */
  calendarSource: string
  /** Phiên bản dữ liệu lịch — đổi khi nguồn cập nhật để đối chiếu. */
  calendarVersion: string
  sundayCycle?: SundayCycle  // Năm A / B / C (nếu là Chúa Nhật hoặc mùa liên quan)
  weekdayCycle?: WeekdayCycle// Năm I / II (nếu là ngày thường)
  readings?: LiturgicalReadings // Bài đọc Lời Chúa
  patronSaints?: string[]    // Các Thánh kính nhớ trong ngày
  isCustomParishEvent?: boolean // Sự kiện riêng của giáo xứ / xứ đoàn
  customEventNote?: string   // Ghi chú sự kiện xứ đoàn
}

export interface ParishEvent {
  id: string
  date: string               // YYYY-MM-DD
  title: string
  description?: string
  branch?: string            // Áp dụng cho ngành nào hoặc Toàn Xứ Đoàn
  category: 'FEAST_DAY' | 'CAMP' | 'TRAINING' | 'SACRAMENT' | 'RETREAT' | 'MEETING' | 'OTHER'
  categoryName: string
  location?: string
  time?: string              // HH:mm
}
