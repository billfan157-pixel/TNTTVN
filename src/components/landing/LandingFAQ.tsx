import React, { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'

interface FAQItem {
  id: string
  question: string
  answer: string
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'cap-tai-khoan',
    question: 'Làm thế nào để tôi có tài khoản đăng nhập Catevia?',
    answer:
      'Tài khoản do Ban Giáo Lý và Ban Điều Hành Xứ Đoàn cấp phát theo danh sách thiếu nhi và Ban Huynh Trưởng đã được phê duyệt. Khi niên khóa Giáo lý bắt đầu, phụ huynh và Giáo Lý Viên sẽ nhận được thông tin tài khoản từ Giáo Lý Viên chủ nhiệm lớp.',
  },
  {
    id: 'quen-mat-khau',
    question: 'Quên mật khẩu thì phải xử lý thế nào?',
    answer:
      'Với phụ huynh: Vui lòng nhắn cho Giáo Lý Viên chủ nhiệm của con em mình để được hỗ trợ đặt lại mật khẩu. Với Giáo Lý Viên / Huynh Trưởng: Liên hệ Ban Điều Hành Xứ Đoàn hoặc Ban Giáo Lý để nhận mật khẩu mới an toàn.',
  },
  {
    id: 'nham-cong',
    question: 'Nếu tôi vào nhầm cổng đăng nhập thì sao?',
    answer:
      'Catevia phân biệt rõ Cổng Giáo Lý Viên & Huynh Trưởng (dành cho Giáo Lý Viên, Huynh Trưởng, Ban Điều Hành) và Cổng Phụ Huynh (dành cho cha mẹ thiếu nhi). Nếu bạn đăng nhập nhầm cổng, hệ thống sẽ thông báo rõ ràng và hướng dẫn bạn chuyển sang đúng cổng chỉ với một lần chạm.',
  },
  {
    id: 'ngoai-tuyen',
    question: 'Khi nhà thờ không có wifi hoặc mất sóng 4G thì có điểm danh được không?',
    answer:
      'Hoàn toàn được. Catevia hoạt động theo cơ chế Ngoại tuyến (Offline-First): mọi thao tác điểm danh chuyên cần Thánh Lễ và ghi nhận điểm số trong ngày vẫn thực hiện bình thường trên máy, và sẽ tự động đồng bộ lên hệ thống ngay khi thiết bị có kết nối mạng trở lại.',
  },
  {
    id: 'dung-dien-thoai',
    question: 'Tôi có thể sử dụng Catevia trên điện thoại (iPhone / Android) không?',
    answer:
      'Có. Catevia tương thích hoàn hảo trên mọi trình duyệt di động và máy tính bảng. Bạn có thể chọn "Thêm vào màn hình chính" (Add to Home Screen) trên Safari hoặc Chrome để sử dụng tiện lợi như một ứng dụng cài đặt thông thường.',
  },
  {
    id: 'bao-mat-du-lieu',
    question: 'Dữ liệu và điểm số của con em tôi được bảo mật như thế nào?',
    answer:
      'Dữ liệu thuộc quyền sở hữu trọn vẹn của Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn. Hệ thống phân quyền chặt chẽ: phụ huynh chỉ có thể tra cứu thông tin của chính con em mình; mật khẩu được mã hóa an toàn và không bao giờ chia sẻ cho bất kỳ bên thứ ba nào.',
  },
]

export function LandingFAQ() {
  const [openId, setOpenId] = useState<string | null>(null)

  const toggleItem = (id: string) => {
    setOpenId(prev => (prev === id ? null : id))
  }

  return (
    <section aria-labelledby="tieu-de-faq" className="flex flex-col gap-8 scroll-mt-20 max-w-4xl mx-auto w-full" id="cau-hoi-thuong-gap">
      <div className="landing-narrative text-center flex flex-col items-center gap-3">
        <span className="landing-eyebrow">
          <HelpCircle aria-hidden="true" className="w-4 h-4" />
          <span>Giải Đáp Thắc Mắc</span>
        </span>
        <h2 id="tieu-de-faq" className="landing-section-title m-0 text-balance">
          Câu hỏi thường gặp
        </h2>
        <p className="landing-lead m-0 text-balance">
          Những băn khoăn phổ biến nhất của phụ huynh và huynh trưởng khi sử dụng Catevia.
        </p>
      </div>

      <div className="flex flex-col gap-3" role="region" aria-label="Danh sách câu hỏi thường gặp">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openId === item.id
          const buttonId = `faq-btn-${item.id}`
          const panelId = `faq-panel-${item.id}`

          return (
            <article
              key={item.id}
              className={`card transition-colors ${
                isOpen ? 'border-parish-primary/40 shadow-sm' : ''
              }`}
            >
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleItem(item.id)}
                className="w-full min-h-12 px-4 sm:px-5 py-3.5 text-left flex items-start sm:items-center justify-between gap-3 text-text-main hover:text-parish-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary rounded-xl"
              >
                <span className="text-sm sm:text-base font-bold flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-surface-app border border-surface-border text-text-muted text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                    {index + 1}
                  </span>
                  <span>{item.question}</span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`w-4 h-4 text-text-muted shrink-0 mt-1 sm:mt-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-parish-primary' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="px-4 sm:px-5 pb-4 pt-2 text-sm text-text-secondary leading-relaxed border-t border-surface-border/60 animate-in fade-in duration-200"
                >
                  <p className="m-0">{item.answer}</p>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
