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

func setupUserTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Org{},
		&model.OrgUserBond{},
		&model.Department{},
	))

	return db
}

func seedOrg(t *testing.T, db *gorm.DB) *model.Org {
	t.Helper()
	org := &model.Org{Name: "Test Org"}
	require.NoError(t, db.Create(org).Error)
	return org
}

// Members authenticate via username/password; WebAuthn/DingTalk are supplementary.
// CreateMember signature is (orgID, phone, name, email, username, password, position, isAdmin, deptID, isDeptMgr).

func TestUserService_CreateMember_NewPhone(t *testing.T) {
	db := setupUserTestDB(t)
	org := seedOrg(t, db)

	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)
	svc := NewUserService(userRepo, bondRepo)

	ctx := context.Background()
	m, err := svc.CreateMember(ctx, org.ID, "13800138000", "Alice", "a@b.com", "alice", "secret123", "Engineer", false, nil, false)
	require.NoError(t, err)
	require.NotNil(t, m)

	assert.Equal(t, "13800138000", m.Phone)
	assert.Equal(t, "Alice", m.Name)
	assert.Equal(t, "a@b.com", m.Email)
	assert.Equal(t, "Engineer", m.Position)
	assert.False(t, m.IsAdmin)
	assert.False(t, m.IsDepartmentManager)

	// User created with username + bcrypt password
	user, err := userRepo.GetByPhone(ctx, "13800138000")
	require.NoError(t, err)
	assert.Equal(t, "Alice", user.Name)
	require.NotNil(t, user.Username)
	assert.Equal(t, "alice", *user.Username)
	require.NotNil(t, user.PasswordHash)
}

func TestUserService_CreateMember_ExistingPhone_AutoJoin(t *testing.T) {
	db := setupUserTestDB(t)
	org := seedOrg(t, db)

	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	// Pre-create a user (no password)
	existUser := &model.User{Phone: "13900139000", Name: "Bob"}
	require.NoError(t, db.Create(existUser).Error)

	svc := NewUserService(userRepo, bondRepo)

	ctx := context.Background()
	m, err := svc.CreateMember(ctx, org.ID, "13900139000", "", "", "", "", "", true, nil, false)
	require.NoError(t, err)
	require.NotNil(t, m)

	assert.Equal(t, existUser.ID, m.UserID)
	assert.Equal(t, "Bob", m.Name)
	assert.True(t, m.IsAdmin)

	bond, _ := bondRepo.GetByOrgAndUser(ctx, org.ID, existUser.ID)
	require.NotNil(t, bond)
}

func TestUserService_CreateMember_AlreadyInOrg(t *testing.T) {
	db := setupUserTestDB(t)
	org := seedOrg(t, db)

	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)
	existUser := &model.User{Phone: "13700137000", Name: "Carol"}
	require.NoError(t, db.Create(existUser).Error)
	bond := &model.OrgUserBond{OrgID: org.ID, UserID: existUser.ID}
	require.NoError(t, db.Create(bond).Error)

	svc := NewUserService(userRepo, bondRepo)

	ctx := context.Background()
	m, err := svc.CreateMember(ctx, org.ID, "13700137000", "", "", "", "", "", false, nil, false)
	require.NoError(t, err)
	require.NotNil(t, m)
	assert.Equal(t, bond.ID, m.BondID)
}

func TestUserService_ListMembers(t *testing.T) {
	db := setupUserTestDB(t)
	org := seedOrg(t, db)

	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	u1 := &model.User{Phone: "13800000001", Name: "U1"}
	u2 := &model.User{Phone: "13800000002", Name: "U2"}
	require.NoError(t, db.Create(u1).Error)
	require.NoError(t, db.Create(u2).Error)

	b1 := &model.OrgUserBond{OrgID: org.ID, UserID: u1.ID, IsAdmin: true}
	b2 := &model.OrgUserBond{OrgID: org.ID, UserID: u2.ID, IsAdmin: false}
	require.NoError(t, db.Create(b1).Error)
	require.NoError(t, db.Create(b2).Error)

	svc := NewUserService(userRepo, bondRepo)

	ctx := context.Background()
	members, err := svc.ListMembers(ctx, org.ID)
	require.NoError(t, err)
	assert.Len(t, members, 2)
}

