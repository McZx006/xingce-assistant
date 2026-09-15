<template>
  <span class="help-wrap">
    <span class="help-dot" title="点击查看格式说明" @click="open = !open">?</span>
    <div v-if="open" class="help-panel" @click.stop>
      <div class="help-close clickable" @click="open = false">×</div>
      <slot />
    </div>
  </span>
</template>

<script setup>
import { ref } from 'vue'
const open = ref(false)
</script>

<style scoped>
.help-wrap { position: relative; display: inline-flex; margin-left: 6px; vertical-align: middle; }
.help-dot {
  width: 17px; height: 17px; border-radius: 50%; background: var(--primary); color: #fff;
  font-size: 11px; line-height: 17px; text-align: center; cursor: pointer; user-select: none; flex: none;
}
.help-dot:hover { background: #2a62d4; }
.help-panel {
  position: absolute; top: 26px; left: 0; z-index: 30; width: 400px;
  background: #1f2937; color: #e5e7eb; border-radius: 10px; padding: 14px 16px;
  font-size: 12px; line-height: 1.9; box-shadow: 0 8px 30px rgba(0, 0, 0, .25); text-align: left;
}
.help-close { position: absolute; top: 6px; right: 10px; color: #9ca3af; font-size: 15px; }
.help-panel :deep(b) { color: #fff; }
.help-panel :deep(code) {
  background: #334155; border-radius: 4px; padding: 1px 6px; font-size: 11px; color: #fbbf24;
}
</style>
