package tools

import (
	"context"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// WorkflowTools exposes the platform workflow engine via MCP.
type WorkflowTools struct {
	wfService    *service.WorkflowService
	rateLimiter  *mcpserver.RateLimiter
	auditService *service.AuditService
}

// NewWorkflowTools creates a new WorkflowTools instance.
func NewWorkflowTools(wf *service.WorkflowService, rl *mcpserver.RateLimiter, as *service.AuditService) *WorkflowTools {
	return &WorkflowTools{wfService: wf, rateLimiter: rl, auditService: as}
}

// RegisterTools registers all workflow tools with the MCP server.
func (t *WorkflowTools) RegisterTools(server *mcpserver.MCPServer) {
	// workflow.define — create a workflow definition
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.define",
			Description: "Create a new workflow definition (steps, variables, assignees). The definition is a JSON object with name, variables, and steps[] where each step is one of: start/approval/condition/end.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":      map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"name":       map[string]interface{}{"type": "string", "description": "Workflow name"},
					"description": map[string]interface{}{"type": "string", "description": "Workflow description (optional)"},
					"definition": map[string]interface{}{"type": "object", "description": "Workflow definition JSON: {variables:{}, steps:[{name,type,next,assignee,on_approve,on_reject,conditions,result}] }"},
				},
				Required: []string{"orgId", "name", "definition"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.define", Description: "Define a workflow", RequiredScope: "workflow.write",
			Handler: t.handleDefine, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.get_definition
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.get_definition",
			Description: "Get a workflow definition by ID, including its full step graph.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"definitionId": map[string]interface{}{"type": "integer", "description": "Workflow definition ID"},
				},
				Required: []string{"orgId", "definitionId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.get_definition", Description: "Get a workflow definition", RequiredScope: "workflow.read",
			Handler: t.handleGetDefinition, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.list_definitions
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.list_definitions",
			Description: "List all workflow definitions for an organization.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{"type": "integer", "description": "Organization ID"},
				},
				Required: []string{"orgId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.list_definitions", Description: "List workflow definitions", RequiredScope: "workflow.read",
			Handler: t.handleListDefinitions, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.archive
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.archive",
			Description: "Archive a workflow definition so no new instances can be started from it.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"definitionId": map[string]interface{}{"type": "integer", "description": "Workflow definition ID"},
				},
				Required: []string{"orgId", "definitionId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.archive", Description: "Archive a workflow definition", RequiredScope: "workflow.write",
			Handler: t.handleArchive, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.start
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.start",
			Description: "Start a new workflow instance from a definition, providing initial variables.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"definitionId": map[string]interface{}{"type": "integer", "description": "Workflow definition ID"},
					"variables": map[string]interface{}{"type": "object", "description": "Initial workflow variables (e.g. {leaveDays:3, leaveType:'sick'})"},
				},
				Required: []string{"orgId", "definitionId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.start", Description: "Start a workflow instance", RequiredScope: "workflow.write",
			Handler: t.handleStart, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.get_instance
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.get_instance",
			Description: "Get a workflow instance by ID, including its current step, status, variables, and full task history.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"instanceId": map[string]interface{}{"type": "integer", "description": "Workflow instance ID"},
				},
				Required: []string{"orgId", "instanceId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.get_instance", Description: "Get a workflow instance", RequiredScope: "workflow.read",
			Handler: t.handleGetInstance, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.list_instances
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.list_instances",
			Description: "List workflow instances for an organization, optionally filtered by status (running/approved/rejected/cancelled).",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":  map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"status": map[string]interface{}{"type": "string", "description": "Optional status filter"},
				},
				Required: []string{"orgId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.list_instances", Description: "List workflow instances", RequiredScope: "workflow.read",
			Handler: t.handleListInstances, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.cancel
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.cancel",
			Description: "Cancel a running workflow instance. Only the creator or an org admin may cancel.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":      map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"instanceId": map[string]interface{}{"type": "integer", "description": "Workflow instance ID"},
				},
				Required: []string{"orgId", "instanceId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.cancel", Description: "Cancel a workflow instance", RequiredScope: "workflow.write",
			Handler: t.handleCancel, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.list_tasks
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.list_tasks",
			Description: "List workflow tasks for the calling user (their pending approvals and acted history), optionally filtered by status.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"status": map[string]interface{}{"type": "string", "description": "Optional status filter (pending/approved/rejected)"},
				},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.list_tasks", Description: "List my workflow tasks", RequiredScope: "workflow.read",
			Handler: t.handleListTasks, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.approve
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.approve",
			Description: "Approve a pending workflow task assigned to the calling user, advancing the instance along its approve branch.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":  map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"taskId": map[string]interface{}{"type": "integer", "description": "Task ID to approve"},
					"comment": map[string]interface{}{"type": "string", "description": "Approval comment (optional)"},
				},
				Required: []string{"orgId", "taskId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.approve", Description: "Approve a workflow task", RequiredScope: "workflow.write",
			Handler: t.handleApprove, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// workflow.reject
	server.AddTool(
		mcp.Tool{
			Name:        "workflow.reject",
			Description: "Reject a pending workflow task assigned to the calling user, routing the instance along its reject branch.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":   map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"taskId":  map[string]interface{}{"type": "integer", "description": "Task ID to reject"},
					"comment": map[string]interface{}{"type": "string", "description": "Rejection comment (optional)"},
				},
				Required: []string{"orgId", "taskId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "workflow.reject", Description: "Reject a workflow task", RequiredScope: "workflow.write",
			Handler: t.handleReject, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)
}

// --- handlers ---

func (t *WorkflowTools) handleDefine(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	name, err := mcpserver.GetStringArg(request.Params.Arguments, "name")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	description := mcpserver.GetOptionalStringArg(request.Params.Arguments, "description", "")
	defRaw, ok := request.Params.Arguments["definition"].(map[string]interface{})
	if !ok {
		return mcpserver.CreateErrorResponse("definition must be a JSON object"), nil
	}
	userID, _ := mcpserver.GetUserIDFromContext(ctx)

	def, err := t.wfService.DefineWorkflow(ctx, orgID, userID, name, description, defRaw)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to define workflow: %v", err)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"id": def.ID, "name": def.Name, "version": def.Version, "status": def.Status,
	})
}

