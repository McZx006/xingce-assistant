import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { initDB } from './db'
import './assets/style.css'

async function bootstrap() {
  await initDB()
  createApp(App).use(router).mount('#app')
}
bootstrap()
