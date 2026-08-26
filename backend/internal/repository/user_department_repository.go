package repository

import (
	"context"

	"github.com/xrl/suzuran-cloud/internal/model"
	"gorm.io/gorm"
)

type UserDepartmentRepository struct {
	db *gorm.DB
}

func NewUserDepartmentRepository(db *gorm.DB) *UserDepartmentRepository {
	return &UserDepartmentRepository{db: db}
}

func (r *UserDepartmentRepository) Create(ctx context.Context, ud *model.UserDepartment) error {
	return r.db.WithContext(ctx).Create(ud).Error
}

func (r *UserDepartmentRepository) Delete(ctx context.Context, orgID, userID, departmentID int) error {
	return r.db.WithContext(ctx).
		Where("org_id = ? AND user_id = ? AND department_id = ?", orgID, userID, departmentID).
		Delete(&model.UserDepartment{}).Error
}

func (r *UserDepartmentRepository) GetByUser(ctx context.Context, orgID, userID int) ([]*model.UserDepartment, error) {
	var uds []*model.UserDepartment
	err := r.db.WithContext(ctx).Preload("Department").
		Where("org_id = ? AND user_id = ?", orgID, userID).
		Find(&uds).Error
	return uds, err
}

func (r *UserDepartmentRepository) GetByDepartment(ctx context.Context, orgID, departmentID int) ([]*model.UserDepartment, error) {
	var uds []*model.UserDepartment
	err := r.db.WithContext(ctx).Preload("User").
		Where("org_id = ? AND department_id = ?", orgID, departmentID).
		Find(&uds).Error
	return uds, err
}

func (r *UserDepartmentRepository) SetPrimary(ctx context.Context, orgID, userID, departmentID int) error {
	// Clear all primary flags for this user in this org
	if err := r.db.WithContext(ctx).Model(&model.UserDepartment{}).
		Where("org_id = ? AND user_id = ?", orgID, userID).
		Update("is_primary", false).Error; err != nil {
		return err
	}
	// Set the specified department as primary
	return r.db.WithContext(ctx).Model(&model.UserDepartment{}).
		Where("org_id = ? AND user_id = ? AND department_id = ?", orgID, userID, departmentID).
		Update("is_primary", true).Error
}

func (r *UserDepartmentRepository) GetPrimary(ctx context.Context, orgID, userID int) (*model.UserDepartment, error) {
	var ud model.UserDepartment
	err := r.db.WithContext(ctx).Preload("Department").
		Where("org_id = ? AND user_id = ? AND is_primary = ?", orgID, userID, true).
		First(&ud).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &ud, err
}
