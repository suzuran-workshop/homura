package tools

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// AppTools exposes application management tools to agents.
type AppTools struct {
	appService   *service.ApplicationService
	distService  *service.DistributionService
	rateLimiter  *mcpserver.RateLimiter
	auditService *service.AuditService
}

// NewAppTools creates a new AppTools.
func NewAppTools(appService *service.ApplicationService, distService *service.DistributionService, rateLimiter *mcpserver.RateLimiter, auditService *service.AuditService) *AppTools {
	return &AppTools{appService: appService, distService: distService, rateLimiter: rateLimiter, auditService: auditService}
}

// requireAppOrg verifies that the caller belongs to the org that owns the
// app, keeping org isolation for tools that take an appId (and therefore
// cannot use the orgId argument check).
func (t *AppTools) requireAppOrg(ctx context.Context, appID string) error {
	callerOrg, err := mcpserver.GetOrgIDFromContext(ctx)
	if err != nil {
		return err
	}
	app, err := t.appService.GetApp(ctx, appID)
	if err != nil {
		return err
	}
	if app.OrgID != callerOrg {
		return errors.New("access denied to app")
	}
	return nil
}

func (t *AppTools) addTool(server *mcpserver.MCPServer, tool mcp.Tool, scope string, handler mcpserver.ToolHandler) {
	server.AddTool(tool, mcpserver.WrapToolHandler(mcpserver.ToolConfig{
		Name: tool.Name, Description: tool.Description, RequiredScope: scope,
		Handler: handler, RateLimiter: t.rateLimiter, AuditService: t.auditService,
	}))
}

func (t *AppTools) strProp(desc string) map[string]interface{} {
	return map[string]interface{}{"type": "string", "description": desc}
}

func (t *AppTools) intProp(desc string) map[string]interface{} {
	return map[string]interface{}{"type": "integer", "description": desc}
}

