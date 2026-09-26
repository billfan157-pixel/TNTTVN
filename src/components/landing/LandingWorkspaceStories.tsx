import React from 'react'
import { CalendarDays, CheckCircle2, GraduationCap, HeartHandshake } from 'lucide-react'
import { LandingWorkspacePreview, type PreviewWorkspace } from './LandingHeroPreview'

interface Story {
  id: PreviewWorkspace
  number: string
  eyebrow: string
  title: string
  description: string
  highlights: [string, string]
  icon: typeof GraduationCap
}

const STORIES: Story[] = [
  {
    id: 'academic',
    number: '01',
    eyebrow: 'Giáo Lý Viên & Huynh Trưởng',
    title: 'Từ buổi học đến trọn vẹn cả niên khóa',
    description: 'Lớp học, điểm danh, sổ điểm và hành trình thăng ngành nằm trong cùng một mạch công việc.',
    highlights: ['Ghi nhận chuyên cần ngay tại lớp, kể cả lúc mất mạng.', 'Theo dõi quá trình học và chuẩn bị đánh giá cuối kỳ.'],
    icon: GraduationCap,
  },
  {
    id: 'organization',
    number: '02',
    eyebrow: 'Ban Điều Hành Xứ Đoàn',
    title: 'Một nơi để toàn thể Xứ Đoàn cùng vận hành',
    description: 'Lịch sinh hoạt, thông báo và phân công công việc giúp các huynh trưởng cùng nhìn về một hướng.',
    highlights: ['Kết nối sự kiện và công việc của các ngành.', 'Theo dõi hoạt động và quỹ theo đúng phạm vi phụ trách.'],
    icon: CalendarDays,
  },
  {
    id: 'parent',
    number: '03',
    eyebrow: 'Cổng Phụ Huynh',
    title: 'Phụ huynh luôn biết con mình đang đồng hành thế nào',
    description: 'Trên điện thoại, cha mẹ theo dõi việc học Giáo lý, chuyên cần và gửi đơn xin phép khi cần.',
    highlights: ['Thông tin của con trong một không gian riêng.', 'Giữ liên lạc với Giáo Lý Viên và Xứ Đoàn.'],
    icon: HeartHandshake,
  },
]

export function LandingWorkspaceStories({ activeStory = 'academic', sequential = false }: { activeStory?: PreviewWorkspace; sequential?: boolean } = {}) {
  return (
    <section aria-labelledby="tieu-de-khong-gian-lam-viec" className="landing-story-sequence">
      <h3 id="tieu-de-khong-gian-lam-viec" className="sr-only">Ba không gian làm việc Catevia</h3>
      {STORIES.map(story => {
        const Icon = story.icon
        return (
          <article
            key={story.id}
            id={`story-${story.id}`}
            data-landing-scene={story.id}
            data-story-tab={story.id}
            data-active={activeStory === story.id}
            className={`landing-product-story landing-product-story--${story.id}`}
          >
            <div className="landing-product-story__copy">
              <span className="landing-product-story__number">{story.number} / 03</span>
              <div className="landing-product-story__icon"><Icon aria-hidden="true" /></div>
              <p className="landing-product-story__eyebrow">{story.eyebrow}</p>
              <h3>{story.title}</h3>
              <p className="landing-product-story__description">{story.description}</p>
              <ul aria-label={`Điểm nổi bật của ${story.eyebrow}`}>
                {story.highlights.map(highlight => (
                  <li key={highlight}><CheckCircle2 aria-hidden="true" />{highlight}</li>
                ))}
              </ul>
            </div>
            {sequential && <div className="landing-product-story__mobile-visual" aria-label={`Giao diện minh họa ${story.eyebrow}`}>
              <LandingWorkspacePreview workspace={story.id} />
            </div>}
          </article>
        )
      })}
    </section>
  )
}
