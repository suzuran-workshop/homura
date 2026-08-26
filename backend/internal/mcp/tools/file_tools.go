package tools

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/service"
	"github.com/xrl/suzuran-cloud/internal/storage"
)

// FileTools provides file storage-related MCP tools.
type FileTools struct {
	fileStorage  storage.FileStorage
	rateLimiter  *mcpserver.RateLimiter
	auditService *service.AuditService
}

// NewFileTools creates a new FileTools instance.
func NewFileTools(fileStorage storage.FileStorage, rl *mcpserver.RateLimiter, as *service.AuditService) *FileTools {
	return &FileTools{fileStorage: fileStorage, rateLimiter: rl, auditService: as}
}

// RegisterTools registers all file tools with the MCP server.
func (t *FileTools) RegisterTools(server *mcpserver.MCPServer) {
	// file.upload - Upload a file
	server.AddTool(
		mcp.Tool{
			Name:        "file.upload",
			Description: "Upload a file to storage",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{
						"type":        "integer",
						"description": "Organization ID",
					},
					"fileName": map[string]interface{}{
						"type":        "string",
						"description": "File name",
					},
					"fileBase64": map[string]interface{}{
						"type":        "string",
						"description": "File content in base64 encoding",
					},
					"contentType": map[string]interface{}{
						"type":        "string",
						"description": "MIME type of the file",
					},
				},
				Required: []string{"orgId", "fileName", "fileBase64", "contentType"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "file.upload",
			Description:   "Upload file",
			RequiredScope: "file.write",
			Handler:       t.handleFileUpload,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// file.download - Get presigned URL for file download
	server.AddTool(
		mcp.Tool{
			Name:        "file.download",
			Description: "Get a presigned URL to download a file",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"objectKey": map[string]interface{}{
						"type":        "string",
						"description": "Object key of the file",
					},
					"expiryMinutes": map[string]interface{}{
						"type":        "integer",
						"description": "URL expiry time in minutes (default: 60)",
					},
				},
				Required: []string{"objectKey"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "file.download",
			Description:   "Get download URL",
			RequiredScope: "file.read",
			Handler:       t.handleFileDownload,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// file.delete - Delete a file
	server.AddTool(
		mcp.Tool{
			Name:        "file.delete",
			Description: "Delete a file from storage",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"objectKey": map[string]interface{}{
						"type":        "string",
						"description": "Object key of the file to delete",
					},
				},
				Required: []string{"objectKey"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "file.delete",
			Description:   "Delete file",
			RequiredScope: "file.write",
			Handler:       t.handleFileDelete,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// file.list - List files in an organization
	server.AddTool(
		mcp.Tool{
			Name:        "file.list",
			Description: "List files in an organization",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{
						"type":        "integer",
						"description": "Organization ID",
					},
					"prefix": map[string]interface{}{
						"type":        "string",
						"description": "Prefix filter relative to the org's file path (optional)",
					},
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of files to return (default: 100)",
					},
				},
				Required: []string{"orgId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "file.list",
			Description:   "List files",
			RequiredScope: "file.read",
			Handler:       t.handleFileList,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// file.presigned_url - Generate presigned URL
	server.AddTool(
		mcp.Tool{
			Name:        "file.presigned_url",
			Description: "Generate a presigned URL for file access",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"objectKey": map[string]interface{}{
						"type":        "string",
						"description": "Object key of the file",
					},
					"expiryMinutes": map[string]interface{}{
						"type":        "integer",
						"description": "URL expiry time in minutes (default: 60)",
					},
				},
				Required: []string{"objectKey"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "file.presigned_url",
			Description:   "Generate presigned URL",
			RequiredScope: "file.read",
			Handler:       t.handleFilePresignedURL,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)
}

// handleFileUpload handles the file.upload tool.
func (t *FileTools) handleFileUpload(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return nil, err
	}

	fileName, err := mcpserver.GetStringArg(request.Params.Arguments, "fileName")
	if err != nil {
		return nil, err
	}

	fileBase64, err := mcpserver.GetStringArg(request.Params.Arguments, "fileBase64")
	if err != nil {
		return nil, err
	}

	contentType, err := mcpserver.GetStringArg(request.Params.Arguments, "contentType")
	if err != nil {
		return nil, err
	}

	// Decode base64 content
	fileData, err := base64.StdEncoding.DecodeString(fileBase64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	// Create reader from file data
	reader := bytes.NewReader(fileData)

	// Upload file
	result, err := t.fileStorage.UploadFile(ctx, orgID, fileName, reader, contentType)
	if err != nil {
		return nil, fmt.Errorf("failed to upload file: %w", err)
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"objectKey":  result.ObjectKey,
		"url":        result.URL,
		"size":       result.Size,
		"uploadedAt": result.UploadedAt,
	})
}

// handleFileDownload handles the file.download tool.
func (t *FileTools) handleFileDownload(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	objectKey, err := mcpserver.GetStringArg(request.Params.Arguments, "objectKey")
	if err != nil {
		return nil, err
	}

	expiryMinutes := mcpserver.GetOptionalIntArg(request.Params.Arguments, "expiryMinutes", 60)
	expiry := time.Duration(expiryMinutes) * time.Minute

	// Get presigned URL
	url, err := t.fileStorage.GetPresignedURL(ctx, objectKey, expiry)
	if err != nil {
		return nil, fmt.Errorf("failed to get presigned URL: %w", err)
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"presignedUrl": url,
		"expiresIn":    expiryMinutes,
	})
}

// handleFileDelete handles the file.delete tool.
func (t *FileTools) handleFileDelete(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	objectKey, err := mcpserver.GetStringArg(request.Params.Arguments, "objectKey")
	if err != nil {
		return nil, err
	}

	err = t.fileStorage.DeleteFile(ctx, objectKey)
	if err != nil {
		return nil, fmt.Errorf("failed to delete file: %w", err)
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"message": "File deleted successfully",
	})
}

// handleFileList handles the file.list tool.
func (t *FileTools) handleFileList(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return nil, err
	}

	prefix := mcpserver.GetOptionalStringArg(request.Params.Arguments, "prefix", "")
	limit := mcpserver.GetOptionalIntArg(request.Params.Arguments, "limit", 100)

	files, err := t.fileStorage.ListFiles(ctx, orgID, prefix, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to list files: %w", err)
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"orgId":  orgID,
		"count":  len(files),
		"files":  files,
	})
}

// handleFilePresignedURL handles the file.presigned_url tool.
func (t *FileTools) handleFilePresignedURL(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	objectKey, err := mcpserver.GetStringArg(request.Params.Arguments, "objectKey")
	if err != nil {
		return nil, err
	}

	expiryMinutes := mcpserver.GetOptionalIntArg(request.Params.Arguments, "expiryMinutes", 60)
	expiry := time.Duration(expiryMinutes) * time.Minute

	// Get presigned URL
	url, err := t.fileStorage.GetPresignedURL(ctx, objectKey, expiry)
	if err != nil {
		return nil, fmt.Errorf("failed to get presigned URL: %w", err)
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"presignedUrl": url,
		"expiresIn":    expiryMinutes,
	})
}
