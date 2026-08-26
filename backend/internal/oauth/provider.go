package oauth

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/pkg/loginkey"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// OAuthProvider is the strategy interface for external OAuth platforms.
// Each platform (DingTalk, WeChat Work, Feishu) implements this interface
// so the handler can route OAuth flows generically.
type OAuthProvider interface {
	// Name returns the platform identifier (e.g. "dingtalk", "wechat", "feishu").
	Name() string

	// AuthorizeURL builds the redirect URL for the OAuth authorize step.
	// state is a CSRF token; redirectURI is where the platform redirects back.
	AuthorizeURL(ctx context.Context, redirectURI string) (string, error)

	// ValidateState checks the CSRF state returned by the platform.
	// Returns the stored redirectURI on success.
	ValidateState(ctx context.Context, state string) (string, error)

	// ExchangeUser exchanges the authorization code for external user info.
	ExchangeUser(ctx context.Context, code string) (*ExternalUser, error)

	// LoginKeyForUser generates the login_key for an external user.
	LoginKeyForUser(ext *ExternalUser) string
}

// ExternalUser is the normalized user info returned by any OAuth platform.
type ExternalUser struct {
	Platform string // "dingtalk", "wechat", "feishu"
	OpenID   string // platform-specific unique user ID
	UnionID  string // cross-app union ID (optional)
	UserID   string // platform internal user ID (optional)
	Name     string
	Nick     string
	Email    string
	Mobile   string
	Avatar   string
	JobNo    string
	Title    string
}

// ProviderRegistry manages registered OAuth providers.
type ProviderRegistry struct {
	mu        sync.RWMutex
	providers map[string]OAuthProvider
}

func NewProviderRegistry() *ProviderRegistry {
	return &ProviderRegistry{providers: make(map[string]OAuthProvider)}
}

func (r *ProviderRegistry) Register(p OAuthProvider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[p.Name()] = p
}

func (r *ProviderRegistry) Get(name string) (OAuthProvider, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.providers[name]
	if !ok {
		return nil, fmt.Errorf("OAuth provider %q not configured", name)
	}
	return p, nil
}

func (r *ProviderRegistry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.providers))
	for name := range r.providers {
		names = append(names, name)
	}
	return names
}

// LoginOrCreate is the shared logic for all OAuth providers:
// find existing user by platform identifiers, or create a new user with a login_key.
func LoginOrCreate(
	ctx context.Context,
	provider OAuthProvider,
	ext *ExternalUser,
	userRepo *repository.UserRepository,
	bondRepo *repository.OrgUserBondRepository,
	orgRepo *repository.OrgRepository,
) (string, bool, error) {
	if ext.OpenID == "" {
		return "", false, errors.New("no external user identifier")
	}

	// Try to find existing user by platform-specific identifiers
	user, err := findExternalUser(ctx, provider.Name(), ext, userRepo)
	if err != nil {
		return "", false, err
	}

	isNew := false
	if user == nil {
		// Create new user
		name := ext.Name
		if name == "" {
			name = ext.Nick
		}
		email := ext.Email
		if email == "" && ext.OpenID != "" {
			email = ext.OpenID + "@" + provider.Name() + ".suzuran.io"
		}

		lk := provider.LoginKeyForUser(ext)
		user = &model.User{
			Name:     name,
			Email:    email,
			LoginKey: lk,
			Phone:    ext.Mobile,
			AvatarURL: ext.Avatar,
		}
		// Set platform-specific fields
		switch provider.Name() {
		case "dingtalk":
			user.DingtalkUserID = strPtr(ext.UserID)
			user.DingtalkUnionID = strPtr(ext.UnionID)
			user.DingtalkOpenID = strPtr(ext.OpenID)
		}
		if err := userRepo.Create(ctx, user); err != nil {
			return "", false, fmt.Errorf("failed to create user: %w", err)
		}
		isNew = true
	} else {
		// Refresh identifiers if missing
		updated := false
		if provider.Name() == "dingtalk" {
			if user.DingtalkUserID == nil && ext.UserID != "" {
				user.DingtalkUserID = strPtr(ext.UserID)
				updated = true
			}
			if user.DingtalkUnionID == nil && ext.UnionID != "" {
				user.DingtalkUnionID = strPtr(ext.UnionID)
				updated = true
			}
			if user.DingtalkOpenID == nil && ext.OpenID != "" {
				user.DingtalkOpenID = strPtr(ext.OpenID)
				updated = true
			}
		}
		if updated {
			_ = userRepo.Update(ctx, user)
		}
	}

	// Build login session
	orgs := availableOrgsForUser(ctx, user.ID, bondRepo, orgRepo)
	loginResult := &LoginResult{UserID: user.ID, AvailableOrgs: orgs}
	if isNew {
		loginResult.IsNewUser = true
	}

	loginSessionID, err := RandomString(32)
	if err != nil {
		return "", false, err
	}
	if err := storeLoginSession(loginSessionID, loginResult, 5*time.Minute); err != nil {
		return "", false, fmt.Errorf("failed to store login session: %w", err)
	}

	return loginSessionID, isNew, nil
}

// findExternalUser searches for an existing user by platform-specific identifiers.
func findExternalUser(ctx context.Context, platform string, ext *ExternalUser, userRepo *repository.UserRepository) (*model.User, error) {
	switch platform {
	case "dingtalk":
		users, err := userRepo.List(ctx)
		if err != nil {
			return nil, err
		}
		for _, u := range users {
			if ext.UserID != "" && u.DingtalkUserID != nil && *u.DingtalkUserID == ext.UserID {
				return u, nil
			}
			if ext.UnionID != "" && u.DingtalkUnionID != nil && *u.DingtalkUnionID == ext.UnionID {
				return u, nil
			}
			if ext.OpenID != "" && u.DingtalkOpenID != nil && *u.DingtalkOpenID == ext.OpenID {
				return u, nil
			}
		}
	}
	return nil, nil
}

func availableOrgsForUser(ctx context.Context, userID int, bondRepo *repository.OrgUserBondRepository, orgRepo *repository.OrgRepository) []OrgChoice {
	bonds, err := bondRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil
	}
	out := make([]OrgChoice, 0, len(bonds))
	for _, b := range bonds {
		name := ""
		if org, _ := orgRepo.GetByID(ctx, b.OrgID); org != nil {
			name = org.Name
		}
		out = append(out, OrgChoice{OrgID: b.OrgID, OrgName: name, IsAdmin: b.IsAdmin})
	}
	return out
}

// Ensure loginkey is used (suppress import error if not yet used above)
var _ = loginkey.ForOAuth
