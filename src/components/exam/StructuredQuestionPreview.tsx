import type { ExamQuestion } from '../../types'
import { questionFormatLabel } from '../../utils/structuredQuestions'

export function StructuredQuestionPreview({ question, showAnswers = false }: { question: ExamQuestion; showAnswers?: boolean }) {
  const data = question.answerData
  if (!question.responseFormat && !data?.subparts?.length) return null
  return <div className="min-w-0 space-y-2 text-xs" aria-label={`Cấu trúc câu ${question.index}`}>
    <p className="m-0 font-bold text-parish-primary">{questionFormatLabel(question)}{data?.subparts?.length ? ` · ${data.subparts.length} ý nhỏ` : ''}</p>
    {data?.wordBank?.length ? <p className="m-0 text-text-secondary">Từ cho sẵn: {data.wordBank.join(' · ')}</p> : null}
    {question.responseFormat === 'matching' && data?.left && data.right && <table className="w-full table-fixed border-collapse text-left">
      <thead><tr><th className="border border-surface-border p-2">Cột A</th><th className="border border-surface-border p-2">Cột B</th></tr></thead>
      <tbody>{Array.from({ length: Math.max(data.left.length, data.right.length) }, (_, index) => <tr key={index}>
        <td className="break-words border border-surface-border p-2 align-top">{data.left?.[index] && `${data.left[index].id}. ${data.left[index].text}`}</td>
        <td className="break-words border border-surface-border p-2 align-top">{data.right?.[index] && `${data.right[index].id}. ${data.right[index].text}`}</td>
      </tr>)}</tbody>
    </table>}
    {showAnswers && data?.blanks && <ul className="m-0 list-disc pl-5">{data.blanks.map(blank => <li key={blank.id}>Ô {blank.id}: {blank.acceptedAnswers.join(' / ') || 'Chưa nhập đáp án'}</li>)}</ul>}
    {showAnswers && data?.pairs?.length ? <p className="m-0">Đáp án: {data.pairs.map(pair => `${pair.leftId} → ${pair.rightId}`).join('; ')}</p> : null}
    {data?.subparts?.length ? <ul className="m-0 list-disc pl-5">{data.subparts.map((part, index) => <li key={index}>{part.label} {part.text}</li>)}</ul> : null}
  </div>
}
