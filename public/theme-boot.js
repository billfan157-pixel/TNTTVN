/* Apply the persisted theme before CSS paints. Mirror is written by src/lib/uiBoot.ts. */
try {
  var cateviaUiBoot = JSON.parse(localStorage.getItem('parish_ui_boot') || '{}')
  if (cateviaUiBoot.theme === 'dark') document.documentElement.classList.add('dark')
} catch {
  // Storage can be unavailable in hardened/private browser contexts.
}
