package middleware

import (
	"github.com/gin-gonic/gin"
)

// Role names used in JWT claims:
//   "provider"     — 服务商管理员（org_id=1 且 is_admin=true）
//   "tenant_admin" — 租户管理员（is_admin=true）
//   "user"         — 普通用户
//
// All permission checks should use these three names.

// RequireOrgAdmin allows provider and tenant admins.
func RequireOrgAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != "provider" && role != "tenant_admin" {
			c.JSON(403, gin.H{"error": "insufficient permissions"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireDeptManager allows provider admins, tenant admins, and dept managers.
func RequireDeptManager() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != "provider" && role != "tenant_admin" && role != "dept_manager" {
			c.JSON(403, gin.H{"error": "insufficient permissions"})
			c.Abort()
			return
		}
		c.Next()
	}
}
