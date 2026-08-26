package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// LocalStorage implements FileStorage using the local filesystem.
// Files are stored under basePath with the same key structure as MinIO.
type LocalStorage struct {
	basePath string
}

// NewLocalStorage creates a new local filesystem storage backend.
func NewLocalStorage(basePath string) (*LocalStorage, error) {
	if basePath == "" {
		basePath = "./data/storage"
	}
	absPath, err := filepath.Abs(basePath)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve storage path: %w", err)
	}
	if err := os.MkdirAll(absPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create storage directory: %w", err)
	}
	return &LocalStorage{basePath: absPath}, nil
}

// Compile-time interface check
var _ FileStorage = (*LocalStorage)(nil)

func (s *LocalStorage) fullPath(objectKey string) string {
	return filepath.Join(s.basePath, objectKey)
}

func (s *LocalStorage) UploadFile(ctx context.Context, orgID int, fileName string, reader io.Reader, contentType string) (*UploadResult, error) {
	objectKey := fmt.Sprintf("orgs/%d/files/%d_%s", orgID, time.Now().UnixNano(), fileName)
	return s.UploadFileRaw(ctx, objectKey, reader, contentType, -1)
}

func (s *LocalStorage) UploadFileRaw(ctx context.Context, objectKey string, reader io.Reader, contentType string, size int64) (*UploadResult, error) {
	path := s.fullPath(objectKey)
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}

	file, err := os.Create(path)
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	written, err := io.Copy(file, reader)
	if err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	return &UploadResult{
		ObjectKey: objectKey,
		URL:       fmt.Sprintf("/api/files/%s", objectKey),
		Size:      written,
		UploadedAt: time.Now(),
	}, nil
}

func (s *LocalStorage) DownloadFile(ctx context.Context, objectKey string) (io.ReadCloser, int64, error) {
	path := s.fullPath(objectKey)
	file, err := os.Open(path)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to open file: %w", err)
	}
	stat, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, 0, fmt.Errorf("failed to stat file: %w", err)
	}
	return file, stat.Size(), nil
}

func (s *LocalStorage) GetPresignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	// Local storage doesn't support presigned URLs; return the direct path
	return fmt.Sprintf("/api/files/%s", objectKey), nil
}

func (s *LocalStorage) DeleteFile(ctx context.Context, objectKey string) error {
	path := s.fullPath(objectKey)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete file: %w", err)
	}
	return nil
}

func (s *LocalStorage) ListFiles(ctx context.Context, orgID int, prefix string, limit int) ([]FileInfo, error) {
	if limit <= 0 {
		limit = 100
	}

	orgPrefix := fmt.Sprintf("orgs/%d/files/", orgID)
	if prefix != "" {
		orgPrefix += prefix
	}
	searchPath := s.fullPath(orgPrefix)

	var files []FileInfo
	err := filepath.Walk(searchPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip errors
		}
		if info.IsDir() {
			return nil
		}
		if len(files) >= limit {
			return filepath.SkipAll
		}
		relPath, _ := filepath.Rel(s.basePath, path)
		relPath = strings.ReplaceAll(relPath, "\\", "/") // normalize for cross-platform
		files = append(files, FileInfo{
			ObjectKey: relPath,
			Size:      info.Size(),
			Updated:   info.ModTime(),
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list files: %w", err)
	}
	return files, nil
}