// RegisterTools registers all app tools with the server.
func (t *AppTools) RegisterTools(server *mcpserver.MCPServer) {
	appID := t.strProp("Application ID")

	// app.import
	t.addTool(server, mcp.Tool{
		Name:        "app.import",
		Description: "Import an application from a base64-encoded zip package. The zip must contain an app.json manifest at its root (name, runtime, entrypoint, port, mcp_scopes). The package is stored on the platform and survives database resets.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"orgId":     t.intProp("Organization ID that owns the app"),
				"zipBase64": t.strProp("Base64-encoded zip of the application code (max 50 MB before encoding)"),
			},
			Required: []string{"orgId", "zipBase64"},
		},
	}, "org.write", t.handleImport)

	// app.list
	t.addTool(server, mcp.Tool{
		Name:        "app.list",
		Description: "List applications owned by an organization.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"orgId": t.intProp("Organization ID"),
			},
			Required: []string{"orgId"},
		},
	}, "org.read", t.handleList)

	// app.get
	t.addTool(server, mcp.Tool{
		Name:        "app.get",
		Description: "Get application details by ID.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.read", t.handleGet)

	// app.update
	t.addTool(server, mcp.Tool{
		Name:        "app.update",
		Description: "Update application metadata (name, version, runtime, entrypoint, port, quotas, mcp_scopes). Only provided fields are changed. Use app.update_code to replace the code package.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"appId":       appID,
				"name":        t.strProp("Display name"),
				"version":     t.strProp("Version string"),
				"runtime":     t.strProp("Runtime image (e.g. node:18)"),
				"entrypoint":  t.strProp("Command to start the app (e.g. node server.js)"),
				"port":        t.intProp("App listen port (1024-65535)"),
				"cpuQuota":    t.strProp("CPU quota (e.g. 0.1)"),
				"memoryQuota": t.strProp("Memory quota (e.g. 128Mi)"),
				"dbConnQuota": t.intProp("DB connection quota"),
				"mcpScopes":   map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}, "description": "MCP scopes granted to the app (e.g. org.read, data.read)"},
			},
			Required: []string{"appId"},
		},
	}, "org.write", t.handleUpdate)

	// app.delete
	t.addTool(server, mcp.Tool{
		Name:        "app.delete",
		Description: "Delete an application and its container. Distributions and admins are removed by cascade.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.write", t.handleDelete)

	// app.update_code
	t.addTool(server, mcp.Tool{
		Name:        "app.update_code",
		Description: "Replace the code package of an existing application with a new base64-encoded zip (must contain app.json at its root). The manifest version, if present, is synced onto the application. Redeploy the app for changes to take effect.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"appId":     appID,
				"zipBase64": t.strProp("Base64-encoded zip of the new code (max 50 MB before encoding)"),
			},
			Required: []string{"appId", "zipBase64"},
		},
	}, "org.write", t.handleUpdateCode)

	// app.deploy
	t.addTool(server, mcp.Tool{
		Name:        "app.deploy",
		Description: "Deploy an application into a sandbox container. The caller's token is injected as OAUTH_TOKEN so the app can authenticate to the MCP server.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.write", t.handleDeploy)

	// app.start
	t.addTool(server, mcp.Tool{
		Name:        "app.start",
		Description: "Start a stopped application container.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.write", t.handleStart)

	// app.stop
	t.addTool(server, mcp.Tool{
		Name:        "app.stop",
		Description: "Stop a running application container.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.write", t.handleStop)

	// app.restart
	t.addTool(server, mcp.Tool{
		Name:        "app.restart",
		Description: "Restart an application container.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.write", t.handleRestart)

	// app.status
	t.addTool(server, mcp.Tool{
		Name:        "app.status",
		Description: "Get the current runtime status of an application container.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.read", t.handleStatus)

	// app.logs
	t.addTool(server, mcp.Tool{
		Name:        "app.logs",
		Description: "Get recent container logs for an application.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"appId": appID,
				"tail":  t.intProp("Number of log lines (default 100)"),
			},
			Required: []string{"appId"},
		},
	}, "org.read", t.handleLogs)

	// app.deployments
	t.addTool(server, mcp.Tool{
		Name:        "app.deployments",
		Description: "List deployment history for an application.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.read", t.handleDeployments)

	// app.distribute
	t.addTool(server, mcp.Tool{
		Name:        "app.distribute",
		Description: "Distribute an application to an organization (tenant start page + per-org app admins). Provider role only.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"appId":       appID,
				"targetOrgId": t.intProp("Target organization ID (cannot be the provider org)"),
			},
			Required: []string{"appId", "targetOrgId"},
		},
	}, "org.write", t.handleDistribute)

	// app.undistribute
	t.addTool(server, mcp.Tool{
		Name:        "app.undistribute",
		Description: "Remove an application distribution from an organization (admins are removed too). Provider role only.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"appId":       appID,
				"targetOrgId": t.intProp("Organization ID"),
			},
			Required: []string{"appId", "targetOrgId"},
		},
	}, "org.write", t.handleUndistribute)

	// app.list_distributions
	t.addTool(server, mcp.Tool{
		Name:        "app.list_distributions",
		Description: "List the organizations an application is distributed to, including their admins.",
		InputSchema: mcp.ToolInputSchema{
			Type:       "object",
			Properties: map[string]interface{}{"appId": appID},
			Required:   []string{"appId"},
		},
	}, "org.read", t.handleListDistributions)

	// app.set_admin
	t.addTool(server, mcp.Tool{
		Name:        "app.set_admin",
		Description: "Grant a user app-admin rights for (app, org). The user must be a member of the org and the app must be distributed to it. Provider role only.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"appId":       appID,
				"targetOrgId": t.intProp("Organization ID"),
				"userId":      t.intProp("User ID to grant admin rights"),
			},
			Required: []string{"appId", "targetOrgId", "userId"},
		},
	}, "org.write", t.handleSetAdmin)

	// app.remove_admin
	t.addTool(server, mcp.Tool{
		Name:        "app.remove_admin",
		Description: "Revoke app-admin rights from a user for (app, org). Provider role only.",
		InputSchema: mcp.ToolInputSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"appId":       appID,
				"targetOrgId": t.intProp("Organization ID"),
				"userId":      t.intProp("User ID to revoke admin rights from"),
			},
			Required: []string{"appId", "targetOrgId", "userId"},
		},
	}, "org.write", t.handleRemoveAdmin)
}

// decodeZipArg decodes and size-checks a base64 zip argument.
func decodeZipArg(zipBase64 string) ([]byte, error) {
	if len(zipBase64) > service.MaxZipSize*4/3+8 {
		return nil, fmt.Errorf("package too large (max %d bytes)", service.MaxZipSize)
	}
	zipData, err := base64.StdEncoding.DecodeString(zipBase64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode zipBase64: %w", err)
	}
	return zipData, nil
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
	zipData, err := decodeZipArg(zipBase64)
	if err != nil {
		return nil, err
	}
	app, err := t.appService.ImportApp(ctx, orgID, zipData)
	if err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"appId": app.ID, "name": app.Name, "version": app.Version,
		"runtime": app.Runtime, "entrypoint": app.Entrypoint, "port": app.Port,
		"sourceKey": app.SourceKey,
	})
}

