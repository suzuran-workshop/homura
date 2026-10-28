---
layout: home

hero:
  name: homura
  text: Hono + React 全栈轻应用 SDK
  tagline: 渐进式能力包 × 起步模板 · standalone 部署 · 为 AI 开发而生
  actions:
    - theme: brand
      text: 架构总览
      link: /ARCHITECTURE
    - theme: alt
      text: 起步模板（hono-react）
      link: https://github.com/suzuran-workshop/homura/tree/main/templates/hono-react
    - theme: alt
      text: GitHub
      link: https://github.com/suzuran-workshop/homura

features:
  - icon: 🧩
    title: 渐进式能力包
    details: core / db / storage / auth / 3p / license / app-kit 按需组合，互不硬依赖——可选依赖走 peer + 动态 import + 子路径导出。
  - icon: 🚀
    title: 双形态部署
    details: 独立 Node 服务直跑（@hono/node-server），RuntimeAdapter 收口部署差异。
  - icon: 🗄️
    title: 三方言持久层
    details: Drizzle pg / sqlite 双 driver + pgCol/sqliteCol 配方与 parity 门禁，迁移 SQL 由 drizzle-kit 生成。
  - icon: 🔐
    title: 认证与授权开箱即用
    details: 通用 OAuth2 客户端、自管 session（HS256 短 JWT + opaque refresh rotate）、license 激活心跳与停服守卫。
  - icon: 🤖
    title: AI 开发友好
    details: 模板即活文档，契约先行（types.ts / contract.ts 快照锁），测试与实现同文件 colocate；AGENTS.md 提供「能力 × 形态支持矩阵」，模板 README 提供部署 runbook 与排错速查。
  - icon: 📦
    title: npm 直发
    details: CalVer 版本（YY.MM.DD），根 package.json 是唯一版本权威、@homurajs/* 各包同版本发布，push main 触发 CI 全量校验后自动发版。
---
