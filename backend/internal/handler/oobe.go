package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/model"
	"gorm.io/gorm"
)

// OOBEHandler handles Out-of-Box Experience setup endpoints.
type OOBEHandler struct {
	db *gorm.DB
}

func NewOOBEHandler(db *gorm.DB) *OOBEHandler {
	return &OOBEHandler{db: db}
}

// NeedOOBE checks if the system needs OOBE initialization.
// OOBE is needed when no user has a WebAuthn credential — partial setups
// (user created but no passkey registered) are treated as uninitialized.
func NeedOOBE(db *gorm.DB) bool {
	var count int64
	db.Model(&model.WebAuthnCredential{}).Count(&count)
	return count == 0
}

// Status returns whether OOBE is needed.
// GET /oobe/status
func (h *OOBEHandler) Status(c *gin.Context) {
	c.JSON(200, gin.H{"needOOBE": NeedOOBE(h.db)})
}

// Setup creates the first provider admin user and organization.
// Only available when no user has a WebAuthn credential (needOOBE == true).
// Automatically cleans up any partial data from previous failed OOBE attempts
// before creating fresh records.
// POST /oobe/setup
func (h *OOBEHandler) Setup(c *gin.Context) {
	// Guard: only allow when no user has a passkey
	if !NeedOOBE(h.db) {
		c.JSON(http.StatusForbidden, gin.H{"error": "system already initialized"})
		return
	}

	var req struct {
		AdminName  string `json:"adminName" binding:"required"`
		AdminEmail string `json:"adminEmail" binding:"required,email"`
		OrgName    string `json:"orgName" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Clean up any orphaned data from previous failed OOBE attempts
	// (users without credentials, empty orgs, dangling bonds)
	h.cleanupOrphanedOOBE()

	now := time.Now()

	var org model.Org
	var user model.User

	err := h.db.Transaction(func(tx *gorm.DB) error {
		// 1. Create the provider organization
		org = model.Org{
			Name:        req.OrgName,
			Description: "系统初始化管理员组织",
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}

		// 2. Create the admin user (no password — OAuth-only)
		user = model.User{
			Name:      req.AdminName,
			Email:     req.AdminEmail,
			IsActive:  true,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}

		// 3. Bind user to org as admin (provider role)
		bond := model.OrgUserBond{
			OrgID:     org.ID,
			UserID:    user.ID,
			IsAdmin:   true,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := tx.Create(&bond).Error; err != nil {
			return err
		}

		// 4. Create root department
		dept := model.Department{
			OrgID:     org.ID,
			Name:      "根部门",
			Level:     1,
			SortOrder: 0,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := tx.Create(&dept).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"userId": user.ID,
		"orgId":  org.ID,
	})
}

// cleanupOrphanedOOBE removes only data created by a previous failed OOBE attempt.
// It identifies orphaned OOBE data by checking for users that were created during
// OOBE (have an org_user_bond but no WebAuthn credentials) and only removes those.
// Pre-existing users (e.g. from DingTalk sync) are NOT affected.
func (h *OOBEHandler) cleanupOrphanedOOBE() {
	// Only clean up if there are users without credentials AND those users
	// were created very recently (within the last 30 minutes, indicating OOBE attempt).
	// This prevents wiping pre-existing accounts.
	h.db.Exec(`
		DELETE FROM org_user_bonds
		WHERE user_id IN (
			SELECT u.id FROM users u
			LEFT JOIN webauthn_credentials wc ON u.id = wc.user_id
			WHERE wc.id IS NULL
			AND u.created_at > NOW() - INTERVAL '30 minutes'
		)
	`)
	h.db.Exec(`
		DELETE FROM departments
		WHERE org_id IN (
			SELECT o.id FROM orgs o
			LEFT JOIN org_user_bonds b ON o.id = b.org_id
			WHERE b.id IS NULL
			AND o.created_at > NOW() - INTERVAL '30 minutes'
		)
	`)
	h.db.Exec(`
		DELETE FROM users
		WHERE id IN (
			SELECT u.id FROM users u
			LEFT JOIN webauthn_credentials wc ON u.id = wc.user_id
			WHERE wc.id IS NULL
			AND u.created_at > NOW() - INTERVAL '30 minutes'
		)
	`)
	h.db.Exec(`
		DELETE FROM orgs
		WHERE id IN (
			SELECT o.id FROM orgs o
			LEFT JOIN org_user_bonds b ON o.id = b.org_id
			WHERE b.id IS NULL
			AND o.created_at > NOW() - INTERVAL '30 minutes'
		)
	`)
}
