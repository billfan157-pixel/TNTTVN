import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPreviewIngress } from './verify-preview-ingress.mjs'

const ALIAS = 'tnttvn.vercel.app'

// The public alias is the production entrypoint; the generated deployment URL
// may require Vercel Authentication. Bind the public probes to the exact READY
// deployment from the workflow without sending API credentials to either site.
export async function verifyProductionIngress({ deploymentId, projectId, teamId, token, fetcher = fetch }) {
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId || '') || !projectId || !teamId || !token) {
    throw new Error('Deployment identity and Vercel credentials are required')
  }
  async function checkAlias() {
    const url = new URL(`https://api.vercel.com/v4/aliases/${ALIAS}`)
    url.searchParams.set('teamId', teamId)
    url.searchParams.set('projectId', projectId)
    const response = await fetcher(url.href, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    })
    if (response.status !== 200) throw new Error(`Production alias lookup failed (HTTP ${response.status})`)
    const alias = await response.json()
    if (alias.alias !== ALIAS || alias.deploymentId !== deploymentId
      || alias.projectId !== projectId || alias.redirect) {
      throw new Error('Production alias does not serve the expected deployment and project')
    }
  }
  await checkAlias()
  const ingress = await verifyPreviewIngress(`https://${ALIAS}`, { fetcher })
  await checkAlias()
  return { ...ingress, deploymentId, aliasMappingVerified: true }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await verifyProductionIngress({ deploymentId: process.argv[2],
      projectId: process.env.VERCEL_PROJECT_ID, teamId: process.env.VERCEL_TEAM_ID,
      token: process.env.VERCEL_TOKEN })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (!result.ok) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, message: error?.message || 'Ingress verification failed' })}\n`)
    process.exitCode = 1
  }
}
