package service

import (
	"context"
	"errors"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// OrgService handles organization operations
type OrgService struct {
	orgRepo  *repository.OrgRepository
	deptRepo *repository.DepartmentRepository
	bondRepo *repository.OrgUserBondRepository
}

// NewOrgService creates a new organization service
func NewOrgService(orgRepo *repository.OrgRepository, deptRepo *repository.DepartmentRepository, bondRepo *repository.OrgUserBondRepository) *OrgService {
	return &OrgService{
		orgRepo:  orgRepo,
		deptRepo: deptRepo,
		bondRepo: bondRepo,
	}
}

// CreateOrg creates a new organization
func (s *OrgService) CreateOrg(ctx context.Context, name, description string, parentID *int) (*model.Org, error) {
	// Validate parent exists and prevent circular references
	if parentID != nil {
		parent, err := s.orgRepo.GetByID(ctx, *parentID)
		if err != nil {
			return nil, err
		}
		if parent == nil {
			return nil, errors.New("parent organization not found")
		}
	}
	org := &model.Org{
		Name:        name,
		Description: description,
		ParentID:    parentID,
	}
	err := s.orgRepo.Create(ctx, org)
	if err != nil {
		return nil, err
	}
	return org, nil
}

// GetOrgByID retrieves an organization by ID
func (s *OrgService) GetOrgByID(ctx context.Context, id int) (*model.Org, error) {
	return s.orgRepo.GetByID(ctx, id)
}

// ListOrgs lists all organizations
func (s *OrgService) ListOrgs(ctx context.Context) ([]*model.Org, error) {
	return s.orgRepo.List(ctx)
}

// UpdateOrg updates an organization
func (s *OrgService) UpdateOrg(ctx context.Context, id int, name, description string, parentID *int) error {
	org, err := s.orgRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if org == nil {
		return errors.New("organization not found")
	}
	// Prevent setting self as parent
	if parentID != nil && *parentID == id {
		return errors.New("organization cannot be its own parent")
	}
	// Prevent circular references
	if parentID != nil {
		ancestors, err := s.orgRepo.GetAncestors(ctx, *parentID)
		if err != nil {
			return err
		}
		for _, a := range ancestors {
			if a.ID == id {
				return errors.New("setting this parent would create a circular reference")
			}
		}
	}
	org.Name = name
	org.Description = description
	org.ParentID = parentID
	return s.orgRepo.Update(ctx, org)
}

// DeleteOrg deletes an organization
func (s *OrgService) DeleteOrg(ctx context.Context, id int) error {
	return s.orgRepo.Delete(ctx, id)
}

// --- Hierarchy methods ---

// GetChildren returns all direct children of an org.
func (s *OrgService) GetChildren(ctx context.Context, parentID int) ([]*model.Org, error) {
	return s.orgRepo.GetChildren(ctx, parentID)
}

// GetAncestors returns all ancestor orgs from the given org up to the root.
func (s *OrgService) GetAncestors(ctx context.Context, orgID int) ([]*model.Org, error) {
	return s.orgRepo.GetAncestors(ctx, orgID)
}

// GetDescendants returns all descendant orgs.
func (s *OrgService) GetDescendants(ctx context.Context, orgID int) ([]*model.Org, error) {
	return s.orgRepo.GetDescendants(ctx, orgID)
}

// GetAncestorOrgIDs returns the org itself plus all ancestor org IDs.
// Used for resource sharing: child orgs can access resources from parent orgs.
func (s *OrgService) GetAncestorOrgIDs(ctx context.Context, orgID int) ([]int, error) {
	ids := []int{orgID}
	ancestors, err := s.orgRepo.GetAncestors(ctx, orgID)
	if err != nil {
		return nil, err
	}
	for _, a := range ancestors {
		ids = append(ids, a.ID)
	}
	return ids, nil
}
