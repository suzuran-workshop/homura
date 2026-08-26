package oauth

import (
	"context"
	"errors"
)

// FeishuService is a stub for Feishu/Lark OAuth.
// Currently not implemented; returns "not configured" errors.
type FeishuService struct{}

func NewFeishuService() *FeishuService {
	return &FeishuService{}
}

func (s *FeishuService) Name() string {
	return "feishu"
}

func (s *FeishuService) AuthorizeURL(ctx context.Context, redirectURI string) (string, error) {
	return "", errors.New("Feishu OAuth not configured")
}

func (s *FeishuService) ValidateState(ctx context.Context, state string) (string, error) {
	return "", errors.New("Feishu OAuth not configured")
}

func (s *FeishuService) ExchangeUser(ctx context.Context, code string) (*ExternalUser, error) {
	return nil, errors.New("Feishu OAuth not configured")
}

func (s *FeishuService) LoginKeyForUser(ext *ExternalUser) string {
	return "feishu-" + ext.OpenID
}

// Compile-time interface check
var _ OAuthProvider = (*FeishuService)(nil)
