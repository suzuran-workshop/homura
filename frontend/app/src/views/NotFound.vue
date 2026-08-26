<template>
  <div class="error-page">
    <i class="mdi mdi-alert-circle" style="font-size: 128px; color: var(--colorPaletteYellowForeground1)"</i>
    <h1>404 - 页面不存在</h1>
    <p>您访问的页面不存在</p>
    <fluent-button appearance="filled" @click="router.push('/')">返回首页</fluent-button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--colorNeutralBackground1);
  color: var(--colorNeutralForeground1);
  gap: var(--spacingVerticalM);
  padding: var(--spacingHorizontalXL);
  text-align: center;
}

h1 {
  font-size: var(--fontSizeHero700);
  font-weight: var(--fontWeightBold);
  margin: 0;
}

p {
  font-size: var(--fontSizeBase300);
  color: var(--colorNeutralForeground2);
  margin: 0;
}
</style>
