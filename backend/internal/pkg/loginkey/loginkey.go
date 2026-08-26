package loginkey

import (
	"crypto/rand"
	"fmt"
	"strings"
)

// Generate creates a random login key with the given prefix.
// If prefix is empty, a pure UUID-style key is returned.
// Format: "<prefix>-<16 hex chars>" for prefixed, or "<32 hex chars>" for unprefixed.
func Generate(prefix string) string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	hex := fmt.Sprintf("%x", b)
	if prefix != "" {
		return prefix + "-" + hex
	}
	return hex
}

// ForOAuth generates a login key for an OAuth user: "<platform>-<openid>".
func ForOAuth(platform, openID string) string {
	if openID == "" {
		return Generate(platform)
	}
	return strings.ToLower(platform) + "-" + openID
}
