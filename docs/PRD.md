# PRD — homura template/SDK

## 产品目标

- 要达成的目标：AI（Agent）按模板快速产出的 Hono+React 全栈轻应用，天然具备钉钉登录、持久化、图床、平台消息/审批、远程激活控制，standalone 部署（独立 Node 服务）

## 用户与使用场景

- 目标用户：制作人本人 + 其 AI Agent（App 的实际编写者）；App 的最终用户是钉钉组织内成员
- 典型场景：
  1. 「给部门做个值班报名工具」→ Agent 派生 homura 模板 → 填业务路由/页面 → 独立部署（node:sqlite）
  2. 「做个审批联动工具」→ 模板起步 → pg/sqlite 持久化 → 钉扫码登录
  3. 「某 App 滥用，停掉」→ homura-genuine 下发 suspended → 该 App 心跳感知 → 全站 503

## 核心问题

- 要解决的关键问题：
  1. 每个轻应用重复实现登录/存储/部署差异（轮子税）
  2. 部署环境差异（自有 PG vs sqlite；网关后 vs 直连）
  3. AI 生成的代码需要可预期的组装范式（模板即约束）

## 功能及其意义

| 功能                 | 解决什么                                        | 为什么需要                                                                                               |
| -------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| @homurajs/core       | 环境探测/形态常量/配置/配置文件投递/日志/TTL-KV | 一切包的公共基座，环境差异单点收口                                                                       |
| @homurajs/db         | 双方言持久层（sqlite / pg）                     | 独立部署按 DIALECT 切换，App 零改动 |
| @homurajs/storage    | 图床/对象存储三后端                             | 图床刚需；后端由部署环境决定（local/s3/supabase）                                                       |
| @homurajs/auth       | 钉钉登录（OIDC 客户端）+ session              | 所有 App 都要对接登录；oidc-dingtalk 已有服务端                                                        |
| @homurajs/3p         | 平台消息/审批/通讯录封装                        | 推送与流程是企业场景核心；平台可插拔                                                                     |
| @homurajs/license    | 激活心跳 + 远程停服                             | 制作人对散布 App 的运行控制权                                                                            |
| @homurajs/app-kit    | createApp 渐进式装配                            | AI 开发的统一组装范式                                                                                    |
| templates/hono-react | 起步模板（活文档）                              | 模板即 AI 的说明书                                                                                       |

## 功能之间的关系

- core 是地基；db/storage/auth/3p/license 五个能力包彼此独立、全部可选；app-kit 只做装配不做能力；模板组装一切并示范

## 范围与非目标

- 范围内：上述 8 项、双方言迁移工具
- 范围外：OIDC Provider（../oidc-dingtalk）、中央授权服务（../homura-genuine）、多租户/组织模型、低代码、可视化编辑器、npm 发包（v1 派生式消费）
