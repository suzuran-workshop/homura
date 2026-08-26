<!-- frontend/app/src/views/user/Dashboard.vue -->
<template>
  <div>
    <h1 class="page-title">用户中心</h1>
    <div class="cards-grid">
      <FluentCard>
        <div class="card-icon-area">
          <i class="mdi mdi-file-document-outline mdi-48px" style="color: var(--colorBrandForeground1)"></i>
          <div class="card-heading">我的表单</div>
          <p class="card-desc">填写和提交表单</p>
        </div>
      </FluentCard>
      <FluentCard>
        <div class="card-icon-area">
          <i class="mdi mdi-apps mdi-48px" style="color: var(--colorNeutralForeground2)"></i>
          <div class="card-heading">消息通知</div>
          <p class="card-desc">查看审批进度</p>
        </div>
      </FluentCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import FluentCard from '../../components/FluentCard.vue'
</script>

<style scoped>
.page-title {
  font-size: var(--fontSizeBase600);
  font-weight: var(--fontWeightSemibold);
  margin-bottom: var(--spacingVerticalL);
}

.cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacingVerticalM);
}

.card-icon-area {
  text-align: center;
  padding: var(--spacingVerticalM) 0;
}

.card-heading {
  font-size: var(--fontSizeBase500);
  font-weight: var(--fontWeightSemibold);
  margin-top: var(--spacingVerticalS);
}

.card-desc {
  color: var(--colorNeutralForeground3);
  font-size: var(--fontSizeBase200);
  margin-top: var(--spacingVerticalXS);
}

@media (max-width: 768px) {
  .cards-grid { grid-template-columns: 1fr; }
}
</style>
