import { referencesAnswerOptions } from './examOptionReferences.js'

export const SHUFFLE_OPTION_CODES = ['A', 'B', 'C', 'D'] as const
export type ShuffleOptionCode = typeof SHUFFLE_OPTION_CODES[number]
export type SmartShuffleMode = 'questions_and_options' | 'questions_only' | 'options_only'
export type ExamShufflePolicy = 'fixed_aggregates' | 'rewrite_aggregates'
export const EXAM_SHUFFLE_POLICIES = ['fixed_aggregates', 'rewrite_aggregates'] as const
const CODES = SHUFFLE_OPTION_CODES

export interface ShuffleSourceQuestion {
  index: number
  question: string
  type?: 'multiple_choice' | 'essay'
  options?: Record<ShuffleOptionCode, string>
  correctOption?: ShuffleOptionCode
  explanation?: string
}
type Field = 'question' | 'explanation' | ShuffleOptionCode
interface ReferenceToken { start: number; end: number; target: ShuffleOptionCode }
interface Aggregate {
  owner: ShuffleOptionCode
  targets: ShuffleOptionCode[]
  scope: 'before' | 'after' | 'others'
  operator: 'all' | 'none'
  english: boolean
  tail: string
}
export interface ShuffleQuestionSummary {
  sourceIndex: number
  status: 'free' | 'constrained' | 'held'
  validOrderCount: number
  reasons: string[]
  references: Array<{ field: Field; targets: ShuffleOptionCode[] }>
  aggregates: Array<{ choice: ShuffleOptionCode; targets: ShuffleOptionCode[]; scope: Aggregate['scope']; operator: Aggregate['operator'] }>
}
interface QuestionPlan {
  source: ShuffleSourceQuestion
  summary: ShuffleQuestionSummary
  tokens: Partial<Record<Field, ReferenceToken[]>>
  aggregates: Aggregate[]
  variants: Array<{ order: ShuffleOptionCode[]; question: ShuffleSourceQuestion; signature: string }>
}
export interface ShuffleLayout {
  questions: Array<{ sourceIndex: number; order: ShuffleOptionCode[]; rendered: ShuffleSourceQuestion }>
}
export interface ExamShufflePlan {
  summaries: ShuffleQuestionSummary[]
  questionOrderLocked: boolean
  orderReasons: string[]
  layouts: ShuffleLayout[]
  capacityExact: boolean
}

export function normalizeShuffleText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim()
}
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase()
}
// Offsets belong to the original UTF-16 string, including decomposed accents.
function foldedSource(value: string) {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  let offset = 0
  for (const character of value) {
    const normalized = fold(character)
    if (!normalized && ends.length) ends[ends.length - 1] = offset + character.length
    for (let i = 0; i < normalized.length; i++) {
      starts.push(offset)
      ends.push(offset + character.length)
    }
    text += normalized
    offset += character.length
  }
  return { text, starts, ends }
}
const LABEL = '\\(?[a-d]\\)?'
const JOIN = '(?:[,;/&+]|va|hoac|hay|and|or|nor)'
const CHAIN = LABEL + '(?:\\s*' + JOIN + '\\s*' + LABEL + ')*'
const NOUN = '(?:dap an|dap|phuong an|lua chon|cau tra loi|y|answers?|options?|choices?)'
const PREFIX = '(?:ca|both|neither|either|' + NOUN + '(?:\\s+(?:dung|chinh xac|bi mat|la|is|are|correct)){0,3})'
const ANY_LABEL = '\\(?[a-z]\\)?'
const ANY_CHAIN = ANY_LABEL + '(?:\\s*' + JOIN + '\\s*' + ANY_LABEL + ')*'
const ANY_CONTEXT = new RegExp('(?:^|[^\\p{L}\\p{N}_])' + PREFIX + '\\s*[:#]?\\s*(' + ANY_CHAIN + ')(?![\\p{L}\\p{N}_])', 'gu')
const CONTEXT = new RegExp('(?:^|[^\\p{L}\\p{N}_])' + PREFIX + '\\s*[:#]?\\s*(' + CHAIN + ')(?![\\p{L}\\p{N}_])', 'gu')
const LIST = new RegExp('^\\s*(' + LABEL + '(?:\\s*' + JOIN + '\\s*' + LABEL + ')+)\\s+(?:(?:deu|la|are|is)\\s+)?(?:dung|sai|chinh xac|correct|incorrect|true|false)(?![\\p{L}\\p{N}])', 'u')
const SINGLE_EXPLANATION = /^\s*([a-d])\s+(?:dung|sai|la dap an|is correct|is incorrect)(?![\p{L}\p{N}])/u

