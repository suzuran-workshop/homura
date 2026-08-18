package mcp

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
)

// SchemaResource represents a JSON schema resource
type SchemaResource struct {
	Name        string
	URI         string
	Description string
	Content     string
}

// LoadSchemaResources loads JSON schema files from a directory
func LoadSchemaResources(dir string) []SchemaResource {
	var schemas []SchemaResource

	entries, err := os.ReadDir(dir)
	if err != nil {
		return schemas
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		path := filepath.Join(dir, entry.Name())
		content, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		name := strings.TrimSuffix(entry.Name(), ".json")
		schemas = append(schemas, SchemaResource{
			Name:        name,
			URI:         fmt.Sprintf("schema://%s.json", name),
			Description: fmt.Sprintf("JSON Schema for %s model", name),
			Content:     string(content),
		})
	}

	return schemas
}

// RegisterResources registers all MCP resources (schema documents)
func (s *MCPServer) RegisterResources(schemas []SchemaResource) {
	for _, schema := range schemas {
		resource := mcp.NewResource(
			schema.URI,
			schema.Name,
			mcp.WithResourceDescription(schema.Description),
			mcp.WithMIMEType("application/json"),
		)

		content := schema.Content

		// Register resource handler
		s.server.AddResource(resource, func(ctx context.Context, req mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
			return []mcp.ResourceContents{
				mcp.TextResourceContents{
					URI:      schema.URI,
					MIMEType: "application/json",
					Text:     content,
				},
			}, nil
		})
	}
}

