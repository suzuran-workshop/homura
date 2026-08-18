package middleware_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/xrl/suzuran-cloud/internal/middleware"
)

func setupPermissionRouter(role string) *gin.Engine {
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if role != "" {
			c.Set("role", role)
		}
		c.Next()
	})
	return r
}

func TestRequireProviderAllowsProvider(t *testing.T) {
	r := setupPermissionRouter("provider")
	r.Use(middleware.RequireProvider())
	r.GET("/admin", func(c *gin.Context) { c.Status(200) })

	req := httptest.NewRequest("GET", "/admin", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
}

func TestRequireProviderBlocksTenant(t *testing.T) {
	r := setupPermissionRouter("tenant")
	r.Use(middleware.RequireProvider())
	r.GET("/admin", func(c *gin.Context) { c.Status(200) })

	req := httptest.NewRequest("GET", "/admin", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, 403, w.Code)
	assert.Contains(t, w.Body.String(), "insufficient permissions")
}

func TestRequireProviderBlocksLegacyRoles(t *testing.T) {
	for _, role := range []string{"tenant_admin", "dept_manager", "user", ""} {
		r := setupPermissionRouter(role)
		r.Use(middleware.RequireProvider())
		r.GET("/admin", func(c *gin.Context) { c.Status(200) })

		req := httptest.NewRequest("GET", "/admin", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, 403, w.Code, "role %q must be blocked", role)
	}
}
