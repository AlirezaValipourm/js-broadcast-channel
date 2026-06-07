import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  minify: true,
  treeshake: true,
  target: 'es2020',
  clean: true,
  esbuildOptions: (options) => {
    options.mangleProps = /^_private_/
  }
})