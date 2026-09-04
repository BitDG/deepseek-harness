import { defineConfig } from 'tsdown'
import { typertPlugin } from '../../typert/generator/lib/types/tsdown-plugin.js'

/** Build the Remote host; the post-shutdown worker runs from emitted ESM. */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  plugins: [typertPlugin({ mode: 'workspace', faces: ['host'] })],
})
