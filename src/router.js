import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/import', component: () => import('./views/ImportView.vue') },
    { path: '/papers', component: () => import('./views/PapersView.vue') },
    { path: '/mistakes', component: () => import('./views/MistakeBookView.vue') },
    { path: '/practice', component: () => import('./views/PracticeView.vue') },
    { path: '/analysis', component: () => import('./views/AnalysisView.vue') },
    { path: '/stats', component: () => import('./views/StatsView.vue') },
    { path: '/settings', component: () => import('./views/SettingsView.vue') }
  ]
})
