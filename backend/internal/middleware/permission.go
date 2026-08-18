package middleware

import (
	"github.com/gin-gonic/gin"
)

// Role names used in JWT claims:
//   "provider" — 服务商（provider org id=1 的成员，隐含所有应用管理员身份）
//   "tenant"   — 租户（其他组织的普通用户，只能访问分发到本组织的应用）
//
// All permission checks should use these two names.

// RequireProvider allows only provider-role callers (service provider portal).
func RequireProvider() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != "provider" {
			c.JSON(403, gin.H{"error": "insufficient permissions"})
			c.Abort()
			return
		}
		c.Next()
	}
}
