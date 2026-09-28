const base = new URL(process.argv[2] ?? '')
const token = process.env.PROBE_TOKEN
if (base.hostname !== 'catevia-free-feasibility.billfan157.workers.dev' ||
    base.protocol !== 'https:' || !token || token.length < 32) {
  throw new Error('Provide the protected probe URL and PROBE_TOKEN')
}

const endpoint = new URL('/probe/alarm', base)
const headers = { Authorization: `Bearer ${token}` }
const scheduledResponse = await fetch(endpoint, { method: 'POST', headers })
if (!scheduledResponse.ok) throw new Error(`Alarm scheduling returned ${scheduledResponse.status}`)
const scheduled = await scheduledResponse.json()
let result = null
let checks = 0
for (; checks < 10; checks++) {
  const response = await fetch(endpoint, { headers })
  if (!response.ok) throw new Error(`Alarm read returned ${response.status}`)
  result = await response.json()
  if (result?.firedAt) break
  await new Promise(resolve => setTimeout(resolve, 500))
}
const passed = result?.scheduledAt === scheduled.scheduledAt &&
  Number.isFinite(result?.firedAt) && result.firedAt >= result.scheduledAt
console.log(JSON.stringify({
  passed,
  scheduledAt: new Date(scheduled.scheduledAt).toISOString(),
  firedAt: result?.firedAt ? new Date(result.firedAt).toISOString() : null,
  delayMs: result?.firedAt ? result.firedAt - scheduled.scheduledAt : null,
  checks: checks + 1,
}, null, 2))
if (!passed) process.exitCode = 1