func TestUserService_UpdateMember(t *testing.T) {
	db := setupUserTestDB(t)
	org := seedOrg(t, db)

	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	u := &model.User{Phone: "13800000010", Name: "Original"}
	require.NoError(t, db.Create(u).Error)
	bond := &model.OrgUserBond{OrgID: org.ID, UserID: u.ID, IsAdmin: false}
	require.NoError(t, db.Create(bond).Error)

	svc := NewUserService(userRepo, bondRepo)

	ctx := context.Background()
	isAdmin := true
	deptID := 42
	isDeptMgr := true
	m, err := svc.UpdateMember(ctx, org.ID, u.ID, "New Name", "new@e.com", "Senior", &isAdmin, &deptID, &isDeptMgr)
	require.NoError(t, err)
	require.NotNil(t, m)

	assert.Equal(t, "New Name", m.Name)
	assert.Equal(t, "new@e.com", m.Email)
	assert.Equal(t, "Senior", m.Position)
	assert.True(t, m.IsAdmin)
	assert.True(t, m.IsDepartmentManager)
	assert.Equal(t, 42, *m.DepartmentID)
}

func TestUserService_RemoveMember(t *testing.T) {
	db := setupUserTestDB(t)
	org := seedOrg(t, db)

	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	u := &model.User{Phone: "13800000020", Name: "RemoveMe"}
	require.NoError(t, db.Create(u).Error)
	bond := &model.OrgUserBond{OrgID: org.ID, UserID: u.ID}
	require.NoError(t, db.Create(bond).Error)

	// Remover must be a different user who is also an admin (last-admin protection).
	currentUser := &model.User{Phone: "13800000021", Name: "Remover"}
	require.NoError(t, db.Create(currentUser).Error)
	currentBond := &model.OrgUserBond{OrgID: org.ID, UserID: currentUser.ID, IsAdmin: true}
	require.NoError(t, db.Create(currentBond).Error)

	svc := NewUserService(userRepo, bondRepo)

	ctx := context.Background()
	err := svc.RemoveMember(ctx, org.ID, u.ID, currentUser.ID)
	require.NoError(t, err)

	// Bond should be gone
	b, _ := bondRepo.GetByOrgAndUser(ctx, org.ID, u.ID)
	assert.Nil(t, b)

	// User should still exist
	user, _ := userRepo.GetByID(ctx, u.ID)
	assert.NotNil(t, user)
}

func TestDepartmentService_BuildTree(t *testing.T) {
	db := setupUserTestDB(t)
	org := &model.Org{Name: "Tree Org"}
	require.NoError(t, db.Create(org).Error)

	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)
	svc := NewDepartmentService(deptRepo, bondRepo)

	ctx := context.Background()

	root, err := svc.CreateDept(ctx, &model.Department{OrgID: org.ID, Name: "Root", Level: 1})
	require.NoError(t, err)

	child1, err := svc.CreateDept(ctx, &model.Department{OrgID: org.ID, Name: "Child1", ParentID: &root.ID, Level: 2})
	require.NoError(t, err)

	_, err = svc.CreateDept(ctx, &model.Department{OrgID: org.ID, Name: "Child2", ParentID: &root.ID, Level: 2})
	require.NoError(t, err)

	grandchild, err := svc.CreateDept(ctx, &model.Department{OrgID: org.ID, Name: "GrandChild", ParentID: &child1.ID, Level: 3})
	require.NoError(t, err)

	tree, err := svc.BuildTree(ctx, org.ID)
	require.NoError(t, err)

	assert.Len(t, tree, 1)
	assert.Equal(t, "Root", tree[0].Name)
	assert.Len(t, tree[0].Children, 2)
	assert.Equal(t, "Child1", tree[0].Children[0].Name)
	assert.Equal(t, "Child2", tree[0].Children[1].Name)
	assert.Len(t, tree[0].Children[0].Children, 1)
	assert.Equal(t, "GrandChild", tree[0].Children[0].Children[0].Name)

	_ = grandchild
}
