package tools

import (
	"context"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// OrgTools provides organization-related MCP tools.
type OrgTools struct {
	orgService   *service.OrgService
	rateLimiter  *mcpserver.RateLimiter
	auditService *service.AuditService
}

// NewOrgTools creates a new OrgTools instance.
func NewOrgTools(orgService *service.OrgService, rl *mcpserver.RateLimiter, as *service.AuditService) *OrgTools {
	return &OrgTools{orgService: orgService, rateLimiter: rl, auditService: as}
}

// RegisterTools registers all organization tools with the MCP server.
func (t *OrgTools) RegisterTools(server *mcpserver.MCPServer) {
	// org.get - Get organization details
	server.AddTool(
		mcp.Tool{
			Name:        "org.get",
			Description: "Get organization details by ID",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{
						"type":        "integer",
						"description": "Organization ID",
					},
				},
				Required: []string{"orgId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "org.get",
			RequiredScope: "org.read",
			Handler:       t.handleOrgGet,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// org.list - List organizations (provider only)
	server.AddTool(
		mcp.Tool{
			Name:        "org.list",
			Description: "List all organizations (provider role only)",
			InputSchema: mcp.ToolInputSchema{
				Type:       "object",
				Properties: map[string]interface{}{},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "org.list",
			RequiredScope: "org.read",
			Handler:       t.handleOrgList,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// org.create - Create organization (provider only)
	server.AddTool(
		mcp.Tool{
			Name:        "org.create",
			Description: "Create a new organization (provider role only)",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Organization name",
					},
					"description": map[string]interface{}{
						"type":        "string",
						"description": "Organization description",
					},
				},
				Required: []string{"name"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "org.create",
			RequiredScope: "org.write",
			Handler:       t.handleOrgCreate,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// org.update - Update organization (provider only)
	server.AddTool(
		mcp.Tool{
			Name:        "org.update",
			Description: "Update organization details (provider role only)",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{
						"type":        "integer",
						"description": "Organization ID",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "New organization name",
					},
					"description": map[string]interface{}{
						"type":        "string",
						"description": "New organization description",
					},
				},
				Required: []string{"orgId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "org.update",
			RequiredScope: "org.write",
			Handler:       t.handleOrgUpdate,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// org.delete - Delete organization (provider only)
	server.AddTool(
		mcp.Tool{
			Name:        "org.delete",
			Description: "Delete an organization (provider role only)",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{
						"type":        "integer",
						"description": "Organization ID to delete",
					},
				},
				Required: []string{"orgId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "org.delete",
			RequiredScope: "org.write",
			Handler:       t.handleOrgDelete,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)
}

// handleOrgGet handles the org.get tool.
func (t *OrgTools) handleOrgGet(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}

	org, err := t.orgService.GetOrgByID(ctx, orgID)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to get organization: %v", err)), nil
	}
	if org == nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("organization not found: %d", orgID)), nil
	}

	result, _ := mcpserver.CreateSuccessResponse(map[string]interface{}{
		"id":          org.ID,
		"name":        org.Name,
		"description": org.Description,
		"createdAt":   org.CreatedAt,
		"updatedAt":   org.UpdatedAt,
	})
	return result, nil
}

// handleOrgList handles the org.list tool.
func (t *OrgTools) handleOrgList(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if err := mcpserver.RequireRole(ctx, "provider"); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}

	orgs, err := t.orgService.ListOrgs(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to list organizations: %v", err)), nil
	}

	orgList := make([]map[string]interface{}, 0, len(orgs))
	for _, org := range orgs {
		orgList = append(orgList, map[string]interface{}{
			"id":          org.ID,
			"name":        org.Name,
			"description": org.Description,
		})
	}

	result, _ := mcpserver.CreateSuccessResponse(map[string]interface{}{
		"orgs": orgList,
	})
	return result, nil
}

// handleOrgCreate handles the org.create tool.
func (t *OrgTools) handleOrgCreate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if err := mcpserver.RequireRole(ctx, "provider"); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}

	name, err := mcpserver.GetStringArg(request.Params.Arguments, "name")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}

	description := mcpserver.GetOptionalStringArg(request.Params.Arguments, "description", "")

	org, err := t.orgService.CreateOrg(ctx, name, description, nil)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to create organization: %v", err)), nil
	}

	result, _ := mcpserver.CreateSuccessResponse(map[string]interface{}{
		"id":          org.ID,
		"name":        org.Name,
		"description": org.Description,
		"createdAt":   org.CreatedAt,
	})
	return result, nil
}

// handleOrgUpdate handles the org.update tool.
func (t *OrgTools) handleOrgUpdate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if err := mcpserver.RequireRole(ctx, "provider"); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}

	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}

	name := mcpserver.GetOptionalStringArg(request.Params.Arguments, "name", "")
	description := mcpserver.GetOptionalStringArg(request.Params.Arguments, "description", "")

	err = t.orgService.UpdateOrg(ctx, orgID, name, description, nil)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to update organization: %v", err)), nil
	}

	result, _ := mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"message": "Organization updated successfully",
	})
	return result, nil
}

// handleOrgDelete handles the org.delete tool.
func (t *OrgTools) handleOrgDelete(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if err := mcpserver.RequireRole(ctx, "provider"); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}

	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}

	err = t.orgService.DeleteOrg(ctx, orgID)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to delete organization: %v", err)), nil
	}

	result, _ := mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"message": "Organization deleted successfully",
	})
	return result, nil
}
