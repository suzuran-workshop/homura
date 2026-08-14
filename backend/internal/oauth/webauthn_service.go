package oauth

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// WebAuthnService implements WebAuthn registration and login ceremonies.
type WebAuthnService struct {
	webAuthn *webauthn.WebAuthn
	userRepo *repository.UserRepository
	credRepo *repository.WebAuthnCredentialRepository
	bondRepo *repository.OrgUserBondRepository
	orgRepo  *repository.OrgRepository
}

// NewWebAuthnService creates a new WebAuthnService.
func NewWebAuthnService(
	cfg *Config,
	userRepo *repository.UserRepository,
	credRepo *repository.WebAuthnCredentialRepository,
	bondRepo *repository.OrgUserBondRepository,
	orgRepo *repository.OrgRepository,
) (*WebAuthnService, error) {
	wconfig := &webauthn.Config{
		RPDisplayName: cfg.RPDisplayName,
		RPID:          cfg.RPID,
		RPOrigins:     cfg.RPOrigins,
		Timeouts: webauthn.TimeoutsConfig{
			Login:        webauthn.TimeoutConfig{Enforce: true, Timeout: 60 * time.Second, TimeoutUVD: 60 * time.Second},
			Registration: webauthn.TimeoutConfig{Enforce: true, Timeout: 120 * time.Second, TimeoutUVD: 120 * time.Second},
		},
	}
	w, err := webauthn.New(wconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to init webauthn: %w", err)
	}
	return &WebAuthnService{
		webAuthn: w,
		userRepo: userRepo,
		credRepo: credRepo,
		bondRepo: bondRepo,
		orgRepo:  orgRepo,
	}, nil
}

// BeginRegistrationResponse is what the browser feeds to navigator.credentials.create().
type BeginRegistrationResponse struct {
	SessionID string          `json:"sessionId"`
	Options   json.RawMessage `json:"options"`
	UserID    int             `json:"userId"`
}

// OrgChoice is an organization the user can select after login.
type OrgChoice struct {
	OrgID   int    `json:"orgId"`
	OrgName string `json:"orgName"`
	IsAdmin bool   `json:"isAdmin"`
}

// BeginRegistration starts the WebAuthn credential registration ceremony.
// If userID > 0, the user already exists (adding a passkey). Otherwise a new
// user is created from name/email — used during self-service sign-up.
func (s *WebAuthnService) BeginRegistration(ctx context.Context, userID int, name, email string) (*BeginRegistrationResponse, error) {
	user, err := s.resolveUser(ctx, userID, name, email)
	if err != nil {
		return nil, err
	}

	creds, err := s.credRepo.ListByUserID(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to load credentials: %w", err)
	}
	wuser := &WebAuthnUser{User: user, Credentials: creds}

	options, sessionData, err := s.webAuthn.BeginRegistration(wuser,
		webauthn.WithResidentKeyRequirement(protocol.ResidentKeyRequirementPreferred),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to begin registration: %w", err)
	}

	sessionID, err := RandomString(32)
	if err != nil {
		return nil, err
	}
	if err := storeSession(sessionID, sessionData, 5*time.Minute); err != nil {
		return nil, fmt.Errorf("failed to store session: %w", err)
	}

	optsJSON, _ := json.Marshal(options)
	return &BeginRegistrationResponse{
		SessionID: sessionID,
		Options:  optsJSON,
		UserID:   user.ID,
	}, nil
}

// FinishRegistration verifies the authenticator response and persists the credential.
func (s *WebAuthnService) FinishRegistration(ctx context.Context, sessionID string, parsedResponse []byte) (int, error) {
	sessionData, err := loadSession(sessionID)
	if err != nil {
		return 0, errors.New("invalid or expired registration session")
	}
	defer deleteSession(sessionID)

	userID, ok := userIDFromHandle(sessionData.UserID)
	if !ok {
		return 0, errors.New("invalid session user handle")
	}
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return 0, errors.New("user not found")
	}
	creds, _ := s.credRepo.ListByUserID(ctx, user.ID)
	wuser := &WebAuthnUser{User: user, Credentials: creds}

	parsed, err := parseCredentialResponse(parsedResponse)
	if err != nil {
		return 0, fmt.Errorf("failed to parse credential response: %w", err)
	}

	created, err := s.webAuthn.CreateCredential(wuser, *sessionData, parsed)
	if err != nil {
		return 0, fmt.Errorf("registration verification failed: %w", err)
	}

	transportsJSON := model.JSONB{}
	if len(created.Transport) > 0 {
		if raw, err := json.Marshal(created.Transport); err == nil {
			_ = json.Unmarshal(raw, &transportsJSON)
		}
	}

	record := &model.WebAuthnCredential{
		UserID:          user.ID,
		CredentialID:    created.ID,
		PublicKey:       created.PublicKey,
		AttestationType: created.AttestationType,
		AAGUID:          hex.EncodeToString(created.Authenticator.AAGUID),
		SignCount:       created.Authenticator.SignCount,
		Transports:      transportsJSON,
		UserIDBytes:     sessionData.UserID,
	}
	if err := s.credRepo.Create(ctx, record); err != nil {
		return 0, fmt.Errorf("failed to store credential: %w", err)
	}
	return user.ID, nil
}

