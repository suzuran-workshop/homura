package repository

import (
	"context"
	"time"

	"github.com/xrl/suzuran-cloud/internal/model"
	"gorm.io/gorm"
)

// ApplicationRepository manages Application persistence.
type ApplicationRepository struct {
	db *gorm.DB
}

func NewApplicationRepository(db *gorm.DB) *ApplicationRepository {
	return &ApplicationRepository{db: db}
}

func (r *ApplicationRepository) Create(ctx context.Context, app *model.Application) error {
	return r.db.WithContext(ctx).Create(app).Error
}

func (r *ApplicationRepository) GetByID(ctx context.Context, id string) (*model.Application, error) {
	var app model.Application
	err := r.db.WithContext(ctx).First(&app, "id = ?", id).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &app, err
}

func (r *ApplicationRepository) ListByOrgID(ctx context.Context, orgID int) ([]*model.Application, error) {
	var apps []*model.Application
	err := r.db.WithContext(ctx).Where("org_id = ?", orgID).Order("created_at DESC").Find(&apps).Error
	return apps, err
}

// ListAll lists every application in the platform (provider view).
func (r *ApplicationRepository) ListAll(ctx context.Context) ([]*model.Application, error) {
	var apps []*model.Application
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&apps).Error
	return apps, err
}

func (r *ApplicationRepository) Update(ctx context.Context, app *model.Application) error {
	return r.db.WithContext(ctx).Save(app).Error
}

// ExistsByName checks whether an app with the given name exists in an org.
func (r *ApplicationRepository) ExistsByName(ctx context.Context, orgID int, name string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&model.Application{}).
		Where("org_id = ? AND name = ?", orgID, name).
		Count(&count).Error
	return count > 0, err
}

// UpdateSourceKey sets the object key of the app's code package.
func (r *ApplicationRepository) UpdateSourceKey(ctx context.Context, id, sourceKey string) error {
	return r.db.WithContext(ctx).
		Model(&model.Application{}).
		Where("id = ?", id).
		Update("source_key", sourceKey).Error
}

func (r *ApplicationRepository) Delete(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Delete(&model.Application{}, "id = ?", id).Error
}

// UpdateStatus updates the status and container ID of an application.
func (r *ApplicationRepository) UpdateStatus(ctx context.Context, id, status, containerID string) error {
	updates := map[string]interface{}{
		"status":      status,
		"container_id": containerID,
		"updated_at":  time.Now(),
	}
	return r.db.WithContext(ctx).Model(&model.Application{}).Where("id = ?", id).Updates(updates).Error
}

// --- Application distribution (multi-tenant sharing) ---

// CreateDistribution distributes an app to an org (idempotent via unique index).
func (r *ApplicationRepository) CreateDistribution(ctx context.Context, appID string, orgID int) error {
	return r.db.WithContext(ctx).Create(&model.ApplicationDistribution{
		AppID: appID,
		OrgID: orgID,
	}).Error
}

// DeleteDistribution removes an app distribution for an org.
func (r *ApplicationRepository) DeleteDistribution(ctx context.Context, appID string, orgID int) error {
	return r.db.WithContext(ctx).
		Where("app_id = ? AND org_id = ?", appID, orgID).
		Delete(&model.ApplicationDistribution{}).Error
}

// ListDistributionsByApp lists all orgs an app is distributed to.
func (r *ApplicationRepository) ListDistributionsByApp(ctx context.Context, appID string) ([]*model.ApplicationDistribution, error) {
	var dists []*model.ApplicationDistribution
	err := r.db.WithContext(ctx).Where("app_id = ?", appID).Order("org_id ASC").Find(&dists).Error
	return dists, err
}

// ListDistributionsByOrg lists all apps distributed to an org.
func (r *ApplicationRepository) ListDistributionsByOrg(ctx context.Context, orgID int) ([]*model.ApplicationDistribution, error) {
	var dists []*model.ApplicationDistribution
	err := r.db.WithContext(ctx).Where("org_id = ?", orgID).Find(&dists).Error
	return dists, err
}

// GetDistribution checks whether an app is distributed to an org.
func (r *ApplicationRepository) GetDistribution(ctx context.Context, appID string, orgID int) (*model.ApplicationDistribution, error) {
	var dist model.ApplicationDistribution
	err := r.db.WithContext(ctx).Where("app_id = ? AND org_id = ?", appID, orgID).First(&dist).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &dist, err
}

// --- Application admins ---

// CreateAdmin grants app-admin rights to a user for (app, org).
func (r *ApplicationRepository) CreateAdmin(ctx context.Context, appID string, orgID, userID int) error {
	return r.db.WithContext(ctx).Create(&model.ApplicationAdmin{
		AppID:  appID,
		OrgID:  orgID,
		UserID: userID,
	}).Error
}

// DeleteAdmin revokes app-admin rights from a user for (app, org).
func (r *ApplicationRepository) DeleteAdmin(ctx context.Context, appID string, orgID, userID int) error {
	return r.db.WithContext(ctx).
		Where("app_id = ? AND org_id = ? AND user_id = ?", appID, orgID, userID).
		Delete(&model.ApplicationAdmin{}).Error
}

// ListAdminsByAppOrg lists all app admins for (app, org).
func (r *ApplicationRepository) ListAdminsByAppOrg(ctx context.Context, appID string, orgID int) ([]*model.ApplicationAdmin, error) {
	var admins []*model.ApplicationAdmin
	err := r.db.WithContext(ctx).Where("app_id = ? AND org_id = ?", appID, orgID).Order("id ASC").Find(&admins).Error
	return admins, err
}

// GetAdmin checks whether a user is an app admin for (app, org).
func (r *ApplicationRepository) GetAdmin(ctx context.Context, appID string, orgID, userID int) (*model.ApplicationAdmin, error) {
	var admin model.ApplicationAdmin
	err := r.db.WithContext(ctx).Where("app_id = ? AND org_id = ? AND user_id = ?", appID, orgID, userID).First(&admin).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &admin, err
}