function labelsIn(value: string, alphabet: string) {
  const pattern = new RegExp('(^|[^\\p{L}\\p{N}_])([' + alphabet + '])(?![\\p{L}\\p{N}_])', 'gu')
  return [...value.matchAll(pattern)].map(match => ({ label: match[2], index: match.index! + match[1].length }))
}

function parseReferences(value: string, explanation = false): { tokens: ReferenceToken[]; uncertain: boolean } {
  const normalized = foldedSource(value)
  const ranges: Array<[number, number]> = []
  const recognized: Array<[number, number]> = []
  for (const match of normalized.text.matchAll(CONTEXT)) {
    const start = match.index! + match[0].lastIndexOf(match[1])
    const rawLabels = value.slice(normalized.starts[start], normalized.ends[start + match[1].length - 1])
    // English "both a man and a woman" / "answer a question" contain articles,
    // not choice A. Lowercase English candidates remain literal or held.
    if (/^(?:both|neither|either|answers?|options?|choices?)/u.test(match[0].replace(/^[^\p{L}\p{N}_]+/u, '')) &&
      labelsIn(rawLabels, 'a-d').length > 0) continue
    ranges.push([start, start + match[1].length])
    recognized.push([match.index!, match.index! + match[0].length])
  }
  const list = normalized.text.match(LIST)
  if (list) {
    const start = list.index! + list[0].indexOf(list[1])
    ranges.push([start, start + list[1].length])
    recognized.push([list.index!, list.index! + list[0].length])
  }
  const single = explanation ? normalized.text.match(SINGLE_EXPLANATION) : null
  if (single) {
    const start = single[0].indexOf(single[1])
    ranges.push([start, start + 1])
    recognized.push([0, single[0].length])
  }
  const byOffset = new Map<number, ReferenceToken>()
  let invalidToken = false
  for (const [start, end] of ranges) {
    const fragment = normalized.text.slice(start, end)
    for (const match of labelsIn(fragment, 'a-d')) {
      const at = start + match.index
      if (!/^[A-Da-d]$/u.test(value.slice(normalized.starts[at], normalized.ends[at]))) {
        invalidToken = true
        continue
      }
      byOffset.set(normalized.starts[at], { start: normalized.starts[at], end: normalized.ends[at], target: match.label.toUpperCase() as ShuffleOptionCode })
    }
  }
  const tokens = [...byOffset.values()].sort((a, b) => a.start - b.start)
  let remainder = value
  // Process disjoint ranges in source order; overlapping recognition is harmless.
  const covered = recognized.sort((a, b) => a[0] - b[0]).reduce<Array<[number, number]>>((result, range) => {
    const previous = result[result.length - 1]
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1])
    else result.push([...range])
    return result
  }, [])
  for (const [start, end] of covered.reverse()) {
    const sourceStart = normalized.starts[start]
    const sourceEnd = normalized.ends[end - 1]
    if (sourceStart !== undefined && sourceEnd !== undefined) remainder = remainder.slice(0, sourceStart) + ' lựa chọn ' + remainder.slice(sourceEnd)
  }
  const dangling = [...normalized.text.matchAll(ANY_CONTEXT)].some(match =>
    labelsIn(match[1], 'a-z').some(label => !CODES.includes(label.label.toUpperCase() as ShuffleOptionCode)))
  const uncertain = invalidToken || dangling || referencesAnswerOptions(remainder) ||
    (explanation && labelsIn(remainder, 'A-D').length > 0) ||
    (tokens.length > 0 && labelsIn(remainder, 'A-Z').length > 0) ||
    /(?:tat ca|khong co|khong)\s+(?:(?:cac|nhung|moi)\s+)?dap(?![\p{L}\p{N}])/u.test(fold(remainder)) ||
    /(?:^|[^\p{L}\p{N}])[a-d]\s+(?:dung|sai|lon hon|nho hon|is correct|is incorrect)(?![\p{L}\p{N}])/u.test(fold(remainder)) ||
    (tokens.length > 0 && /(?:^|[^\p{L}\p{N}])(?:tren|duoi|above|below)(?![\p{L}\p{N}])/u.test(normalized.text)) ||
    /(?:hai|ba|bon|[234])\s+(?:y|dap an|phuong an)\s+(?:dau|cuoi)|(?:nhung|cac)\s+(?:dap an|phuong an)\s+do/u.test(fold(remainder))
  return { tokens, uncertain }
}

