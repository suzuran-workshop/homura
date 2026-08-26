package service

import (
	"context"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// DepartmentService handles department operations
type DepartmentService struct {
	deptRepo   *repository.DepartmentRepository
	bondRepo   *repository.OrgUserBondRepository
	udRepo     *repository.UserDepartmentRepository
}

// NewDepartmentService creates a new department service
func NewDepartmentService(deptRepo *repository.DepartmentRepository, bondRepo *repository.OrgUserBondRepository, udRepo *repository.UserDepartmentRepository) *DepartmentService {
	return &DepartmentService{
		deptRepo: deptRepo,
		bondRepo: bondRepo,
		udRepo:   udRepo,
	}
}

// CreateDept creates a new department
func (s *DepartmentService) CreateDept(ctx context.Context, dept *model.Department) (*model.Department, error) {
	err := s.deptRepo.Create(ctx, dept)
	if err != nil {
		return nil, err
	}
	return dept, nil
}

// GetDeptByID retrieves a department by ID
func (s *DepartmentService) GetDeptByID(ctx context.Context, id int) (*model.Department, error) {
	return s.deptRepo.GetByID(ctx, id)
}

// GetDeptsByOrgID retrieves all departments for an organization
func (s *DepartmentService) GetDeptsByOrgID(ctx context.Context, orgID int) ([]*model.Department, error) {
	return s.deptRepo.GetByOrgID(ctx, orgID)
}

// UpdateDept updates a department
func (s *DepartmentService) UpdateDept(ctx context.Context, dept *model.Department) error {
	return s.deptRepo.Update(ctx, dept)
}

// DeleteDept deletes a department
func (s *DepartmentService) DeleteDept(ctx context.Context, id int) error {
	return s.deptRepo.Delete(ctx, id)
}

// SetManager sets a department manager
func (s *DepartmentService) SetManager(ctx context.Context, deptID, managerUserID int) error {
	return s.deptRepo.SetManager(ctx, deptID, managerUserID)
}

// DepartmentNode is a department with its children for tree rendering.
type DepartmentNode struct {
	model.Department
	Children []DepartmentNode `json:"children"`
}

// BuildTree returns departments of an org assembled into a tree structure.
// 组装方式：按 parentID 分组，再从根节点递归向下构建（从底向上填充 Children，
// 避免「边链接边值拷贝」导致 roots 拷贝丢失后续填充的经典 bug）。
func (s *DepartmentService) BuildTree(ctx context.Context, orgID int) ([]DepartmentNode, error) {
	depts, err := s.deptRepo.GetByOrgID(ctx, orgID)
	if err != nil {
		return nil, err
	}

	// 本批存在的部门 id 集合，用于判断父部门是否在本 org 内
	exists := make(map[int]bool, len(depts))
	for _, d := range depts {
		exists[d.ID] = true
	}

	// 按 parentID 分组；ParentID 为 nil/0 或父不在本批 → 视为根
	childrenOf := make(map[int][]*model.Department)
	var roots []*model.Department
	for _, d := range depts {
		if d.ParentID != nil && *d.ParentID != 0 && exists[*d.ParentID] {
			childrenOf[*d.ParentID] = append(childrenOf[*d.ParentID], d)
		} else {
			roots = append(roots, d)
		}
	}

	var build func(ds []*model.Department) []DepartmentNode
	build = func(ds []*model.Department) []DepartmentNode {
		nodes := make([]DepartmentNode, 0, len(ds))
		for _, d := range ds {
			n := DepartmentNode{Department: *d}
			if kids := childrenOf[d.ID]; len(kids) > 0 {
				n.Children = build(kids)
			}
			nodes = append(nodes, n)
		}
		return nodes
	}
	return build(roots), nil
}

// --- Multi-department membership ---

// AddMember adds a user to a department within an org.
func (s *DepartmentService) AddMember(ctx context.Context, orgID, userID, departmentID int) error {
	ud := &model.UserDepartment{
		OrgID:        orgID,
		UserID:       userID,
		DepartmentID: departmentID,
	}
	if err := s.udRepo.Create(ctx, ud); err != nil {
		return err
	}
	// Also sync the primary department to the bond for backward compat
	return s.syncPrimaryDeptToBond(ctx, orgID, userID)
}

// RemoveMember removes a user from a department within an org.
func (s *DepartmentService) RemoveMember(ctx context.Context, orgID, userID, departmentID int) error {
	if err := s.udRepo.Delete(ctx, orgID, userID, departmentID); err != nil {
		return err
	}
	return s.syncPrimaryDeptToBond(ctx, orgID, userID)
}

// SetPrimaryDepartment marks a department as the user's primary department.
func (s *DepartmentService) SetPrimaryDepartment(ctx context.Context, orgID, userID, departmentID int) error {
	if err := s.udRepo.SetPrimary(ctx, orgID, userID, departmentID); err != nil {
		return err
	}
	return s.syncPrimaryDeptToBond(ctx, orgID, userID)
}

// GetUserDepartments returns all departments a user belongs to within an org.
func (s *DepartmentService) GetUserDepartments(ctx context.Context, orgID, userID int) ([]*model.UserDepartment, error) {
	return s.udRepo.GetByUser(ctx, orgID, userID)
}

// GetDepartmentMembers returns all users in a department.
func (s *DepartmentService) GetDepartmentMembers(ctx context.Context, orgID, departmentID int) ([]*model.UserDepartment, error) {
	return s.udRepo.GetByDepartment(ctx, orgID, departmentID)
}

// syncPrimaryDeptToBond keeps the bond's department_id in sync with the primary UserDepartment.
func (s *DepartmentService) syncPrimaryDeptToBond(ctx context.Context, orgID, userID int) error {
	primary, err := s.udRepo.GetPrimary(ctx, orgID, userID)
	if err != nil {
		return err
	}
	bond, err := s.bondRepo.GetByOrgAndUser(ctx, orgID, userID)
	if err != nil || bond == nil {
		return err
	}
	var deptID *int
	if primary != nil {
		deptID = &primary.DepartmentID
	}
	bond.DepartmentID = deptID
	return s.bondRepo.Update(ctx, bond)
}