func (t *WorkflowTools) handleGetDefinition(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	defID, err := mcpserver.GetIntArg(request.Params.Arguments, "definitionId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	def, err := t.wfService.GetDefinition(ctx, orgID, defID)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to get definition: %v", err)), nil
	}
	if def == nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("definition not found: %d", defID)), nil
	}
	return mcpserver.CreateSuccessResponse(def)
}

func (t *WorkflowTools) handleListDefinitions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	list, err := t.wfService.ListDefinitions(ctx, orgID)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to list definitions: %v", err)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"definitions": list, "count": len(list)})
}

func (t *WorkflowTools) handleArchive(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	defID, err := mcpserver.GetIntArg(request.Params.Arguments, "definitionId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	if err := t.wfService.ArchiveDefinition(ctx, orgID, defID); err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to archive definition: %v", err)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"success": true, "message": "definition archived"})
}

func (t *WorkflowTools) handleStart(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	defID, err := mcpserver.GetIntArg(request.Params.Arguments, "definitionId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	vars, _ := request.Params.Arguments["variables"].(map[string]interface{})
	userID, _ := mcpserver.GetUserIDFromContext(ctx)

	inst, err := t.wfService.StartInstance(ctx, orgID, defID, userID, vars)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to start workflow: %v", err)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"instanceId": inst.ID, "definitionId": inst.DefinitionID, "status": inst.Status, "currentStep": inst.CurrentStep,
	})
}

func (t *WorkflowTools) handleGetInstance(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	instID, err := mcpserver.GetIntArg(request.Params.Arguments, "instanceId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	inst, tasks, err := t.wfService.GetInstance(ctx, orgID, instID)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to get instance: %v", err)), nil
	}
	if inst == nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("instance not found: %d", instID)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"instance": inst, "tasks": tasks,
	})
}

func (t *WorkflowTools) handleListInstances(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	status := mcpserver.GetOptionalStringArg(request.Params.Arguments, "status", "")
	list, err := t.wfService.ListInstances(ctx, orgID, status)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to list instances: %v", err)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"instances": list, "count": len(list)})
}

func (t *WorkflowTools) handleCancel(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	instID, err := mcpserver.GetIntArg(request.Params.Arguments, "instanceId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	userID, _ := mcpserver.GetUserIDFromContext(ctx)
	role, _ := mcpserver.GetRoleFromContext(ctx)
	isAdmin := role == "provider"

	if err := t.wfService.CancelInstance(ctx, orgID, instID, userID, isAdmin); err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to cancel instance: %v", err)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"success": true, "message": "instance cancelled"})
}

func (t *WorkflowTools) handleListTasks(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	userID, err := mcpserver.GetUserIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	status := mcpserver.GetOptionalStringArg(request.Params.Arguments, "status", "")
	list, err := t.wfService.ListTasks(ctx, userID, status)
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to list tasks: %v", err)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{"tasks": list, "count": len(list)})
}

func (t *WorkflowTools) handleApprove(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return t.actOnTask(ctx, request, "approved")
}

func (t *WorkflowTools) handleReject(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return t.actOnTask(ctx, request, "rejected")
}

func (t *WorkflowTools) actOnTask(ctx context.Context, request mcp.CallToolRequest, decision string) (*mcp.CallToolResult, error) {
	orgID, err := mcpserver.GetIntArg(request.Params.Arguments, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	taskID, err := mcpserver.GetIntArg(request.Params.Arguments, "taskId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), nil
	}
	comment := mcpserver.GetOptionalStringArg(request.Params.Arguments, "comment", "")
	userID, _ := mcpserver.GetUserIDFromContext(ctx)

	var (
		inst *model.WorkflowInstance
	)
	if decision == "approved" {
		inst, err = t.wfService.ApproveTask(ctx, orgID, taskID, userID, comment)
	} else {
		inst, err = t.wfService.RejectTask(ctx, orgID, taskID, userID, comment)
	}
	if err != nil {
		return mcpserver.CreateErrorResponse(fmt.Sprintf("failed to %s task: %v", decision, err)), nil
	}
	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"instanceId": inst.ID, "status": inst.Status, "currentStep": inst.CurrentStep,
	})
}
