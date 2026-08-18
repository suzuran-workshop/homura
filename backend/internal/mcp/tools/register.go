package tools

import (
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/service"
	"github.com/xrl/suzuran-cloud/internal/storage"
	"gorm.io/gorm"
)

// RegisterAllTools registers all MCP tools with the server.
func RegisterAllTools(
	server *mcpserver.MCPServer,
	orgService *service.OrgService,
	userService *service.UserService,
	deptService *service.DepartmentService,
	fileStorage *storage.MinIOClient,
	db *gorm.DB,
	rateLimiter *mcpserver.RateLimiter,
	auditService *service.AuditService,
	workflowService *service.WorkflowService,
	dataService *service.DataService,
	appService *service.ApplicationService,
) {
	// Register organization tools
	orgTools := NewOrgTools(orgService, rateLimiter, auditService)
	orgTools.RegisterTools(server)

	// Register user tools
	userTools := NewUserTools(userService, rateLimiter, auditService)
	userTools.RegisterTools(server)

	// Register department tools
	deptTools := NewDeptTools(deptService, rateLimiter, auditService)
	deptTools.RegisterTools(server)

	// Register file tools (only if file storage is available)
	if fileStorage != nil {
		fileTools := NewFileTools(fileStorage, rateLimiter, auditService)
		fileTools.RegisterTools(server)
	}

	// Register audit tools
	auditTools := NewAuditTools(db, rateLimiter, auditService)
	auditTools.RegisterTools(server)

	// Register workflow tools (only if the workflow service is configured)
	if workflowService != nil {
		workflowTools := NewWorkflowTools(workflowService, rateLimiter, auditService)
		workflowTools.RegisterTools(server)
	}

	// Register data tools (only if the data service is configured)
	if dataService != nil {
		dataTools := NewDataTools(dataService, rateLimiter, auditService)
		dataTools.RegisterTools(server)
	}

	// Register app tools (only if the app service is configured)
	if appService != nil {
		appTools := NewAppTools(appService, rateLimiter, auditService)
		appTools.RegisterTools(server)
	}
}
