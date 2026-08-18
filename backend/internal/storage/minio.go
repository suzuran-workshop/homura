package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinIOClient wraps MinIO operations
type MinIOClient struct {
	client *minio.Client
	bucket string
}

// NewMinIOClient creates a new MinIO client
func NewMinIOClient(endpoint, accessKey, secretKey, bucket string) (*MinIOClient, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false, // Set to true in production with TLS
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	// Ensure bucket exists
	exists, err := client.BucketExists(context.Background(), bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		err = client.MakeBucket(context.Background(), bucket, minio.MakeBucketOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	return &MinIOClient{client: client, bucket: bucket}, nil
}

// UploadResult contains upload result
type UploadResult struct {
	ObjectKey  string    `json:"objectKey"`
	URL        string    `json:"url"`
	Size       int64     `json:"size"`
	UploadedAt time.Time `json:"uploadedAt"`
}

// UploadFile uploads a file and returns result
func (c *MinIOClient) UploadFile(ctx context.Context, orgID int, fileName string, reader io.Reader, contentType string) (*UploadResult, error) {
	objectKey := fmt.Sprintf("orgs/%d/files/%d_%s", orgID, time.Now().UnixNano(), fileName)

	info, err := c.client.PutObject(ctx, c.bucket, objectKey, reader, -1, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to upload file: %w", err)
	}

	return &UploadResult{
		ObjectKey:  objectKey,
		URL:        fmt.Sprintf("/api/files/%s", objectKey),
		Size:       info.Size,
		UploadedAt: time.Now(),
	}, nil
}

// UploadFileRaw uploads content to an explicit object key (used for app packages).
func (c *MinIOClient) UploadFileRaw(ctx context.Context, objectKey string, reader io.Reader, contentType string, size int64) (*UploadResult, error) {
	info, err := c.client.PutObject(ctx, c.bucket, objectKey, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to upload file: %w", err)
	}
	return &UploadResult{
		ObjectKey:  objectKey,
		Size:       info.Size,
		UploadedAt: time.Now(),
	}, nil
}

// DownloadFile streams an object from MinIO. Returns the reader and object size.
func (c *MinIOClient) DownloadFile(ctx context.Context, objectKey string) (io.ReadCloser, int64, error) {
	obj, err := c.client.GetObject(ctx, c.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to download file: %w", err)
	}
	st, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, 0, fmt.Errorf("failed to stat file: %w", err)
	}
	return obj, st.Size, nil
}

// GetPresignedURL generates a presigned URL for download
func (c *MinIOClient) GetPresignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	reqParams := make(url.Values)
	url, err := c.client.PresignedGetObject(ctx, c.bucket, objectKey, expiry, reqParams)
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	return url.String(), nil
}

// DeleteFile deletes a file from MinIO
func (c *MinIOClient) DeleteFile(ctx context.Context, objectKey string) error {
	err := c.client.RemoveObject(ctx, c.bucket, objectKey, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}
	return nil
}

// ListFiles lists objects under an organization's storage prefix.
// prefix is an optional sub-path filter relative to the org prefix
// (e.g. "reports/" matches orgs/<orgID>/files/reports/*).
// limit caps the number of returned objects; <=0 defaults to 100.
func (c *MinIOClient) ListFiles(ctx context.Context, orgID int, prefix string, limit int) ([]FileInfo, error) {
	if limit <= 0 {
		limit = 100
	}

	// Org-scoped prefix; uploads use "orgs/<orgID>/files/<...>".
	orgPrefix := fmt.Sprintf("orgs/%d/files/", orgID)
	if prefix != "" {
		orgPrefix += prefix
	}

	objectCh := c.client.ListObjects(ctx, c.bucket, minio.ListObjectsOptions{
		Prefix:    orgPrefix,
		Recursive: true,
	})

	files := make([]FileInfo, 0, limit)
	for object := range objectCh {
		if object.Err != nil {
			return nil, fmt.Errorf("failed to list files: %w", object.Err)
		}
		files = append(files, FileInfo{
			ObjectKey:   object.Key,
			Size:        object.Size,
			Updated:     object.LastModified,
			ContentType: object.ContentType,
		})
		if len(files) >= limit {
			break
		}
	}

	return files, nil
}
