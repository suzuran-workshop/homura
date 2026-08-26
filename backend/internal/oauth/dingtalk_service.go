package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/pkg/loginkey"
	"github.com/xrl/suzuran-cloud/internal/pkg/redis"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// DingTalkUser holds the user info returned by DingTalk's OAuth getuserinfo API.
type DingTalkUser struct {
	UserID     string `json:"userid"`
	UnionID    string `json:"unionid"`
	OpenID     string `json:"openid"`
	Nick       string `json:"nick"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	Mobile     string `json:"mobile"`
	AvatarURL  string `json:"avatar"`
	JobNumber  string `json:"jobnumber"`
	Title      string `json:"title"`
}

// DingTalkService implements DingTalk OAuth login.
type DingTalkService struct {
	cfg       *Config
	userRepo  *repository.UserRepository
	bondRepo  *repository.OrgUserBondRepository
	orgRepo   *repository.OrgRepository
	httpClient *http.Client
}

// NewDingTalkService creates a new DingTalkService.
func NewDingTalkService(cfg *Config, userRepo *repository.UserRepository, bondRepo *repository.OrgUserBondRepository, orgRepo *repository.OrgRepository) *DingTalkService {
	return &DingTalkService{
		cfg:       cfg,
		userRepo:  userRepo,
		bondRepo:  bondRepo,
		orgRepo:   orgRepo,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// AuthorizeURL builds the DingTalk OAuth authorize redirect URL with a
// state parameter stored in Redis (CSRF protection, 5-minute expiry).
func (s *DingTalkService) AuthorizeURL(ctx context.Context, redirectURI string) (string, error) {
	state, err := RandomString(16)
	if err != nil {
		return "", err
	}
	if redis.Client != nil {
		if err := redis.Set(ctx, "dt_state:"+state, redirectURI, 5*time.Minute); err != nil {
			return "", fmt.Errorf("failed to store state: %w", err)
		}
	}

	q := url.Values{}
	q.Set("client_id", s.cfg.DingTalkAppKey)
	q.Set("redirect_uri", redirectURI)
	q.Set("response_type", "code")
	q.Set("scope", "openid")
	q.Set("prompt", "consent")
	q.Set("state", state)
	return "https://login.dingtalk.com/oauth2/auth?" + q.Encode(), nil
}

// ValidateState checks the CSRF state returned by DingTalk against the one stored.
func (s *DingTalkService) ValidateState(ctx context.Context, state string) (string, error) {
	if redis.Client != nil {
		val, err := redis.Get(ctx, "dt_state:"+state).Result()
		if err != nil {
			return "", errors.New("invalid or expired state")
		}
		_ = redis.Delete(ctx, "dt_state:"+state)
		return val, nil
	}
	// No Redis: accept any state (dev only).
	return "", nil
}

// ExchangeUser exchanges the authorization code for DingTalk user info.
// Uses DingTalk's new OAuth2 getuserinfo endpoint (login.dingtalk.com).
func (s *DingTalkService) ExchangeUser(ctx context.Context, code string) (*DingTalkUser, error) {
	// Step 1: get user token from code
	userToken, err := s.getUserToken(ctx, code)
	if err != nil {
		return nil, err
	}
	// Step 2: get userinfo with the token
	return s.getUserInfo(ctx, userToken)
}

func (s *DingTalkService) getUserToken(ctx context.Context, code string) (string, error) {
	endpoint := fmt.Sprintf("https://api.dingtalk.com/v1.0/oauth2/userAccessToken")
	body := fmt.Sprintf(`{"clientId":"%s","clientSecret":"%s","code":"%s","grantType":"authorization_code"}`,
		s.cfg.DingTalkAppKey, s.cfg.DingTalkAppSecret, code)

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, strReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("dingtalk userAccessToken failed: %s", string(raw))
	}
	var result struct {
		AccessToken  string `json:"accessToken"`
		RefreshToken string `json:"refreshToken"`
		ExpireIn     int    `json:"expireIn"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", err
	}
	if result.AccessToken == "" {
		return "", errors.New("empty access token from dingtalk")
	}
	return result.AccessToken, nil
}

func (s *DingTalkService) getUserInfo(ctx context.Context, userToken string) (*DingTalkUser, error) {
	endpoint := "https://api.dingtalk.com/v1.0/contact/users/me"
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-acs-dingtalk-access-token", userToken)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("dingtalk getuserinfo failed: %s", string(raw))
	}
	var u DingTalkUser
	if err := json.Unmarshal(raw, &u); err != nil {
		return nil, err
	}
	return &u, nil
}

