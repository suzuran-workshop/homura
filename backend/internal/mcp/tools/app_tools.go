package tools

import (
	"context"
	"encoding/base64"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// AppTools exposes application management tools to agents.
type AppTools struct {
	appService   *service.ApplicationService
	rateLimiter  *mcpserver.RateLimiter
	auditService *service.AuditService
}

// NewAppTools creates a new AppTools.
func NewAppTools(appService *service.ApplicationService, rateLimiter *mcpserver.RateLimiter, auditService *service.AuditService) *AppTools {
	return &AppTools{appService: appService, rateLimiter: rateLimiter, auditService: auditService}
}

// RegisterTools registers all app tools with the server.
func (t *AppTools) RegisterTools(server *mcpserver.MCPServer) {
	server.AddTool(
		mcp.Tool{
			Name:        "app.import",
			Description: "Import an application from a base64-encoded zip package. The zip must contain an app.json manifest at its root (name, runtime, entrypoint, port, mcp_scopes). The package is stored on the platform and survives database resets.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":      map[string]interface{}{"type": "integer", "description": "Organization ID that owns the app"},
					"zipBase64":  map[string]interface{}{"type": "string", "description": "Base64-encoded zip of the application code (max 50 MB before encoding)"},
				},
				Required: []string{"orgId", "zipBase64"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "app.import",
			Description:   "Import an application from a zip package",
			RequiredScope: "org.write",
			Handler:       t.handleImport,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)
}

// handleImport handles the app.import tool.
func (t *AppTools) handleImport(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return nil, err
	}

	zipBase64, err := mcpserver.GetStringArg(request.Params.Arguments, "zipBase64")
	if err != nil {
		return nil, err
	}

	// Base64 overhead: 4/3 of raw size. Cap the encoded payload to stay
	// within the package size limit before decoding.
	if len(zipBase64) > service.MaxZipSize*4/3+8 {
		return nil, fmt.Errorf("package too large (max %d bytes)", service.MaxZipSize)
	}

	zipData, err := base64.StdEncoding.DecodeString(zipBase64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode zipBase64: %w", err)
	}

	app, err := t.appService.ImportApp(ctx, orgID, zipData)
	if err != nil {
		return nil, err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"appId":     app.ID,
		"name":      app.Name,
		"version":   app.Version,
		"runtime":   app.Runtime,
		"entrypoint": app.Entrypoint,
		"port":      app.Port,
		"sourceKey": app.SourceKey,
	})
}