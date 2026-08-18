package provider

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/service"
)

// AppHandler handles application management HTTP requests.
type AppHandler struct {
	appService *service.ApplicationService
}

// NewAppHandler creates a new AppHandler.
func NewAppHandler(appService *service.ApplicationService) *AppHandler {
	return &AppHandler{appService: appService}
}

// Create handles POST /api/provider/apps
func (h *AppHandler) Create(c *gin.Context) {
	orgID := c.GetInt("org_id")
	var req service.CreateAppRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	app, err := h.appService.CreateApp(c.Request.Context(), orgID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, app)
}

// List handles GET /api/provider/apps
func (h *AppHandler) List(c *gin.Context) {
	orgID := c.GetInt("org_id")
	apps, err := h.appService.ListApps(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"apps": apps})
}

// GetByID handles GET /api/provider/apps/:appId
func (h *AppHandler) GetByID(c *gin.Context) {
	appID := c.Param("appId")
	app, err := h.appService.GetApp(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, app)
}

// Update handles PUT /api/provider/apps/:appId
func (h *AppHandler) Update(c *gin.Context) {
	appID := c.Param("appId")
	var req service.UpdateAppRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	app, err := h.appService.UpdateApp(c.Request.Context(), appID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, app)
}

// Delete handles DELETE /api/provider/apps/:appId
func (h *AppHandler) Delete(c *gin.Context) {
	appID := c.Param("appId")
	if err := h.appService.DeleteApp(c.Request.Context(), appID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// Deploy handles POST /api/provider/apps/:appId/deploy
// Extracts the caller's OAuth token and injects it into the container
// so the app can authenticate to the MCP server.
func (h *AppHandler) Deploy(c *gin.Context) {
	appID := c.Param("appId")
	// Extract the raw Bearer token from the Authorization header
	oauthToken := ""
	if auth := c.GetHeader("Authorization"); len(auth) > 7 && auth[:7] == "Bearer " {
		oauthToken = auth[7:]
	}
	deployment, err := h.appService.DeployApp(c.Request.Context(), appID, oauthToken)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, deployment)
}

// Start handles POST /api/provider/apps/:appId/start
func (h *AppHandler) Start(c *gin.Context) {
	appID := c.Param("appId")
	if err := h.appService.StartApp(c.Request.Context(), appID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "started"})
}

// Stop handles POST /api/provider/apps/:appId/stop
func (h *AppHandler) Stop(c *gin.Context) {
	appID := c.Param("appId")
	if err := h.appService.StopApp(c.Request.Context(), appID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "stopped"})
}

// Restart handles POST /api/provider/apps/:appId/restart
func (h *AppHandler) Restart(c *gin.Context) {
	appID := c.Param("appId")
	if err := h.appService.RestartApp(c.Request.Context(), appID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "restarted"})
}

// Status handles GET /api/provider/apps/:appId/status
func (h *AppHandler) Status(c *gin.Context) {
	appID := c.Param("appId")
	status, err := h.appService.GetAppStatus(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": status})
}

// Logs handles GET /api/provider/apps/:appId/logs?tail=100
func (h *AppHandler) Logs(c *gin.Context) {
	appID := c.Param("appId")
	tail := 100
	if t := c.Query("tail"); t != "" {
		if v, err := strconv.Atoi(t); err == nil {
			tail = v
		}
	}
	logs, err := h.appService.GetAppLogs(c.Request.Context(), appID, tail)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// Deployments handles GET /api/provider/apps/:appId/deployments
func (h *AppHandler) Deployments(c *gin.Context) {
	appID := c.Param("appId")
	deployments, err := h.appService.GetDeployments(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deployments": deployments})
}

// Import handles POST /api/provider/apps/import
// Uploads an application code zip (must contain app.json at its root).
// The package is stored in object storage, so apps do not depend on
// host filesystem paths and survive database resets.
func (h *AppHandler) Import(c *gin.Context) {
	orgID := c.GetInt("org_id")

	// Limit request body to the maximum package size.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxZipSize)

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required: " + err.Error()})
		return
	}
	defer file.Close()

	zipData, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read package: " + err.Error()})
		return
	}

	app, err := h.appService.ImportApp(c.Request.Context(), orgID, zipData)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, app)
}
