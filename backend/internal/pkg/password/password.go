package password

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// bcryptCost 12 provides ~250ms per hash — good balance between security and UX.
const bcryptCost = 12

// Hash generates a bcrypt hash from a plaintext password.
// Requires minimum 6 characters.
func Hash(plaintext string) (string, error) {
	if len(plaintext) < 6 {
		return "", errors.New("password must be at least 6 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// Verify checks a plaintext password against a bcrypt hash.
func Verify(plaintext, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)) == nil
}
