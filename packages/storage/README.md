# @homurajs/storage

对象存储/图床：三后端（local-fs / s3 兼容 / supabase）+ `/files/<key>` 代理路由。

> ⚠ **qw-pages 上三个后端都不可用**（2026-10-13 实测）：
>
> - `supabase`：桶建不出来——anon 建桶被 RLS 拒（400 内含 403），平台受控迁移角色对 `storage` schema 也无权（`42501`）
> - `local`：默认 `./data/files` 在 Pages 不可写（应用根只读），且 `mkdir` 发生在**每次上传时**而非构造期 → 启动正常、`/_healthz` 报 ok、首次上传才 EACCES；改指 `QWENWORK_WRITABLE_DIR` 也只能当临时缓冲（跨发布清空）
> - `s3`：理论可行（凭据可经 `homura.config.env` 投递），但需 App 自行安装 optional peer，且 S3 端点出网未验证
>
> 详见 `docs/specs/module-qw-pages.md` 与 AGENTS.md 的支持矩阵。

```ts
import { createLocalStorage } from '@homurajs/storage/local' // 独立形态
// import { createS3Storage } from '@homurajs/storage/s3'      // minio/oss（AWS SDK 动态加载，需自装 peer）
// import { createSupabaseStorage, loadSupabaseStorageEnv } from '@homurajs/storage/supabase'

const storage = createLocalStorage({ rootDir: './data/files' })

// 上传：ns 前缀自动 key；返回代理 URL
const r = await storage.uploadFile('imgs', 'cat.png', bytes, 'image/png')
// r.objectKey = 'imgs/files/1760..._cat.png'，r.url = '/files/imgs/files/...'

// 下载 / 删除 / 列举（列举强制 ns 前缀，无法越权）
const d = await storage.downloadFile(r.objectKey)
await storage.deleteFile(r.objectKey)
const files = await storage.listFiles('imgs', '', 20)

// 代理路由（Hono）：统一下载入口，presign 弱后端自动降级到它
import { createFileProxyRoutes } from '@homurajs/storage/proxy'
app.route('/', createFileProxyRoutes(storage))
```

supabase 后端的 env 解析用**本包**的 loader，不要用 `@homurajs/db/pg` 的那个：

```ts
import { createSupabaseStorage, loadSupabaseStorageEnv } from '@homurajs/storage/supabase'

// 只需 SUPABASE_URL + SUPABASE_ANON_KEY（qw-pages 会自动注入这两项）
const { platformUrl, apiKey } = loadSupabaseStorageEnv(process.env)
const storage = createSupabaseStorage({ platformUrl, apiKey, bucket: 'files' })
// ⚠ bucket 必须预先存在：本包与平台迁移都建不出桶（见上方警告）
```

`@homurajs/db/pg` 的 `loadSupabaseEnv` 要 `SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD`（PG 直连用，仅自托管 supabase 有），拿它来配对象存储会因为缺 PG 凭据而抛错——这个连带依赖已经拆掉。

使用示范见模板 `src/server/routes/files.ts` 与 `app.ts`（buildStorage）。