// RegisterPrompts registers all MCP prompts (Agent guides)
func (s *MCPServer) RegisterPrompts() {
	// Prompt: How to list organizations
	listOrgsPrompt := mcp.NewPrompt(
		"list-organizations",
		mcp.WithPromptDescription("Guide for listing all organizations the user has access to"),
	)

	s.server.AddPrompt(listOrgsPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Guide for listing all organizations the user has access to",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `To list organizations, use the org.list tool. This tool returns all organizations the current user has access to.

Example usage:
1. Call org.list tool with no arguments
2. The tool returns an array of organization objects, each containing:
   - id: organization ID
   - name: organization name
   - description: organization description

This tool requires the 'org.read' scope and the 'provider' role.

Related tools:
- org.get: Get details of a specific organization by ID
- org.create: Create a new organization (provider only)
- org.update: Update organization details (provider only)
- org.delete: Delete an organization (provider only)`,
					},
				},
			},
		}, nil
	})

	// Prompt: How to create a user
	createUserPrompt := mcp.NewPrompt(
		"create-user",
		mcp.WithPromptDescription("Guide for creating a new user in an organization"),
	)

	s.server.AddPrompt(createUserPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Guide for creating a new user in an organization",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `To create a user, use the user.create_member tool. This requires appropriate permissions.

Required parameters:
- orgId: the organization ID where the user will be created
- phone: user's phone number
- name: user's full name

Optional parameters:
- email: user's email address
- position: user's job position
- isAdmin: whether the user is an org admin (default: false)
- departmentId: assign the user to a department
- isDepartmentManager: whether the user is a department manager (default: false)

Example workflow:
1. Verify you have 'org.write' scope for the target organization
2. Call user.create_member with the required parameters
3. The tool returns the created user object with assigned ID
4. Optionally, use user.update_member to set additional attributes
5. Optionally, use dept.set_manager to assign the user as a department manager

Related tools:
- user.list_members: List all members in an organization
- user.update_member: Update member information
- user.remove_member: Remove a member from the organization

Permissions required: 'org.write' scope for the organization.`,
					},
				},
			},
		}, nil
	})

	// Prompt: How to manage departments
	manageDeptsPrompt := mcp.NewPrompt(
		"manage-departments",
		mcp.WithPromptDescription("Guide for managing organizational departments"),
	)

	s.server.AddPrompt(manageDeptsPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Guide for managing organizational departments",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `Department management involves creating, updating, and organizing the organizational hierarchy.

Key tools:
- dept.list: List all departments in an organization
- dept.get: Get department details by ID
- dept.tree: Get departments in tree structure (hierarchy)
- dept.create: Create a new department
- dept.update: Update department information
- dept.delete: Delete a department
- dept.set_manager: Set department manager (assign a user as manager)

Department hierarchy:
- Departments support nested structure (parent-child relationships)
- Use dept.tree to visualize the complete hierarchy
- When creating a department, specify parentId to establish hierarchy

Example workflow for creating a department:
1. Call dept.list to see existing structure
2. Call dept.create with orgId, name, and optional parentId
3. Call dept.set_manager to assign a manager (requires a userId)

Example workflow for restructuring:
1. Call dept.tree to understand the current hierarchy
2. Call dept.update with a new parentId to move a department
3. Call dept.delete to remove empty departments

Permissions required: 'org.write' scope for the organization.`,
					},
				},
			},
		}, nil
	})

	// Prompt: How to upload files
	uploadFilePrompt := mcp.NewPrompt(
		"upload-file",
		mcp.WithPromptDescription("Guide for uploading files to storage"),
	)

	s.server.AddPrompt(uploadFilePrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Guide for uploading files to storage",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `To upload files, use the file.upload tool. Files are stored with org-scoped paths in MinIO (S3-compatible).

Required parameters:
- orgId: organization ID (files are stored under org-scoped paths)
- fileName: the name of the file
- fileBase64: file content as base64-encoded string
- contentType: MIME type (e.g., "application/pdf", "image/png")

File management tools:
- file.upload: Upload a new file (requires 'file.write' scope)
- file.download: Get a presigned download URL (requires 'file.read' scope)
- file.delete: Delete a file (requires 'file.write' scope)
- file.list: List files in an organization (requires 'file.read' scope)
- file.presigned_url: Generate a presigned URL for temporary access (requires 'file.read' scope)

Example workflow:
1. Read the file content and encode it as base64
2. Call file.upload with orgId, fileName, fileBase64, and contentType
3. The tool returns the file's objectKey and metadata
4. Use the objectKey with file.download or file.presigned_url for later access
5. Use file.list with orgId and optional prefix to browse files

Permissions required: 'file.write' scope for uploading, 'file.read' scope for downloading.`,
					},
				},
			},
		}, nil
	})

	// Prompt: How to query audit logs
	auditQueryPrompt := mcp.NewPrompt(
		"query-audit-logs",
		mcp.WithPromptDescription("Guide for querying audit logs"),
	)

	s.server.AddPrompt(auditQueryPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Guide for querying audit logs",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `To query audit logs, use the audit.query tool. This tracks all tool invocations and data changes.

Optional filter parameters:
- orgId: organization ID (filters to specific org)
- userId: user ID (filters to specific user)
- action: action type (e.g., "create", "update", "delete", "mcp_tool_call")
- resourceType: resource type (e.g., "user", "org", "dept", "file", "mcp")
- startTime: filter logs after this timestamp (ISO 8601 format)
- endTime: filter logs before this timestamp (ISO 8601 format)
- limit: maximum number of results (default: 100)
- offset: pagination offset (default: 0)

Audit log structure:
Each log entry contains:
- id: log entry ID
- orgId: organization ID
- userId: user ID who performed the action
- action: what action was performed
- resourceType: type of resource affected
- resourceId: ID of the affected resource
- timestamp: when the action occurred
- metadata: additional context (JSON)

To record custom audit entries, use audit.log:
- orgId: organization ID (required)
- action: action name (required)
- resourceType: resource type (required)
- resourceId: resource ID (optional)
- metadata: additional context (optional JSON object)

Example queries:
1. Get all logs for an organization: audit.query with orgId
2. Get user creation logs: audit.query with action="create" and resourceType="user"
3. Get MCP tool call logs: audit.query with action="mcp_tool_call"

Permissions required: 'audit.read' scope for querying, 'audit.write' scope for logging.`,
					},
				},
			},
		}, nil
	})

	// Prompt: How to authenticate with MCP
	authPrompt := mcp.NewPrompt(
		"authentication",
		mcp.WithPromptDescription("Guide for authenticating with the MCP server"),
	)

	s.server.AddPrompt(authPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Guide for authenticating with the MCP server",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `Authentication with the MCP server uses OAuth 2.0 with WebAuthn or DingTalk OAuth.

Authentication flow:
1. Obtain an access token through OAuth flow (WebAuthn or DingTalk)
2. Include the access token in the Authorization header: "Bearer {token}"
3. The MCP server validates the token and extracts user context
4. User context includes: user_id, org_id, role, scopes

Token scopes determine what operations are allowed:
- org.read — Read organization/user/department data
- org.write — Modify organization/user/department data
- file.read — Read/download files
- file.write — Upload/delete files
- audit.read — Query audit logs
- audit.write — Record custom audit log entries

Token expiration:
- Access tokens expire after 15 minutes
- Use refresh tokens to obtain new access tokens:
  POST /oauth/token (grant_type=refresh_token)
- Refresh tokens expire after 30 days and are rotated on each use

Error handling:
- 401 Unauthorized: Invalid or expired token
- 403 Forbidden: Insufficient scopes for the operation

Best practices:
- Always include the access token in requests
- Handle token expiration gracefully (refresh before expiry)
- Request only the scopes your application needs`,
					},
				},
			},
		}, nil
	})

	// Prompt: End-to-end application development guide
	developAppPrompt := mcp.NewPrompt(
		"develop-app",
		mcp.WithPromptDescription("End-to-end guide for developing and deploying an app on Suzuran Cloud"),
	)

	s.server.AddPrompt(developAppPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "End-to-end guide for developing and deploying an app on Suzuran Cloud",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `This guide walks you through developing and deploying an application on Suzuran Cloud.

## Step 1: Create app.json (Application Manifest)

Create an app.json file in your project root:

{
  "name": "my-app",          // lowercase alphanumeric + hyphens
  "version": "1.0.0",        // semver format
  "runtime": "node:18",      // node:18, node:20, python:3.11, or go:1.21
  "entrypoint": "node server.js",
  "port": 8080,
  "resources": {
    "cpu": "0.5",            // CPU cores (e.g., "0.5" = 50% of one core)
    "memory": "512Mi"        // memory limit
  },
  "mcp_scopes": ["org.read", "file.read"],  // required MCP permissions
  "routes": [
    { "path": "/api/*", "handler": "http://localhost:8080" }
  ]
}

## Step 2: Write application code using @suzuran/sdk

Install: npm install @suzuran/sdk

import { createApp } from '@suzuran/sdk'

const app = createApp({ name: 'my-app', port: 8080 })

// Register routes
app.get('/api/items', async (req, res) => {
  const members = await app.mcp.call('user.list_members', { orgId: req.orgId })
  res.json({ items: members })
})

// Lifecycle hooks
app.onStart(() => console.log('App starting...'))
app.onStop(() => console.log('App stopping...'))

app.start()

## Step 3: Deploy via Platform API

# Create the application
curl -X POST http://localhost:8888/api/provider/apps \
  -H "Authorization: Bearer $TOKEN" \
  -d @app.json

# Deploy (starts a Docker container)
curl -X POST http://localhost:8888/api/provider/apps/{appId}/deploy \
  -H "Authorization: Bearer $TOKEN"

# Access the application
curl http://localhost:8888/apps/{appId}/api/items

## Runtime Environment

The platform injects these environment variables into your container:
- APP_ID: your application ID
- ORG_ID: the organization that owns this app
- PORT: the port your app should listen on
- MCP_ENDPOINT: URL of the MCP server (http://backend:8888/mcp)
- OAUTH_TOKEN: OAuth token for MCP authentication

## Available MCP Tools (24 total)

Organization: org.get, org.list, org.create, org.update, org.delete
Users: user.list_members, user.create_member, user.update_member, user.remove_member
Departments: dept.list, dept.get, dept.tree, dept.create, dept.update, dept.delete, dept.set_manager
Files: file.upload, file.download, file.delete, file.list, file.presigned_url
Apps: app.import
Audit: audit.query, audit.log`,
					},
				},
			},
		}, nil
	})

	// Prompt: MCP tools catalog
	catalogPrompt := mcp.NewPrompt(
		"mcp-tools-catalog",
		mcp.WithPromptDescription("Complete catalog of all 24 MCP tools organized by category"),
	)

	s.server.AddPrompt(catalogPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Complete catalog of all 24 MCP tools organized by category",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `# MCP Tools Catalog (24 tools)

## Organization Tools (5) — scope: org.read / org.write
- org.get — Get organization details by ID [org.read]
- org.list — List all organizations (provider role only) [org.read]
- org.create — Create a new organization (provider role only) [org.write]
- org.update — Update organization details (provider role only) [org.write]
- org.delete — Delete an organization (provider role only) [org.write]

## User Tools (4) — scope: org.read / org.write
- user.list_members — List all members in an organization [org.read]
  Required: orgId
- user.create_member — Create a new member [org.write]
  Required: orgId, phone, name
- user.update_member — Update member information [org.write]
  Required: orgId, userId
- user.remove_member — Remove a member from the organization [org.write]
  Required: orgId, userId

## Department Tools (7) — scope: org.read / org.write
- dept.list — List all departments in an organization [org.read]
  Required: orgId
- dept.get — Get department details by ID [org.read]
  Required: deptId
- dept.tree — Get department hierarchy tree [org.read]
  Required: orgId
- dept.create — Create a new department [org.write]
  Required: orgId, name
- dept.update — Update department information [org.write]
  Required: deptId
- dept.delete — Delete a department [org.write]
  Required: deptId
- dept.set_manager — Set department manager [org.write]
  Required: deptId, managerUserId

## File Tools (5) — scope: file.read / file.write
- file.upload — Upload a file (base64 encoded) [file.write]
  Required: orgId, fileName, fileBase64, contentType
- file.download — Get presigned download URL [file.read]
  Required: objectKey
- file.delete — Delete a file [file.write]
  Required: objectKey
- file.list — List files in an organization [file.read]
  Required: orgId
- file.presigned_url — Generate presigned access URL [file.read]
  Required: objectKey

## App Tools (1) — scope: org.write
- app.import — Import an application from a base64 zip (must contain app.json)
  Required: orgId, zipBase64

## Audit Tools (2) — scope: audit.read / audit.write
- audit.query — Query audit logs with filters [audit.read]
  Optional: orgId, userId, action, resourceType, startTime, endTime, limit, offset
- audit.log — Create a custom audit log entry [audit.write]
  Required: orgId, action, resourceType

## How to call a tool

POST /mcp with JSON-RPC 2.0:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool.name",
    "arguments": { ... }
  }
}

Header: Authorization: Bearer <access_token>`,
					},
				},
			},
		}, nil
	})

	// Prompt: Cross-application data query guide
	dataQueryPrompt := mcp.NewPrompt(
		"data-query",
		mcp.WithPromptDescription("Guide for querying and sharing data across applications"),
	)

	s.server.AddPrompt(dataQueryPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Guide for querying and sharing data across applications",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `# Cross-Application Data Querying

Suzuran Cloud enables data sharing between applications through the MCP Server.
All data access goes through MCP tools — applications never connect to the database directly.

## Data Sharing Model

Applications share data in two layers:

1. **Foundation data** (automatically shared via MCP):
   - Organizations (org.get, org.list)
   - Users/members (user.list_members, user.create_member)
   - Departments (dept.list, dept.tree, dept.get)
   - Files (file.list, file.download)
   - Audit logs (audit.query)

2. **Application data** (app-specific, stored via the app's own logic):
   - Apps store their own data in their own way
   - To share with other apps, expose data through your HTTP routes
   - Other apps can fetch via your routes through the platform proxy

## Querying Patterns

### Get organization context
const org = await app.mcp.call('org.get', { orgId: req.orgId })

### List team members
const members = await app.mcp.call('user.list_members', { orgId: req.orgId })

### Navigate department hierarchy
const tree = await app.mcp.call('dept.tree', { orgId: req.orgId })

### Access shared files
const files = await app.mcp.call('file.list', {
  orgId: req.orgId,
  prefix: 'shared/',
  limit: 50
})

### Track what happened
const logs = await app.mcp.call('audit.query', {
  orgId: req.orgId,
  action: 'create',
  resourceType: 'user',
  limit: 20
})

## Important Constraints

- All MCP calls require a valid OAuth token (automatically handled by the SDK)
- Data is scoped to the caller's organization (org_id isolation)
- Rate limit: 100 MCP calls per minute per user
- Apps cannot directly access the database — must use MCP tools
- Apps cannot call other apps directly — must go through the platform proxy`,
					},
				},
			},
		}, nil
	})

	// Prompt: Workflow engine guide
	workflowPrompt := mcp.NewPrompt(
		"workflow-guide",
		mcp.WithPromptDescription("Guide for defining and running approval workflows via the platform workflow engine"),
	)

	s.server.AddPrompt(workflowPrompt, func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Description: "Guide for the platform workflow engine (define, start, approve, reject)",
			Messages: []mcp.PromptMessage{
				{
					Role: mcp.RoleAssistant,
					Content: mcp.TextContent{
						Type: "text",
						Text: `The platform provides a built-in workflow engine for approval/process flows (Spec 06).
Workflows are defined as JSON and exposed through MCP tools (workflow.* scopes).

## Defining a workflow

Call workflow.define with a definition JSON. Steps can be: start / approval / condition / end.

Example — a 2-level leave approval with a condition branch:

{
  "name": "请假审批",
  "variables": { "leaveDays": "number" },
  "steps": [
    { "name": "submit", "type": "start", "next": "manager_approve" },
    {
      "name": "manager_approve", "type": "approval",
      "assignee": { "type": "user", "value": 5 },
      "on_approve": { "goto": "check_days" },
      "on_reject":  { "goto": "end_rejected" }
    },
    {
      "name": "check_days", "type": "condition",
      "conditions": [
        { "when": "leaveDays > 3", "goto": "director_approve" },
        { "otherwise": "end_approved" }
      ]
    },
    {
      "name": "director_approve", "type": "approval",
      "assignee": { "type": "user", "value": 8 },
      "on_approve": { "goto": "end_approved" },
      "on_reject":  { "goto": "end_rejected" }
    },
    { "name": "end_approved", "type": "end", "result": "approved" },
    { "name": "end_rejected", "type": "end", "result": "rejected" }
  ]
}

Assignee types: { "type": "user", "value": "<user_id>" } (role-based assignees are not available in the current role model).
Conditions use simple expressions like "leaveDays > 3" (operators: > < >= <= == !=).

## Running a workflow

1. workflow.define       — create the definition (returns definitionId)
2. workflow.start        — start an instance with initial variables { "leaveDays": 5 }
3. workflow.list_tasks   — the approver lists their pending tasks
4. workflow.approve / workflow.reject — act on a task; the instance auto-advances
5. workflow.get_instance — inspect the instance status + task history

## Constraints

- All workflow.* tools require the 'workflow.read' or 'workflow.write' scope.
- Only the assignee of a task may approve/reject it.
- Only the instance creator or a provider may cancel a running instance.
- Workflow state is org-scoped (org_id isolation) and audited automatically.`,
					},
				},
			},
		}, nil
	})
}
