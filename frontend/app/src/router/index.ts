// frontend/app/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { checkOOBEStatus } from '../api/oobe'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      beforeEnter: (_to, _from, next) => {
        const authStore = useAuthStore()
        if (!authStore.isAuthenticated) {
          next('/login')
          return
        }
        switch (authStore.userRole) {
          case 'provider':
            next('/user/apps')
            break
          default:
            next('/user/apps')
        }
      },
      component: () => import('../views/Home.vue'), // fallback, never reached
    },
    {
      path: '/oobe',
      name: 'OOBE',
      component: () => import('../views/OOBE.vue'),
      meta: { allowDuringOOBE: true },
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/Login.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/oauth/dingtalk/callback',
      name: 'DingTalkCallback',
      component: () => import('../views/Callback.vue'),
      meta: { requiresGuest: true },
    },
    // Provider routes (服务商端)
    {
      path: '/provider',
      component: () => import('../layouts/ProviderLayout.vue'),
      redirect: '/provider/dashboard',
      meta: { requiresAuth: true, role: 'provider' },
      children: [
        {
          path: 'dashboard',
          name: 'ProviderDashboard',
          component: () => import('../views/provider/Dashboard.vue'),
        },
        {
          path: 'orgs',
          name: 'Organizations',
          component: () => import('../views/provider/Organizations.vue'),
        },
        {
          path: 'orgs/:orgId',
          name: 'OrgDetail',
          component: () => import('../views/provider/OrgDetail.vue'),
        },
        {
          path: 'apps',
          name: 'ProviderApps',
          component: () => import('../views/Apps.vue'),
        },
        {
          path: 'apps/:appId',
          name: 'ProviderAppDetail',
          component: () => import('../views/provider/AppDetail.vue'),
        },
        {
          path: 'distribution',
          name: 'AppDistribution',
          component: () => import('../views/provider/AppDistribution.vue'),
        },
        {
          path: 'mcp/tools',
          name: 'ProviderMCPTools',
          component: () => import('../views/provider/MCPTools.vue'),
        },
        {
          path: 'mcp/logs',
          name: 'ProviderMCPLogs',
          component: () => import('../views/provider/MCPLogs.vue'),
        },
      ],
    },
    // User routes (用户端) — accessible to ALL authenticated users
    {
      path: '/user',
      component: () => import('../layouts/UserLayout.vue'),
      meta: { requiresAuth: true },
      redirect: '/user/apps',
      children: [
        {
          path: 'apps',
          name: 'UserApps',
          component: () => import('../views/Apps.vue'),
        },
        {
          path: 'data/:appId',
          name: 'AppDataManager',
          component: () => import('../views/DataManager.vue'),
        },
      ],
    },
    // 403 Forbidden
    {
      path: '/forbidden',
      name: 'Forbidden',
      component: () => import('../views/Forbidden.vue'),
    },
    // Catch all
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('../views/NotFound.vue'),
    },
  ],
})

// Navigation guard for authentication and role-based access
let oobeChecked = false
let needOOBE = false

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  // Check OOBE status once at app startup
  if (!oobeChecked) {
    try {
      const resp = await checkOOBEStatus()
      needOOBE = resp.data.needOOBE
      oobeChecked = true
    } catch (error) {
      console.error('Failed to check OOBE status:', error)
      // If check fails, assume system is initialized to avoid blocking
      needOOBE = false
      oobeChecked = true
    }
  }

  // If system needs OOBE and not already on /oobe, redirect
  if (needOOBE && to.path !== '/oobe') {
    next('/oobe')
    return
  }

  // If system is initialized and on /oobe, redirect to login
  if (!needOOBE && to.path === '/oobe') {
    next('/login')
    return
  }

  // Allow OOBE page to proceed
  if (to.meta.allowDuringOOBE) {
    next()
    return
  }

  // Check if route requires guest (login page)
  if (to.meta.requiresGuest) {
    if (authStore.isAuthenticated) {
      next('/')
    } else {
      next()
    }
    return
  }

  // Check if route requires authentication
  if (to.meta.requiresAuth) {
    if (!authStore.isAuthenticated) {
      next('/login')
      return
    }

    // Check role-based access
    if (to.meta.role && authStore.userRole !== to.meta.role) {
      next('/forbidden')
      return
    }
  }

  next()
})

export default router