// BeginLoginResponse is what the browser feeds to navigator.credentials.get().
type BeginLoginResponse struct {
	SessionID string          `json:"sessionId"`
	Options   json.RawMessage `json:"options"`
}

// BeginLogin starts the WebAuthn login ceremony.
// If identifier is empty, it performs a discoverable login (usernameless/resident key).
// Otherwise, the user is identified by name/email first, then their credentials are loaded for the challenge.
func (s *WebAuthnService) BeginLogin(ctx context.Context, identifier string) (*BeginLoginResponse, error) {
	if identifier == "" {
		// Discoverable login (usernameless) — the OS/browser will prompt the user to select a credential.
		options, sessionData, err := s.webAuthn.BeginDiscoverableLogin()
		if err != nil {
			return s.fakeLoginChallenge()
		}

		sessionID, err := RandomString(32)
		if err != nil {
			return nil, err
		}
		if err := storeSession(sessionID, sessionData, 5*time.Minute); err != nil {
			return nil, fmt.Errorf("failed to store session: %w", err)
		}

		optsJSON, _ := json.Marshal(options)
		return &BeginLoginResponse{SessionID: sessionID, Options: optsJSON}, nil
	}

	user, err := s.findUser(ctx, identifier)
	if err != nil || user == nil {
		// Do not reveal whether the user exists — return a dummy challenge so
		// the ceremony shape is identical (mitigates user enumeration).
		return s.fakeLoginChallenge()
	}

	creds, err := s.credRepo.ListByUserID(ctx, user.ID)
	if err != nil || len(creds) == 0 {
		return s.fakeLoginChallenge()
	}
	wuser := &WebAuthnUser{User: user, Credentials: creds}

	options, sessionData, err := s.webAuthn.BeginLogin(wuser)
	if err != nil {
		return s.fakeLoginChallenge()
	}

	sessionID, err := RandomString(32)
	if err != nil {
		return nil, err
	}
	if err := storeSession(sessionID, sessionData, 5*time.Minute); err != nil {
		return nil, fmt.Errorf("failed to store session: %w", err)
	}

	optsJSON, _ := json.Marshal(options)
	return &BeginLoginResponse{SessionID: sessionID, Options: optsJSON}, nil
}

// LoginResult holds the authenticated user and their selectable orgs.
type LoginResult struct {
	UserID        int         `json:"userId"`
	AvailableOrgs []OrgChoice `json:"availableOrgs"`
	IsNewUser     bool        `json:"isNewUser,omitempty"`
}

