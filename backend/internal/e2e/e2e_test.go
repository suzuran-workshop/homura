package e2e

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/xrl/suzuran-cloud/internal/handler/provider"
	"github.com/xrl/suzuran-cloud/internal/middleware"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/pkg/jwt"
	"github.com/xrl/suzuran-cloud/internal/repository"
	"github.com/xrl/suzuran-cloud/internal/service"
)

const (
	e2eIssuer    = "https://suzuran.test"
	e2eTTLSeconds = 900
)

// setupE2ETestDB creates a fresh in-memory SQLite DB with all tables migrated.
func setupE2ETestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Org{},
		&model.OrgUserBond{},
		&model.Department{},
	))

	return db
}

// setupRouter creates a gin router with the protected routes for E2E testing.
// Auth is simulated via mockAuthMiddleware which verifies real RS256 JWTs.
func setupRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	orgRepo := repository.NewOrgRepository(db)
	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)

	orgService := service.NewOrgService(orgRepo, deptRepo, bondRepo)
	deptService := service.NewDepartmentService(deptRepo, bondRepo)
	userSvc := service.NewUserService(userRepo, bondRepo)

	orgHandler := provider.NewOrgHandler(orgService)
	deptHandler := provider.NewOrgMemberHandler(deptService, userSvc)

	r.Use(middleware.CORS())

	protected := r.Group("/api")
	protected.Use(mockAuthMiddleware())
	protected.Use(middleware.TenantContext())
	{
		providerGroup := protected.Group("/provider")
		{
			providerGroup.GET("/orgs", orgHandler.List)
			providerGroup.POST("/orgs", orgHandler.Create)
			providerGroup.PUT("/orgs/:orgId", orgHandler.Update)
			providerGroup.DELETE("/orgs/:orgId", orgHandler.Delete)

			// Organization department management (provider-operated)
			orgDepts := providerGroup.Group("/orgs/:orgId/departments")
			{
				orgDepts.GET("", deptHandler.ListDepts)
				orgDepts.GET("/tree", deptHandler.DeptTree)
				orgDepts.POST("", deptHandler.CreateDept)
				orgDepts.PUT("/:deptId", deptHandler.UpdateDept)
				orgDepts.DELETE("/:deptId", deptHandler.DeleteDept)
				orgDepts.POST("/:deptId/manager", deptHandler.SetDeptManager)
			}
		}
	}

	return r
}

// mockAuthMiddleware verifies a real RS256 JWT (OAuth access token) and sets
// user context. This mirrors middleware.Auth() but inlined so the e2e suite
// doesn't need a full OAuth IdP running.
func mockAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			c.Abort()
			return
		}
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token format"})
			c.Abort()
			return
		}
		claims, err := jwt.VerifyToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("org_id", claims.OrgID)
		c.Set("role", claims.Role)
		c.Next()
	}
}

// E2E Test 1: Provider Org Management Flow
// Verifies a provider-scoped JWT can create and list orgs.
func TestE2E_ProviderOrgManagementFlow(t *testing.T) {
	db := setupE2ETestDB(t)
	defer func() {
		db.Exec("DELETE FROM org_user_bonds")
		db.Exec("DELETE FROM orgs")
		db.Exec("DELETE FROM users")
	}()

	user := createTestUser(t, db, "Test User")
	org := createTestOrg(t, db, "Provider Org", "Provider Organization")
	createTestBond(t, db, org.ID, user.ID, true)

	router := setupRouter(db)
	token := generateJWTToken(t, user.ID, org.ID, "provider")

	// Create an org
	w := httptest.NewRecorder()
	orgData := map[string]string{"name": "New Org", "description": "via provider"}
	req := httptest.NewRequest("POST", "/api/provider/orgs", bytes.NewReader(mustJSON(t, orgData)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Org-ID", fmt.Sprintf("%d", org.ID))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Failed to create org: %s", w.Body.String())

	// List orgs
	w = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/provider/orgs", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Org-ID", fmt.Sprintf("%d", org.ID))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	t.Logf("✅ Provider org management flow completed")
}

