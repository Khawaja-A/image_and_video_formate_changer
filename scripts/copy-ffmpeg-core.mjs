import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm')
const target = join(root, 'public', 'ffmpeg')

mkdirSync(target, { recursive: true })

for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(join(source, file), join(target, file))
}
