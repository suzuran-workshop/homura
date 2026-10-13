# Spec — license 契约（@homurajs/license ↔ homura-genuine）

## 要构建什么
- 目标：App 与中央授权服务的激活/心跳/停服契约。**契约先行**：homura-genuine（../homura-genuine，待建）实现时逐字同步 `packages/license/src/contract.ts`

## 契约（v1）

```
POST {server}/v1/register   { productId, appId, instanceKey, licenseKey?, version?, fingerprint? }
  → 200 { licenseId, status: active|grace|suspended, heartbeatIntervalSec, graceSec, issuedAt }

POST {server}/v1/heartbeat  { licenseId, instanceKey, metrics?: { activeUsers?, reqPerMin? } }
  → 200 { status, heartbeatIntervalSec, serverTime, notice? }
```

## 行为（LicenseClient，已实现）
- register：instanceKey 生成（16B base64url）或 state store 持久化复用
- 心跳：server 下发间隔 ±10% 抖动；成功重置宽限期（now + graceSec）
- 状态机：suspended 立即生效；失联超 graceSec → grace；unknown = 未注册
- licenseGuard：suspended → 503（/healthz、/auth/* 豁免）；grace → 放行 + X-Homura-License-Warning；strict 可选（unknown 即 503）；默认 fail-open

## homura-genuine 侧待实现需求（输入）
- 双端点如上；status 判定逻辑（licenseKey 校验/黑名单/运营操作）；多 product 管理

## 验收标准
- [x] 契约类型单文件（contract.ts）
- [x] fake genuine 全流程测试（13 项）
- [ ] homura-genuine 建库时同步契约并跑联调
