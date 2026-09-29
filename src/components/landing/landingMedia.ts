export interface ParishImage {
  src: string
  width: number
  height: number
  alt?: string
}

export interface LandingMedia {
  heroVideo?: string
  lessonImage?: ParishImage
  familyImage?: ParishImage
}

// Only publish material approved by the parish. Real community documentary photographs:
// - lessonImage: Huynh Trưởng & GLV quỳ tuyên hứa phụng vụ tại cung thánh
// - familyImage: Các em thiếu nhi các ngành sốt sắng cầu nguyện trong Thánh Lễ
export const landingMedia: LandingMedia = {
  lessonImage: {
    src: '/images/huynh-truong-tuyen-hua.webp',
    width: 1024,
    height: 726,
    alt: 'Huynh Trưởng và Giáo Lý Viên Xứ Đoàn Đức Mẹ Fatima trong giờ chầu và nghi thức tuyên hứa phụng sự',
  },
  familyImage: {
    src: '/images/thieu-nhi-cau-nguyen.webp',
    width: 1024,
    height: 731,
    alt: 'Thiếu nhi Xứ Đoàn Đức Mẹ Fatima sốt sắng cầu nguyện trong Thánh Lễ tại thánh đường Gia Tôn',
  },
}
