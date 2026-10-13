# @homurajs/storage

对象存储/图床：三后端（local-fs / s3 兼容 / supabase）+ `/files/<key>` 代理路由。

```ts
import { createLocalStorage } from '@homurajs/storage/local'   // 独立形态
// import { createS3Storage } from '@homurajs/storage/s3'      // minio/oss（AWS SDK 动态加载）
// import { createSupabaseStorage } from '@homurajs/storage/supabase' // qw-pages（手写 REST）

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

使用示范见模板 `src/server/routes/files.ts`。
