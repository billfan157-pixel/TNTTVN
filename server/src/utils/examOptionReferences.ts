// A quantifier inside ordinary answer content is not a reference to A/B/C/D.
// Keep this pure text check shared by the server gate and the browser preview.
const optionReferences = [
  /(?:^|[^\p{L}\p{N}])(?:tat ca|ca|khong co|khong)(?:\s+(?:cac|nhung|moi|bat ky|hai|ba|bon|[234]))?\s+(?:dap an|phuong an|lua chon|cau tra loi)(?![\p{L}\p{N}])/u,
  /(?:^|[^\p{L}\p{N}])(?:dap an|phuong an|lua chon|cau tra loi|y|tat ca)\s+(?:o\s+)?(?:tren|duoi)(?![\p{L}\p{N}])/u,
  /(?:^|[^\p{L}\p{N}])(?:dap an|phuong an|lua chon|cau tra loi)\s*[:#]?\s*\(?[a-d](?![\p{L}\p{N}])/u,
  /(?:^|[^\p{L}\p{N}])ca\s+\(?[a-d](?![\p{L}\p{N}])/u,
  /(?:^|[^\p{L}\p{N}])[a-d](?![\p{L}\p{N}])[\s).]*(?:[,;/&+]|va|hoac|hay|and|or|nor)[\s(]*[a-d](?![\p{L}\p{N}])/u,
  /\b(?:all|none|both|neither|either)\s+(?:of\s+)?(?:the\s+)?(?:above|below|answers?|options?|choices?)\b/u,
  /^(?:tat ca|ca (?:hai|ba|bon)|all|none)(?:\s+(?:deu (?:dung|sai)|dung|sai|are correct|is correct))?[.!]?$/u,
]

export function referencesAnswerOptions(value: string): boolean {
  const text = value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd')
    .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi')
  return optionReferences.some(pattern => pattern.test(text))
}
