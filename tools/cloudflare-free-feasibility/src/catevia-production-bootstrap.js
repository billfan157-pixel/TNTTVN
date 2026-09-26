// Inert placeholder used only to create the production Worker secret store.
// It has no public workers.dev URL, routes, Cron, or database bindings.
export default {
  fetch() {
    return new Response('Backend cutover pending', { status: 503 })
  },
}
