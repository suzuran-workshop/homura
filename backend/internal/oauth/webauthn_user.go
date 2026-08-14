package oauth

import (
	"encoding/hex"
	"encoding/json"
	"strconv"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/xrl/suzuran-cloud/internal/model"
)

// WebAuthnUser adapts a platform User (+ its credentials) to the
// webauthn.User interface required by the WebAuthn library.
type WebAuthnUser struct {
	User        *model.User
	Credentials []model.WebAuthnCredential
}

// WebAuthnID returns the stable user handle. We use the decimal user ID
// encoded as bytes, which lets login sessions resolve the user from the
// handle returned by the authenticator.
func (u *WebAuthnUser) WebAuthnID() []byte {
	return []byte(strconv.Itoa(u.User.ID))
}

func (u *WebAuthnUser) WebAuthnName() string {
	if u.User.Name != "" {
		return u.User.Name
	}
	return u.User.Email
}

func (u *WebAuthnUser) WebAuthnDisplayName() string {
	return u.WebAuthnName()
}

// WebAuthnCredentials converts stored credentials to the library's value type.
func (u *WebAuthnUser) WebAuthnCredentials() []webauthn.Credential {
	creds := make([]webauthn.Credential, 0, len(u.Credentials))
	for _, c := range u.Credentials {
		var transports []protocol.AuthenticatorTransport
		if c.Transports != nil {
			// Transports stored as JSONB; marshal then unmarshal into the enum slice.
			if raw, err := json.Marshal(c.Transports); err == nil {
				_ = json.Unmarshal(raw, &transports)
			}
		}
		creds = append(creds, webauthn.Credential{
			ID:              c.CredentialID,
			PublicKey:       c.PublicKey,
			AttestationType: c.AttestationType,
			Authenticator: webauthn.Authenticator{
				AAGUID:    decodeAAGUID(c.AAGUID),
				SignCount: c.SignCount,
			},
			Transport: transports,
		})
	}
	return creds
}

// userIDFromHandle reverses WebAuthnID — parses the user ID from the handle bytes.
func userIDFromHandle(handle []byte) (int, bool) {
	id, err := strconv.Atoi(string(handle))
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

// decodeAAGUID converts hex-encoded AAGUID string back to bytes.
// If the string is not valid hex (e.g., already raw bytes), returns it as-is.
func decodeAAGUID(aaguid string) []byte {
	if decoded, err := hex.DecodeString(aaguid); err == nil && len(decoded) == 16 {
		return decoded
	}
	// Fallback: treat as raw bytes (for backward compatibility)
	return []byte(aaguid)
}
