# @homurajs/storage

对象存储/图床：四后端（local-fs / s3 兼容 / supabase / **db**）+ `/files/<key>` 代理路由。

> **qw-pages 上只有 `db` 后端可用**（其余三个 2026-10-13 实测均不可用，db 后端 2026-10-14 实测可用）：
>
> - `db`：✅ **Pages 唯一可用的 storage 后端**——二进制**分块** base64 存进 `homura_files`（清单）+
>   `homura_file_chunks`（数据），走 PostgREST（Pages 唯一可用的数据路径）。分块绕开网关 body 上限，
>   支持大文件（受可配总上限约束，缺省 50MB）；2026-10-14 实测 3MB 分 8 块上传 + 流式下载逐字节一致。
>   ⚠ 大文件正解仍是 s3 预签名直传（见下），db 分块是无对象存储时的兜底
> - `supabase`：❌ 桶建不出来——anon 建桶被 RLS 拒（400 内含 403），平台受控迁移角色对 `storage` schema 也无权（`42501`）
> - `local`：❌ 默认 `./data/files` 在 Pages 不可写（应用根只读），且 `mkdir` 发生在**每次上传时**而非构造期 → 启动正常、`/_healthz` 报 ok、首次上传才 EACCES；改指 `QWENWORK_WRITABLE_DIR` 也只能当临时缓冲（跨发布清空）
> - `s3`：⚠️ 理论可行（凭据可经 `homura.config.env` 投递），但需 App 自行安装 optional peer，且 S3 端点出网未验证
>
> 详见 `docs/specs/module-qw-pages.md` 与 AGENTS.md 的支持矩阵。

```ts
import { createLocalStorage } from '@homurajs/storage/local' // 独立形态
// import { createS3Storage } from '@homurajs/storage/s3'      // minio/oss（AWS SDK 动态加载，需自装 peer）
// import { createSupabaseStorage, loadSupabaseStorageEnv } from '@homurajs/storage/supabase'
// import { createDrizzleFileStore, createRestFileStore } from '@homurajs/storage/db'  // DB-backed

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

## db 后端（DB-backed 分块存储，qw-pages 唯一可用）

把二进制**分块**写进数据库——qw-pages 上的兜底后端。三后端在 Pages 全倒，而 `rest`（PostgREST）
是 Pages 唯一可用的数据路径，故 db 后端是**第一个能在 Pages 上跑的 storage**。强制分块以绕开两道
平台限制：网关 body 上限（实测 ≥1MB 413）+ PostgREST 单值 ~1MB。

```ts
import { createDrizzleFileStore, createRestFileStore } from '@homurajs/storage/db'

// SQL 方言（sqlite / pg）：构造时 CREATE TABLE IF NOT EXISTS，与 drizzle 迁移幂等共存
const storage = createDrizzleFileStore(db, { chunkSize: 384 * 1024, maxTotalBytes: 50 * 1024 * 1024 })

