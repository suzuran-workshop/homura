/**
 * supabase storage 后端：qw-pages 云形态。走 storage-js（REST）。
 */
import type { FileStorage } from './index.js'

export interface SupabaseStorageOptions {
  platformUrl: string
  anonKey: string
  bucket: string
  fetchImpl?: typeof fetch
}

export function createSupabaseStorage(options: SupabaseStorageOptions): FileStorage {
  throw new Error('NotImplemented: createSupabaseStorage')
}
