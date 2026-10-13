export const SUBPART_START_REGEX = /^(?:\(?[a-zA-Z]\)|[a-zA-Z][.:]|\(?[ivxIVX]{1,5}\)|\d+\)|\d+(?:\.\d+)+[.)]?|[-–—•])\s+/

/** Only split an inline list when its labels form an actual sequence. */
export function formatEssaySubparts(text: string): string {
  return text.split('\n').map(line => {
    const markers = Array.from(line.matchAll(/(?:^|\s+)(\(?([a-zA-Z]|[ivxIVX]{1,5}|\d{1,2})\)|([a-zA-Z]|[ivxIVX]{1,5})[.:])\s+/g))
    if (markers.length < 2) return line
    const labels = markers.map(marker => (marker[2] ?? marker[3]).toLowerCase())
    const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
    const sequential = labels.every((label, index) =>
      label === String(index + 1) ||
      (labels[0] === 'a' && label === String.fromCharCode(97 + index)) ||
      (labels[0] === 'i' && label === roman[index]),
    )
    if (!sequential) return line
    let result = ''
    let offset = 0
    for (const marker of markers) {
      const start = marker.index! + marker[0].indexOf(marker[1])
      result += line.slice(offset, start).trimEnd()
      if (result) result += '\n'
      offset = start
    }
    return result + line.slice(offset)
  }).join('\n')
}

export function countEssaySubparts(text: string): number {
  return formatEssaySubparts(text).split('\n').filter(line => SUBPART_START_REGEX.test(line.trim())).length
}
