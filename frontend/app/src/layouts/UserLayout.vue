<!-- frontend/app/src/layouts/UserLayout.vue -->
<template>
  <v-app>
    <v-app-bar color="success" dark>
      <v-app-bar-title>用户中心</v-app-bar-title>
      <v-spacer></v-spacer>
      <span class="mr-4">{{ authStore.user?.name }}</span>
      <v-btn @click="authStore.logout">退出</v-btn>
    </v-app-bar>

    <v-navigation-drawer permanent>
      <v-list>
        <v-list-item to="/user/apps" prepend-icon="mdi-apps" title="应用启动台" />

        <!-- Provider portal entry -->
        <template v-if="authStore.userRole === 'provider'">
          <v-divider class="my-2" />
          <v-list-subheader>管理功能</v-list-subheader>
          <v-list-item to="/provider/dashboard" prepend-icon="mdi-account-multiple" title="服务商管理" />
        </template>
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
