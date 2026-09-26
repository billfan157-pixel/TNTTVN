import React from 'react'
import { Church } from 'lucide-react'
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
  },
  {
    id: 'learn',
    number: '02',
    eyebrow: 'Mỗi buổi Giáo lý',
    title: 'Từng buổi học đều đáng được ghi nhớ.',
    body: 'Giáo Lý Viên cần một cách nhẹ nhàng để chăm sóc lớp, theo dõi chuyên cần và nhìn thấy sự tiến bộ của từng em.',
  },
  {
    id: 'family',
    number: '03',
    eyebrow: 'Mỗi gia đình',
    title: 'Sự đồng hành tiếp tục khi trở về nhà.',
    body: 'Phụ huynh có thể theo sát hành trình Giáo lý của con và giữ kết nối với Xứ Đoàn.',
  },
] as const

export const LandingCommunityScene = React.memo(function LandingCommunityScene({ sequential = false, lessonImage, familyImage }: CommunityMedia) {
  return (
    <section id="hanh-trinh" className="landing-community" aria-labelledby="landing-community-title">
      <div id="gioi-thieu-noi-dung" className="landing-community__intro">
        <span className="landing-eyebrow">Catevia · Cùng Xứ Đoàn lớn lên</span>
        <h2 id="landing-community-title">Một hành trình đức tin. <em>Ba cách đồng hành.</em></h2>
        <p>Từ sân nhà thờ đến lớp Giáo lý rồi trở về mỗi gia đình, mọi khoảnh khắc được kết nối trong một không gian chung.</p>
      </div>

      <div className="landing-community__sequence">
        {!sequential && <div className="landing-community__visual" aria-hidden="true">
          <div className="landing-community__visual-panel landing-community__visual-panel--gather">
            <img src="/images/xu-doan-tap-the.jpg" alt="" width="1600" height="1143" loading="lazy" decoding="async" />
            <span>Xứ Đoàn Đức Mẹ Fatima · Giáo Xứ Gia Tôn</span>
          </div>
          <div className="landing-community__visual-panel landing-community__visual-panel--learn">
            {lessonImage ? <img {...lessonImage} alt="" loading="lazy" decoding="async" /> : <div className="landing-community__product"><LandingWorkspacePreview workspace="academic" /></div>}
          </div>
          <div className="landing-community__visual-panel landing-community__visual-panel--family">
            {familyImage ? <img {...familyImage} alt="" loading="lazy" decoding="async" /> : <div className="landing-community__product landing-community__product--phone"><LandingWorkspacePreview workspace="parent" /></div>}
          </div>
          <span className="landing-community__visual-mark"><Church aria-hidden="true" /> Đức Mẹ Fatima</span>
        </div>}

        <div className="landing-community__chapters">
          {MOMENTS.map(moment => (
            <article key={moment.id} className="landing-community__chapter" data-landing-scene={`community-${moment.id}`}>
              <span className="landing-community__chapter-number">{moment.number} / 03</span>
              {sequential && <div className={`landing-community__mobile-visual landing-community__mobile-visual--${moment.id}`} aria-hidden="true">
                {moment.id === 'gather'
                  ? <img src="/images/xu-doan-tap-the.jpg" alt="" width="1600" height="1143" loading="lazy" decoding="async" />
                  : moment.id === 'learn' && lessonImage
                    ? <img {...lessonImage} alt="" loading="lazy" decoding="async" />
                    : moment.id === 'family' && familyImage
                      ? <img {...familyImage} alt="" loading="lazy" decoding="async" />
                      : <LandingWorkspacePreview workspace={moment.id === 'learn' ? 'academic' : 'parent'} />}
              </div>}
              <div>
                <p className="landing-community__chapter-eyebrow">{moment.eyebrow}</p>
                <h3>{moment.title}</h3>
                <p>{moment.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
})
