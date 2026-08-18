package storage

import (
	"context"
	"io"
	"time"
)

// FileStorage defines the contract for file storage operations.
// It is implemented by MinIOClient and can be mocked in tests.
type FileStorage interface {
	UploadFile(ctx context.Context, orgID int, fileName string, reader io.Reader, contentType string) (*UploadResult, error)
	UploadFileRaw(ctx context.Context, objectKey string, reader io.Reader, contentType string, size int64) (*UploadResult, error)
	DownloadFile(ctx context.Context, objectKey string) (io.ReadCloser, int64, error)
	GetPresignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error)
	DeleteFile(ctx context.Context, objectKey string) error
	ListFiles(ctx context.Context, orgID int, prefix string, limit int) ([]FileInfo, error)
}

// FileInfo describes a stored object.
type FileInfo struct {
	ObjectKey  string    `json:"objectKey"`
	Size       int64     `json:"size"`
	Updated    time.Time `json:"updated"`
	ContentType string   `json:"contentType,omitempty"`
}

// Compile-time assertion that MinIOClient implements FileStorage.
var _ FileStorage = (*MinIOClient)(nil)