function parseAggregate(value: string, owner: ShuffleOptionCode): Aggregate | undefined {
  const normalized = foldedSource(value)
  const trimmed = normalized.text.trim()
  // Only complete templates qualify. Exceptions such as "trừ B" stay held.
  const vietnamese = /^(?<head>(?:tat ca|ca (?:hai|ba|bon|[234]))(?:\s+(?:cac|nhung|moi))?(?:\s+(?:dap an|dap|phuong an|lua chon|cau tra loi|y))?(?:\s+(?:o\s+)?(?:tren|duoi))?|(?:khong co|khong)(?:\s+(?:dap an|dap|phuong an|lua chon|cau tra loi|y))(?:\s+nao)?(?:\s+(?:o\s+)?(?:tren|duoi))?|(?:cac|nhung)\s+(?:dap an|phuong an|lua chon|y)(?:\s+o)?\s+(?:tren|duoi))(?<tail>(?:\s+(?:deu\s+)?(?:la\s+)?(?:dung|sai|chinh xac))?)[.!?…]*$/u
  const english = /^(?<head>(?:all|none)(?:\s+of)?(?:\s+the)?(?:\s+(?:above|below|answers?|options?|choices?))?)(?<tail>(?:\s+(?:(?:are|is)\s+)?(?:correct|incorrect|true|false))?)[.!?]*$/u
  const match = trimmed.match(vietnamese) ?? trimmed.match(english)
  if (!match?.groups) return undefined
  const head = match.groups.head
  const scope = /\b(?:tren|above)\b/u.test(head) ? 'before' : /\b(?:duoi|below)\b/u.test(head) ? 'after' : 'others'
  const position = CODES.indexOf(owner)
  const targets = CODES.filter((_, index) => scope === 'before' ? index < position : scope === 'after' ? index > position : index !== position)
  if (targets.length === 0) return undefined
  const mentionedCount = head.match(/\b(?:hai|ba|bon|[234])\b/u)?.[0]
  if (mentionedCount) {
    const count = ({ hai: 2, ba: 3, bon: 4 } as Record<string, number>)[mentionedCount] ?? Number(mentionedCount)
    if (count !== targets.length) return undefined
  }
  const headStart = normalized.text.indexOf(head)
  const headEnd = normalized.ends[headStart + head.length - 1]
  return { owner, targets, scope, operator: /^(?:khong|none)/u.test(head) ? 'none' : 'all',
    english: /^(?:all|none)/u.test(head), tail: value.slice(headEnd) }
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]]
  return values.flatMap((value, at) => permutations(values.filter((_, index) => index !== at)).map(rest => [value, ...rest]))
}
const OPTION_ORDERS = permutations(CODES)
function labelsFor(targets: ShuffleOptionCode[], order: readonly ShuffleOptionCode[]) {
  return targets.map(id => CODES[order.indexOf(id)])
}
function joinLabels(labels: readonly string[], english = false): string {
  if (labels.length === 1) return labels[0]
  return labels.slice(0, -1).join(', ') + (english ? ' and ' : ' và ') + labels[labels.length - 1]
}
function replaceTokens(text: string, tokens: ReferenceToken[], order: readonly ShuffleOptionCode[]): string {
  let result = text
  for (const token of [...tokens].reverse()) result = result.slice(0, token.start) + CODES[order.indexOf(token.target)] + result.slice(token.end)
  return result
}
function sameSet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every(value => right.includes(value))
}
function paperSignature(question: ShuffleSourceQuestion): string {
  return JSON.stringify([normalizeShuffleText(question.question), question.type ?? 'multiple_choice',
    CODES.map(code => question.options ? normalizeShuffleText(question.options[code]) : null)])
}
function materialize(plan: QuestionPlan, order: ShuffleOptionCode[], policy: ExamShufflePolicy): ShuffleSourceQuestion {
  const source = plan.source
  if (order.every((code, index) => code === CODES[index])) return { ...source, options: { ...source.options! } }
  const rewriteField = (field: Field, value: string) => {
    const aggregate = plan.aggregates.find(item => item.owner === field)
    if (aggregate && policy === 'rewrite_aggregates') {
      const position = order.indexOf(aggregate.owner)
      const actual = aggregate.scope === 'before' ? order.slice(0, position) : aggregate.scope === 'after' ? order.slice(position + 1) : order.filter(id => id !== aggregate.owner)
      if (!sameSet(actual, aggregate.targets)) {
        const labels = joinLabels(labelsFor(aggregate.targets, order), aggregate.english)
        const prefix = aggregate.english
          ? (aggregate.operator === 'all' ? 'All of the options ' : 'None of the options ') + labels
          : (aggregate.operator === 'all' ? 'Cả ' : 'Không có phương án nào trong ') + labels
        return prefix + aggregate.tail
      }
    }
    return replaceTokens(value, plan.tokens[field] ?? [], order)
  }
  return { ...source, question: rewriteField('question', source.question),
    ...(source.explanation !== undefined ? { explanation: rewriteField('explanation', source.explanation) } : {}),
    options: Object.fromEntries(CODES.map((code, index) => [code, rewriteField(order[index], source.options![order[index]])])) as Record<ShuffleOptionCode, string>,
    correctOption: CODES[order.indexOf(source.correctOption!)] }
}

