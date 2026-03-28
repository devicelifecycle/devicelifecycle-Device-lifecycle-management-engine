const fs = require('fs')
const path = require('path')

const root = '/Users/saiyaganti/Device-lifecycle-management-engine'

function walk(dir) {
  let out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) out = out.concat(walk(fullPath))
    else if (entry.isFile() && entry.name === 'route.ts') out.push(fullPath)
  }
  return out
}

function findInsertIndex(lines) {
  let i = 0
  const n = lines.length

  while (i < n && (lines[i].trim() === '' || lines[i].trimStart().startsWith('//'))) i++

  let lastImportEnd = -1
  let seenImport = false

  for (; i < n; i++) {
    const s = lines[i].trimStart()

    if (s.startsWith('import ')) {
      seenImport = true
      lastImportEnd = i
      continue
    }

    if (seenImport && (s === '' || s.startsWith('//'))) continue

    if (seenImport) break
    break
  }

  return lastImportEnd >= 0 ? lastImportEnd + 1 : 0
}

const dynamicRegex = /export const dynamic\s*=\s*['\"]force-dynamic['\"]/ 
const files = walk(path.join(root, 'src/app/api')).sort()

const targets = files.filter((filePath) => {
  const text = fs.readFileSync(filePath, 'utf8')
  return text.includes('supabase.auth.getUser') && dynamicRegex.test(text) === false
})

let patch = '*** Begin Patch\n'

for (const filePath of targets) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const idx = findInsertIndex(lines)
  const start = Math.max(0, idx - 3)
  const end = Math.min(lines.length, idx + 3)

  patch += `*** Update File: ${filePath}\n`
  patch += '@@\n'

  for (let i = start; i < idx; i++) patch += ` ${lines[i]}\n`
  patch += "+export const dynamic = 'force-dynamic'\n"
  patch += '+\n'
  for (let i = idx; i < end; i++) patch += ` ${lines[i]}\n`
}

patch += '*** End Patch\n'

fs.writeFileSync('/tmp/force_dynamic.patch', patch)
fs.writeFileSync('/tmp/force_dynamic_targets.txt', targets.join('\n') + '\n')

console.log(`TARGETS ${targets.length}`)
