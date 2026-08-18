// Package mcp implements the Model Context Protocol server for Suzuran Cloud.
// It provides a unified data access layer for AI agents to interact with
// organizational data through well-defined tools.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// MCPServer wraps the mark3labs/mcp-go server and provides HTTP handlers
// for integration with Gin.
type MCPServer struct {
	server *server.MCPServer
}

// NewMCPServer creates a new MCP server instance.
func NewMCPServer() *MCPServer {
	s := server.NewMCPServer(
		"suzuran-cloud-mcp",
		"1.0.0",
		server.WithToolCapabilities(false),
		server.WithResourceCapabilities(false, true),
		server.WithPromptCapabilities(true),
	)

	return &MCPServer{server: s}
}

// Server returns the underlying mcp-go server for tool registration.
func (s *MCPServer) Server() *server.MCPServer {
	return s.server
}

// AddTool registers a tool and its handler with the MCP server.
func (s *MCPServer) AddTool(tool mcp.Tool, handler ToolHandler) {
	// Convert our custom ToolHandler to server.ToolHandlerFunc
	s.server.AddTool(tool, server.ToolHandlerFunc(handler))
}

// HandleRequest is a Gin handler that processes MCP JSON-RPC requests.
// It expects POST requests with JSON-RPC 2.0 messages.
//
// Authentication must be handled by middleware before this handler is called.
// The gin.Context should contain:
//   - "user_id": int
//   - "org_id": int
//   - "role": string
//   - "scopes": []string
func (s *MCPServer) HandleRequest(c *gin.Context) {
	// Read the request body
	var rawMessage json.RawMessage
	if err := c.ShouldBindJSON(&rawMessage); err != nil {
		c.JSON(400, gin.H{
			"jsonrpc": "2.0",
			"id":      nil,
			"error": gin.H{
				"code":    -32700,
				"message": "Parse error",
			},
		})
		return
	}

	// Inject authentication context into the request context
	ctx := s.injectAuthContext(c.Request.Context(), c)

	// Process the message through the MCP server
	response := s.server.HandleMessage(ctx, rawMessage)

	// Return the response
	c.JSON(200, response)
}

// ListTools returns a list of all available tools.
// This is a convenience endpoint for tool discovery.
func (s *MCPServer) ListTools(c *gin.Context) {
	// Create a synthetic JSON-RPC request for tools/list
	rawMessage := json.RawMessage(`{
		"jsonrpc": "2.0",
		"id": 1,
		"method": "tools/list",
		"params": {}
	}`)

	// Process through MCP server
	ctx := s.injectAuthContext(c.Request.Context(), c)
	response := s.server.HandleMessage(ctx, rawMessage)

	// Return the response
	c.JSON(200, response)
}

// injectAuthContext extracts authentication information from gin.Context
// and injects it into the context.Context for use by tool handlers.
func (s *MCPServer) injectAuthContext(ctx context.Context, c *gin.Context) context.Context {
	// Extract user_id
	if userID, exists := c.Get("user_id"); exists {
		if id, ok := userID.(int); ok {
			ctx = context.WithValue(ctx, contextKeyUserID, id)
		}
	}

	// Extract org_id
	if orgID, exists := c.Get("org_id"); exists {
		if id, ok := orgID.(int); ok {
			ctx = context.WithValue(ctx, contextKeyOrgID, id)
		}
	}

	// Extract role
	if role, exists := c.Get("role"); exists {
		if r, ok := role.(string); ok {
			ctx = context.WithValue(ctx, contextKeyRole, r)
		}
	}

	// Extract scopes
	if scopes, exists := c.Get("scopes"); exists {
		if s, ok := scopes.([]string); ok {
			ctx = context.WithValue(ctx, contextKeyScopes, s)
		}
	}

	// Extract app_id (for app-owned data tools)
	if appID, exists := c.Get("app_id"); exists {
		if id, ok := appID.(string); ok {
			ctx = context.WithValue(ctx, contextKeyAppID, id)
		}
	}

	// Extract the raw bearer token (for tools that inject it into
	// containers, e.g. app.deploy -> OAUTH_TOKEN env var)
	if auth := c.GetHeader("Authorization"); len(auth) > 7 && auth[:7] == "Bearer " {
		ctx = context.WithValue(ctx, contextKeyToken, auth[7:])
	}

	return ctx
}

// Context keys for authentication information
type contextKey string

const (
	contextKeyUserID contextKey = "user_id"
	contextKeyOrgID  contextKey = "org_id"
	contextKeyRole   contextKey = "role"
	contextKeyScopes contextKey = "scopes"
	contextKeyAppID  contextKey = "app_id"
	contextKeyToken  contextKey = "token"
)

// GetUserIDFromContext extracts the user ID from context.
func GetUserIDFromContext(ctx context.Context) (int, error) {
	userID, ok := ctx.Value(contextKeyUserID).(int)
	if !ok {
		return 0, fmt.Errorf("user_id not found in context")
	}
	return userID, nil
}

// GetOrgIDFromContext extracts the org ID from context.
func GetOrgIDFromContext(ctx context.Context) (int, error) {
	orgID, ok := ctx.Value(contextKeyOrgID).(int)
	if !ok {
		return 0, fmt.Errorf("org_id not found in context")
	}
	return orgID, nil
}

// GetRoleFromContext extracts the role from context.
func GetRoleFromContext(ctx context.Context) (string, error) {
	role, ok := ctx.Value(contextKeyRole).(string)
	if !ok {
		return "", fmt.Errorf("role not found in context")
	}
	return role, nil
}

// GetScopesFromContext extracts the scopes from context.
func GetScopesFromContext(ctx context.Context) ([]string, error) {
	scopes, ok := ctx.Value(contextKeyScopes).([]string)
	if !ok {
		return nil, fmt.Errorf("scopes not found in context")
	}
	return scopes, nil
}

// GetAppIDFromContext extracts the app ID from context.
func GetAppIDFromContext(ctx context.Context) (string, error) {
	appID, ok := ctx.Value(contextKeyAppID).(string)
	if !ok {
		return "", fmt.Errorf("app_id not found in context")
	}
	return appID, nil
}

// GetTokenFromContext extracts the raw bearer token from context.
func GetTokenFromContext(ctx context.Context) (string, error) {
	token, ok := ctx.Value(contextKeyToken).(string)
	if !ok || token == "" {
		return "", fmt.Errorf("token not found in context")
	}
	return token, nil
}