// handleList handles the app.list tool.
func (t *AppTools) handleList(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return nil, err
	}
	apps, err := t.appService.ListApps(ctx, orgID)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0, len(apps))
	for _, a := range apps {
		out = append(out, map[string]interface{}{
			"appId": a.ID, "name": a.Name, "version": a.Version, "status": a.Status,
			"runtime": a.Runtime, "entrypoint": a.Entrypoint, "port": a.Port,
			"mcpScopes": a.MCPScopes, "sourceKey": a.SourceKey,
		})
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"apps": out})
}

// handleGet handles the app.get tool.
func (t *AppTools) handleGet(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	app, err := t.appService.GetApp(ctx, appID)
	if err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"appId": app.ID, "name": app.Name, "version": app.Version, "status": app.Status,
		"runtime": app.Runtime, "entrypoint": app.Entrypoint, "port": app.Port,
		"cpuQuota": app.CPUQuota, "memoryQuota": app.MemoryQuota, "dbConnQuota": app.DBConnQuota,
		"mcpScopes": app.MCPScopes, "sourceKey": app.SourceKey,
		"createdAt": app.CreatedAt,
	})
}

// handleUpdate handles the app.update tool.
func (t *AppTools) handleUpdate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments
	appID, err := mcpserver.GetStringArg(args, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}

	req := service.UpdateAppRequest{}
	if v, ok := args["name"].(string); ok {
		req.Name = &v
	}
	if v, ok := args["version"].(string); ok {
		req.Version = &v
	}
	if v, ok := args["runtime"].(string); ok {
		req.Runtime = &v
	}
	if v, ok := args["entrypoint"].(string); ok {
		req.Entrypoint = &v
	}
	if v, ok := args["port"].(float64); ok {
		p := int(v)
		req.Port = &p
	}
	if v, ok := args["cpuQuota"].(string); ok {
		req.CPUQuota = &v
	}
	if v, ok := args["memoryQuota"].(string); ok {
		req.MemoryQuota = &v
	}
	if v, ok := args["dbConnQuota"].(float64); ok {
		d := int(v)
		req.DBConnQuota = &d
	}
	if v, ok := args["mcpScopes"].([]interface{}); ok {
		scopes := make([]string, 0, len(v))
		for _, s := range v {
			if str, ok := s.(string); ok {
				scopes = append(scopes, str)
			}
		}
		req.MCPScopes = scopes
	}

	app, err := t.appService.UpdateApp(ctx, appID, req)
	if err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"appId": app.ID, "name": app.Name, "version": app.Version, "status": app.Status,
		"runtime": app.Runtime, "entrypoint": app.Entrypoint, "port": app.Port,
		"mcpScopes": app.MCPScopes,
	})
}

// handleDelete handles the app.delete tool.
func (t *AppTools) handleDelete(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	if err := t.appService.DeleteApp(ctx, appID); err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"message": "deleted", "appId": appID})
}

// handleUpdateCode handles the app.update_code tool.
func (t *AppTools) handleUpdateCode(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments
	appID, err := mcpserver.GetStringArg(args, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	zipBase64, err := mcpserver.GetStringArg(args, "zipBase64")
	if err != nil {
		return nil, err
	}
	zipData, err := decodeZipArg(zipBase64)
	if err != nil {
		return nil, err
	}
	app, err := t.appService.UpdateCode(ctx, appID, zipData)
	if err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"appId": app.ID, "name": app.Name, "version": app.Version, "sourceKey": app.SourceKey,
	})
}

// handleDeploy handles the app.deploy tool.
func (t *AppTools) handleDeploy(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	oauthToken, err := mcpserver.GetTokenFromContext(ctx)
	if err != nil {
		return nil, err
	}
	deployment, err := t.appService.DeployApp(ctx, appID, oauthToken)
	if err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"deploymentId": deployment.ID,
		"appId":        deployment.ApplicationID,
		"version":      deployment.Version,
		"status":       deployment.Status,
		"containerId":  deployment.ContainerID,
		"createdAt":    deployment.CreatedAt,
		"completedAt":  deployment.CompletedAt,
	})
}

// handleStart handles the app.start tool.
func (t *AppTools) handleStart(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	if err := t.appService.StartApp(ctx, appID); err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"message": "started", "appId": appID})
}

// handleStop handles the app.stop tool.
func (t *AppTools) handleStop(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	if err := t.appService.StopApp(ctx, appID); err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"message": "stopped", "appId": appID})
}

