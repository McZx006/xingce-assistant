<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="logo">行测小助手<small>刷题 · 错题 · 分析 · 全部本地</small></div>
      <nav class="nav">
        <router-link to="/">概览</router-link>
        <router-link to="/import">录入试卷</router-link>
        <router-link to="/papers">试卷</router-link>
        <router-link to="/mistakes">错题本</router-link>
        <router-link to="/practice">刷题练习</router-link>
        <router-link to="/analysis">薄弱分析</router-link>
        <router-link to="/stats">统计趋势</router-link>
        <router-link to="/settings">设置</router-link>
      </nav>
    </aside>
    <main class="main">
      <router-view v-if="store.loaded" />
    </main>
    <div class="toast-wrap">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.msg }}</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { store, refreshStore, toasts } from './store'

onMounted(() => { refreshStore() })
</script>
