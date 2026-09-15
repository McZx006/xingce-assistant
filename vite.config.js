import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: { port: 5173, open: false },
  // 启动时即预构建这些依赖（含动态 import 的重型库），避免首次访问页面时
  // Vite 临时发现新依赖触发「重新优化 + 整页 reload」造成卡顿
  optimizeDeps: {
    include: [
      'vue', 'vue-router', 'dexie',
      'echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers',
      'pdfjs-dist', 'mammoth', 'tesseract.js'
    ]
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // 重型依赖独立成 chunk：配合路由/组件级动态 import，首屏只加载必需代码
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          if (id.includes('mammoth')) return 'mammoth'
          if (id.includes('tesseract.js')) return 'tesseract'
          if (id.includes('vue-router') || id.includes('/vue/') || id.includes('@vue') || id.includes('dexie')) return 'vendor'
        }
      }
    }
  }
})
