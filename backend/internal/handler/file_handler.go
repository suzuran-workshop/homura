package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/storage"
)

// FileHandler handles file upload/download endpoints
type FileHandler struct {
	storage storage.FileStorage
}

// NewFileHandler creates a new file handler
func NewFileHandler(storage storage.FileStorage) *FileHandler {
	return &FileHandler{storage: storage}
}

// Upload handles file upload
func (h *FileHandler) Upload(c *gin.Context) {
	orgID := c.GetInt("org_id")

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get file"})
		return
	}
	defer file.Close()

	result, err := h.storage.UploadFile(c.Request.Context(), orgID, header.Filename, file, header.Header.Get("Content-Type"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}

// Download generates a presigned URL for download
func (h *FileHandler) Download(c *gin.Context) {
	objectKey := c.Param("key")

	url, err := h.storage.GetPresignedURL(c.Request.Context(), objectKey, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": url})
}

// Delete deletes a file
func (h *FileHandler) Delete(c *gin.Context) {
	objectKey := c.Param("key")

	err := h.storage.DeleteFile(c.Request.Context(), objectKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "file deleted"})
}

// List lists files for an organization
func (h *FileHandler) List(c *gin.Context) {
	orgID := c.GetInt("org_id")
	prefix := c.Query("prefix")
	limitStr := c.DefaultQuery("limit", "100")

	var limit int
	if _, err := fmt.Sscanf(limitStr, "%d", &limit); err != nil {
		limit = 100
	}

	files, err := h.storage.ListFiles(c.Request.Context(), orgID, prefix, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"orgId": orgID,
		"count": len(files),
		"files": files,
	})
}
