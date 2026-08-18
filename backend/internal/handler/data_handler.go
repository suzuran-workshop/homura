package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// DataHandler exposes REST endpoints for managing an app's data.
// Access is granted to the app's admins (per org) and providers.
type DataHandler struct {
	dataSvc *service.DataService
	distSvc *service.DistributionService
}

// NewDataHandler creates a new DataHandler.
func NewDataHandler(dataSvc *service.DataService, distSvc *service.DistributionService) *DataHandler {
	return &DataHandler{dataSvc: dataSvc, distSvc: distSvc}
}

// authorize rejects the request unless the caller is a provider or an app
// admin for (org, app).
func (h *DataHandler) authorize(c *gin.Context, appID string, orgID int) bool {
	userID := c.GetInt("user_id")
	ok, err := h.distSvc.IsAppAdmin(c.Request.Context(), userID, orgID, appID)
	if err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions: not an app admin"})
		return false
	}
	return true
}

// ListTables handles GET /api/data/orgs/:orgId/apps/:appId/tables
func (h *DataHandler) ListTables(c *gin.Context) {
	appID := c.Param("appId")
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	if !h.authorize(c, appID, orgID) {
		return
	}
	tables, err := h.dataSvc.ListTables(c.Request.Context(), appID, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(tables))
	for _, t := range tables {
		out = append(out, gin.H{"tableName": t.LogicalName, "columns": parseColumns(&t)})
	}
	c.JSON(http.StatusOK, gin.H{"tables": out})
}

// ListRows handles GET /api/data/orgs/:orgId/apps/:appId/tables/:tableName/rows
func (h *DataHandler) ListRows(c *gin.Context) {
	appID := c.Param("appId")
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	tableName := c.Param("tableName")
	if !h.authorize(c, appID, orgID) {
		return
	}
	limit := 50
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v > 0 {
			offset = v
		}
	}
	meta, err := h.dataSvc.DescribeTable(c.Request.Context(), appID, orgID, tableName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	rows, err := h.dataSvc.Query(c.Request.Context(), appID, orgID, tableName, nil, "id", limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	count, err := h.dataSvc.Count(c.Request.Context(), appID, orgID, tableName, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"table":   gin.H{"tableName": meta.LogicalName, "columns": parseColumns(meta)},
		"rows":    rows,
		"count":   count,
		"limit":   limit,
		"offset":  offset,
	})
}

// InsertRow handles POST /api/data/orgs/:orgId/apps/:appId/tables/:tableName/rows
func (h *DataHandler) InsertRow(c *gin.Context) {
	appID := c.Param("appId")
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	tableName := c.Param("tableName")
	if !h.authorize(c, appID, orgID) {
		return
	}
	var req struct {
		Data map[string]interface{} `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, err := h.dataSvc.Insert(c.Request.Context(), appID, orgID, tableName, req.Data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// UpdateRow handles PUT /api/data/orgs/:orgId/apps/:appId/tables/:tableName/rows/:rowId
func (h *DataHandler) UpdateRow(c *gin.Context) {
	appID := c.Param("appId")
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	tableName := c.Param("tableName")
	rowID, _ := strconv.Atoi(c.Param("rowId"))
	if !h.authorize(c, appID, orgID) {
		return
	}
	var req struct {
		Data map[string]interface{} `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.dataSvc.Update(c.Request.Context(), appID, orgID, tableName,
		map[string]interface{}{"id": rowID}, req.Data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": updated})
}

// DeleteRow handles DELETE /api/data/orgs/:orgId/apps/:appId/tables/:tableName/rows/:rowId
func (h *DataHandler) DeleteRow(c *gin.Context) {
	appID := c.Param("appId")
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	tableName := c.Param("tableName")
	rowID, _ := strconv.Atoi(c.Param("rowId"))
	if !h.authorize(c, appID, orgID) {
		return
	}
	deleted, err := h.dataSvc.Delete(c.Request.Context(), appID, orgID, tableName,
		map[string]interface{}{"id": rowID})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
}

// parseColumns extracts the column definitions stored in a DataTable's Columns JSONB.
func parseColumns(t *model.DataTable) []model.DataColumn {
	if t == nil {
		return nil
	}
	raw, ok := t.Columns["columns"]
	if !ok {
		return nil
	}
	str, ok := raw.(string)
	if !ok || str == "" {
		return nil
	}
	var cols []model.DataColumn
	if err := json.Unmarshal([]byte(str), &cols); err != nil {
		return nil
	}
	return cols
}