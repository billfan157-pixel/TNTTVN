// Private, inert placeholder for provisioning staging secrets before the
// production-mode Catevia bundle performs its module-level fail-closed checks.
export default {
  fetch() {
    return new Response('Staging is not ready', { status: 503 })
  },
}
