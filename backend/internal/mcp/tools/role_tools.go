package tools

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/service"
)

type RoleTools struct {
	roleService  *service.RoleService
	rateLimiter  *mcpserver.RateLimiter
	auditService *service.AuditService
}

func NewRoleTools(rs *service.RoleService, rl *mcpserver.RateLimiter, as *service.AuditService) *RoleTools {
	return &RoleTools{roleService: rs, rateLimiter: rl, auditService: as}
}

func (t *RoleTools) Register(server *mcpserver.MCPServer) {
	// role.create
	server.AddTool(
		mcp.Tool{
			Name:        "role.create",
			Description: "Create a new role in an organization",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":       map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"name":        map[string]interface{}{"type": "string", "description": "Role name"},
					"description": map[string]interface{}{"type": "string", "description": "Role description"},
					"permissions": map[string]interface{}{"type": "object", "description": "Permissions object"},
				},
				Required: []string{"orgId", "name"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "role.create", Description: "Create a role", RequiredScope: "org.write",
			Handler: t.handleCreate, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// role.list
	server.AddTool(
		mcp.Tool{
			Name:        "role.list",
			Description: "List all roles in an organization",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{"type": "integer", "description": "Organization ID"},
				},
				Required: []string{"orgId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "role.list", Description: "List roles", RequiredScope: "org.read",
			Handler: t.handleList, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// role.get
	server.AddTool(
		mcp.Tool{
			Name:        "role.get",
			Description: "Get a role by ID",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":  map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"roleId": map[string]interface{}{"type": "integer", "description": "Role ID"},
				},
				Required: []string{"orgId", "roleId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "role.get", Description: "Get a role", RequiredScope: "org.read",
			Handler: t.handleGet, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// role.update
	server.AddTool(
		mcp.Tool{
			Name:        "role.update",
			Description: "Update a role",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":       map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"roleId":      map[string]interface{}{"type": "integer", "description": "Role ID"},
					"name":        map[string]interface{}{"type": "string", "description": "New role name"},
					"description": map[string]interface{}{"type": "string", "description": "New description"},
					"permissions": map[string]interface{}{"type": "object", "description": "New permissions"},
				},
				Required: []string{"orgId", "roleId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "role.update", Description: "Update a role", RequiredScope: "org.write",
			Handler: t.handleUpdate, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// role.delete
	server.AddTool(
		mcp.Tool{
			Name:        "role.delete",
			Description: "Delete a role",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":  map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"roleId": map[string]interface{}{"type": "integer", "description": "Role ID"},
				},
				Required: []string{"orgId", "roleId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "role.delete", Description: "Delete a role", RequiredScope: "org.write",
			Handler: t.handleDelete, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// role.assign
	server.AddTool(
		mcp.Tool{
			Name:        "role.assign",
			Description: "Assign a role to a user",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":  map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"userId": map[string]interface{}{"type": "integer", "description": "User ID"},
					"roleId": map[string]interface{}{"type": "integer", "description": "Role ID"},
				},
				Required: []string{"orgId", "userId", "roleId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "role.assign", Description: "Assign a role", RequiredScope: "org.write",
			Handler: t.handleAssign, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// role.unassign
	server.AddTool(
		mcp.Tool{
			Name:        "role.unassign",
			Description: "Unassign a role from a user",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":  map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"userId": map[string]interface{}{"type": "integer", "description": "User ID"},
					"roleId": map[string]interface{}{"type": "integer", "description": "Role ID"},
				},
				Required: []string{"orgId", "userId", "roleId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "role.unassign", Description: "Unassign a role", RequiredScope: "org.write",
			Handler: t.handleUnassign, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)
}

func (t *RoleTools) handleCreate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	name, err := mcpserver.GetStringArg(request.Params.Arguments, "name")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	description := mcpserver.GetOptionalStringArg(request.Params.Arguments, "description", "")
	permissions, _ := request.Params.Arguments["permissions"].(map[string]interface{})

	role, err := t.roleService.CreateRole(ctx, orgID, name, description, permissions)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	return mcpserver.CreateSuccessResponse(role)
}

func (t *RoleTools) handleList(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	roles, err := t.roleService.ListRoles(ctx, orgID)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"roles": roles, "count": len(roles)})
}

func (t *RoleTools) handleGet(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	roleID, err := mcpserver.GetIntArg(request.Params.Arguments, "roleId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	role, err := t.roleService.GetRole(ctx, orgID, roleID)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	return mcpserver.CreateSuccessResponse(role)
}

func (t *RoleTools) handleUpdate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	roleID, err := mcpserver.GetIntArg(request.Params.Arguments, "roleId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	name := mcpserver.GetOptionalStringArg(request.Params.Arguments, "name", "")
	description := mcpserver.GetOptionalStringArg(request.Params.Arguments, "description", "")
	permissions, _ := request.Params.Arguments["permissions"].(map[string]interface{})

	role, err := t.roleService.UpdateRole(ctx, orgID, roleID, name, description, permissions)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	return mcpserver.CreateSuccessResponse(role)
}

func (t *RoleTools) handleDelete(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	roleID, err := mcpserver.GetIntArg(request.Params.Arguments, "roleId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	if err := t.roleService.DeleteRole(ctx, orgID, roleID); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"success": true})
}

func (t *RoleTools) handleAssign(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	userID, err := mcpserver.GetIntArg(request.Params.Arguments, "userId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	roleID, err := mcpserver.GetIntArg(request.Params.Arguments, "roleId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	if err := t.roleService.AssignRole(ctx, orgID, userID, roleID); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"success": true})
}

func (t *RoleTools) handleUnassign(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	userID, err := mcpserver.GetIntArg(request.Params.Arguments, "userId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	roleID, err := mcpserver.GetIntArg(request.Params.Arguments, "roleId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	if err := t.roleService.UnassignRole(ctx, orgID, userID, roleID); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"success": true})
}
