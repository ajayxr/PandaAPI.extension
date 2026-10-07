import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const rootDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDirectory, 'index.html'),
        worker: resolve(rootDirectory, 'src/background.js'),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'worker'
          ? 'worker.js'
          : 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
