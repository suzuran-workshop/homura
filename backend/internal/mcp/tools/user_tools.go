package tools

import (
	"context"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// UserTools provides user-related MCP tools.
type UserTools struct {
	userService  *service.UserService
	rateLimiter  *mcpserver.RateLimiter
	auditService *service.AuditService
}

// NewUserTools creates a new UserTools instance.
func NewUserTools(userService *service.UserService, rl *mcpserver.RateLimiter, as *service.AuditService) *UserTools {
	return &UserTools{userService: userService, rateLimiter: rl, auditService: as}
}

// RegisterTools registers all user tools with the MCP server.
func (t *UserTools) RegisterTools(server *mcpserver.MCPServer) {
	// user.list_members - List organization members
	server.AddTool(
		mcp.Tool{
			Name:        "user.list_members",
			Description: "List all members of an organization",
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
			Name:          "user.list_members",
			Description:   "List organization members",
			RequiredScope: "org.read",
			Handler:       t.handleListMembers,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// user.create_member - Create a member
	server.AddTool(
		mcp.Tool{
			Name:        "user.create_member",
			Description: "Create a new member in an organization",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{
						"type":        "integer",
						"description": "Organization ID",
					},
					"phone": map[string]interface{}{
						"type":        "string",
						"description": "Phone number",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "User name",
					},
					"email": map[string]interface{}{
						"type":        "string",
						"description": "Email address",
					},
					"position": map[string]interface{}{
						"type":        "string",
						"description": "Job position",
					},
					"isAdmin": map[string]interface{}{
						"type":        "boolean",
						"description": "Whether user is admin",
					},
					"departmentId": map[string]interface{}{
						"type":        "integer",
						"description": "Department ID (optional)",
					},
					"isDepartmentManager": map[string]interface{}{
						"type":        "boolean",
						"description": "Whether user is department manager",
					},
				},
				Required: []string{"orgId", "phone", "name"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "user.create_member",
			Description:   "Create organization member",
			RequiredScope: "org.write",
			Handler:       t.handleCreateMember,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// user.update_member - Update a member
	server.AddTool(
		mcp.Tool{
			Name:        "user.update_member",
			Description: "Update member information",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{
						"type":        "integer",
						"description": "Organization ID",
					},
					"userId": map[string]interface{}{
						"type":        "integer",
						"description": "User ID to update",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "New name (optional)",
					},
					"email": map[string]interface{}{
						"type":        "string",
						"description": "New email (optional)",
					},
					"position": map[string]interface{}{
						"type":        "string",
						"description": "New position (optional)",
					},
					"isAdmin": map[string]interface{}{
						"type":        "boolean",
						"description": "Admin status (optional)",
					},
					"departmentId": map[string]interface{}{
						"type":        "integer",
						"description": "Department ID (optional)",
					},
					"isDepartmentManager": map[string]interface{}{
						"type":        "boolean",
						"description": "Department manager status (optional)",
					},
				},
				Required: []string{"orgId", "userId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "user.update_member",
			Description:   "Update member",
			RequiredScope: "org.write",
			Handler:       t.handleUpdateMember,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)

	// user.remove_member - Remove a member
	server.AddTool(
		mcp.Tool{
			Name:        "user.remove_member",
			Description: "Remove a member from an organization",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{
						"type":        "integer",
						"description": "Organization ID",
					},
					"userId": map[string]interface{}{
						"type":        "integer",
						"description": "User ID to remove",
					},
				},
				Required: []string{"orgId", "userId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name:          "user.remove_member",
			Description:   "Remove member",
			RequiredScope: "org.write",
			Handler:       t.handleRemoveMember,
			RateLimiter:   t.rateLimiter,
			AuditService:  t.auditService,
		}),
	)
}

// handleListMembers handles the user.list_members tool.
func (t *UserTools) handleListMembers(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return nil, err
	}

	members, err := t.userService.ListMembers(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to list members: %w", err)
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"members": members,
	})
}

// handleCreateMember handles the user.create_member tool.
func (t *UserTools) handleCreateMember(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return nil, err
	}

	phone, err := mcpserver.GetStringArg(request.Params.Arguments, "phone")
	if err != nil {
		return nil, err
	}

	name, err := mcpserver.GetStringArg(request.Params.Arguments, "name")
	if err != nil {
		return nil, err
	}

	email := mcpserver.GetOptionalStringArg(request.Params.Arguments, "email", "")
	usernameStr := mcpserver.GetOptionalStringArg(request.Params.Arguments, "username", "")
	passwordStr := mcpserver.GetOptionalStringArg(request.Params.Arguments, "password", "")
	position := mcpserver.GetOptionalStringArg(request.Params.Arguments, "position", "")
	isAdmin := mcpserver.GetOptionalBoolArg(request.Params.Arguments, "isAdmin", false)
	isDepartmentManager := mcpserver.GetOptionalBoolArg(request.Params.Arguments, "isDepartmentManager", false)

	// Optional department ID
	var deptID *int
	if deptIDArg, ok := request.Params.Arguments["departmentId"]; ok {
		if id, ok := deptIDArg.(float64); ok {
			idInt := int(id)
			deptID = &idInt
		}
	}

	member, err := t.userService.CreateMember(ctx, orgID, phone, name, email, usernameStr, passwordStr, position, isAdmin, deptID, isDepartmentManager)
	if err != nil {
		return nil, fmt.Errorf("failed to create member: %w", err)
	}

	return mcpserver.CreateSuccessResponse(member)
}

// handleUpdateMember handles the user.update_member tool.
func (t *UserTools) handleUpdateMember(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return nil, err
	}

	userID, err := mcpserver.GetIntArg(request.Params.Arguments, "userId")
	if err != nil {
		return nil, err
	}

	name := mcpserver.GetOptionalStringArg(request.Params.Arguments, "name", "")
	email := mcpserver.GetOptionalStringArg(request.Params.Arguments, "email", "")
	position := mcpserver.GetOptionalStringArg(request.Params.Arguments, "position", "")

	// Optional boolean fields
	var isAdmin *bool
	if val, ok := request.Params.Arguments["isAdmin"]; ok {
		if b, ok := val.(bool); ok {
			isAdmin = &b
		}
	}

	var isDepartmentManager *bool
	if val, ok := request.Params.Arguments["isDepartmentManager"]; ok {
		if b, ok := val.(bool); ok {
			isDepartmentManager = &b
		}
	}

	// Optional department ID
	var deptID *int
	if deptIDArg, ok := request.Params.Arguments["departmentId"]; ok {
		if id, ok := deptIDArg.(float64); ok {
			idInt := int(id)
			deptID = &idInt
		}
	}

	member, err := t.userService.UpdateMember(ctx, orgID, userID, name, email, position, isAdmin, deptID, isDepartmentManager)
	if err != nil {
		return nil, fmt.Errorf("failed to update member: %w", err)
	}

	return mcpserver.CreateSuccessResponse(member)
}

// handleRemoveMember handles the user.remove_member tool.
func (t *UserTools) handleRemoveMember(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return nil, err
	}

	userID, err := mcpserver.GetIntArg(request.Params.Arguments, "userId")
	if err != nil {
		return nil, err
	}

	// Get current user ID from context for protection rules
	currentUserID, err := mcpserver.GetUserIDFromContext(ctx)
	if err != nil {
		return nil, err
	}

	err = t.userService.RemoveMember(ctx, orgID, userID, currentUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to remove member: %w", err)
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"message": "Member removed successfully",
	})
}
