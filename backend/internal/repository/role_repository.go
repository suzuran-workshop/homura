package repository

import (
	"context"

	"github.com/xrl/suzuran-cloud/internal/model"
	"gorm.io/gorm"
)

type RoleRepository struct {
	db *gorm.DB
}

func NewRoleRepository(db *gorm.DB) *RoleRepository {
	return &RoleRepository{db: db}
}

func (r *RoleRepository) Create(ctx context.Context, role *model.Role) error {
	return r.db.WithContext(ctx).Create(role).Error
}

func (r *RoleRepository) GetByID(ctx context.Context, id int) (*model.Role, error) {
	var role model.Role
	err := r.db.WithContext(ctx).First(&role, id).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &role, err
}

func (r *RoleRepository) GetByOrgAndName(ctx context.Context, orgID int, name string) (*model.Role, error) {
	var role model.Role
	err := r.db.WithContext(ctx).Where("org_id = ? AND name = ?", orgID, name).First(&role).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &role, err
}

func (r *RoleRepository) GetByOrgID(ctx context.Context, orgID int) ([]*model.Role, error) {
	var roles []*model.Role
	err := r.db.WithContext(ctx).Where("org_id = ?", orgID).Order("id ASC").Find(&roles).Error
	return roles, err
}

func (r *RoleRepository) Update(ctx context.Context, role *model.Role) error {
	return r.db.WithContext(ctx).Save(role).Error
}

func (r *RoleRepository) Delete(ctx context.Context, id int) error {
	return r.db.WithContext(ctx).Delete(&model.Role{}, id).Error
}

// --- UserRole junction ---

func (r *RoleRepository) AssignRole(ctx context.Context, orgID, userID, roleID int) error {
	ur := &model.UserRole{OrgID: orgID, UserID: userID, RoleID: roleID}
	return r.db.WithContext(ctx).Create(ur).Error
}

func (r *RoleRepository) UnassignRole(ctx context.Context, orgID, userID, roleID int) error {
	return r.db.WithContext(ctx).
		Where("org_id = ? AND user_id = ? AND role_id = ?", orgID, userID, roleID).
		Delete(&model.UserRole{}).Error
}

// GetUserRoles returns all roles assigned to a user within an org.
func (r *RoleRepository) GetUserRoles(ctx context.Context, orgID, userID int) ([]*model.Role, error) {
	var userRoles []*model.UserRole
	err := r.db.WithContext(ctx).Preload("Role").
		Where("org_id = ? AND user_id = ?", orgID, userID).
		Find(&userRoles).Error
	if err != nil {
		return nil, err
	}
	roles := make([]*model.Role, 0, len(userRoles))
	for _, ur := range userRoles {
		if ur.Role != nil {
			roles = append(roles, ur.Role)
		}
	}
	return roles, nil
}

// GetRoleAssignees returns user IDs assigned to a role in an org.
func (r *RoleRepository) GetRoleAssignees(ctx context.Context, orgID, roleID int) ([]int, error) {
	var userIDs []int
	err := r.db.WithContext(ctx).Model(&model.UserRole{}).
		Where("org_id = ? AND role_id = ?", orgID, roleID).
		Pluck("user_id", &userIDs).Error
	return userIDs, err
}