// REST 方言（qw-pages）：不建表（无 DDL 权限），两张表须由部署期受控迁移预建
const storage = createRestFileStore(rest, { chunkSize: 384 * 1024, maxTotalBytes: 50 * 1024 * 1024 })
```

两张表（`@homurajs/storage/tables` 的 `pgStorageTables` / `sqliteStorageTables`），App spread 进
自己的 schema 参与迁移（照 `@homurajs/license/tables` 先例）：

- `homura_files`：清单（object_key PK / content_type / total_size / chunk_size / chunk_count / status / created_at / updated_at）
- `homura_file_chunks`：数据分块（object_key + chunk_index 复合主键 / data）

```ts
// schema/pg.ts
import { pgStorageTables } from '@homurajs/storage/tables'
export const homuraFiles = pgStorageTables.homuraFiles
export const homuraFileChunks = pgStorageTables.homuraFileChunks
export const pgSchema = { todos, /* ... */, homuraFiles, homuraFileChunks }
```

**整文件 API 仍可用**（`uploadFile`/`downloadFile`，内部分块/重组，服务端一次性场景）；
**大文件走分块协议**（前端切片，避免整文件进内存、避免撞网关限）：

```ts
// 前端（浏览器）：import { uploadChunked } from '@homurajs/storage/chunk-client'
const r = await uploadChunked(file, { chunkSize: 384 * 1024, onProgress: (loaded, total) => ... })
// r.url 即 /files/<objectKey> 代理下载地址（服务端流式重组）
```

对应服务端路由（模板 `routes/files.ts` 已示范）：`POST /api/files/init` → `PUT /api/files/chunk?key=&index=`
（原始字节 body）→ `POST /api/files/complete`。

**关键设计**：

- `data` 列是 **base64 文本**（不是 bytea/blob）。PostgREST 对 bytea 的 JSON 编解码不可靠
  （2026-10-14 Pages 实测：308B 进去、618B mojibake 出来），文本列三方言一致、编解码由 `db.ts`
  显式控制（toBase64/fromBase64）。代价 +33% 体积——对兜底后端可接受
- **分块绕网关**：每块 base64 后 ≤512KB（raw 缺省 384KB），避开网关 body 限与 PostgREST 单值限。
  客户端每块发**原始字节**（不 base64），请求体 = raw 块大小，最大化余量
- **可配总上限**（`maxTotalBytes`，缺省 50MB）：DB 存 blob 是反模式（撑大库、无 CDN、慢、贵），
  "无限大"是陷阱，故设上限并在超限时提示改用 s3 预签名直传。⚠ **Pages 上网关先拦**：实测 512KB 稳、
  768KB 撞 PostgREST 值上限报 500、≥1MB 被 openresty 413——故单块必须小，大文件靠分块累积
- **流式下载**：`downloadStream` 逐块 yield（Hono `ReadableStream`），避免整文件进内存；代理路由
  `/files/<key>` 优先用它（带 `content-length`，浏览器可显示进度）
- **残块 GC**：`status=uploading` 超 `staleUploadMs`（缺省 24h）的清单在 initUpload 时顺带清扫
  （概率 `sweepProbability`，缺省 0.05；await 而非 fire-and-forget，兼容 Pages/serverless 进程冻结）
- `listFiles` 只返 `status=complete` 的清单、只选元数据列（不拉 data）
- presign 下载无意义（DB 无直连 URL），降级为代理路径 `/files/<key>`
- 依赖方向：storage → `@homurajs/db` schema-helpers（照 auth/license 先例，见 AGENTS.md 白名单）；
  `drizzle-orm` 是 optional peer，`./db` 子路径动态 import

## 大文件正解：预签名直传对象存储

DB 分块是兜底；**大文件的正解是浏览器预签名直传 OSS/S3**——字节不过 App、不过网关，既绕开 body
上限又不膨胀 DB。s3 后端提供 `getSignedUploadUrl`（预签名 PUT）：

```ts
// 服务端：签发直传 URL（模板经 POST /api/files/presign 暴露）
const uploadUrl = await s3Storage.getSignedUploadUrl(objectKey, contentType, 900)

// 前端：import { uploadViaPresign } from '@homurajs/storage/chunk-client'
await uploadViaPresign(file, uploadUrl)   // 浏览器直接 PUT 到 OSS，流式发送 Blob
// 下载仍走 /files/<objectKey> 代理（服务端从 OSS 取），或另签 GET 预签名
```

⚠ 前置：对象存储侧配好 **CORS**（允许 Pages 域名的 `PUT` + `Content-Type` 头）；`uploadViaPresign`
的 content-type 必须与签发时一致（签名覆盖了它）。OSS 从浏览器侧的可达性需自行确认。

## s3 后端接阿里云 OSS（配置 recipe）

s3 后端用 AWS SDK 的 S3 兼容模式接 OSS——OSS 提供 S3 兼容端点，**无需 OSS 专用 SDK**：

```ts
import { createS3Storage } from '@homurajs/storage/s3'

const storage = createS3Storage({
  // OSS 的 S3 兼容端点：https://oss-<region>.aliyuncs.com（如 oss-cn-hangzhou.aliyuncs.com）
  endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  region: 'oss-cn-hangzhou', // OSS 的 region 名（带 oss- 前缀）
  bucket: 'my-bucket',
  accessKeyId: process.env.S3_ACCESS_KEY!,     // OSS AccessKey ID
  secretAccessKey: process.env.S3_SECRET_KEY!, // OSS AccessKey Secret
  autoCreateBucket: false, // ⚠ OSS 桶须在控制台预建；S3 的 CreateBucket 对 OSS 不一定生效，关掉更稳
  presignDirect: false,    // 走 /files 代理下载（不暴露 OSS 直连 URL）；要直连下载再开
})
```

模板里对应 env（`config/homura.config.env` 或真实环境变量）：

```
STORAGE_BACKEND=s3
S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
S3_REGION=oss-cn-hangzhou
S3_BUCKET=my-bucket
S3_ACCESS_KEY=<OSS AccessKey ID>
S3_SECRET_KEY=<OSS AccessKey Secret>
```

**OSS 注意点**：

- 后端用 `forcePathStyle: true`（path-style：`endpoint/bucket/key`），OSS 的 S3 兼容层支持；
  若遇到签名/寻址问题，OSS 也支持 virtual-hosted style（`bucket.endpoint/key`），需按需调整
- `region` 用 OSS 的写法（`oss-cn-hangzhou`），不是 AWS 的 `cn-hangzhou`
- 桶必须**预先在 OSS 控制台创建**并配好读写权限；`autoCreateBucket` 对 OSS 不保证生效，建议关
- 需 App 自行安装两个 optional peer：`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- ⚠ qw-pages 上 OSS 端点出网未验证（Pages 出网仅放行 443，OSS 是 https 应可达，但未实测）；
  standalone 形态可直连

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
