package common

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// OrgMgmtHandler provides department and member management endpoints.
// It accepts an OrgIDResolver so provider (from URL param) and tenant (from context)
// can share the same logic.
//
// Authorization is handled entirely by middleware (RequireProvider)
// mounted on the route group — this handler performs no role checks of its own.
type OrgMgmtHandler struct {
	resolveOrgID OrgIDResolver
	deptService  *service.DepartmentService
	userService  *service.UserService
}

// NewOrgMgmtHandler creates a new OrgMgmtHandler.
func NewOrgMgmtHandler(resolver OrgIDResolver, ds *service.DepartmentService, us *service.UserService) *OrgMgmtHandler {
	return &OrgMgmtHandler{
		resolveOrgID: resolver,
		deptService:  ds,
		userService:  us,
	}
}

// --- Department endpoints ---

func (h *OrgMgmtHandler) ListDepts(c *gin.Context) {
	orgID, err := h.resolveOrgID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	depts, err := h.deptService.GetDeptsByOrgID(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, depts)
}

func (h *OrgMgmtHandler) DeptTree(c *gin.Context) {
	orgID, err := h.resolveOrgID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tree, err := h.deptService.BuildTree(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tree)
}

func (h *OrgMgmtHandler) CreateDept(c *gin.Context) {
	orgID, err := h.resolveOrgID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var req struct {
		Name        string `json:"name"`
		ParentID    *int   `json:"parentId"`
		Level       int    `json:"level"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dept := &model.Department{
		OrgID:       orgID,
		Name:        req.Name,
		ParentID:    req.ParentID,
		Level:       req.Level,
		Description: req.Description,
	}
	created, err := h.deptService.CreateDept(c.Request.Context(), dept)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

func (h *OrgMgmtHandler) UpdateDept(c *gin.Context) {
	orgID, err := h.resolveOrgID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	deptID, _ := strconv.Atoi(c.Param("deptId"))
	var req struct {
		Name        string `json:"name"`
		ParentID    *int   `json:"parentId"`
		Level       int    `json:"level"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dept := &model.Department{
		ID:          deptID,
		OrgID:       orgID,
		Name:        req.Name,
		ParentID:    req.ParentID,
		Level:       req.Level,
		Description: req.Description,
	}
	if err := h.deptService.UpdateDept(c.Request.Context(), dept); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *OrgMgmtHandler) DeleteDept(c *gin.Context) {
	deptID, _ := strconv.Atoi(c.Param("deptId"))
	if err := h.deptService.DeleteDept(c.Request.Context(), deptID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *OrgMgmtHandler) SetDeptManager(c *gin.Context) {
	deptID, _ := strconv.Atoi(c.Param("deptId"))
	var req struct {
		ManagerUserID int `json:"managerUserId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.deptService.SetManager(c.Request.Context(), deptID, req.ManagerUserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "manager set"})
}

// --- Member endpoints ---

func (h *OrgMgmtHandler) ListMembers(c *gin.Context) {
	orgID, err := h.resolveOrgID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	members, err := h.userService.ListMembers(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *OrgMgmtHandler) CreateMember(c *gin.Context) {
	orgID, err := h.resolveOrgID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var req struct {
		Phone    string `json:"phone"`
		Name     string `json:"name"`
		Email    string `json:"email"`
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
		Position string `json:"position"`
		IsAdmin   bool  `json:"isAdmin"`
		DeptID    *int  `json:"departmentId"`
		IsDeptMgr bool  `json:"isDepartmentManager"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	member, err := h.userService.CreateMember(c.Request.Context(), orgID, req.Phone, req.Name, req.Email, req.Username, req.Password, req.Position, req.IsAdmin, req.DeptID, req.IsDeptMgr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, member)
}

func (h *OrgMgmtHandler) UpdateMember(c *gin.Context) {
	orgID, err := h.resolveOrgID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, _ := strconv.Atoi(c.Param("userId"))
	var req struct {
		Name      string `json:"name"`
		Email     string `json:"email"`
		Position  string `json:"position"`
		IsAdmin   *bool  `json:"isAdmin"`
		DeptID    *int   `json:"departmentId"`
		IsDeptMgr *bool  `json:"isDepartmentManager"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	member, err := h.userService.UpdateMember(c.Request.Context(), orgID, userID, req.Name, req.Email, req.Position, req.IsAdmin, req.DeptID, req.IsDeptMgr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, member)
}

func (h *OrgMgmtHandler) RemoveMember(c *gin.Context) {
	orgID, err := h.resolveOrgID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, _ := strconv.Atoi(c.Param("userId"))

	// Get the current user's ID from context (set by auth middleware)
	currentUserID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if err := h.userService.RemoveMember(c.Request.Context(), orgID, userID, currentUserID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

// ResetPassword
// POST /api/provider/orgs/:orgId/users/:userId/reset-password
// POST /api/tenant/users/:userId/reset-password
func (h *OrgMgmtHandler) ResetPassword(c *gin.Context) {
	userID, _ := strconv.Atoi(c.Param("userId"))
	var req struct {
		NewPassword string `json:"newPassword" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.userService.ResetPassword(c.Request.Context(), userID, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password reset successful"})
}
