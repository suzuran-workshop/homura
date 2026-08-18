package oauth

import (
	"context"
	"errors"
	"time"

	"github.com/xrl/suzuran-cloud/internal/pkg/password"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// PasswordService implements username/password login, producing the same
// LoginResult that WebAuthn and DingTalk produce so the existing
// /oauth/session/token bridge works without modification.
type PasswordService struct {
	userRepo *repository.UserRepository
	bondRepo *repository.OrgUserBondRepository
	orgRepo  *repository.OrgRepository
}

// NewPasswordService creates a new PasswordService.
func NewPasswordService(
	userRepo *repository.UserRepository,
	bondRepo *repository.OrgUserBondRepository,
	orgRepo *repository.OrgRepository,
) *PasswordService {
	return &PasswordService{userRepo: userRepo, bondRepo: bondRepo, orgRepo: orgRepo}
}

// Login authenticates with username+password and returns a login session ID
// that the frontend exchanges for tokens via /oauth/session/token.
func (s *PasswordService) Login(ctx context.Context, username, plaintext string) (string, error) {
	user, err := s.userRepo.GetByUsername(ctx, username)
	if err != nil || user == nil {
		// Run bcrypt even when user not found to maintain constant-time response
		// (anti-enumeration, mirrors WebAuthn fakeLoginChallenge pattern).
		_ = password.Verify(plaintext, "$2a$12$AAAAAAAAAAAAAAAAAAAAA.DummyHashForTimingCalibration0000000000000")
		return "", errors.New("invalid username or password")
	}

	if !user.IsActive {
		return "", errors.New("invalid username or password")
	}

	if user.PasswordHash == nil || *user.PasswordHash == "" {
		return "", errors.New("invalid username or password")
	}

	if !password.Verify(plaintext, *user.PasswordHash) {
		return "", errors.New("invalid username or password")
	}

	orgs, err := s.availableOrgs(ctx, user.ID)
	if err != nil {
		return "", err
	}

	loginResult := &LoginResult{UserID: user.ID, AvailableOrgs: orgs}
	sessionID, err := RandomString(32)
	if err != nil {
		return "", err
	}
	if err := storeLoginSession(sessionID, loginResult, 5*time.Minute); err != nil {
		return "", err
	}
	return sessionID, nil
}

func (s *PasswordService) availableOrgs(ctx context.Context, userID int) ([]OrgChoice, error) {
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