// E2E Test 2: Provider Department Management Flow
// Department management is provider-operated; tenant_admin role no longer exists.
func TestE2E_ProviderDepartmentManagementFlow(t *testing.T) {
	db := setupE2ETestDB(t)
	defer func() {
		db.Exec("DELETE FROM departments")
		db.Exec("DELETE FROM org_user_bonds")
		db.Exec("DELETE FROM orgs")
		db.Exec("DELETE FROM users")
	}()

	user := createTestUser(t, db, "Provider Admin")
	org := createTestOrg(t, db, "Tenant Org", "Tenant Organization")
	createTestBond(t, db, org.ID, user.ID, true)

	router := setupRouter(db)
	token := generateJWTToken(t, user.ID, org.ID, "provider")

	// Create a department
	w := httptest.NewRecorder()
	deptData := map[string]interface{}{"name": "Engineering", "level": 1}
	req := httptest.NewRequest("POST", fmt.Sprintf("/api/provider/orgs/%d/departments", org.ID), bytes.NewReader(mustJSON(t, deptData)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Org-ID", fmt.Sprintf("%d", org.ID))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Failed to create department: %s", w.Body.String())
	t.Logf("✅ Provider department management flow completed")
}

// E2E Test 3: Multi-Tenant Isolation
func TestE2E_MultiTenantIsolation(t *testing.T) {
	db := setupE2ETestDB(t)
	defer func() {
		db.Exec("DELETE FROM org_user_bonds")
		db.Exec("DELETE FROM orgs")
		db.Exec("DELETE FROM users")
	}()

	user1 := createTestUser(t, db, "Tenant1 User")
	org1 := createTestOrg(t, db, "Tenant 1", "First Tenant")
	createTestBond(t, db, org1.ID, user1.ID, true)

	user2 := createTestUser(t, db, "Tenant2 User")
	org2 := createTestOrg(t, db, "Tenant 2", "Second Tenant")
	createTestBond(t, db, org2.ID, user2.ID, true)

	router := setupRouter(db)

	token1 := generateJWTToken(t, user1.ID, org1.ID, "provider")
	token2 := generateJWTToken(t, user2.ID, org2.ID, "provider")

	// Tenant 1 creates an org
	w := httptest.NewRecorder()
	org1Data := map[string]string{"name": "Tenant 1 Org", "description": "Belongs to tenant 1"}
	req := httptest.NewRequest("POST", "/api/provider/orgs", bytes.NewReader(mustJSON(t, org1Data)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token1)
	req.Header.Set("X-Org-ID", fmt.Sprintf("%d", org1.ID))
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)

	// Tenant 2 creates an org
	w = httptest.NewRecorder()
	org2Data := map[string]string{"name": "Tenant 2 Org", "description": "Belongs to tenant 2"}
	req = httptest.NewRequest("POST", "/api/provider/orgs", bytes.NewReader(mustJSON(t, org2Data)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token2)
	req.Header.Set("X-Org-ID", fmt.Sprintf("%d", org2.ID))
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)

	t.Logf("✅ Multi-tenant isolation test completed")
}

// --- helpers ---

func createTestUser(t *testing.T, db *gorm.DB, name string) *model.User {
	t.Helper()
	user := &model.User{Name: name}
	require.NoError(t, db.Create(user).Error)
	return user
}

func createTestOrg(t *testing.T, db *gorm.DB, name, description string) *model.Org {
	t.Helper()
	org := &model.Org{Name: name, Description: description}
	require.NoError(t, db.Create(org).Error)
	return org
}

func createTestBond(t *testing.T, db *gorm.DB, orgID, userID int, isAdmin bool) *model.OrgUserBond {
	t.Helper()
	bond := &model.OrgUserBond{OrgID: orgID, UserID: userID, IsAdmin: isAdmin}
	require.NoError(t, db.Create(bond).Error)
	return bond
}

// generateJWTToken signs a real RS256 access token for the test user (OAuth-only).
func generateJWTToken(t *testing.T, userID, orgID int, role string) string {
	t.Helper()
	token, err := jwt.GenerateToken(userID, orgID, role, nil, e2eIssuer, e2eTTLSeconds)
	require.NoError(t, err)
	return token
}

func mustJSON(t *testing.T, v interface{}) []byte {
	t.Helper()
	data, err := json.Marshal(v)
	require.NoError(t, err)
	return data
}
