package storage

import (
	"fmt"
	"os"
)

// StorageBackend represents the type of storage backend
type StorageBackend string

const (
	BackendMinIO StorageBackend = "minio"
	BackendLocal StorageBackend = "local"
	BackendOSS   StorageBackend = "oss"
)

// NewFileStorage creates a FileStorage instance based on environment variables.
// STORAGE_BACKEND: minio (default), local, or oss
func NewFileStorage() (FileStorage, error) {
	backend := os.Getenv("STORAGE_BACKEND")
	if backend == "" {
		backend = "minio" // default
	}

	switch StorageBackend(backend) {
	case BackendMinIO:
		endpoint := os.Getenv("MINIO_ENDPOINT")
		accessKey := os.Getenv("MINIO_ACCESS_KEY")
		secretKey := os.Getenv("MINIO_SECRET_KEY")
		bucket := os.Getenv("MINIO_BUCKET")
		if bucket == "" {
			bucket = "suzuran-files"
		}
		if endpoint == "" || accessKey == "" || secretKey == "" {
			return nil, fmt.Errorf("MinIO configuration incomplete: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY required")
		}
		return NewMinIOClient(endpoint, accessKey, secretKey, bucket)

	case BackendLocal:
		path := os.Getenv("STORAGE_LOCAL_PATH")
		if path == "" {
			path = "./data/storage"
		}
		return NewLocalStorage(path)

	case BackendOSS:
		return nil, fmt.Errorf("OSS storage backend not available: rebuild with '-tags oss' and install github.com/aliyun/aliyun-oss-go-sdk/oss")

	default:
		return nil, fmt.Errorf("unknown storage backend: %s", backend)
	}
}
