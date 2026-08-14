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

func TestRequireOrgAdminAllowsOrgAdmin(t *testing.T) {
    r := setupPermissionRouter("tenant_admin")
    r.Use(middleware.RequireOrgAdmin())
    r.GET("/admin", func(c *gin.Context) { c.Status(200) })

    req := httptest.NewRequest("GET", "/admin", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, 200, w.Code)
}

func TestRequireOrgAdminAllowsProviderAdmin(t *testing.T) {
    r := setupPermissionRouter("provider")
    r.Use(middleware.RequireOrgAdmin())
    r.GET("/admin", func(c *gin.Context) { c.Status(200) })

    req := httptest.NewRequest("GET", "/admin", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, 200, w.Code)
}

func TestRequireOrgAdminBlocksRegularUser(t *testing.T) {
    r := setupPermissionRouter("user")
    r.Use(middleware.RequireOrgAdmin())
    r.GET("/admin", func(c *gin.Context) { c.Status(200) })

    req := httptest.NewRequest("GET", "/admin", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, 403, w.Code)
    assert.Contains(t, w.Body.String(), "insufficient permissions")
}

func TestRequireDeptManagerAllowsDeptManager(t *testing.T) {
    r := setupPermissionRouter("dept_manager")
    r.Use(middleware.RequireDeptManager())
    r.GET("/manage", func(c *gin.Context) { c.Status(200) })

    req := httptest.NewRequest("GET", "/manage", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, 200, w.Code)
}

func TestRequireDeptManagerAllowsOrgAdmin(t *testing.T) {
    r := setupPermissionRouter("tenant_admin")
    r.Use(middleware.RequireDeptManager())
    r.GET("/manage", func(c *gin.Context) { c.Status(200) })

    req := httptest.NewRequest("GET", "/manage", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, 200, w.Code)
}

func TestRequireDeptManagerAllowsProviderAdmin(t *testing.T) {
    r := setupPermissionRouter("provider")
    r.Use(middleware.RequireDeptManager())
    r.GET("/manage", func(c *gin.Context) { c.Status(200) })

    req := httptest.NewRequest("GET", "/manage", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, 200, w.Code)
}

func TestRequireDeptManagerBlocksRegularUser(t *testing.T) {
    r := setupPermissionRouter("user")
    r.Use(middleware.RequireDeptManager())
    r.GET("/manage", func(c *gin.Context) { c.Status(200) })

    req := httptest.NewRequest("GET", "/manage", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, 403, w.Code)
    assert.Contains(t, w.Body.String(), "insufficient permissions")
}
