// Bibliographic facts and original summaries only. No textbook/exam content is bundled.
// Schedule evidence is historical (2023–2024), not a mandate for the current year.
export const XUAN_LOC_REVIEWED_ON = '2026-10-16'

export const XUAN_LOC_SOURCES = {
  schedule: {
    title: 'Lịch đề nghị 2023–2024 · Giáo xứ Ngọc Lâm đăng lại',
    url: 'https://giaoxungoclam.net/tin-giao-phan-xuan-loc-02-09-2023-lich-bao-giang-nam-hoc-2023-2024/',
  },
  khaiTam: {
    title: 'Ban Giáo lý Thái Bình · giới thiệu sách Xuân Lộc (15/11/2022)',
    url: 'https://giaophanthaibinh.net/ban-muc-vu-giao-ly-gptb-gioi-thieu-giao-trinh-giao-ly-khai-tam-nganh-chien-con-cua-giao-phan-xuan-loc',
  },
  songDao: {
    title: 'Giáo phận Bắc Ninh · học liệu tham khảo Sống đạo (2024)',
    url: 'https://giaophanbacninh.org/bo-cau-hoi-trac-nghiem-giao-ly-song-dao/',
  },
} as const

export interface XuanLocBook {
  id: string
  title: string
  edition: string
  url: string
  note: string
  isbn?: string
  sections?: ReadonlyArray<{ summary: string; first: number; last: number }>
}

export interface XuanLocLevel {
  id: string
  name: string
  branch: string
  years: number
  books: readonly XuanLocBook[]
}

export const XUAN_LOC_LEVELS: readonly XuanLocLevel[] = [
  {
    id: 'khai-tam', name: 'Khai Tâm', branch: 'Chiên Con', years: 2,
    books: [{
      id: 'khai-tam-2021', title: 'Thủ bản giáo lý: Khối khai tâm',
      edition: 'NXB Đồng Nai, 2021', isbn: '9786043135336',
      url: 'https://thuvien.thongtinxuanloc.com/sach/thu-ban-giao-ly-khoi-khai-tam-0024433',
      note: 'Tòa Giám mục Xuân Lộc; 119 trang. Mục lục 50 bài được đối chiếu qua Ban Giáo lý Thái Bình; chưa phân bài vào từng năm tại Xuân Lộc.',
      // Original section summaries, not verbatim textbook headings or lesson titles.
      sections: [
        { summary: 'Nhận biết tình thương Thiên Chúa', first: 1, last: 15 },
        { summary: 'Đáp lại bằng lòng yêu mến', first: 16, last: 25 },
        { summary: 'Thực hành đức tin hằng ngày', first: 26, last: 40 },
        { summary: 'Tập trò chuyện cùng Thiên Chúa', first: 41, last: 50 },
      ],
    }],
  },
  {
    id: 'ruoc-le', name: 'Rước Lễ', branch: 'Ấu Nhi', years: 3,
    books: [{
      id: 'ban-tiec-thanh-2017', title: 'Đến Bàn Tiệc Thánh',
      edition: 'Trang giới thiệu của Giáo phận, 19/02/2017',
      url: 'https://giaophanxuanloc.net/chi-tiet/sach-moi-giao-ly-den-ban-tiec-thanh-6697',
      note: 'Giáo phận giới thiệu học liệu trình chiếu. Ngày bài đăng không phải năm xuất bản sách; chưa xác minh mục lục đầy đủ.',
    }],
  },
  {
    id: 'them-suc', name: 'Thêm Sức', branch: 'Thiếu Nhi', years: 3,
    books: [{
      id: 'lon-len-2016', title: 'Lớn lên trong Chúa Thánh Thần · phần học viên',
      edition: 'NXB Đồng Nai, 2016', isbn: '9786045251829',
      url: 'https://thuvien.thongtinxuanloc.com/sach/sach-giao-ly-danh-cho-khoi-lon-len-trong-chua-thanh-than-phan-hoc-vien-toa-giam-muc-xuan-loc-0019021',
      note: 'Tòa Giám mục Xuân Lộc; 112 trang. Chưa xác minh mục lục và ấn bản đang dùng tại giáo xứ.',
    }],
  },
  {
    id: 'song-dao', name: 'Sống Đạo', branch: 'Nghĩa Sĩ', years: 3,
    books: [{
      id: 'song-dao-2010', title: 'Sống Đạo: Giáo Lý Cấp III',
      edition: 'NXB Tôn giáo, 2010',
      url: 'https://thuvien.thongtinxuanloc.com/sach/song-dao-giao-ly-cap-iii-toa-giam-muc-xuan-loc-0018503',
      note: 'Tòa Giám mục Xuân Lộc; 128 trang. Đây là bản lịch sử; không dùng mục lục của bản khác để gán cho bản này.',
    }, {
      id: 'song-dao-2020', title: 'Sống đạo · bản được Bắc Ninh dẫn chiếu',
      edition: 'NXB Đồng Nai, 2020 · xác nhận gián tiếp',
      url: XUAN_LOC_SOURCES.songDao.url,
      note: 'Bắc Ninh dẫn sách này khi biên soạn câu hỏi riêng. Bộ câu hỏi đó không phải đề thi chính thức của Xuân Lộc; chưa nhập nội dung.',
    }],
  },
  {
    id: 'hong-an', name: 'Hồng Ân', branch: 'Hiệp Sĩ', years: 2,
    books: [],
  },
]

export interface XuanLocReference {
  chapter: string
  lesson: string
  lessonOrder: string
  source: string
}

// References never choose a parish branch/class, copy a question, or save a draft.
export function xuanLocReference(book: XuanLocBook, lessonNumber?: number): XuanLocReference {
  const section = book.sections?.find(item => lessonNumber !== undefined && lessonNumber >= item.first && lessonNumber <= item.last && Number.isInteger(lessonNumber))
  const lesson = section ? `Bài ${lessonNumber}` : ''
  return {
    chapter: section ? `Phần ${['I', 'II', 'III', 'IV'][book.sections!.indexOf(section)]}` : '',
    lesson,
    lessonOrder: section ? String(lessonNumber) : '',
    source: `${book.title} · ${book.edition} · ${book.url}${section ? ` · Mục lục: ${XUAN_LOC_SOURCES.khaiTam.url}` : ''}`,
  }
}
