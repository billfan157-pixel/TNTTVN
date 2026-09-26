const measurements = []
let text = ''
let depth = 0
let inString = false
let escaped = false

function accept(recordText) {
  try {
    const record = JSON.parse(recordText)
    let path = null
    try { path = new URL(record.event?.request?.url).pathname } catch {}
    measurements.push({
      scriptName: record.scriptName ?? null,
      executionModel: record.executionModel ?? null,
      entrypoint: record.entrypoint ?? null,
      path,
      outcome: record.outcome ?? null,
      cpuTime: Number.isFinite(record.cpuTime) ? record.cpuTime : null,
      wallTime: Number.isFinite(record.wallTime) ? record.wallTime : null,
      status: Number.isFinite(record.event?.response?.status) ? record.event.response.status : null,
    })
  } catch {
    // Ignore non-JSON status text from Wrangler.
  }
}

for await (const chunk of process.stdin) {
  for (const char of chunk.toString()) {
    if (depth === 0) {
      if (char === '{') {
        text = '{'
        depth = 1
        inString = false
        escaped = false
      }
      continue
    }
    text += char
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) accept(text)
    }
  }
}

const groups = Object.groupBy(measurements, item => `${item.scriptName}:${item.executionModel}:${item.entrypoint}:${item.path}`)
const summary = {}
for (const [key, items] of Object.entries(groups)) {
  const cpus = items.map(item => item.cpuTime).filter(Number.isFinite).sort((a, b) => a - b)
  const walls = items.map(item => item.wallTime).filter(Number.isFinite).sort((a, b) => a - b)
  const percentile = (values, quantile) => values.length ? values[Math.ceil(values.length * quantile) - 1] : null
  summary[key] = {
    invocations: items.length,
    statusCounts: Object.fromEntries([...new Set(items.map(item => String(item.status)))].map(status =>
      [status, items.filter(item => String(item.status) === status).length])),
    cpuTimeMs: { p50: percentile(cpus, 0.5), p95: percentile(cpus, 0.95), max: cpus.at(-1) ?? null },
    wallTimeMs: { p50: percentile(walls, 0.5), p95: percentile(walls, 0.95), max: walls.at(-1) ?? null },
    outcomes: Object.fromEntries([...new Set(items.map(item => item.outcome))].map(outcome =>
      [outcome, items.filter(item => item.outcome === outcome).length])),
  }
}
process.stdout.write(`${JSON.stringify({ invocations: measurements.length, summary }, null, 2)}\n`)
