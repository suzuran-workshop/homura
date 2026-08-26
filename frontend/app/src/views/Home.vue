<template>
  <div class="home-page">
    <fluent-spinner size="large" />
    <p class="home-text">正在跳转...</p>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--colorNeutralBackground1);
}

.home-text {
  font-size: 0.875rem;
  color: var(--colorNeutralForeground3);
  margin-top: 0.75rem;
}
</style>
