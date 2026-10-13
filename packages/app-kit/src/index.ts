export { createApp } from './create-app.js'
export type {
  CreateAppOptions,
  HomuraApp,
  AppDeps,
  HealthCheck,
  AuthInject,
  LicenseInject,
  StorageLike,
  SessionManagerLike,
  PlatformLike,
  LicenseClientLike,
} from './create-app.js'
export type { RuntimeAdapter } from './runtime/adapter.js'
export { createStaticMiddleware, createSpaFallback } from './static.js'
export { detectRuntime } from '@homurajs/core'
