package oauth

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// Handler exposes the OAuth2 + WebAuthn + DingTalk + Password HTTP endpoints.
type Handler struct {
	webAuthn *WebAuthnService
	dingTalk *DingTalkService
	oauth    *OAuthService
	password *PasswordService
}

// NewHandler creates a new OAuth handler.
func NewHandler(webAuthn *WebAuthnService, dingTalk *DingTalkService, oauth *OAuthService, password *PasswordService) *Handler {
	return &Handler{webAuthn: webAuthn, dingTalk: dingTalk, oauth: oauth, password: password}
}

// --- WebAuthn registration ---

// BeginRegistration
// POST /oauth/webauthn/register/begin
func (h *Handler) BeginRegistration(c *gin.Context) {
	var req struct {
		UserID int    `json:"userId"`
		Name   string `json:"name"`
		Email  string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Email is now optional; the backend will auto-generate <name>@suzuran.io if empty.
	resp, err := h.webAuthn.BeginRegistration(c.Request.Context(), req.UserID, req.Name, req.Email)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// FinishRegistration
// POST /oauth/webauthn/register/finish
func (h *Handler) FinishRegistration(c *gin.Context) {
	var req struct {
		SessionID string          `json:"sessionId"`
		Response  json.RawMessage `json:"response"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, err := h.webAuthn.FinishRegistration(c.Request.Context(), req.SessionID, req.Response)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"userId": userID})
}

// --- WebAuthn login ---

// BeginLogin
// POST /oauth/webauthn/login/begin
// If identifier is empty, a discoverable (usernameless) login challenge is returned.
func (h *Handler) BeginLogin(c *gin.Context) {
	var req struct {
		Identifier string `json:"identifier"`
	}
	_ = c.ShouldBindJSON(&req) // allow empty body
	resp, err := h.webAuthn.BeginLogin(c.Request.Context(), req.Identifier)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// FinishLogin
// POST /oauth/webauthn/login/finish
func (h *Handler) FinishLogin(c *gin.Context) {
	var req struct {
		SessionID string          `json:"sessionId"`
		Response  json.RawMessage `json:"response"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	loginSessionID, err := h.webAuthn.FinishLogin(c.Request.Context(), req.SessionID, req.Response)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	// Load the login session to return userId + availableOrgs alongside the sessionId,
	// so the frontend can render an org selector before calling /oauth/session/token.
	lr, _ := loadLoginSession(loginSessionID)
	resp := gin.H{"sessionId": loginSessionID}
	if lr != nil {
		resp["userId"] = lr.UserID
		resp["availableOrgs"] = lr.AvailableOrgs
	}
	c.JSON(http.StatusOK, resp)
}

// --- DingTalk OAuth ---

// DingTalkAuthorize
// GET /oauth/dingtalk/authorize?redirect_uri=...
func (h *Handler) DingTalkAuthorize(c *gin.Context) {
	redirectURI := c.Query("redirect_uri")
	if redirectURI == "" {
		redirectURI = h.oauth.cfg.Issuer + "/oauth/dingtalk/callback"
	}
	authURL, err := h.dingTalk.AuthorizeURL(c.Request.Context(), redirectURI)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"authorizeUrl": authURL})
}

// DingTalkCallback
// GET /oauth/dingtalk/callback?code=...&state=...
func (h *Handler) DingTalkCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing code"})
		return
	}
	if _, err := h.dingTalk.ValidateState(c.Request.Context(), state); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dtUser, err := h.dingTalk.ExchangeUser(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	loginSessionID, err := h.dingTalk.LoginOrCreate(c.Request.Context(), dtUser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Load the login session to return userId + availableOrgs alongside the sessionId.
	lr, _ := loadLoginSession(loginSessionID)
	resp := gin.H{"sessionId": loginSessionID}
	if lr != nil {
		resp["userId"] = lr.UserID
		resp["availableOrgs"] = lr.AvailableOrgs
		resp["isNewUser"] = lr.IsNewUser
	}
	c.JSON(http.StatusOK, resp)
}

// --- Session token exchange (login → token bridge) ---

// SessionToken
// POST /oauth/session/token
// Exchanges a login session (from WebAuthn/DingTalk) for access + refresh tokens.
func (h *Handler) SessionToken(c *gin.Context) {
	var req struct {
		SessionID string `json:"sessionId"`
		OrgID     int    `json:"orgId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.SessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sessionId is required"})
		return
	}
	if req.OrgID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "orgId is required"})
		return
	}

	resp, err := h.oauth.ExchangeLoginSession(c.Request.Context(), req.SessionID, req.OrgID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// --- OAuth2 endpoints ---

// Authorize
// GET /oauth/authorize?response_type=code&client_id=...&redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256&scope=...
// Expects the caller to have already authenticated and selected an org — the
// gin context carries userID+orgID (set by the OAuth/auth middleware).
func (h *Handler) Authorize(c *gin.Context) {
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	userID, _ := userIDVal.(int)
	orgIDVal, _ := c.Get("org_id")
	orgID, _ := orgIDVal.(int)

	clientID := c.Query("client_id")
	redirectURI := c.Query("redirect_uri")
	state := c.Query("state")
	scope := c.Query("scope")
	codeChallenge := c.Query("code_challenge")
	codeChallengeMethod := c.Query("code_challenge_method")

	code, err := h.oauth.CreateSession(c.Request.Context(), userID, orgID, clientID, redirectURI, scope, codeChallenge, codeChallengeMethod)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	u, parseErr := url.Parse(redirectURI)
	if parseErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid redirect_uri"})
		return
	}
	q := u.Query()
	q.Set("code", code)
	if state != "" {
		q.Set("state", state)
	}
	u.RawQuery = q.Encode()
	c.Redirect(http.StatusFound, u.String())
}

// Token
// POST /oauth/token (application/x-www-form-urlencoded or JSON)
func (h *Handler) Token(c *gin.Context) {
	var req struct {
		GrantType       string `form:"grant_type" json:"grant_type"`
		Code            string `form:"code" json:"code"`
		RefreshToken    string `form:"refresh_token" json:"refresh_token"`
		ClientID        string `form:"client_id" json:"client_id"`
		ClientSecret    string `form:"client_secret" json:"client_secret"`
		RedirectURI     string `form:"redirect_uri" json:"redirect_uri"`
		CodeVerifier    string `form:"code_verifier" json:"code_verifier"`
	}
	if err := c.ShouldBind(&req); err != nil && err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var (
		resp *TokenResponse
		err  error
	)
	switch req.GrantType {
	case "authorization_code":
		resp, err = h.oauth.ExchangeAuthorizationCode(c.Request.Context(), req.Code, req.ClientID, req.ClientSecret, req.RedirectURI, req.CodeVerifier)
	case "refresh_token":
		resp, err = h.oauth.RefreshToken(c.Request.Context(), req.RefreshToken, req.ClientID)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported_grant_type"})
		return
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Revoke
// POST /oauth/revoke
func (h *Handler) Revoke(c *gin.Context) {
	token := c.PostForm("token")
	if token == "" {
		var req struct {
			Token string `json:"token"`
		}
		_ = c.ShouldBindJSON(&req)
		token = req.Token
	}
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing token"})
		return
	}
	_ = h.oauth.RevokeToken(c.Request.Context(), token)
	c.JSON(http.StatusOK, gin.H{"revoked": true})
}

// Metadata
// GET /.well-known/openid-configuration
func (h *Handler) Metadata(c *gin.Context) {
	c.JSON(http.StatusOK, h.oauth.Metadata())
}

// --- Password login ---

// PasswordLogin
// POST /oauth/password/login
// Authenticates with username+password and returns a sessionId + availableOrgs,
// identical to the WebAuthn FinishLogin response shape.
func (h *Handler) PasswordLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	loginSessionID, err := h.password.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	lr, _ := loadLoginSession(loginSessionID)
	resp := gin.H{"sessionId": loginSessionID}
	if lr != nil {
		resp["userId"] = lr.UserID
		resp["availableOrgs"] = lr.AvailableOrgs
	}
	c.JSON(http.StatusOK, resp)
}

// silence unused imports if redirect parsing moves out later.
var _ = strings.Split