function planQuestion(source: ShuffleSourceQuestion, mode: SmartShuffleMode, policy: ExamShufflePolicy, hold: boolean, holdReason?: string): QuestionPlan {
  const summary: ShuffleQuestionSummary = { sourceIndex: source.index, status: 'free', validOrderCount: 24, reasons: [], references: [], aggregates: [] }
  const plan: QuestionPlan = { source, summary, tokens: {}, aggregates: [], variants: [] }
  let uncertain = hold
  if (hold) summary.reasons.push(holdReason ?? 'Giữ thứ tự lựa chọn theo yêu cầu của giáo viên.')
  const graph = new Map<ShuffleOptionCode, ShuffleOptionCode[]>()
  for (const field of ['question', ...CODES, 'explanation'] as const) {
    const value = field === 'question' || field === 'explanation' ? source[field] : source.options![field]
    if (!value) continue
    const aggregate = CODES.includes(field as ShuffleOptionCode) ? parseAggregate(value, field as ShuffleOptionCode) : undefined
    if (aggregate) {
      plan.aggregates.push(aggregate)
      summary.aggregates.push({ choice: aggregate.owner, targets: aggregate.targets, scope: aggregate.scope, operator: aggregate.operator })
      graph.set(aggregate.owner, aggregate.targets)
      continue
    }
    const parsed = parseReferences(value, field === 'explanation')
    if (parsed.uncertain) {
      uncertain = true
      summary.reasons.push((CODES.includes(field as ShuffleOptionCode) ? 'Lựa chọn ' + field : field === 'question' ? 'Thân câu' : 'Lời giải') + ': chưa xác định chắc chắn phạm vi tham chiếu.')
    }
    if (parsed.tokens.length) {
      plan.tokens[field] = parsed.tokens
      const targets = [...new Set(parsed.tokens.map(token => token.target))]
      summary.references.push({ field, targets })
      if (CODES.includes(field as ShuffleOptionCode)) graph.set(field as ShuffleOptionCode, targets)
    }
  }
  const visits = new Set<ShuffleOptionCode>()
  const complete = new Set<ShuffleOptionCode>()
  function cyclic(code: ShuffleOptionCode): boolean {
    if (visits.has(code)) return true
    if (complete.has(code)) return false
    visits.add(code)
    if ((graph.get(code) ?? []).some(cyclic)) return true
    visits.delete(code)
    complete.add(code)
    return false
  }
  if (CODES.some(cyclic)) {
    uncertain = true
    summary.reasons.push('Có tham chiếu vào chính lựa chọn hoặc vòng tham chiếu; giữ nguyên lựa chọn để xem lại.')
  }
  summary.status = uncertain ? 'held' : plan.aggregates.length || summary.references.length ? 'constrained' : 'free'
  if (!uncertain && plan.aggregates.length) {
    summary.reasons.push(policy === 'rewrite_aggregates' ? 'Cập nhật cách diễn đạt tổng hợp khi vị trí mới làm thay đổi phạm vi trên/dưới.'
      : 'Giữ ' + plan.aggregates.map(item => item.owner).join(', ') + '; trộn những lựa chọn trong đúng phạm vi gốc.')
  }
  if (!uncertain && summary.references.length) summary.reasons.push('Cập nhật nhãn tham chiếu theo lựa chọn gốc.')
  const orders = mode === 'questions_only' || uncertain ? [[...CODES]] : OPTION_ORDERS.filter(order =>
    plan.aggregates.every(aggregate => {
      if (policy === 'rewrite_aggregates') return true
      const position = order.indexOf(aggregate.owner)
      if (position !== CODES.indexOf(aggregate.owner)) return false
      const actual = aggregate.scope === 'before' ? order.slice(0, position) : aggregate.scope === 'after' ? order.slice(position + 1) : order.filter(id => id !== aggregate.owner)
      return sameSet(actual, aggregate.targets)
    }))
  const seen = new Set<string>()
  for (const order of orders) {
    const question = uncertain || mode === 'questions_only' ? { ...source, options: { ...source.options! } } : materialize(plan, order, policy)
    if (new Set(CODES.map(code => normalizeShuffleText(question.options![code]).toLowerCase())).size !== 4) continue
    const signature = paperSignature(question)
    if (!seen.has(signature)) {
      seen.add(signature)
      plan.variants.push({ order: [...order], question, signature })
    }
  }
  summary.validOrderCount = plan.variants.length
  return plan
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let at = result.length - 1; at > 0; at--) {
    const swap = Math.floor(random() * (at + 1))
    ;[result[at], result[swap]] = [result[swap], result[at]]
  }
  return result
}
function* uniqueOrders<T>(values: readonly T[], key: (value: T) => string): Generator<T[]> {
  const current = [...values].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)
  while (true) {
    yield [...current]
    let pivot = current.length - 2
    while (pivot >= 0 && key(current[pivot]) >= key(current[pivot + 1])) pivot--
    if (pivot < 0) return
    let next = current.length - 1
    while (key(current[next]) <= key(current[pivot])) next--
    ;[current[pivot], current[next]] = [current[next], current[pivot]]
    current.push(...current.splice(pivot + 1).reverse())
  }
}
function* combinations(counts: number[]): Generator<number[]> {
  if (counts.some(count => count < 1)) return
  const digits = counts.map(() => 0)
  while (true) {
    yield [...digits]
    let at = digits.length - 1
    while (at >= 0 && ++digits[at] === counts[at]) digits[at--] = 0
    if (at < 0) return
  }
}

