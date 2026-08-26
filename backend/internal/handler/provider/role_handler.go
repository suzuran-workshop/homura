package provider

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// RoleHandler handles organization-scoped role management endpoints.
type RoleHandler struct {
	roleService *service.RoleService
}

func NewRoleHandler(rs *service.RoleService) *RoleHandler {
	return &RoleHandler{roleService: rs}
}

// ListRoles GET /api/provider/orgs/:orgId/roles
func (h *RoleHandler) ListRoles(c *gin.Context) {
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	roles, err := h.roleService.ListRoles(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"roles": roles})
}

// CreateRole POST /api/provider/orgs/:orgId/roles
func (h *RoleHandler) CreateRole(c *gin.Context) {
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	var req struct {
		Name        string                 `json:"name" binding:"required"`
		Description string                 `json:"description"`
		Permissions map[string]interface{} `json:"permissions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	role, err := h.roleService.CreateRole(c.Request.Context(), orgID, req.Name, req.Description, req.Permissions)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, role)
}

// GetRole GET /api/provider/orgs/:orgId/roles/:roleId
func (h *RoleHandler) GetRole(c *gin.Context) {
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	roleID, _ := strconv.Atoi(c.Param("roleId"))
	role, err := h.roleService.GetRole(c.Request.Context(), orgID, roleID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, role)
}

// UpdateRole PUT /api/provider/orgs/:orgId/roles/:roleId
func (h *RoleHandler) UpdateRole(c *gin.Context) {
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	roleID, _ := strconv.Atoi(c.Param("roleId"))
	var req struct {
		Name        string                 `json:"name"`
		Description string                 `json:"description"`
		Permissions map[string]interface{} `json:"permissions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	role, err := h.roleService.UpdateRole(c.Request.Context(), orgID, roleID, req.Name, req.Description, req.Permissions)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, role)
}

// DeleteRole DELETE /api/provider/orgs/:orgId/roles/:roleId
func (h *RoleHandler) DeleteRole(c *gin.Context) {
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	roleID, _ := strconv.Atoi(c.Param("roleId"))
	if err := h.roleService.DeleteRole(c.Request.Context(), orgID, roleID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// AssignRole POST /api/provider/orgs/:orgId/roles/:roleId/users/:userId
func (h *RoleHandler) AssignRole(c *gin.Context) {
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	roleID, _ := strconv.Atoi(c.Param("roleId"))
	userID, _ := strconv.Atoi(c.Param("userId"))
	if err := h.roleService.AssignRole(c.Request.Context(), orgID, userID, roleID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// UnassignRole DELETE /api/provider/orgs/:orgId/roles/:roleId/users/:userId
func (h *RoleHandler) UnassignRole(c *gin.Context) {
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	roleID, _ := strconv.Atoi(c.Param("roleId"))
	userID, _ := strconv.Atoi(c.Param("userId"))
	if err := h.roleService.UnassignRole(c.Request.Context(), orgID, userID, roleID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetUserRoles GET /api/provider/orgs/:orgId/users/:userId/roles
func (h *RoleHandler) GetUserRoles(c *gin.Context) {
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	userID, _ := strconv.Atoi(c.Param("userId"))
	roles, err := h.roleService.GetUserRoles(c.Request.Context(), orgID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"roles": roles})
}
