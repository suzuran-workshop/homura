/**
 * qw-pages 适配器。
 *
 * 2026-10-13 在真实 qw-pages 动态页上实测（探针 + 双路计数归因，定论见 docs/specs/module-qw-pages.md）：
 *
 * 1. **入口约定 = 常驻 Node 进程**：平台注入 PORT/HOST 并把网关流量反代到 App 自监听的 socket。
 *    探针同时挂了 serve() 与 default/fetch/app 三重导出，全程 `serve` 命中 47 次、`handler` 命中 0 次
 *    → 平台从不调用导出函数。故原 exportHandlers 三重对冲已删除，本适配器改为与 standalone 共用监听实现。
 * 2. **HOST 实测注入为 127.0.0.1**（网关与 App 同网络命名空间），故缺省绑 loopback 而非全网卡。
 * 3. **发布根目录即产物根**（实测 cwd=/opt/qwenwork-page/app），静态目录默认 `client`，
 *    不是 standalone 的 `dist/client`。不再用 import.meta.url 回溯定位：按 npm 依赖消费时
 *    该算法会落到 `node_modules/@homurajs/app-kit/client`（实测证伪，目录不存在）。
 * 4. **'/healthz' 被 Page Gateway 保留**（网关自答 `ok`，请求不下发到进程），
 *    健康检查路径统一取 core 的 healthzPathFor('qw-pages') = '/_healthz'。
 * 5. 平台对 HTML 响应做后处理（注入页面 chrome 脚本并覆盖 Cache-Control），非 HTML 资源原样透传，
 *    故 static.ts 的缓存头策略在 Pages 上仍然有效，但不要依赖 HTML 的字节长度/ETag。
 */
import { resolve } from 'node:path'
import type { RuntimeAdapter } from './adapter.js'
import { listenWithNodeServer } from './node.js'

/** qw-pages 推荐端口（实测平台注入 PORT=8081；9000 被平台禁用） */
export const QW_PAGES_DEFAULT_PORT = 8081

export function createQwPagesAdapter(): RuntimeAdapter {
  return {
    target: 'qw-pages',
    start: (app, opts) =>
      listenWithNodeServer(app, {
        port: opts.port ?? Number(process.env.PORT ?? QW_PAGES_DEFAULT_PORT),
        hostname: process.env.HOST ?? '127.0.0.1',
        signal: opts.signal,
      }),
    // qw-pages 在平台网关后 → 信任 X-Forwarded-*（模板据此把 cookie 置为 secure）
    trustProxy: () => true,
    assetsDir: (env) => resolve(env.HOMURA_ASSETS_DIR ?? 'client'),
  }
}
