package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// AdminView is the API-facing view of an app admin (user info).
type AdminView struct {
	UserID   int    `json:"userId"`
	Name     string `json:"name"`
	Username string `json:"username,omitempty"`
}

// DistributionView describes one org an app is distributed to, including its admins.
type DistributionView struct {
	OrgID   int         `json:"orgId"`
	OrgName string      `json:"orgName"`
	Admins  []AdminView `json:"admins"`
}

// DistributionService handles app distribution (multi-tenant sharing) and
// per-org app admins. The provider (org 1 members) is implicitly an admin
// of every distributed app and does not need an ApplicationAdmin record.
type DistributionService struct {
	appRepo  *repository.ApplicationRepository
	orgRepo  *repository.OrgRepository
	userRepo *repository.UserRepository
	bondRepo *repository.OrgUserBondRepository
}

// NewDistributionService creates a new DistributionService.
func NewDistributionService(
	appRepo *repository.ApplicationRepository,
	orgRepo *repository.OrgRepository,
	userRepo *repository.UserRepository,
	bondRepo *repository.OrgUserBondRepository,
) *DistributionService {
	return &DistributionService{appRepo: appRepo, orgRepo: orgRepo, userRepo: userRepo, bondRepo: bondRepo}
}

// DistributeApp distributes an app to an org (idempotent).
func (s *DistributionService) DistributeApp(ctx context.Context, appID string, orgID int) error {
	app, err := s.appRepo.GetByID(ctx, appID)
	if err != nil {
		return fmt.Errorf("failed to get application: %w", err)
	}
	if app == nil {
		return errors.New("application not found")
	}
	org, err := s.orgRepo.GetByID(ctx, orgID)
	if err != nil || org == nil {
		return errors.New("organization not found")
	}
	if orgID == 1 {
		return errors.New("apps cannot be distributed to the provider org")
	}
	existing, err := s.appRepo.GetDistribution(ctx, appID, orgID)
	if err != nil {
		return err
	}
	if existing != nil {
		return errors.New("app already distributed to this org")
	}
	return s.appRepo.CreateDistribution(ctx, appID, orgID)
}

// UndistributeApp removes an app distribution and its admins.
func (s *DistributionService) UndistributeApp(ctx context.Context, appID string, orgID int) error {
	if err := s.appRepo.DeleteDistribution(ctx, appID, orgID); err != nil {
		return err
	}
	admins, err := s.appRepo.ListAdminsByAppOrg(ctx, appID, orgID)
	if err != nil {
		return err
	}
	for _, a := range admins {
		if err := s.appRepo.DeleteAdmin(ctx, appID, orgID, a.UserID); err != nil {
			return err
		}
	}
	return nil
}

// ListDistributions lists all orgs an app is distributed to, with admins.
func (s *DistributionService) ListDistributions(ctx context.Context, appID string) ([]DistributionView, error) {
	dists, err := s.appRepo.ListDistributionsByApp(ctx, appID)
	if err != nil {
		return nil, err
	}
	out := make([]DistributionView, 0, len(dists))
	for _, d := range dists {
		view := DistributionView{OrgID: d.OrgID}
		if org, _ := s.orgRepo.GetByID(ctx, d.OrgID); org != nil {
			view.OrgName = org.Name
		}
		admins, err := s.appRepo.ListAdminsByAppOrg(ctx, appID, d.OrgID)
		if err != nil {
			return nil, err
		}
		for _, a := range admins {
			av := AdminView{UserID: a.UserID}
			if u, _ := s.userRepo.GetByID(ctx, a.UserID); u != nil {
				av.Name = u.Name
				if u.Username != nil {
					av.Username = *u.Username
				}
			}
			view.Admins = append(view.Admins, av)
		}
		out = append(out, view)
	}
	return out, nil
}

// SetAppAdmin grants a user app-admin rights for (app, org).
// The user must be a member of the org, and the app must be distributed to it.
func (s *DistributionService) SetAppAdmin(ctx context.Context, appID string, orgID, userID int) error {
	dist, err := s.appRepo.GetDistribution(ctx, appID, orgID)
	if err != nil {
		return err
	}
	if dist == nil {
		return errors.New("app is not distributed to this org")
	}
	bond, err := s.bondRepo.GetByOrgAndUser(ctx, orgID, userID)
	if err != nil {
		return err
	}
	if bond == nil {
		return errors.New("user is not a member of this org")
	}
	existing, err := s.appRepo.GetAdmin(ctx, appID, orgID, userID)
	if err != nil {
		return err
	}
	if existing != nil {
		return errors.New("user is already an app admin")
	}
	return s.appRepo.CreateAdmin(ctx, appID, orgID, userID)
}

// RemoveAppAdmin revokes app-admin rights from a user for (app, org).
func (s *DistributionService) RemoveAppAdmin(ctx context.Context, appID string, orgID, userID int) error {
	return s.appRepo.DeleteAdmin(ctx, appID, orgID, userID)
}

// IsAppAdmin reports whether a user has full data access to (app, org):
// either an explicit ApplicationAdmin record, or provider membership (org 1).
func (s *DistributionService) IsAppAdmin(ctx context.Context, userID, orgID int, appID string) (bool, error) {
	if superBond, err := s.bondRepo.GetByOrgAndUser(ctx, 1, userID); err == nil && superBond != nil {
		return true, nil
	}
	admin, err := s.appRepo.GetAdmin(ctx, appID, orgID, userID)
	if err != nil {
		return false, err
	}
	return admin != nil, nil
}

// ListAppsForOrg lists apps distributed to an org (tenant start page).
func (s *DistributionService) ListAppsForOrg(ctx context.Context, orgID int) ([]*model.Application, error) {
	dists, err := s.appRepo.ListDistributionsByOrg(ctx, orgID)
	if err != nil {
		return nil, err
	}
	apps := make([]*model.Application, 0, len(dists))
	for _, d := range dists {
		app, err := s.appRepo.GetByID(ctx, d.AppID)
		if err != nil {
			return nil, err
		}
		if app != nil {
			apps = append(apps, app)
		}
	}
	return apps, nil
}

// ListAllApps lists every application in the platform (provider view).
func (s *DistributionService) ListAllApps(ctx context.Context) ([]*model.Application, error) {
	return s.appRepo.ListAll(ctx)
}