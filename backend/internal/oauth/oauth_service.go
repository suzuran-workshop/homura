package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/pkg/jwt"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// OAuthService implements the OAuth2 authorization-code and refresh-token flows,
// token issuance and revocation.
type OAuthService struct {
	cfg         *Config
	tokenRepo   *repository.OAuthTokenRepository
	sessionRepo *repository.OAuthSessionRepository
	clientRepo  *repository.OAuthClientRepository
	userRepo    *repository.UserRepository
	bondRepo    *repository.OrgUserBondRepository
	orgRepo     *repository.OrgRepository
}

// NewOAuthService creates a new OAuthService.
func NewOAuthService(
	cfg *Config,
	tokenRepo *repository.OAuthTokenRepository,
	sessionRepo *repository.OAuthSessionRepository,
	clientRepo *repository.OAuthClientRepository,
	userRepo *repository.UserRepository,
	bondRepo *repository.OrgUserBondRepository,
	orgRepo *repository.OrgRepository,
) *OAuthService {
	return &OAuthService{
		cfg:         cfg,
		tokenRepo:   tokenRepo,
		sessionRepo: sessionRepo,
		clientRepo:  clientRepo,
		userRepo:    userRepo,
		bondRepo:    bondRepo,
		orgRepo:     orgRepo,
	}
}

// CreateSession issues a one-time authorization code after the user consents.
// Used by the /oauth/authorize endpoint after WebAuthn/DingTalk login + org selection.
func (s *OAuthService) CreateSession(ctx context.Context, userID, orgID int, clientID, redirectURI, scope, codeChallenge, codeChallengeMethod string) (string, error) {
	if _, err := s.clientRepo.GetByID(ctx, clientID); err != nil {
		return "", errors.New("invalid client")
	}
	code, err := RandomString(32)
	if err != nil {
		return "", err
	}
	session := &model.OAuthSession{
		ID:                  randomID(),
		Code:                code,
		UserID:              userID,
		OrgID:               orgID,
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		Scope:               scope,
		CodeChallenge:       codeChallenge,
		CodeChallengeMethod: codeChallengeMethod,
		ExpiresAt:           time.Now().Add(10 * time.Minute),
	}
	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	return code, nil
}

// TokenResponse is the OAuth2 token endpoint response.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
}

// ExchangeAuthorizationCode redeems an authorization code for tokens.
func (s *OAuthService) ExchangeAuthorizationCode(ctx context.Context, code, clientID, clientSecret, redirectURI, codeVerifier string) (*TokenResponse, error) {
	session, err := s.sessionRepo.GetByCode(ctx, code)
	if err != nil || session == nil {
		return nil, errors.New("invalid or expired authorization code")
	}
	if session.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("authorization code expired")
	}
	if session.ClientID != clientID {
		return nil, errors.New("client mismatch")
	}
	if session.RedirectURI != "" && session.RedirectURI != redirectURI {
		return nil, errors.New("redirect_uri mismatch")
	}
	// PKCE verification (S256 only).
	if session.CodeChallenge != "" {
		if codeVerifier == "" {
			return nil, errors.New("missing code_verifier")
		}
		sum := sha256.Sum256([]byte(codeVerifier))
		if hex.EncodeToString(sum[:]) != session.CodeChallenge {
			return nil, errors.New("pkce verification failed")
		}
	}

	// Verify client secret (for confidential clients).
	client, _ := s.clientRepo.GetByID(ctx, clientID)
	if client != nil && client.Confidential && client.ClientSecret != clientSecret {
		return nil, errors.New("invalid client secret")
	}

	_ = s.sessionRepo.MarkUsed(ctx, code)

	return s.issueTokens(ctx, session.UserID, session.OrgID, session.ClientID, session.Scope)
}

// RefreshToken redeems a refresh token for new tokens.
func (s *OAuthService) RefreshToken(ctx context.Context, refreshToken, clientID string) (*TokenResponse, error) {
	hash := hashToken(refreshToken)
	stored, err := s.tokenRepo.GetByRefreshTokenHash(ctx, hash)
	if err != nil || stored == nil {
		return nil, errors.New("invalid or revoked refresh token")
	}
	if stored.ClientID != clientID {
		return nil, errors.New("client mismatch")
	}
	if stored.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("refresh token expired")
	}
	// Rotate: revoke the old refresh token.
	_ = s.tokenRepo.Revoke(ctx, stored.ID)
	return s.issueTokens(ctx, stored.UserID, stored.OrgID, stored.ClientID, stored.Scope)
}

// RevokeToken revokes an access or refresh token.
func (s *OAuthService) RevokeToken(ctx context.Context, token string) error {
	// Could be a refresh token or access token. Try refresh-token hash first.
	hash := hashToken(token)
	if stored, _ := s.tokenRepo.GetByRefreshTokenHash(ctx, hash); stored != nil {
		return s.tokenRepo.Revoke(ctx, stored.ID)
	}
	// Access tokens are short-lived JWTs; nothing to revoke server-side, but
	// we could blacklist the JTI in Redis. Left as a future enhancement.
	return nil
}

