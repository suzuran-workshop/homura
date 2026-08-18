package username

import (
	"errors"
	"regexp"
	"strings"
)

// validPattern: 3-50 chars, lowercase letters and hyphens, must start with a letter.
var validPattern = regexp.MustCompile(`^[a-z][a-z-]{2,49}$`)

// Validate checks that a username conforms to the format rules.
func Validate(u string) error {
	if u == "" {
		return errors.New("username is required")
	}
	if !validPattern.MatchString(u) {
		return errors.New("username must be 3-50 lowercase letters or hyphens, starting with a letter")
	}
	return nil
}

// Normalize lowercases and trims whitespace from a username.
func Normalize(u string) string {
	return strings.ToLower(strings.TrimSpace(u))
}