// LoginOrCreate resolves a DingTalk user to a platform user.
// If the DingTalk userid is already bound, the existing user is returned.
// Otherwise a new user is created (but not bound to any org — an admin must
// add them, or they self-select during first-time onboarding).
// Returns a sessionId that the frontend uses to exchange for tokens.
func (s *DingTalkService) LoginOrCreate(ctx context.Context, dtUser *DingTalkUser) (string, error) {
	if dtUser.UserID == "" && dtUser.OpenID == "" && dtUser.UnionID == "" {
		return "", errors.New("no dingtalk identifier")
	}

	user, err := s.findDingTalkUser(ctx, dtUser)
	if err != nil {
		return "", err
	}
	isNew := false
	if user == nil {
		// Create a new user from DingTalk profile.
		name := dtUser.Name
		if name == "" {
			name = dtUser.Nick
		}
		// Auto-generate email: <openid>@dingtalk.suzuran.io
		email := ""
		if dtUser.OpenID != "" {
			email = dtUser.OpenID + "@dingtalk.suzuran.io"
		} else if dtUser.Email != "" {
			email = dtUser.Email
		}
		// Generate login_key: dingtalk-<openid>
		lk := loginkey.ForOAuth("dingtalk", dtUser.OpenID)
		user = &model.User{
			Name:             name,
			Email:            email,
			LoginKey:         lk,
			Phone:            dtUser.Mobile,
			DingtalkUserID:   strPtr(dtUser.UserID),
			DingtalkUnionID:  strPtr(dtUser.UnionID),
			DingtalkOpenID:   strPtr(dtUser.OpenID),
			AvatarURL:        dtUser.AvatarURL,
		}
		if err := s.userRepo.Create(ctx, user); err != nil {
			return "", fmt.Errorf("failed to create dingtalk user: %w", err)
		}
		isNew = true
	} else {
		// Refresh DingTalk identifiers if missing.
		updated := false
		if user.DingtalkUserID == nil && dtUser.UserID != "" {
			user.DingtalkUserID = strPtr(dtUser.UserID)
			updated = true
		}
		if user.DingtalkUnionID == nil && dtUser.UnionID != "" {
			user.DingtalkUnionID = strPtr(dtUser.UnionID)
			updated = true
		}
		if user.DingtalkOpenID == nil && dtUser.OpenID != "" {
			user.DingtalkOpenID = strPtr(dtUser.OpenID)
			updated = true
		}
		if updated {
			_ = s.userRepo.Update(ctx, user)
		}
	}

	orgs, err := s.availableOrgs(ctx, user.ID)
	if err != nil {
		return "", err
	}

	// Store login result in session for the frontend to exchange for tokens.
	loginResult := &LoginResult{
		UserID:        user.ID,
		AvailableOrgs: orgs,
	}
	loginSessionID, err := RandomString(32)
	if err != nil {
		return "", err
	}
	if err := storeLoginSession(loginSessionID, loginResult, 5*time.Minute); err != nil {
		return "", fmt.Errorf("failed to store login session: %w", err)
	}

	// Mark isNewUser in the session data for frontend reference
	if isNew {
		loginResult.IsNewUser = true
	}

	return loginSessionID, nil
}

func (s *DingTalkService) findDingTalkUser(ctx context.Context, dt *DingTalkUser) (*model.User, error) {
	users, err := s.userRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		if dt.UserID != "" && u.DingtalkUserID != nil && *u.DingtalkUserID == dt.UserID {
			return u, nil
		}
		if dt.UnionID != "" && u.DingtalkUnionID != nil && *u.DingtalkUnionID == dt.UnionID {
			return u, nil
		}
		if dt.OpenID != "" && u.DingtalkOpenID != nil && *u.DingtalkOpenID == dt.OpenID {
			return u, nil
		}
	}
	return nil, nil
}

func (s *DingTalkService) availableOrgs(ctx context.Context, userID int) ([]OrgChoice, error) {
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

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// strReader returns an io.Reader over a string without importing strings/bytes everywhere.
type stringReader struct {
	s string
	i int
}

func strReader(s string) *stringReader { return &stringReader{s: s} }

func (r *stringReader) Read(p []byte) (int, error) {
	if r.i >= len(r.s) {
		return 0, io.EOF
	}
	n := copy(p, r.s[r.i:])
	r.i += n
	return n, nil
}
