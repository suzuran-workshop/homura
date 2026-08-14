package provider

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/model"
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

// SeedApps handles POST /api/provider/apps/seed
// Scans the apps/ directory, reads app.json manifests, and creates Application records.
// Skips apps that already exist (by name).
func (h *AppHandler) SeedApps(c *gin.Context) {
	orgID := c.GetInt("org_id")

	// Default apps directory (can be overridden via APPS_DIR env var)
	appsDir := os.Getenv("APPS_DIR")
	if appsDir == "" {
		appsDir = "../../apps"
	}

	// Scan apps directory
	entries, err := os.ReadDir(appsDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read apps directory: " + err.Error()})
		return
	}

	// Get existing apps to avoid duplicates
	existingApps, _ := h.appService.ListApps(c.Request.Context(), orgID)
	existingNames := make(map[string]bool)
	for _, app := range existingApps {
		existingNames[app.Name] = true
	}

	var created []string
	var skipped []string
	var failed []map[string]string

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		appPath := filepath.Join(appsDir, entry.Name())
		manifestPath := filepath.Join(appPath, "app.json")

		// Check if app.json exists
		manifestData, err := os.ReadFile(manifestPath)
		if err != nil {
			continue // Skip directories without app.json
		}

		// Parse manifest
		var manifest struct {
			Name        string            `json:"name"`
			Version     string            `json:"version"`
			Runtime     string            `json:"runtime"`
			Entrypoint  string            `json:"entrypoint"`
			Port        int               `json:"port"`
			Resources   map[string]string `json:"resources"`
			MCPScopes   []string          `json:"mcp_scopes"`
			Routes      []model.Route     `json:"routes"`
		}

		if err := json.Unmarshal(manifestData, &manifest); err != nil {
			failed = append(failed, map[string]string{
				"app":   entry.Name(),
				"error": "Invalid manifest: " + err.Error(),
			})
			continue
		}

		// Skip if already exists
		if existingNames[manifest.Name] {
			skipped = append(skipped, manifest.Name)
			continue
		}

		// Create app
		req := service.CreateAppRequest{
			Name:        manifest.Name,
			Version:     manifest.Version,
			Runtime:     manifest.Runtime,
			Entrypoint:  manifest.Entrypoint,
			Port:        manifest.Port,
			CPUQuota:    manifest.Resources["cpu"],
			MemoryQuota: manifest.Resources["memory"],
			MCPScopes:   manifest.MCPScopes,
		}

		if _, err := h.appService.CreateApp(c.Request.Context(), orgID, req); err != nil {
			failed = append(failed, map[string]string{
				"app":   manifest.Name,
				"error": err.Error(),
			})
		} else {
			created = append(created, manifest.Name)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"created": created,
		"skipped": skipped,
		"failed":  failed,
	})
}
