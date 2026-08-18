package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

func setupDistributionTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Org{},
		&model.OrgUserBond{},
		&model.Application{},
		&model.ApplicationDistribution{},
		&model.ApplicationAdmin{},
	))

	return db
}

func seedDistributionData(t *testing.T, db *gorm.DB) (appID string, orgID, tenantUserID, providerUserID int) {
	t.Helper()

	providerOrg := &model.Org{Name: "Provider Org"}
	require.NoError(t, db.Create(providerOrg).Error)

	org := &model.Org{Name: "Tenant Org"}
	require.NoError(t, db.Create(org).Error)

	provider := &model.User{Name: "Provider"}
	require.NoError(t, db.Create(provider).Error)
	require.NoError(t, db.Create(&model.OrgUserBond{OrgID: providerOrg.ID, UserID: provider.ID}).Error)

	tenant := &model.User{Name: "Tenant"}
	require.NoError(t, db.Create(tenant).Error)
	require.NoError(t, db.Create(&model.OrgUserBond{OrgID: org.ID, UserID: tenant.ID}).Error)

	app := &model.Application{ID: "app-1", OrgID: 1, Name: "Test App", Status: "created"}
	require.NoError(t, db.Create(app).Error)

	return app.ID, org.ID, tenant.ID, provider.ID
}

func TestDistributionService_DistributeAndUndistribute(t *testing.T) {
	db := setupDistributionTestDB(t)
	ctx := context.Background()
	appID, orgID, _, _ := seedDistributionData(t, db)

	appRepo := repository.NewApplicationRepository(db)
	orgRepo := repository.NewOrgRepository(db)
	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)
	svc := NewDistributionService(appRepo, orgRepo, userRepo, bondRepo)

	// Distribute
	require.NoError(t, svc.DistributeApp(ctx, appID, orgID))

	// Duplicate rejected
	err := svc.DistributeApp(ctx, appID, orgID)
	assert.ErrorContains(t, err, "already distributed")

	// Distribute to provider org rejected
	err = svc.DistributeApp(ctx, appID, 1)
	assert.ErrorContains(t, err, "provider org")

	// Unknown org rejected
	err = svc.DistributeApp(ctx, appID, 999)
	assert.ErrorContains(t, err, "organization not found")

	// Unknown app rejected
	err = svc.DistributeApp(ctx, "no-such-app", orgID)
	assert.ErrorContains(t, err, "application not found")

	// List for org
	apps, err := svc.ListAppsForOrg(ctx, orgID)
	require.NoError(t, err)
	assert.Len(t, apps, 1)
	assert.Equal(t, appID, apps[0].ID)

	// Undistribute
	require.NoError(t, svc.UndistributeApp(ctx, appID, orgID))
	apps, err = svc.ListAppsForOrg(ctx, orgID)
	require.NoError(t, err)
	assert.Empty(t, apps)
}

func TestDistributionService_AppAdmins(t *testing.T) {
	db := setupDistributionTestDB(t)
	ctx := context.Background()
	appID, orgID, tenantUserID, providerUserID := seedDistributionData(t, db)

	appRepo := repository.NewApplicationRepository(db)
	orgRepo := repository.NewOrgRepository(db)
	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)
	svc := NewDistributionService(appRepo, orgRepo, userRepo, bondRepo)

	// Not an admin before distribution
	ok, err := svc.IsAppAdmin(ctx, tenantUserID, orgID, appID)
	require.NoError(t, err)
	assert.False(t, ok)

	// Provider is implicitly an admin everywhere
	ok, err = svc.IsAppAdmin(ctx, providerUserID, orgID, appID)
	require.NoError(t, err)
	assert.True(t, ok)

	// SetAdmin before distribution rejected
	err = svc.SetAppAdmin(ctx, appID, orgID, tenantUserID)
	assert.ErrorContains(t, err, "not distributed")

	// Distribute, then set admin
	require.NoError(t, svc.DistributeApp(ctx, appID, orgID))
	require.NoError(t, svc.SetAppAdmin(ctx, appID, orgID, tenantUserID))

	ok, err = svc.IsAppAdmin(ctx, tenantUserID, orgID, appID)
	require.NoError(t, err)
	assert.True(t, ok)

	// Duplicate rejected
	err = svc.SetAppAdmin(ctx, appID, orgID, tenantUserID)
	assert.ErrorContains(t, err, "already an app admin")

	// Non-member rejected
	err = svc.SetAppAdmin(ctx, appID, orgID, 9999)
	assert.ErrorContains(t, err, "not a member")

	// List distributions includes admin info
	dists, err := svc.ListDistributions(ctx, appID)
	require.NoError(t, err)
	require.Len(t, dists, 1)
	assert.Equal(t, "Tenant Org", dists[0].OrgName)
	require.Len(t, dists[0].Admins, 1)
	assert.Equal(t, "Tenant", dists[0].Admins[0].Name)

	// Remove admin
	require.NoError(t, svc.RemoveAppAdmin(ctx, appID, orgID, tenantUserID))
	ok, err = svc.IsAppAdmin(ctx, tenantUserID, orgID, appID)
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestDistributionService_ListAllApps(t *testing.T) {
	db := setupDistributionTestDB(t)
	ctx := context.Background()
	appID, _, _, _ := seedDistributionData(t, db)

	appRepo := repository.NewApplicationRepository(db)
	orgRepo := repository.NewOrgRepository(db)
	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)
	svc := NewDistributionService(appRepo, orgRepo, userRepo, bondRepo)

	apps, err := svc.ListAllApps(ctx)
	require.NoError(t, err)
	require.Len(t, apps, 1)
	assert.Equal(t, appID, apps[0].ID)
}