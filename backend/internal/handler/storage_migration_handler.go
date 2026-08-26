package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/repository"
	"github.com/xrl/suzuran-cloud/internal/storage"
)

// StorageMigrationHandler handles storage migration endpoints
type StorageMigrationHandler struct {
	migrationService *storage.MigrationService
	orgRepo          *repository.OrgRepository
	sourceBackend    string
	targetBackend    string
}

// NewStorageMigrationHandler creates a new storage migration handler
func NewStorageMigrationHandler(migrationService *storage.MigrationService, orgRepo *repository.OrgRepository, sourceBackend, targetBackend string) *StorageMigrationHandler {
	return &StorageMigrationHandler{
		migrationService: migrationService,
		orgRepo:          orgRepo,
		sourceBackend:    sourceBackend,
		targetBackend:    targetBackend,
	}
}

// MigrateOrg handles POST /api/provider/storage/migrate/:orgId
func (h *StorageMigrationHandler) MigrateOrg(c *gin.Context) {
	orgIDStr := c.Param("orgId")
	orgID, err := strconv.Atoi(orgIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid orgId"})
		return
	}

	// Verify org exists
	org, err := h.orgRepo.GetByID(c.Request.Context(), orgID)
	if err != nil || org == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}

	// Perform migration
	count, err := h.migrationService.MigrateOrgFiles(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   err.Error(),
			"source":  h.sourceBackend,
			"target":  h.targetBackend,
			"orgId":   orgID,
			"orgName": org.Name,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "migration completed",
		"source":  h.sourceBackend,
		"target":  h.targetBackend,
		"orgId":   orgID,
		"orgName": org.Name,
		"files":   count,
	})
}

// MigrateAll handles POST /api/provider/storage/migrate
func (h *StorageMigrationHandler) MigrateAll(c *gin.Context) {
	// Get all organizations
	orgs, err := h.orgRepo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list organizations"})
		return
	}

	orgIDs := make([]int, len(orgs))
	for i, org := range orgs {
		orgIDs[i] = org.ID
	}

	// Perform migration for all orgs
	count, err := h.migrationService.MigrateAllFiles(c.Request.Context(), orgIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  err.Error(),
			"source": h.sourceBackend,
			"target": h.targetBackend,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "migration completed",
		"source":  h.sourceBackend,
		"target":  h.targetBackend,
		"files":   count,
		"orgs":    len(orgIDs),
	})
}

// VerifyOrg handles GET /api/provider/storage/verify/:orgId
func (h *StorageMigrationHandler) VerifyOrg(c *gin.Context) {
	orgIDStr := c.Param("orgId")
	orgID, err := strconv.Atoi(orgIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid orgId"})
		return
	}

	verified, missing, err := h.migrationService.VerifyMigration(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"orgId":    orgID,
		"verified": verified,
		"missing":  missing,
		"source":   h.sourceBackend,
		"target":   h.targetBackend,
	})
}
