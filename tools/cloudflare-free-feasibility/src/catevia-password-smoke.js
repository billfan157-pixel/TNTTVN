// Local-only integration probe for Catevia's real password compute adapter.
import { PasswordCpu } from '../../../server/src/cloudflare/passwordCpu.js'
import { withPasswordCpuNamespace, hashPassword, comparePassword } from '../../../server/src/utils/passwordCompute.ts'

export { PasswordCpu }

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/__synthetic_password_smoke') return new Response(null, { status: 404 })
    let rpcCalls = 0
    const namespace = { getByName(name) {
      rpcCalls++
      return env.PASSWORD_CPU.getByName(name)
    } }
    const result = await withPasswordCpuNamespace(namespace, async () => {
      const password = 'Synthetic-Worker-Only@123'
      const hash = await hashPassword(password, 12)
      return {
        rounds: Number(hash.slice(4, 6)),
        matched: await comparePassword(password, hash),
        rejected: await comparePassword('Wrong-Synthetic@123', hash),
      }
    })
    return Response.json({ ...result, rpcCalls }, {
      status: result.rounds === 12 && result.matched && !result.rejected && rpcCalls === 3 ? 200 : 500,
    })
  },
}
