import React from 'react'
import { ArrowRight, Church } from 'lucide-react'
import type { ParishImage } from './landingMedia'
import { LandingWorkspacePreview } from './LandingHeroPreview'

interface CommunityMedia {
  sequential?: boolean
  lessonImage?: ParishImage
  familyImage?: ParishImage
}

const MOMENTS = [
  {
    id: 'gather',
    number: '01',
    eyebrow: 'Một Xứ Đoàn',
    title: 'Mọi hành trình bắt đầu từ một cộng đoàn.',
    body: 'Tại Giáo Xứ Gia Tôn, các em lớn lên cùng đức tin, bạn bè và những người đồng hành mỗi Chúa nhật.',
    connection: 'Một nơi kết nối nhịp sống Xứ Đoàn',
  },
  {
    id: 'learn',
    number: '02',
    eyebrow: 'Mỗi buổi Giáo lý',
    title: 'Từng buổi học đều đáng được ghi nhớ.',
    body: 'Giáo Lý Viên cần một cách nhẹ nhàng để chăm sóc lớp, theo dõi chuyên cần và nhìn thấy sự tiến bộ của từng em.',
    connection: 'Một mạch công việc dành cho người phục vụ',
  },
  {
    id: 'family',
    number: '03',
    eyebrow: 'Mỗi gia đình',
    title: 'Sự đồng hành tiếp tục khi trở về nhà.',
    body: 'Phụ huynh có thể theo sát hành trình Giáo lý của con và giữ kết nối với Xứ Đoàn.',
    connection: 'Một không gian riêng để gia đình đồng hành',
  },
] as const

export const LandingCommunityScene = React.memo(function LandingCommunityScene({ sequential = false, lessonImage, familyImage }: CommunityMedia) {
  return (
    <section id="hanh-trinh" className="landing-community" aria-labelledby="landing-community-title">
      <div id="gioi-thieu-noi-dung" className="landing-community__intro">
        <div className="landing-community__opening">
          <span className="landing-eyebrow">01 / Câu chuyện của chúng ta</span>
          <h2 id="landing-community-title">Một hành trình đức tin. <em>Ba cách đồng hành.</em></h2>
        </div>
        <div className="landing-community__context">
          <p>Từ sân nhà thờ đến lớp Giáo lý rồi trở về mỗi gia đình, mọi khoảnh khắc được kết nối trong một không gian chung.</p>
          <ol className="landing-community__path" aria-label="Ba chặng đồng hành">
            <li><span>01</span>Cộng đoàn</li>
            <li><span>02</span>Lớp Giáo lý</li>
            <li><span>03</span>Gia đình</li>
          </ol>
          <p className="landing-community__context-note">Con người ở trung tâm. Catevia kết nối những người cùng chăm lo cho các em.</p>
        </div>
      </div>

      <div className="landing-community__sequence">
        {!sequential && <div className="landing-community__visual" aria-hidden="true">
          <div className="landing-community__visual-panel landing-community__visual-panel--gather">
            <img src="/images/hero/hero-1280.webp" alt="" width="1280" height="864" loading="lazy" decoding="async" />
            <span>Xứ Đoàn Fatima · Gia Tôn</span>
          </div>
          <div className="landing-community__visual-panel landing-community__visual-panel--learn">
            {lessonImage ? (
              <>
                <img {...lessonImage} alt="" loading="lazy" decoding="async" />
                <span>Nghi thức tuyên hứa · Huynh Trưởng &amp; GLV</span>
              </>
            ) : <div className="landing-community__product"><LandingWorkspacePreview workspace="academic" /></div>}
          </div>
          <div className="landing-community__visual-panel landing-community__visual-panel--family">
            {familyImage ? (
              <>
                <img {...familyImage} alt="" loading="lazy" decoding="async" />
                <span>Thiếu nhi Fatima · Hiệp dâng Thánh Lễ</span>
              </>
            ) : <div className="landing-community__product landing-community__product--phone"><LandingWorkspacePreview workspace="parent" /></div>}
          </div>
          <span className="landing-community__visual-mark"><Church aria-hidden="true" /> Đức Mẹ Fatima</span>
        </div>}

        <div className="landing-community__chapters">
          {MOMENTS.map(moment => (
            <article key={moment.id} className="landing-community__chapter" data-landing-scene={`community-${moment.id}`}>
              <span className="landing-community__chapter-number"><span>{moment.number}</span> / 03</span>
              {sequential && <div className={`landing-community__mobile-visual landing-community__mobile-visual--${moment.id}`} aria-hidden="true">
                {moment.id === 'gather'
                  ? <img src="/images/hero/hero-1280.webp" alt="" width="1280" height="864" loading="lazy" decoding="async" />
                  : moment.id === 'learn' && lessonImage
                    ? <img {...lessonImage} alt="" loading="lazy" decoding="async" />
                    : moment.id === 'family' && familyImage
                      ? <img {...familyImage} alt="" loading="lazy" decoding="async" />
                      : <LandingWorkspacePreview workspace={moment.id === 'learn' ? 'academic' : 'parent'} />}
              </div>}
              <div>
                <p className="landing-community__chapter-eyebrow">{moment.eyebrow}</p>
                <h3>{moment.title}</h3>
                <p className="landing-community__chapter-summary">{moment.body}</p>
                <a className="landing-community__connection" href="#san-pham">{moment.connection}<ArrowRight aria-hidden="true" /></a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
})
