import { defineConfig } from 'vitepress'

// 仓库部署在 <org>.github.io/homura 子路径下，base 必须一致
export default defineConfig({
  lang: 'zh-CN',
  title: 'homura',
  description:
    'Hono+React 全栈 Node 应用的 template/SDK monorepo：渐进式能力包 × 起步模板，standalone 部署',
  base: '/homura/',
  themeConfig: {
    nav: [
      { text: '产品定义', link: '/PRD' },
      { text: '架构', link: '/ARCHITECTURE' },
      { text: '决策记录', link: '/DECISIONS' },
      { text: '模块规格', link: '/specs/module-schema' },
      { text: '沿革', link: '/heritage/suzuran-lessons' },
    ],
    sidebar: {
      '/specs/': [
        {
          text: '模块规格（specs）',
          items: [
            { text: 'schema 双方言配方', link: '/specs/module-schema' },
            { text: 'OIDC 客户端', link: '/specs/module-oidc' },
            { text: 'session 自管', link: '/specs/module-session' },
            { text: '3p 平台能力分片', link: '/specs/module-3p' },
            { text: 'license 激活心跳', link: '/specs/module-license' },
          ],
        },
      ],
      '/heritage/': [
        {
          text: '沿革（heritage）',
          items: [{ text: 'Suzuran 轮次教训', link: '/heritage/suzuran-lessons' }],
        },
      ],
      '/': [
        {
          text: '指南',
          items: [
            { text: '产品定义（PRD）', link: '/PRD' },
            { text: '架构', link: '/ARCHITECTURE' },
            { text: '决策记录', link: '/DECISIONS' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/suzuran-workshop/homura' },
    ],
    outline: { level: [2, 3] },
  },
})
