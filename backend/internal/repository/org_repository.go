package repository

import (
	"context"
	"github.com/xrl/suzuran-cloud/internal/model"
	"gorm.io/gorm"
)

type OrgRepository struct {
	db *gorm.DB
}

func NewOrgRepository(db *gorm.DB) *OrgRepository {
	return &OrgRepository{db: db}
}

func (r *OrgRepository) Create(ctx context.Context, org *model.Org) error {
	return r.db.WithContext(ctx).Create(org).Error
}

func (r *OrgRepository) GetByID(ctx context.Context, id int) (*model.Org, error) {
	var org model.Org
	err := r.db.WithContext(ctx).First(&org, id).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &org, err
}

func (r *OrgRepository) List(ctx context.Context) ([]*model.Org, error) {
	var orgs []*model.Org
	err := r.db.WithContext(ctx).Order("id ASC").Find(&orgs).Error
	return orgs, err
}

func (r *OrgRepository) Update(ctx context.Context, org *model.Org) error {
	return r.db.WithContext(ctx).Save(org).Error
}

func (r *OrgRepository) Delete(ctx context.Context, id int) error {
	return r.db.WithContext(ctx).Delete(&model.Org{}, id).Error
}

// GetChildren returns all direct children of an org.
func (r *OrgRepository) GetChildren(ctx context.Context, parentID int) ([]*model.Org, error) {
	var orgs []*model.Org
	err := r.db.WithContext(ctx).Where("parent_id = ?", parentID).Order("id ASC").Find(&orgs).Error
	return orgs, err
}

// GetAncestors returns all ancestor orgs from the given org up to the root.
func (r *OrgRepository) GetAncestors(ctx context.Context, orgID int) ([]*model.Org, error) {
	var ancestors []*model.Org
	currentID := orgID
	visited := make(map[int]bool)
	for {
		if visited[currentID] {
			break // prevent circular reference loops
		}
		visited[currentID] = true
		org, err := r.GetByID(ctx, currentID)
		if err != nil || org == nil || org.ParentID == nil {
			break
		}
		parent, err := r.GetByID(ctx, *org.ParentID)
		if err != nil || parent == nil {
			break
		}
		ancestors = append(ancestors, parent)
		currentID = parent.ID
	}
	return ancestors, nil
}

// GetDescendants returns all descendant orgs (children, grandchildren, etc.).
func (r *OrgRepository) GetDescendants(ctx context.Context, orgID int) ([]*model.Org, error) {
	var descendants []*model.Org
	visited := make(map[int]bool)
	var collect func(id int) error
	collect = func(id int) error {
		if visited[id] {
			return nil // prevent circular loops
		}
		visited[id] = true
		children, err := r.GetChildren(ctx, id)
		if err != nil {
			return err
		}
		for _, child := range children {
			descendants = append(descendants, child)
			if err := collect(child.ID); err != nil {
				return err
			}
		}
		return nil
	}
	if err := collect(orgID); err != nil {
		return nil, err
	}
	return descendants, nil
}
