import apiClient from '../api/client'

export interface FileInfo {
  key: string
  name: string
  size: number
  lastModified: string
  contentType?: string
}

export interface FileListResponse {
  files: FileInfo[]
  total: number
}

export const fileApi = {
  // 获取文件列表
  list: (prefix?: string): Promise<FileListResponse> => {
    const params = prefix ? { prefix } : {}
    return apiClient.get('/api/provider/files/list', { params }).then(res => res.data)
  },

  // 上传文件
  upload: (file: File, onProgress?: (percent: number) => void): Promise<FileInfo> => {
    const formData = new FormData()
    formData.append('file', file)

    return apiClient.post('/api/provider/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percent)
        }
      },
    }).then(res => res.data)
  },

  // 获取下载链接
  getDownloadUrl: (key: string): Promise<{ url: string }> => {
    return apiClient.get(`/api/provider/files/${encodeURIComponent(key)}/download`).then(res => res.data)
  },

  // 删除文件
  delete: (key: string): Promise<void> => {
    return apiClient.delete(`/api/provider/files/${encodeURIComponent(key)}`).then(res => res.data)
  },
}