// A fresh deterministic stream keeps browser preflight independent of call order.
function previewRandom(): () => number {
  let state = 0x43545633
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Pure shared compiler. It never evaluates truth or chooses the correct answer. */
export function planExamShuffle(
  questions: readonly ShuffleSourceQuestion[], mode: SmartShuffleMode,
  policy: ExamShufflePolicy = 'fixed_aggregates', heldQuestionIndices: readonly number[] = [],
  random: () => number = previewRandom(),
): ExamShufflePlan {
  const mc = [...questions].filter(question => question.type !== 'essay').sort((a, b) => a.index - b.index)
  const crossFields = questions.flatMap(question => [question.question, question.explanation ?? '', ...Object.values(question.options ?? {})])
    .filter(text => /(?:^|[^\p{L}\p{N}])(?:cau|question)\s+(?:so\s+)?(?:\d+|tren|duoi|truoc|sau|above|below)(?![\p{L}\p{N}])|(?:hai|ba|bon|[234])\s+cau\s+(?:dau|cuoi)|(?:doan van|bai doc|hinh|bang)\s+(?:o\s+)?(?:tren|duoi)/u.test(fold(text)))
  const crossQuestionReference = crossFields.length > 0
  const crossChoiceReference = crossFields.some(text => referencesAnswerOptions(text) || labelsIn(text, 'A-D').length > 0)
  const plans = mc.map(question => planQuestion(question, mode, policy, crossChoiceReference || heldQuestionIndices.includes(question.index),
    crossChoiceReference ? 'Có tham chiếu lựa chọn giữa các câu; giữ lựa chọn để giáo viên xem lại.' : undefined))
  const questionOrderLocked = mode === 'options_only' || crossQuestionReference
  const orderReasons = crossQuestionReference ? ['Có tham chiếu vị trí câu khác; giữ thứ tự câu để bảo toàn nội dung.'] : []
  const summaries = plans.map(plan => plan.summary)
  const layouts: ShuffleLayout[] = []
  const seen = new Set<string>()
  function append(ordered: QuestionPlan[], digits: number[], variants: Map<QuestionPlan, QuestionPlan['variants']>): void {
    if (ordered.some((plan, at) => !variants.get(plan)?.[digits[at]])) return
    const selected = ordered.map((plan, at) => ({ plan, variant: variants.get(plan)![digits[at]] }))
    const signature = JSON.stringify(selected.map(item => item.variant.signature))
    if (seen.has(signature)) return
    seen.add(signature)
    layouts.push({ questions: selected.map(({ plan, variant }) => ({ sourceIndex: plan.source.index, order: [...variant.order], rendered: variant.question })) })
  }
  const originalVariants = new Map(plans.map(plan => [plan, plan.variants]))
  append(plans, plans.map(() => 0), originalVariants)
  const variants = new Map(plans.map(plan => [plan, shuffled(plan.variants, random)]))
  // Diversify every question/code first. The complete mixed-radix fallback below
  // establishes capacity; it must not make B-H differ only at the last question.
  for (let attempt = 0; attempt < 32 && layouts.length < 8; attempt++) {
    const ordered = questionOrderLocked ? plans : shuffled(plans, random)
    append(ordered, ordered.map(plan => Math.floor(random() * variants.get(plan)!.length)), variants)
  }
  if (layouts.length === 8) return { summaries, questionOrderLocked, orderReasons, layouts, capacityExact: false }
  const family = new Map(plans.map(plan => [plan, JSON.stringify(plan.variants.map(variant => variant.signature).sort())]))
  const ranks = new Map(shuffled([...new Set(family.values())], random).map((key, index) => [key, String(index).padStart(3, '0')]))
  const questionOrders = questionOrderLocked ? [plans] : uniqueOrders(plans, plan => ranks.get(family.get(plan)!)!)
  let attempted = 0
  for (const ordered of questionOrders) {
    for (const digits of combinations(ordered.map(plan => variants.get(plan)!.length))) {
      append(ordered, digits, variants)
      if (layouts.length === 8) return { summaries, questionOrderLocked, orderReasons, layouts, capacityExact: false }
      if (++attempted >= 10000) return { summaries, questionOrderLocked, orderReasons, layouts, capacityExact: false }
    }
  }
  return { summaries, questionOrderLocked, orderReasons, layouts, capacityExact: true }
}
