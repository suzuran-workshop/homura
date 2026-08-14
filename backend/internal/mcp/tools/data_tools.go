package tools

import (
	"context"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/xrl/suzuran-cloud/internal/mcp"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// DataTools exposes app-owned data storage via MCP.
type DataTools struct {
	dataService *service.DataService
	rateLimiter *mcpserver.RateLimiter
	auditService *service.AuditService
}

// NewDataTools creates a new DataTools instance.
func NewDataTools(ds *service.DataService, rl *mcpserver.RateLimiter, as *service.AuditService) *DataTools {
	return &DataTools{dataService: ds, rateLimiter: rl, auditService: as}
}

// RegisterTools registers all data tools with the MCP server.
func (t *DataTools) RegisterTools(server *mcpserver.MCPServer) {
	// data.create_table
	server.AddTool(
		mcp.Tool{
			Name:        "data.create_table",
			Description: "Create a new table for the calling app. Table name is prefixed with app_id for isolation. Automatically adds id, org_id, created_at, updated_at columns.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name (lowercase, underscores only, max 63 chars)"},
					"columns": map[string]interface{}{
						"type":        "array",
						"description": "Column definitions",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"name":         map[string]interface{}{"type": "string"},
								"type":         map[string]interface{}{"type": "string", "enum": []string{"text", "integer", "boolean", "timestamp", "jsonb", "numeric", "date"}},
								"nullable":     map[string]interface{}{"type": "boolean"},
								"primaryKey":   map[string]interface{}{"type": "boolean"},
								"defaultValue": map[string]interface{}{},
							},
							"required": []string{"name", "type"},
						},
					},
				},
				Required: []string{"orgId", "tableName", "columns"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.create_table", Description: "Create a table", RequiredScope: "data.write",
			Handler: t.handleCreateTable, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.drop_table
	server.AddTool(
		mcp.Tool{
			Name:        "data.drop_table",
			Description: "Drop an app-owned table.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
				},
				Required: []string{"orgId", "tableName"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.drop_table", Description: "Drop a table", RequiredScope: "data.write",
			Handler: t.handleDropTable, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.list_tables
	server.AddTool(
		mcp.Tool{
			Name:        "data.list_tables",
			Description: "List all tables owned by the calling app.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId": map[string]interface{}{"type": "integer", "description": "Organization ID"},
				},
				Required: []string{"orgId"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.list_tables", Description: "List tables", RequiredScope: "data.read",
			Handler: t.handleListTables, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.describe_table
	server.AddTool(
		mcp.Tool{
			Name:        "data.describe_table",
			Description: "Get column definitions for a table.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
				},
				Required: []string{"orgId", "tableName"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.describe_table", Description: "Describe table", RequiredScope: "data.read",
			Handler: t.handleDescribeTable, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.insert
	server.AddTool(
		mcp.Tool{
			Name:        "data.insert",
			Description: "Insert a row into an app-owned table.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
					"data":      map[string]interface{}{"type": "object", "description": "Row data (key-value pairs)"},
				},
				Required: []string{"orgId", "tableName", "data"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.insert", Description: "Insert row", RequiredScope: "data.write",
			Handler: t.handleInsert, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.batch_insert
	server.AddTool(
		mcp.Tool{
			Name:        "data.batch_insert",
			Description: "Insert multiple rows in one call.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
					"rows": map[string]interface{}{
						"type":        "array",
						"description": "Array of row data objects",
						"items":       map[string]interface{}{"type": "object"},
					},
				},
				Required: []string{"orgId", "tableName", "rows"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.batch_insert", Description: "Batch insert rows", RequiredScope: "data.write",
			Handler: t.handleBatchInsert, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.query
	server.AddTool(
		mcp.Tool{
			Name:        "data.query",
			Description: "Query rows from an app-owned table with filters.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
					"where":     map[string]interface{}{"type": "object", "description": "Filter conditions (key-value pairs, all combined with AND)"},
					"orderBy":   map[string]interface{}{"type": "string", "description": "Column to order by"},
					"limit":     map[string]interface{}{"type": "integer", "description": "Maximum number of rows to return"},
					"offset":    map[string]interface{}{"type": "integer", "description": "Number of rows to skip"},
				},
				Required: []string{"orgId", "tableName"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.query", Description: "Query rows", RequiredScope: "data.read",
			Handler: t.handleQuery, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.update
	server.AddTool(
		mcp.Tool{
			Name:        "data.update",
			Description: "Update rows in an app-owned table.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
					"where":     map[string]interface{}{"type": "object", "description": "Filter conditions"},
					"data":      map[string]interface{}{"type": "object", "description": "Data to update"},
				},
				Required: []string{"orgId", "tableName", "where", "data"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.update", Description: "Update rows", RequiredScope: "data.write",
			Handler: t.handleUpdate, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.delete
	server.AddTool(
		mcp.Tool{
			Name:        "data.delete",
			Description: "Delete rows from an app-owned table.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
					"where":     map[string]interface{}{"type": "object", "description": "Filter conditions"},
				},
				Required: []string{"orgId", "tableName", "where"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.delete", Description: "Delete rows", RequiredScope: "data.write",
			Handler: t.handleDelete, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.count
	server.AddTool(
		mcp.Tool{
			Name:        "data.count",
			Description: "Count rows matching a filter.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
					"where":     map[string]interface{}{"type": "object", "description": "Filter conditions"},
				},
				Required: []string{"orgId", "tableName"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.count", Description: "Count rows", RequiredScope: "data.read",
			Handler: t.handleCount, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.add_column
	server.AddTool(
		mcp.Tool{
			Name:        "data.add_column",
			Description: "Add a column to an existing table.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":     map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"tableName": map[string]interface{}{"type": "string", "description": "Table name"},
					"column": map[string]interface{}{
						"type":        "object",
						"description": "Column definition",
						"properties": map[string]interface{}{
							"name":         map[string]interface{}{"type": "string"},
							"type":         map[string]interface{}{"type": "string"},
							"nullable":     map[string]interface{}{"type": "boolean"},
							"defaultValue": map[string]interface{}{},
						},
						"required": []string{"name", "type"},
					},
				},
				Required: []string{"orgId", "tableName", "column"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.add_column", Description: "Add column", RequiredScope: "data.write",
			Handler: t.handleAddColumn, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)

	// data.exec_raw
	server.AddTool(
		mcp.Tool{
			Name:        "data.exec_raw",
			Description: "Execute a parameterized SQL statement for complex queries. Restricted to the app's own tables only.",
			InputSchema: mcp.ToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"orgId":  map[string]interface{}{"type": "integer", "description": "Organization ID"},
					"sql":    map[string]interface{}{"type": "string", "description": "SQL statement with $1, $2, etc. placeholders"},
					"params": map[string]interface{}{"type": "array", "description": "Parameter values for placeholders", "items": map[string]interface{}{}},
				},
				Required: []string{"orgId", "sql"},
			},
		},
		mcpserver.WrapToolHandler(mcpserver.ToolConfig{
			Name: "data.exec_raw", Description: "Execute raw SQL", RequiredScope: "data.write",
			Handler: t.handleExecRaw, RateLimiter: t.rateLimiter, AuditService: t.auditService,
		}),
	)
}

// Handler implementations

func (t *DataTools) handleCreateTable(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	columnsArg, ok := args["columns"].([]interface{})
	if !ok {
		return mcpserver.CreateErrorResponse("columns must be an array"), fmt.Errorf("columns must be an array")
	}

	var columns []model.DataColumn
	for _, colArg := range columnsArg {
		colMap, ok := colArg.(map[string]interface{})
		if !ok {
			return mcpserver.CreateErrorResponse("invalid column definition"), fmt.Errorf("invalid column definition")
		}

		col := model.DataColumn{
			Name:     colMap["name"].(string),
			Type:     colMap["type"].(string),
			Nullable: mcpserver.GetOptionalBoolArg(colMap, "nullable", true),
		}
		if pk, ok := colMap["primaryKey"].(bool); ok {
			col.PrimaryKey = pk
		}
		if def, ok := colMap["defaultValue"]; ok {
			col.DefaultValue = def
		}
		columns = append(columns, col)
	}

	// Get app_id from context (injected by app runtime)
	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	if err := t.dataService.CreateTable(ctx, appID, orgID, tableName, columns); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success":   true,
		"tableName": tableName,
		"message":   fmt.Sprintf("Table '%s' created successfully", tableName),
	})
}

func (t *DataTools) handleDropTable(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	if err := t.dataService.DropTable(ctx, appID, orgID, tableName); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Table '%s' dropped successfully", tableName),
	})
}

func (t *DataTools) handleListTables(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	tables, err := t.dataService.ListTables(ctx, appID, orgID)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"tables": tables,
		"count":  len(tables),
	})
}

func (t *DataTools) handleDescribeTable(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	table, err := t.dataService.DescribeTable(ctx, appID, orgID, tableName)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(table)
}

func (t *DataTools) handleInsert(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	data, ok := args["data"].(map[string]interface{})
	if !ok {
		return mcpserver.CreateErrorResponse("data must be an object"), fmt.Errorf("data must be an object")
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	id, err := t.dataService.Insert(ctx, appID, orgID, tableName, data)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"id":      id,
		"message": "Row inserted successfully",
	})
}

func (t *DataTools) handleBatchInsert(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	rowsArg, ok := args["rows"].([]interface{})
	if !ok {
		return mcpserver.CreateErrorResponse("rows must be an array"), fmt.Errorf("rows must be an array")
	}

	var rows []map[string]interface{}
	for _, rowArg := range rowsArg {
		row, ok := rowArg.(map[string]interface{})
		if !ok {
			return mcpserver.CreateErrorResponse("invalid row data"), fmt.Errorf("invalid row data")
		}
		rows = append(rows, row)
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	ids, err := t.dataService.BatchInsert(ctx, appID, orgID, tableName, rows)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"ids":     ids,
		"count":   len(ids),
		"message": fmt.Sprintf("%d rows inserted successfully", len(ids)),
	})
}

func (t *DataTools) handleQuery(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	var where map[string]interface{}
	if whereArg, ok := args["where"].(map[string]interface{}); ok {
		where = whereArg
	}

	orderBy := mcpserver.GetOptionalStringArg(args, "orderBy", "")
	limit := mcpserver.GetOptionalIntArg(args, "limit", 100)
	offset := mcpserver.GetOptionalIntArg(args, "offset", 0)

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	rows, err := t.dataService.Query(ctx, appID, orgID, tableName, where, orderBy, limit, offset)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"rows":  rows,
		"count": len(rows),
	})
}

func (t *DataTools) handleUpdate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	where, ok := args["where"].(map[string]interface{})
	if !ok {
		return mcpserver.CreateErrorResponse("where must be an object"), fmt.Errorf("where must be an object")
	}

	data, ok := args["data"].(map[string]interface{})
	if !ok {
		return mcpserver.CreateErrorResponse("data must be an object"), fmt.Errorf("data must be an object")
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	count, err := t.dataService.Update(ctx, appID, orgID, tableName, where, data)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"count":   count,
		"message": fmt.Sprintf("%d rows updated successfully", count),
	})
}

func (t *DataTools) handleDelete(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	where, ok := args["where"].(map[string]interface{})
	if !ok {
		return mcpserver.CreateErrorResponse("where must be an object"), fmt.Errorf("where must be an object")
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	count, err := t.dataService.Delete(ctx, appID, orgID, tableName, where)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"count":   count,
		"message": fmt.Sprintf("%d rows deleted successfully", count),
	})
}

func (t *DataTools) handleCount(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	var where map[string]interface{}
	if whereArg, ok := args["where"].(map[string]interface{}); ok {
		where = whereArg
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	count, err := t.dataService.Count(ctx, appID, orgID, tableName, where)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"count": count,
	})
}

func (t *DataTools) handleAddColumn(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	tableName, err := mcpserver.GetStringArg(args, "tableName")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	colArg, ok := args["column"].(map[string]interface{})
	if !ok {
		return mcpserver.CreateErrorResponse("column must be an object"), fmt.Errorf("column must be an object")
	}

	col := model.DataColumn{
		Name:     colArg["name"].(string),
		Type:     colArg["type"].(string),
		Nullable: mcpserver.GetOptionalBoolArg(colArg, "nullable", true),
	}
	if def, ok := colArg["defaultValue"]; ok {
		col.DefaultValue = def
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	if err := t.dataService.AddColumn(ctx, appID, orgID, tableName, col); err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Column '%s' added successfully", col.Name),
	})
}

func (t *DataTools) handleExecRaw(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.Params.Arguments

	orgID, err := mcpserver.GetIntArg(args, "orgId")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	sql, err := mcpserver.GetStringArg(args, "sql")
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	var params []interface{}
	if paramsArg, ok := args["params"].([]interface{}); ok {
		params = paramsArg
	}

	appID, err := mcpserver.GetAppIDFromContext(ctx)
	if err != nil {
		return mcpserver.CreateErrorResponse("app_id not found in context"), err
	}

	rows, err := t.dataService.ExecRaw(ctx, appID, orgID, sql, params)
	if err != nil {
		return mcpserver.CreateErrorResponse(err.Error()), err
	}

	return mcpserver.CreateSuccessResponse(map[string]interface{}{
		"rows":  rows,
		"count": len(rows),
	})
}
