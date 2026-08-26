/* eslint-disable no-console */
/**
 * E2E THỰC TẾ: Quét phiếu OMR (render thật bằng Chromium) → chấm → ghi điểm tự động vào hệ thống.
 *
 * Chạy: npx tsx scripts/verify-omr-e2e.ts
 *
 * Mô phỏng đầy đủ chuỗi:
 *   1. Render PHIẾU IN THẬT (SVG full-page / HTML integrated từ SSOT examSheets.ts) bằng Puppeteer
 *   2. Chụp ảnh thật → detectAnswersFromImage (OMR engine thật)
 *   3. Gửi kết quả qua HTTP thật → POST /api/exams/:id/results (kèm answers + _confidence như ExamScanModal)
 *   4. POST /complete → finalize → kiểm tra grades / assessment_entries / exam_finalizations / audit trong DB thật
 *
 * Dùng DB temp riêng (DB_PATH) — không đụng dữ liệu production.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const dbDir = mkdtempSync(join(tmpdir(), 'omr-e2e-'))
process.env.DB_PATH = join(dbDir, 'parish-e2e.db')
process.env.PORT = '8897'
process.env.JWT_SECRET = 'omr-e2e-secret-key-0123456789abcdef'
process.env.TELEGRAM_BOT_TOKEN = ''
process.env.OPS_TOKEN = ''

const BASE = 'http://localhost:8897'
const PARISH = 'gia-ton'
const CLASS_ID = 'CLS-TN-1'
const ACADEMIC_YEAR = '2026-2027'
const TOTAL_Q = 50
const MAX_SCORE = 10

type CheckResult = { name: string; pass: boolean; detail: string }
const checks: CheckResult[] = []
function check(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
}

async function main() {
  // ─── Boot: seed + server thật ───
  const { seedIfEmpty } = await import('../server/src/seed.ts')
  await seedIfEmpty()
  const { db } = await import('../server/src/db/index.ts')
  const schema = await import('../server/src/db/schema.ts')
  const { eq, and } = await import('drizzle-orm')

  const studentsSeed = [
    { id: 'st-omr-full', code: 'OMR-FULL', holyName: 'Giu-se', fullName: 'Học Sinh Toàn Phần', gender: 'Nam', dateOfBirth: '2014-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'ThieuNhi', classId: CLASS_ID, parishId: PARISH },
    { id: 'st-omr-40', code: 'OMR-40', holyName: 'Maria', fullName: 'Học Sinh 40/50', gender: 'Nữ', dateOfBirth: '2014-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'ThieuNhi', classId: CLASS_ID, parishId: PARISH },
    { id: 'st-omr-int', code: 'OMR-INT', holyName: 'Anna', fullName: 'Học Sinh Phiếu Gộp', gender: 'Nữ', dateOfBirth: '2014-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'ThieuNhi', classId: CLASS_ID, parishId: PARISH },
    { id: 'st-omr-int2', code: 'OMR-INT2', holyName: 'Tê-rê-sa', fullName: 'Học Sinh Phiếu Gộp In Đơn', gender: 'Nữ', dateOfBirth: '2014-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'ThieuNhi', classId: CLASS_ID, parishId: PARISH },
  ]
  await db.insert(schema.students).values(studentsSeed).onConflictDoNothing()

  await import('../server/src/index.ts')

  // ─── HTTP helper ───
  const api = async (path: string, opts: { method?: string; token?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    const res = await fetch(BASE + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    let body: unknown = null
    try { body = await res.json() } catch { /* ignore */ }
    return { status: res.status, body: body as any }
  }

  // ─── 1. Login thật ───
  const login = await api('/api/auth/login', { method: 'POST', body: { username: 'bill', password: 'admin123', parishId: PARISH } })
  const token: string | undefined = login.body?.data?.accessToken
  check('Login admin qua HTTP thật', login.status === 200 && !!token, `status=${login.status}`)
  if (!token) return finalize()

  // ─── 2. Tạo phiên MC 50 câu (đúng như UI gửi) ───
  const options = ['A', 'B', 'C', 'D']
  const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
  for (let i = 1; i <= TOTAL_Q; i++) answerKey[i] = options[(i - 1) % 4] as 'A' | 'B' | 'C' | 'D'

  const create = await api('/api/exams', {
    method: 'POST',
    token,
    body: {
      classId: CLASS_ID, subject: 'Giáo Lý', scoreType: 'final', maxScore: MAX_SCORE,
      semester: 1, academicYear: ACADEMIC_YEAR, examType: 'multiple_choice',
      questionCount: TOTAL_Q, answerKey: JSON.stringify(answerKey),
    },
  })
  check('Tạo phiên trắc nghiệm 50 câu (201)', create.status === 201, `status=${create.status}`)
  const sessionId: string | undefined = create.body?.data?.id
  if (!sessionId) return finalize()

  // ─── 3. Render phiếu THẬT + quét OMR ───
  const { buildSingleAnswerSheetSvgString, buildBatchExamPapersHtml, buildExamPaperHtml } = await import('../src/utils/examSheets.ts')
  const { mcOptionToCell } = await import('../src/lib/answerSheetTemplate.ts')
  const { detectAnswersFromImage } = await import('../src/lib/omr.ts')
  const puppeteer = (await import('puppeteer')).default

  const studentInfo = (s: typeof studentsSeed[number]) => ({ id: s.id, code: s.code, name: s.fullName })

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  const page = await browser.newPage()

  const captureImageData = async (html: string, w: number, h: number, postLoad?: () => Promise<void>, fullPage = false): Promise<ImageData> => {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 400))
    if (postLoad) await postLoad()
    await new Promise((r) => setTimeout(r, 200))
    const shot = await page.screenshot({ type: 'png', fullPage })
    const b64 = shot.toString('base64')
    const px = await page.evaluate(async (dataUrl) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, c.width, c.height)
      return { data: Array.from(id.data), width: c.width, height: c.height }
    }, `data:image/png;base64,${b64}`)
    return { data: new Uint8ClampedArray(px.data), width: px.width, height: px.height } as unknown as ImageData
  }

  const runOmr = (img: ImageData, label: string) => {
    const res = detectAnswersFromImage(img, answerKey, TOTAL_Q, MAX_SCORE)
    console.log(`  [OMR ${label}] ok=${res.ok} score=${res.score} correct=${res.rawCorrectCount}/${res.totalQuestions} conf=${res.confidence.toFixed(2)} reason=${res.reason}`)
    return res
  }

  // Phiếu FULL-PAGE (SVG thật + tô ô theo tọa độ SSOT như học sinh tô bút chì)
  const VW = 1000
  const VH = Math.round(VW / 0.707)
  const fullPageHtml = (student: typeof studentsSeed[number], fill: Record<number, string>) => {
    const svg = buildSingleAnswerSheetSvgString(studentInfo(student), {
      sessionId: sessionId, subject: 'Giáo Lý', scoreTypeLabel: 'Thi Cuối Kỳ', classLabel: 'Thiếu Nhi 1',
      maxScore: MAX_SCORE, examType: 'multiple_choice', questionCount: TOTAL_Q,
    })
    let bubbles = ''
    for (const [q, opt] of Object.entries(fill)) {
      const cell = mcOptionToCell(Number(q), opt as 'A' | 'B' | 'C' | 'D', TOTAL_Q)
      bubbles += `<circle cx="${(cell.x * VW).toFixed(2)}" cy="${(cell.y * VH).toFixed(2)}" r="17" fill="#16181d"/>`
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;background:#ffffff">${svg.slice(0, svg.lastIndexOf('</svg>'))}${bubbles}${svg.slice(svg.lastIndexOf('</svg>'))}</body></html>`
  }

  // Phiếu INTEGRATED (HTML đề thi thật + tô bubble qua DOM) — dùng buildBatchExamPapersHtml
  // (wrapper .batch-exam-page padding 8mm = đúng điều kiện in thật, marker không bị clip mép)
  const integratedHtml = (student: typeof studentsSeed[number]) => {
    const questions = Array.from({ length: TOTAL_Q }, (_, i) => ({
      index: i + 1,
      question: `Câu hỏi số ${i + 1}: giáo lý về Chúa Giê-su và các mầu nhiệm.`,
      options: { A: 'Đáp án A đúng', B: 'Đáp án B đúng', C: 'Đáp án C đúng', D: 'Đáp án D đúng' },
      correctOption: answerKey[i + 1],
    }))
    return buildBatchExamPapersHtml([studentInfo(student)], {
      parishName: 'Giáo Xứ E2E', dioceseName: 'Giáo Phận Tổng Giáo Phận', subject: 'Giáo Lý',
      classLabel: 'Thiếu Nhi 1', academicYear: ACADEMIC_YEAR, questions,
      includeAnswerGrid: true, includeGradingBox: true, sessionId: sessionId,
    }).replace('</style>', `
      .bubble-filled { background: #16181d !important; color: transparent !important; }
    </style>`)
  }

  // Phiếu INTEGRATED in ĐƠN (buildExamPaperHtml — container lề 8mm, marker không clip mép)
  const integratedSingleHtml = (student: typeof studentsSeed[number]) => {
    const questions = Array.from({ length: TOTAL_Q }, (_, i) => ({
      index: i + 1,
      question: `Câu hỏi số ${i + 1}: giáo lý về Chúa Giê-su và các mầu nhiệm.`,
      options: { A: 'Đáp án A đúng', B: 'Đáp án B đúng', C: 'Đáp án C đúng', D: 'Đáp án D đúng' },
      correctOption: answerKey[i + 1],
    }))
    return buildExamPaperHtml({
      subject: 'Giáo Lý', classLabel: 'Thiếu Nhi 1', academicYear: ACADEMIC_YEAR, questions,
      includeAnswerGrid: true, student: studentInfo(student),
    }).replace('</style>', `
      .bubble-filled { background: #16181d !important; color: transparent !important; }
    </style>`)
  }

  // Đáp án học sinh: A) đúng 50/50 · B) đúng 40 + sai 10 → 8.0 · C) phiếu gộp đúng 50/50
  const fillFull = { ...answerKey }
  const fill40: Record<number, string> = {}
  for (let i = 1; i <= 40; i++) fill40[i] = answerKey[i]
  for (let i = 41; i <= 50; i++) fill40[i] = options[(i - 1 + 1) % 4] // +1 rotate → sai
  const fillInt = { ...answerKey }

  const omrFull = runOmr(await captureImageData(fullPageHtml(studentsSeed[0], fillFull), VW, VH), 'FULL-PAGE 50/50')
  check('OMR phiếu toàn trang: detect 50/50 → 10.0', omrFull.ok && omrFull.score === 10.0 && omrFull.rawCorrectCount === 50, `score=${omrFull.score} correct=${omrFull.rawCorrectCount}`)

  const omr40 = runOmr(await captureImageData(fullPageHtml(studentsSeed[1], fill40), VW, VH), 'FULL-PAGE 40/50')
  check('OMR phiếu toàn trang: 40/50 → 8.0', omr40.ok && omr40.score === 8.0 && omr40.rawCorrectCount === 40, `score=${omr40.score} correct=${omr40.rawCorrectCount}`)

  const omrInt = runOmr(await captureImageData(
    integratedHtml(studentsSeed[2]),
    800, 1131,
    async () => {
      await page.evaluate((fill) => {
        const rows = document.querySelectorAll('.grid-q-row')
        for (const row of Array.from(rows)) {
          const m = row.querySelector('.q-num')?.textContent?.match(/\d+/)
          const q = m ? Number(m[0]) : null
          const opt = q ? (fill as Record<number, string>)[q] : null
          if (!opt) continue
          const bubbles = row.querySelectorAll('.bubble')
          const idx = { A: 0, B: 1, C: 2, D: 3 }[opt as 'A' | 'B' | 'C' | 'D']
          if (bubbles[idx]) bubbles[idx].classList.add('bubble-filled')
        }
      }, fillInt)
    },
  ), 'INTEGRATED 50/50')
  check('OMR phiếu gộp (integrated): detect 50/50 → 10.0', omrInt.ok && omrInt.score === 10.0 && omrInt.rawCorrectCount === 50, `score=${omrInt.score} correct=${omrInt.rawCorrectCount}`)

  const omrInt2 = runOmr(await captureImageData(
    integratedSingleHtml(studentsSeed[3]),
    800, 1131,
    async () => {
      await page.evaluate((fill) => {
        const rows = document.querySelectorAll('.grid-q-row')
        for (const row of Array.from(rows)) {
          const m = row.querySelector('.q-num')?.textContent?.match(/\d+/)
          const q = m ? Number(m[0]) : null
          const opt = q ? (fill as Record<number, string>)[q] : null
          if (!opt) continue
          const bubbles = row.querySelectorAll('.bubble')
          const idx = { A: 0, B: 1, C: 2, D: 3 }[opt as 'A' | 'B' | 'C' | 'D']
          if (bubbles[idx]) bubbles[idx].classList.add('bubble-filled')
        }
      }, fillInt)
    },
  ), 'INTEGRATED SINGLE-PRINT 50/50')
  check('OMR phiếu gộp in đơn (single-print): detect 50/50 → 10.0', omrInt2.ok && omrInt2.score === 10.0 && omrInt2.rawCorrectCount === 50, `score=${omrInt2.score} correct=${omrInt2.rawCorrectCount}`)

  // ─── 4. Lưu kết quả qua HTTP (đúng format ExamScanModal: answers kèm _confidence) ───
  const toAnswers = (res: typeof omrFull): string => {
    const map: Record<string, string | null> = {}
    for (const q of res.questions) map[String(q.questionIndex)] = q.selectedAnswer
    map._confidence = String(Math.round(res.confidence * 100) / 100)
    return JSON.stringify(map)
  }

  const save = await api(`/api/exams/${sessionId}/results`, {
    method: 'POST',
    token,
    body: {
      results: [
        { studentId: 'st-omr-full', score: omrFull.score, source: 'qr_scan', answers: toAnswers(omrFull) },
        { studentId: 'st-omr-40', score: omr40.score, source: 'qr_scan', answers: toAnswers(omr40) },
        { studentId: 'st-omr-int', score: omrInt.score, source: 'qr_scan', answers: toAnswers(omrInt) },
        { studentId: 'st-omr-int2', score: omrInt2.score, source: 'qr_scan', answers: toAnswers(omrInt2) },
      ],
    },
  })
  check('Lưu 4 kết quả quét (answers kèm _confidence không bị chặn)', save.status === 200, `status=${save.status} saved=${save.body?.data?.saved ?? save.body?.data?.total}`)

  const getResults = await api(`/api/exams/${sessionId}/results`, { token })
  const rows = getResults.body?.data?.results ?? getResults.body?.data ?? []
  const rowFull = rows.find((r: any) => r.studentId === 'st-omr-full')
  const rowInt = rows.find((r: any) => r.studentId === 'st-omr-int')
  check('GET results: answers lưu đầy đủ (kể cả _confidence)', !!rowFull && JSON.parse(rowFull.answers)?._confidence !== undefined && JSON.parse(rowFull.answers)?.['1'] !== undefined, `answers=${rowFull?.answers?.slice(0, 60)}`)
  check('GET results: điểm học sinh đúng', rowFull?.score === 10.0 && rowInt?.score === 10.0, `full=${rowFull?.score} int=${rowInt?.score}`)

  // ─── 5. Hoàn tất → tự động ghi điểm ───
  const complete = await api(`/api/exams/${sessionId}/complete`, { method: 'POST', token })
  check('Hoàn tất phiên (complete → completed)', complete.status === 200 && complete.body?.data?.status === 'completed', `status=${complete.status} session=${complete.body?.data?.status}`)

  const gradesRows = await db.select().from(schema.grades).where(eq(schema.grades.parishId, PARISH))
  const gFull = gradesRows.find((g: any) => g.studentId === 'st-omr-full')
  const g40 = gradesRows.find((g: any) => g.studentId === 'st-omr-40')
  const gInt = gradesRows.find((g: any) => g.studentId === 'st-omr-int')
  const gInt2 = gradesRows.find((g: any) => g.studentId === 'st-omr-int2')
  check('DB: grades.scoreFinal = 10 (học sinh toàn phần)', gFull?.scoreFinal === 10.0, `scoreFinal=${gFull?.scoreFinal}`)
  check('DB: grades.scoreFinal = 8 (40/50 câu)', g40?.scoreFinal === 8.0, `scoreFinal=${g40?.scoreFinal}`)
  check('DB: grades.scoreFinal = 10 (phiếu gộp)', gInt?.scoreFinal === 10.0, `scoreFinal=${gInt?.scoreFinal}`)
  check('DB: grades.scoreFinal = 10 (phiếu gộp in đơn)', gInt2?.scoreFinal === 10.0, `scoreFinal=${gInt2?.scoreFinal}`)
  const srcOk = gFull && g40 && gInt && gInt2 && gFull.scoreFinalSource === 'exam_scan' && g40.scoreFinalSource === 'exam_scan' && gInt.scoreFinalSource === 'exam_scan' && gInt2.scoreFinalSource === 'exam_scan'
  check('DB: nguồn điểm = exam_scan (truy vết OMR)', !!srcOk, `source=${gFull?.scoreFinalSource},${g40?.scoreFinalSource},${gInt?.scoreFinalSource},${gInt2?.scoreFinalSource}`)
  const metaOk = gFull && gFull.semester === 1 && gFull.academicYear === ACADEMIC_YEAR
  check('DB: semester + academicYear ghi đúng', !!metaOk, `semester=${gFull?.semester} year=${gFull?.academicYear}`)

  const finalizations = await db.select().from(schema.examFinalizations).where(eq(schema.examFinalizations.examSessionId, sessionId))
  const items = await db.select().from(schema.examFinalizationItems).where(eq(schema.examFinalizationItems.finalizationId, finalizations[0]?.id ?? 'none'))
  check('DB: exam_finalizations ledger 1 bản ghi', finalizations.length === 1, `count=${finalizations.length}`)
  check('DB: exam_finalization_items 4 mục committed', items.length === 4 && items.every((i: any) => i.status === 'committed'), `count=${items.length} statuses=${items.map((i: any) => i.status).join(',')}`)

  const audits = await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.parishId, PARISH), eq(schema.auditLogs.entityId, sessionId)))
  check('DB: audit EXAM_FINALIZE + EXAM_SAVE_RESULTS ghi đủ', audits.some((a: any) => a.action === 'EXAM_FINALIZE') && audits.some((a: any) => a.action === 'EXAM_SAVE_RESULTS'), `actions=${audits.map((a: any) => a.action).join(',')}`)

  await browser.close()

  // ─── Tổng kết ───
  function finalize() {
    const failed = checks.filter((c) => !c.pass)
    console.log('\n══════════════════════════════════════════')
    console.log(`KẾT QUẢ: ${checks.length - failed.length}/${checks.length} PASS`)
    if (failed.length > 0) {
      console.log('FAILED:')
      for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
      process.exit(1)
    }
    console.log('✅ TOÀN BỘ LUỒNG OMR SCAN → CHẤM → GHI ĐIỂM HOẠT ĐỘNG ĐÚNG')
    rmSync(dbDir, { recursive: true, force: true })
    process.exit(0)
  }

  finalize()
}

main().catch((err) => {
  console.error('E2E CRASHED:', err)
  process.exit(2)
})
