package service

import (
	"context"
	"errors"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// RoleService handles organization-scoped role management.
// Roles are "flowing positions" — orthogonal to the system-level provider/tenant.
type RoleService struct {
	roleRepo *repository.RoleRepository
	userRepo *repository.UserRepository
	bondRepo *repository.OrgUserBondRepository
}

func NewRoleService(roleRepo *repository.RoleRepository, userRepo *repository.UserRepository, bondRepo *repository.OrgUserBondRepository) *RoleService {
	return &RoleService{roleRepo: roleRepo, userRepo: userRepo, bondRepo: bondRepo}
}

func (s *RoleService) CreateRole(ctx context.Context, orgID int, name, description string, permissions map[string]interface{}) (*model.Role, error) {
	role := &model.Role{
		OrgID:       orgID,
		Name:        name,
		Description: description,
		Permissions: model.JSONB(permissions),
	}
	if err := s.roleRepo.Create(ctx, role); err != nil {
		return nil, err
	}
	return role, nil
}

func (s *RoleService) ListRoles(ctx context.Context, orgID int) ([]*model.Role, error) {
	return s.roleRepo.GetByOrgID(ctx, orgID)
}

func (s *RoleService) GetRole(ctx context.Context, orgID, roleID int) (*model.Role, error) {
	role, err := s.roleRepo.GetByID(ctx, roleID)
	if err != nil {
		return nil, err
	}
	if role == nil || role.OrgID != orgID {
		return nil, errors.New("role not found")
	}
	return role, nil
}

// GetRoleByName finds a role by name within an org (used by workflow engine).
func (s *RoleService) GetRoleByName(ctx context.Context, orgID int, name string) (*model.Role, error) {
	return s.roleRepo.GetByOrgAndName(ctx, orgID, name)
}

func (s *RoleService) UpdateRole(ctx context.Context, orgID, roleID int, name, description string, permissions map[string]interface{}) (*model.Role, error) {
	role, err := s.GetRole(ctx, orgID, roleID)
	if err != nil {
		return nil, err
	}
	if name != "" {
		role.Name = name
	}
	if description != "" {
		role.Description = description
	}
	if permissions != nil {
		role.Permissions = model.JSONB(permissions)
	}
	if err := s.roleRepo.Update(ctx, role); err != nil {
		return nil, err
	}
	return role, nil
}

func (s *RoleService) DeleteRole(ctx context.Context, orgID, roleID int) error {
	if _, err := s.GetRole(ctx, orgID, roleID); err != nil {
		return err
	}
	return s.roleRepo.Delete(ctx, roleID)
}

func (s *RoleService) AssignRole(ctx context.Context, orgID, userID, roleID int) error {
	bond, err := s.bondRepo.GetByOrgAndUser(ctx, orgID, userID)
	if err != nil {
		return err
	}
	if bond == nil {
		return errors.New("user is not a member of this organization")
	}
	if _, err := s.GetRole(ctx, orgID, roleID); err != nil {
		return err
	}
	return s.roleRepo.AssignRole(ctx, orgID, userID, roleID)
}

func (s *RoleService) UnassignRole(ctx context.Context, orgID, userID, roleID int) error {
	return s.roleRepo.UnassignRole(ctx, orgID, userID, roleID)
}

func (s *RoleService) GetUserRoles(ctx context.Context, orgID, userID int) ([]*model.Role, error) {
	return s.roleRepo.GetUserRoles(ctx, orgID, userID)
}

// GetRoleAssigneeIDs returns user IDs that hold a specific role in an org.
func (s *RoleService) GetRoleAssigneeIDs(ctx context.Context, orgID, roleID int) ([]int, error) {
	return s.roleRepo.GetRoleAssignees(ctx, orgID, roleID)
}
