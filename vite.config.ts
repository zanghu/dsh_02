import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置：注册 Vue 单文件组件插件
export default defineConfig({
  plugins: [vue()],
})
