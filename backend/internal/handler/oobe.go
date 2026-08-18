package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/pkg/password"
	"github.com/xrl/suzuran-cloud/internal/pkg/username"
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
// OOBE is needed when no user has a password set AND no user has a WebAuthn credential.
// This supports both password-based and passkey-based initialization flows.
func NeedOOBE(db *gorm.DB) bool {
	var count int64
	db.Model(&model.User{}).Where("password_hash IS NOT NULL").Count(&count)
	if count > 0 {
		return false
	}
	db.Model(&model.WebAuthnCredential{}).Count(&count)
	return count == 0
}

// Status returns whether OOBE is needed.
// GET /oobe/status
func (h *OOBEHandler) Status(c *gin.Context) {
	c.JSON(200, gin.H{"needOOBE": NeedOOBE(h.db)})
}

// Setup creates the first provider admin user and organization.
// Only available when no user has a password or passkey (needOOBE == true).
// Automatically cleans up any partial data from previous failed OOBE attempts
// before creating fresh records.
// POST /oobe/setup
func (h *OOBEHandler) Setup(c *gin.Context) {
	// Guard: only allow when no user has a password or passkey
	if !NeedOOBE(h.db) {
		c.JSON(http.StatusForbidden, gin.H{"error": "system already initialized"})
		return
	}

	var req struct {
		AdminName     string `json:"adminName" binding:"required"`
		AdminEmail    string `json:"adminEmail" binding:"required,email"`
		AdminUsername string `json:"adminUsername" binding:"required"`
		AdminPassword string `json:"adminPassword" binding:"required,min=6"`
		OrgName       string `json:"orgName" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate username format
	uname := username.Normalize(req.AdminUsername)
	if err := username.Validate(uname); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Hash password
	hash, err := password.Hash(req.AdminPassword)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Clean up any orphaned data from previous failed OOBE attempts
	// (users without credentials, empty orgs, dangling bonds)
	h.cleanupOrphanedOOBE()

	now := time.Now()

	var org model.Org
	var user model.User

	err = h.db.Transaction(func(tx *gorm.DB) error {
		// Check username uniqueness inside the transaction
		var count int64
		tx.Model(&model.User{}).Where("username = ?", uname).Count(&count)
		if count > 0 {
			return errors.New("username already taken")
		}

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

		// 2. Create the admin user with username and password
		user = model.User{
			Name:         req.AdminName,
			Email:        req.AdminEmail,
			Username:     &uname,
			PasswordHash: &hash,
			IsActive:     true,
			CreatedAt:    now,
			UpdatedAt:    now,
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
// OOBE (have no password AND no WebAuthn credentials) and only removes those.
// Pre-existing users (e.g. from DingTalk sync or password-based accounts) are NOT affected.
func (h *OOBEHandler) cleanupOrphanedOOBE() {
	// Only clean up if there are users without credentials AND without password,
	// AND those users were created very recently (within the last 30 minutes,
	// indicating OOBE attempt). This prevents wiping pre-existing accounts.
	cutoff := time.Now().Add(-30 * time.Minute)

	h.db.Exec(`
		DELETE FROM org_user_bonds
		WHERE user_id IN (
			SELECT u.id FROM users u
			LEFT JOIN webauthn_credentials wc ON u.id = wc.user_id
			WHERE wc.id IS NULL
			AND u.password_hash IS NULL
			AND u.created_at > ?
		)
	`, cutoff)
	h.db.Exec(`
		DELETE FROM departments
		WHERE org_id IN (
			SELECT o.id FROM orgs o
			LEFT JOIN org_user_bonds b ON o.id = b.org_id
			WHERE b.id IS NULL
			AND o.created_at > ?
		)
	`, cutoff)
	h.db.Exec(`
		DELETE FROM users
		WHERE id IN (
			SELECT u.id FROM users u
			LEFT JOIN webauthn_credentials wc ON u.id = wc.user_id
			WHERE wc.id IS NULL
			AND u.password_hash IS NULL
			AND u.created_at > ?
		)
	`, cutoff)
	h.db.Exec(`
		DELETE FROM orgs
		WHERE id IN (
			SELECT o.id FROM orgs o
			LEFT JOIN org_user_bonds b ON o.id = b.org_id
			WHERE b.id IS NULL
			AND o.created_at > ?
		)
	`, cutoff)
}