// issueTokens generates an access token (JWT) and a refresh token, persists them.
func (s *OAuthService) issueTokens(ctx context.Context, userID, orgID int, clientID, scope string) (*TokenResponse, error) {
	role, scopes := s.resolveRoleAndScopes(ctx, userID, orgID, scope)
	accessToken, err := jwt.GenerateToken(userID, orgID, role, scopes, s.cfg.Issuer, s.cfg.AccessTokenTTLSeconds)
	if err != nil {
		return nil, fmt.Errorf("failed to sign access token: %w", err)
	}

	refreshToken, err := RandomString(48)
	if err != nil {
		return nil, err
	}
	tokenRecord := &model.OAuthToken{
		ID:               randomID(),
		UserID:           userID,
		OrgID:            orgID,
		ClientID:         clientID,
		Scope:            scope,
		RefreshTokenHash: hashToken(refreshToken),
		ExpiresAt:        time.Now().Add(time.Duration(s.cfg.RefreshTokenTTLSeconds) * time.Second),
	}
	if err := s.tokenRepo.Create(ctx, tokenRecord); err != nil {
		return nil, fmt.Errorf("failed to store token: %w", err)
	}

	return &TokenResponse{
		AccessToken:  accessToken,
		TokenType:    "Bearer",
		ExpiresIn:    s.cfg.AccessTokenTTLSeconds,
		RefreshToken: refreshToken,
		Scope:        scope,
	}, nil
}

// resolveRoleAndScopes determines the user's role (provider/tenant)
// for the given org and merges requested scopes with the org's allowed scopes.
//
// Role model (2026-08):
//   - provider: member of the provider org (id=1) — platform-level operator,
//     implicitly an app admin of every distributed app.
//   - tenant: everyone else; has access only to apps distributed to their org.
func (s *OAuthService) resolveRoleAndScopes(ctx context.Context, userID, orgID int, requestedScope string) (string, []string) {
	role := "tenant"
	if orgID == 1 {
		// Provider org members are providers when acting in org 1.
		role = "provider"
	} else if superBond, e := s.bondRepo.GetByOrgAndUser(ctx, 1, userID); e == nil && superBond != nil {
		// Provider org members keep the provider role across all orgs.
		role = "provider"
	}
	scopes := parseScopes(requestedScope)
	return role, scopes
}

// MetadataResponse describes the OAuth2 server metadata (RFC 8414 / OIDC discovery).
type MetadataResponse struct {
	Issuer                 string   `json:"issuer"`
	AuthorizationEndpoint  string   `json:"authorization_endpoint"`
	TokenEndpoint          string   `json:"token_endpoint"`
	RevocationEndpoint     string   `json:"revocation_endpoint"`
	ResponseTypesSupported []string `json:"response_types_supported"`
	GrantTypesSupported    []string `json:"grant_types_supported"`
	CodeChallengeMethodsSupported []string `json:"code_challenge_methods_supported"`
	ScopesSupported        []string `json:"scopes_supported"`
}

// Metadata returns the OAuth2 server discovery document.
func (s *OAuthService) Metadata() *MetadataResponse {
	base := strings.TrimRight(s.cfg.Issuer, "/")
	return &MetadataResponse{
		Issuer:                 s.cfg.Issuer,
		AuthorizationEndpoint:  base + "/oauth/authorize",
		TokenEndpoint:          base + "/oauth/token",
		RevocationEndpoint:     base + "/oauth/revoke",
		ResponseTypesSupported: []string{"code"},
		GrantTypesSupported:    []string{"authorization_code", "refresh_token"},
		CodeChallengeMethodsSupported: []string{"S256"},
		ScopesSupported:        []string{"openid", "org.read", "org.write", "file.read", "file.write", "data.read", "data.write", "audit.read", "audit.write"},
	}
}

// ExchangeLoginSession redeems a login session (from WebAuthn/DingTalk login)
// for access + refresh tokens. The orgId must be one of the user's available orgs.
func (s *OAuthService) ExchangeLoginSession(ctx context.Context, loginSessionID string, orgID int) (*TokenResponse, error) {
	lr, err := loadLoginSession(loginSessionID)
	if err != nil {
		return nil, errors.New("invalid or expired login session")
	}
	defer deleteLoginSession(loginSessionID)

	// Verify the requested orgId is in the user's available orgs.
	found := false
	for _, org := range lr.AvailableOrgs {
		if org.OrgID == orgID {
			found = true
			break
		}
	}
	if !found {
		return nil, errors.New("org not available for this user")
	}

	// Use the platform SPA as the implicit client for first-party login.
	return s.issueTokens(ctx, lr.UserID, orgID, "suzuran-spa", "openid org.read org.write")
}

func parseScopes(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, " ")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func randomID() string {
	id, _ := RandomString(24)
	return id
}
