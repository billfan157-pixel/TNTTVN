// Keep development-only policy explicit. Production starts `dist/index.js`
// directly and therefore cannot inherit this bootstrap environment marker.
process.env.NODE_ENV ||= 'development'

await import('./index.js')
