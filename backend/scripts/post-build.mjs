// Build sonrası: ESM import'larına .js uzantısı ekle
// tsc-alias path alias'ları çözdükten sonra relative import'lar
// uzantısız kalıyor; Node ESM'de bu hataya yol açıyor.
import { promises as fs, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('dist')

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (p.endsWith('.js')) yield p
  }
}

const SPEC_RE = /(\b(?:from|import)\s*\(?\s*)(['"])([^'"]+)\2/g

let changedFiles = 0
let totalReplacements = 0

for await (const file of walk(ROOT)) {
  const original = await fs.readFile(file, 'utf8')
  const dir = path.dirname(file)
  let content = original

  content = content.replace(SPEC_RE, (match, prefix, quote, spec) => {
    // Sadece relative yollar
    if (!spec.startsWith('.')) return match
    // Zaten uzantı varsa dokunma
    if (/\.(js|json|node|mjs|cjs)$/.test(spec)) return match
    // Dizin referansı (./foo/ gibi) zaten /index.js ile bitecek
    if (spec.endsWith('/')) {
      return `${prefix}${quote}${spec}index.js${quote}`
    }
    // Dosya var mı?
    const abs = path.resolve(dir, spec)
    try {
      const st = statSync(abs)
      if (st.isDirectory()) {
        return `${prefix}${quote}${spec}/index.js${quote}`
      }
      // Dosya mevcut, uzantısız → .js ekle
    } catch {
      // Dosya yok, yine de .js ekle (runtime'da çözülecek)
    }
    totalReplacements++
    return `${prefix}${quote}${spec}.js${quote}`
  })

  if (content !== original) {
    await fs.writeFile(file, content)
    changedFiles++
  }
}

console.log(`[post-build] ${changedFiles} dosya güncellendi, ${totalReplacements} import'a .js uzantısı eklendi`)