// FinishLogin verifies the authenticator assertion, stores the login result
// in a session, and returns a sessionId. The frontend uses this sessionId
// to call /oauth/session/token with the selected orgId to get tokens.
func (s *WebAuthnService) FinishLogin(ctx context.Context, sessionID string, parsedResponse []byte) (string, error) {
	sessionData, err := loadSession(sessionID)
	if err != nil {
		return "", errors.New("invalid or expired login session")
	}
	defer deleteSession(sessionID)

	parsed, err := parseAssertionResponse(parsedResponse)
	if err != nil {
		return "", fmt.Errorf("failed to parse assertion response: %w", err)
	}

	// Check if this is a discoverable login (userHandle provided by authenticator).
	if len(parsed.Response.UserHandle) > 0 {
		handler := func(rawID, userHandle []byte) (webauthn.User, error) {
			uid, ok := userIDFromHandle(userHandle)
			if !ok {
				return nil, errors.New("invalid user handle")
			}
			user, err := s.userRepo.GetByID(ctx, uid)
			if err != nil || user == nil {
				return nil, errors.New("user not found")
			}
			creds, _ := s.credRepo.ListByUserID(ctx, user.ID)
			return &WebAuthnUser{User: user, Credentials: creds}, nil
		}

		updatedCred, err := s.webAuthn.ValidateDiscoverableLogin(handler, *sessionData, parsed)
		if err != nil {
			return "", fmt.Errorf("discoverable login verification failed: %w", err)
		}

		// Resolve user from updated credential for storing login session.
		storedCred, _ := s.credRepo.GetByCredentialID(ctx, updatedCred.ID)
		if storedCred == nil {
			return "", errors.New("credential not found after validation")
		}
		user, err := s.userRepo.GetByID(ctx, storedCred.UserID)
		if err != nil || user == nil {
			return "", errors.New("user not found")
		}

		// Persist updated sign count + last-used time.
		storedCred.SignCount = updatedCred.Authenticator.SignCount
		now := time.Now()
		storedCred.LastUsedAt = &now
		_ = s.credRepo.Update(ctx, storedCred)

		orgs, err := s.availableOrgs(ctx, user.ID)
		if err != nil {
			return "", err
		}

		loginResult := &LoginResult{UserID: user.ID, AvailableOrgs: orgs}
		loginSessionID, err := RandomString(32)
		if err != nil {
			return "", err
		}
		if err := storeLoginSession(loginSessionID, loginResult, 5*time.Minute); err != nil {
			return "", fmt.Errorf("failed to store login session: %w", err)
		}
		return loginSessionID, nil
	}

	// Standard login (identifier-based).
	userID, ok := userIDFromHandle(sessionData.UserID)
	if !ok {
		return "", errors.New("invalid session user handle")
	}
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return "", errors.New("user not found")
	}
	creds, _ := s.credRepo.ListByUserID(ctx, user.ID)
	wuser := &WebAuthnUser{User: user, Credentials: creds}

	updatedCred, err := s.webAuthn.ValidateLogin(wuser, *sessionData, parsed)
	if err != nil {
		return "", fmt.Errorf("login verification failed: %w", err)
	}

	// Persist updated sign count + last-used time.
	if stored, _ := s.credRepo.GetByCredentialID(ctx, updatedCred.ID); stored != nil {
		stored.SignCount = updatedCred.Authenticator.SignCount
		now := time.Now()
		stored.LastUsedAt = &now
		_ = s.credRepo.Update(ctx, stored)
	}

	orgs, err := s.availableOrgs(ctx, user.ID)
	if err != nil {
		return "", err
	}

	// Store login result in session for the frontend to exchange for tokens.
	loginResult := &LoginResult{UserID: user.ID, AvailableOrgs: orgs}
	loginSessionID, err := RandomString(32)
	if err != nil {
		return "", err
	}
	if err := storeLoginSession(loginSessionID, loginResult, 5*time.Minute); err != nil {
		return "", fmt.Errorf("failed to store login session: %w", err)
	}

	return loginSessionID, nil
}

func (s *WebAuthnService) resolveUser(ctx context.Context, userID int, name, email string) (*model.User, error) {
	if userID > 0 {
		u, err := s.userRepo.GetByID(ctx, userID)
		if err != nil || u == nil {
			return nil, errors.New("user not found")
		}
		return u, nil
	}
	if name == "" {
		return nil, errors.New("name is required to register")
	}
	// Auto-generate email: <username>@suzuran.io
	if email == "" {
		email = name + "@suzuran.io"
	}
	u := &model.User{Name: name, Email: email}
	if err := s.userRepo.Create(ctx, u); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}
	return u, nil
}

func (s *WebAuthnService) findUser(ctx context.Context, identifier string) (*model.User, error) {
	users, err := s.userRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		if (u.Email != "" && u.Email == identifier) || (u.Name != "" && u.Name == identifier) {
			return u, nil
		}
	}
	return nil, nil
}

func (s *WebAuthnService) availableOrgs(ctx context.Context, userID int) ([]OrgChoice, error) {
	bonds, err := s.bondRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]OrgChoice, 0, len(bonds))
	for _, b := range bonds {
		name := ""
		if org, _ := s.orgRepo.GetByID(ctx, b.OrgID); org != nil {
			name = org.Name
		}
		out = append(out, OrgChoice{OrgID: b.OrgID, OrgName: name, IsAdmin: b.IsAdmin})
	}
	return out, nil
}

// fakeLoginChallenge returns a dummy challenge that mirrors the real response
// shape, so attackers cannot tell whether the identifier exists.
func (s *WebAuthnService) fakeLoginChallenge() (*BeginLoginResponse, error) {
	sessionID, _ := RandomString(32)
	fake := protocol.CredentialAssertion{
		Response: protocol.PublicKeyCredentialRequestOptions{
			Challenge:        protocol.URLEncodedBase64([]byte("fake-challenge-fake-challenge-fake")),
			Timeout:          60000,
			UserVerification: protocol.VerificationPreferred,
		},
	}
	opts, _ := json.Marshal(fake)
	return &BeginLoginResponse{SessionID: sessionID, Options: opts}, nil
}
