import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const sourceDir = path.resolve(projectRoot, 'tools/tini-dom-export')
const distDir = path.resolve(projectRoot, 'dist')
const outputZip = path.resolve(distDir, 'tini-dom-export.zip')

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true })
}

// Generate icons if missing
const iconDir = path.join(sourceDir, 'icons')
if (!fs.existsSync(path.join(iconDir, 'icon128.png'))) {
  console.log('Generating extension icons...')
  execSync('node scripts/generate-extension-icons.mjs', { stdio: 'inherit' })
}

console.log(`Packaging extension from ${sourceDir} into ${outputZip}...`)

if (process.platform === 'win32') {
  execSync(`powershell -Command "Compress-Archive -Path '${sourceDir}/*' -DestinationPath '${outputZip}' -Force"`, { stdio: 'inherit' })
} else {
  execSync(`cd "${sourceDir}" && zip -r "${outputZip}" ./*`, { stdio: 'inherit' })
}

const stats = fs.statSync(outputZip)
console.log(`✓ Packaging complete: dist/tini-dom-export.zip (${(stats.size / 1024).toFixed(1)} KB)`)
