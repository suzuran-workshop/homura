package provider

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// DistributionHandler handles app distribution and per-org app admins.
type DistributionHandler struct {
	distService *service.DistributionService
}

// NewDistributionHandler creates a new DistributionHandler.
func NewDistributionHandler(distService *service.DistributionService) *DistributionHandler {
	return &DistributionHandler{distService: distService}
}

// List handles GET /api/provider/apps/:appId/distributions
func (h *DistributionHandler) List(c *gin.Context) {
	appID := c.Param("appId")
	dists, err := h.distService.ListDistributions(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"distributions": dists})
}

// Distribute handles POST /api/provider/apps/:appId/distributions
func (h *DistributionHandler) Distribute(c *gin.Context) {
	appID := c.Param("appId")
	var req struct {
		OrgID int `json:"orgId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.distService.DistributeApp(c.Request.Context(), appID, req.OrgID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "distributed"})
}

// Undistribute handles DELETE /api/provider/apps/:appId/distributions/:orgId
func (h *DistributionHandler) Undistribute(c *gin.Context) {
	appID := c.Param("appId")
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	if err := h.distService.UndistributeApp(c.Request.Context(), appID, orgID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "distribution removed"})
}

// SetAdmin handles POST /api/provider/apps/:appId/distributions/:orgId/admins
func (h *DistributionHandler) SetAdmin(c *gin.Context) {
	appID := c.Param("appId")
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	var req struct {
		UserID int `json:"userId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.distService.SetAppAdmin(c.Request.Context(), appID, orgID, req.UserID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "admin set"})
}

// RemoveAdmin handles DELETE /api/provider/apps/:appId/distributions/:orgId/admins/:userId
func (h *DistributionHandler) RemoveAdmin(c *gin.Context) {
	appID := c.Param("appId")
	orgID, _ := strconv.Atoi(c.Param("orgId"))
	userID, _ := strconv.Atoi(c.Param("userId"))
	if err := h.distService.RemoveAppAdmin(c.Request.Context(), appID, orgID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "admin removed"})
}