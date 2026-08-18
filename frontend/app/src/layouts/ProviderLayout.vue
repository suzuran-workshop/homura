<!-- frontend/app/src/layouts/ProviderLayout.vue -->
<template>
  <v-app>
    <v-app-bar color="primary" dark>
      <v-app-bar-title>服务商门户</v-app-bar-title>
      <v-spacer></v-spacer>
      <span class="mr-4">{{ authStore.user?.name }}</span>
      <v-btn @click="authStore.logout">退出</v-btn>
    </v-app-bar>

    <v-navigation-drawer permanent>
      <v-list>
        <v-list-item to="/provider/dashboard" prepend-icon="mdi-view-dashboard" title="仪表盘" />
        <v-list-item to="/provider/apps" prepend-icon="mdi-apps" title="应用启动台" />
        <v-list-item to="/provider/distribution" prepend-icon="mdi-share-variant" title="应用分发" />
        <v-list-item to="/provider/orgs" prepend-icon="mdi-account-multiple" title="组织管理" />
        <v-list-subheader>MCP</v-list-subheader>
        <v-list-item to="/provider/mcp/tools" prepend-icon="mdi-tools" title="MCP 工具" />
        <v-list-item to="/provider/mcp/logs" prepend-icon="mdi-script-text-outline" title="MCP 调用日志" />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <v-container>
        <RouterView />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { useAuthStore } from '../stores/auth'
import { RouterView } from 'vue-router'

const authStore = useAuthStore()
</script>