// handleRestart handles the app.restart tool.
func (t *AppTools) handleRestart(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	if err := t.appService.RestartApp(ctx, appID); err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"message": "restarted", "appId": appID})
}

// handleStatus handles the app.status tool.
func (t *AppTools) handleStatus(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	status, err := t.appService.GetAppStatus(ctx, appID)
	if err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"appId": appID, "status": status})
}

// handleLogs handles the app.logs tool.
func (t *AppTools) handleLogs(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments
	appID, err := mcpserver.GetStringArg(args, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	tail := mcpserver.GetOptionalIntArg(args, "tail", 100)
	logs, err := t.appService.GetAppLogs(ctx, appID, tail)
	if err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"appId": appID, "logs": logs})
}

// handleDeployments handles the app.deployments tool.
func (t *AppTools) handleDeployments(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	deployments, err := t.appService.GetDeployments(ctx, appID)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0, len(deployments))
	for _, d := range deployments {
		out = append(out, map[string]interface{}{
			"deploymentId": d.ID, "appId": d.ApplicationID, "version": d.Version, "status": d.Status,
			"containerId": d.ContainerID, "createdAt": d.CreatedAt, "completedAt": d.CompletedAt,
		})
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"deployments": out})
}

// handleDistribute handles the app.distribute tool.
func (t *AppTools) handleDistribute(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments
	appID, err := mcpserver.GetStringArg(args, "appId")
	if err != nil {
		return nil, err
	}
	orgID, err := mcpserver.GetIntArg(args, "targetOrgId")
	if err != nil {
		return nil, err
	}
	if err := mcpserver.RequireRole(ctx, "provider"); err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	if err := t.distService.DistributeApp(ctx, appID, orgID); err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"message": "distributed", "appId": appID, "orgId": orgID})
}

// handleUndistribute handles the app.undistribute tool.
func (t *AppTools) handleUndistribute(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments
	appID, err := mcpserver.GetStringArg(args, "appId")
	if err != nil {
		return nil, err
	}
	orgID, err := mcpserver.GetIntArg(args, "targetOrgId")
	if err != nil {
		return nil, err
	}
	if err := mcpserver.RequireRole(ctx, "provider"); err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	if err := t.distService.UndistributeApp(ctx, appID, orgID); err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"message": "distribution removed", "appId": appID, "orgId": orgID})
}

// handleListDistributions handles the app.list_distributions tool.
func (t *AppTools) handleListDistributions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	appID, err := mcpserver.GetStringArg(request.Params.Arguments, "appId")
	if err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	dists, err := t.distService.ListDistributions(ctx, appID)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0, len(dists))
	for _, d := range dists {
		admins := make([]map[string]interface{}, 0, len(d.Admins))
		for _, a := range d.Admins {
			admins = append(admins, map[string]interface{}{"userId": a.UserID, "name": a.Name, "username": a.Username})
		}
		out = append(out, map[string]interface{}{"orgId": d.OrgID, "orgName": d.OrgName, "admins": admins})
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"distributions": out})
}

// handleSetAdmin handles the app.set_admin tool.
func (t *AppTools) handleSetAdmin(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments
	appID, err := mcpserver.GetStringArg(args, "appId")
	if err != nil {
		return nil, err
	}
	orgID, err := mcpserver.GetIntArg(args, "targetOrgId")
	if err != nil {
		return nil, err
	}
	userID, err := mcpserver.GetIntArg(args, "userId")
	if err != nil {
		return nil, err
	}
	if err := mcpserver.RequireRole(ctx, "provider"); err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	if err := t.distService.SetAppAdmin(ctx, appID, orgID, userID); err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"message": "admin set", "appId": appID, "orgId": orgID, "userId": userID})
}

// handleRemoveAdmin handles the app.remove_admin tool.
func (t *AppTools) handleRemoveAdmin(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments
	appID, err := mcpserver.GetStringArg(args, "appId")
	if err != nil {
		return nil, err
	}
	orgID, err := mcpserver.GetIntArg(args, "targetOrgId")
	if err != nil {
		return nil, err
	}
	userID, err := mcpserver.GetIntArg(args, "userId")
	if err != nil {
		return nil, err
	}
	if err := mcpserver.RequireRole(ctx, "provider"); err != nil {
		return nil, err
	}
	if err := t.requireAppOrg(ctx, appID); err != nil {
		return nil, err
	}
	if err := t.distService.RemoveAppAdmin(ctx, appID, orgID, userID); err != nil {
		return nil, err
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"message": "admin removed", "appId": appID, "orgId": orgID, "userId": userID})
}