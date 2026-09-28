import { DurableObject } from 'cloudflare:workers'
import app from '../app.ts'
import { withPdfRenderer } from '../services/pdfService.ts'
import { client } from '../db/connection.ts'
import { RECOVERY_QUARANTINE_KEY } from '../db/recoveryQuarantine.ts'

// One application shard per deployment keeps CPU-heavy Hono routes within the
// Durable Object invocation budget while Turso remains the only database.
export class BackendShard extends DurableObject {
  async fetch(request) {
    try {
      // The Node boot gate cannot run at Worker module evaluation. Recheck the
      // restore quarantine on every request so a live isolate cannot serve a
      // database that was quarantined after it started.
      const marker = await client.execute({
        sql: 'SELECT key FROM system_settings WHERE key = ? LIMIT 1',
        args: [RECOVERY_QUARANTINE_KEY],
      })
      if (marker.rows.length > 0) return new Response('Database recovery pending', { status: 503 })
    } catch {
      return new Response('Database readiness unavailable', { status: 503 })
    }
    return withPdfRenderer(
      (html, options) => this.env.PDF_JOB.get(this.env.PDF_JOB.idFromName('deployment-pdf-renderer')).renderPdf(html, options),
      () => app.fetch(request, this.env, this.ctx),
    )
  }
}
