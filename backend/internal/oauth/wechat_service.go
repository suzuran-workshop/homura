package oauth

import (
	"context"
	"errors"
)

// WeChatWorkService is a stub for WeChat Work OAuth.
// Currently not implemented; returns "not configured" errors.
type WeChatWorkService struct{}

func NewWeChatWorkService() *WeChatWorkService {
	return &WeChatWorkService{}
}

func (s *WeChatWorkService) Name() string {
	return "wechat"
}

func (s *WeChatWorkService) AuthorizeURL(ctx context.Context, redirectURI string) (string, error) {
	return "", errors.New("WeChat Work OAuth not configured")
}

func (s *WeChatWorkService) ValidateState(ctx context.Context, state string) (string, error) {
	return "", errors.New("WeChat Work OAuth not configured")
}

func (s *WeChatWorkService) ExchangeUser(ctx context.Context, code string) (*ExternalUser, error) {
	return nil, errors.New("WeChat Work OAuth not configured")
}

func (s *WeChatWorkService) LoginKeyForUser(ext *ExternalUser) string {
	return "wechat-" + ext.OpenID
}

// Compile-time interface check
var _ OAuthProvider = (*WeChatWorkService)(nil)
