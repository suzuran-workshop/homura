//go:build oss
// +build oss

package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
)

// OSSStorage implements FileStorage using Alibaba Cloud OSS.
type OSSStorage struct {
	client     *oss.Client
	bucket     *oss.Bucket
	bucketName string
}

// NewOSSStorage creates a new Alibaba Cloud OSS storage backend.
func NewOSSStorage(endpoint, accessKeyID, accessKeySecret, bucketName string) (*OSSStorage, error) {
	client, err := oss.New(endpoint, accessKeyID, accessKeySecret)
	if err != nil {
		return nil, fmt.Errorf("failed to create OSS client: %w", err)
	}

	bucket, err := client.Bucket(bucketName)
	if err != nil {
		return nil, fmt.Errorf("failed to get bucket: %w", err)
	}

	return &OSSStorage{
		client:     client,
		bucket:     bucket,
		bucketName: bucketName,
	}, nil
}

var _ FileStorage = (*OSSStorage)(nil)

func (s *OSSStorage) UploadFile(ctx context.Context, orgID int, fileName string, reader io.Reader, contentType string) (*UploadResult, error) {
	objectKey := fmt.Sprintf("orgs/%d/files/%d_%s", orgID, time.Now().UnixNano(), fileName)
	return s.UploadFileRaw(ctx, objectKey, reader, contentType, -1)
}

func (s *OSSStorage) UploadFileRaw(ctx context.Context, objectKey string, reader io.Reader, contentType string, size int64) (*UploadResult, error) {
	options := []oss.Option{}
	if contentType != "" {
		options = append(options, oss.ContentType(contentType))
	}

	if err := s.bucket.PutObject(objectKey, reader, options...); err != nil {
		return nil, fmt.Errorf("failed to upload to OSS: %w", err)
	}

	meta, err := s.bucket.GetObjectMeta(objectKey)
	if err != nil {
		return nil, fmt.Errorf("failed to get object metadata: %w", err)
	}

	var fileSize int64
	if size >= 0 {
		fileSize = size
	} else if contentLength := meta.Get("Content-Length"); contentLength != "" {
		fmt.Sscanf(contentLength, "%d", &fileSize)
	}

	return &UploadResult{
		ObjectKey:  objectKey,
		URL:        fmt.Sprintf("/api/files/%s", objectKey),
		Size:       fileSize,
		UploadedAt: time.Now(),
	}, nil
}

func (s *OSSStorage) DownloadFile(ctx context.Context, objectKey string) (io.ReadCloser, int64, error) {
	body, err := s.bucket.GetObject(objectKey)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to download from OSS: %w", err)
	}

	meta, err := s.bucket.GetObjectMeta(objectKey)
	if err != nil {
		body.Close()
		return nil, 0, fmt.Errorf("failed to get object metadata: %w", err)
	}

	var fileSize int64
	if contentLength := meta.Get("Content-Length"); contentLength != "" {
		fmt.Sscanf(contentLength, "%d", &fileSize)
	}

	return body, fileSize, nil
}

func (s *OSSStorage) GetPresignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	url, err := s.bucket.SignURL(objectKey, oss.HTTPGet, int64(expiry.Seconds()))
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}
	return url, nil
}

func (s *OSSStorage) DeleteFile(ctx context.Context, objectKey string) error {
	if err := s.bucket.DeleteObject(objectKey); err != nil {
		return fmt.Errorf("failed to delete from OSS: %w", err)
	}
	return nil
}

func (s *OSSStorage) ListFiles(ctx context.Context, orgID int, prefix string, limit int) ([]FileInfo, error) {
	if limit <= 0 {
		limit = 100
	}

	orgPrefix := fmt.Sprintf("orgs/%d/files/", orgID)
	if prefix != "" {
		orgPrefix += prefix
	}

	result, err := s.bucket.ListObjects(oss.Prefix(orgPrefix), oss.MaxKeys(limit))
	if err != nil {
		return nil, fmt.Errorf("failed to list objects: %w", err)
	}

	files := make([]FileInfo, 0, len(result.Objects))
	for _, obj := range result.Objects {
		files = append(files, FileInfo{
			ObjectKey: obj.Key,
			Size:      obj.Size,
			Updated:   obj.LastModified,
		})
	}

	return files, nil
}
