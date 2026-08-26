package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

func TestOrgService_CreateOrg(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	testCases := []struct {
		name        string
		orgName     string
		description string
		wantErr     bool
	}{
		{
			name:        "Valid organization",
			orgName:     "Test Org",
			description: "A test organization",
			wantErr:     false,
		},
		{
			name:        "Empty description",
			orgName:     "Test Org 2",
			description: "",
			wantErr:     false,
		},
		{
			name:        "Long name and description",
			orgName:     "Very Long Organization Name That Exceeds Normal Length",
			description: "This is a very long description for testing purposes to ensure the system can handle lengthy text inputs without any issues or errors occurring during database operations",
			wantErr:     false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			org, err := orgService.CreateOrg(ctx, tc.orgName, tc.description, nil)

			if tc.wantErr {
				assert.Error(t, err)
				assert.Nil(t, org)
			} else {
				require.NoError(t, err)
				assert.NotNil(t, org)
				assert.NotZero(t, org.ID)
				assert.Equal(t, tc.orgName, org.Name)
				assert.Equal(t, tc.description, org.Description)
				assert.False(t, org.CreatedAt.IsZero())
				assert.False(t, org.UpdatedAt.IsZero())
			}
		})
	}
}

func TestOrgService_GetOrgByID(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	org := &model.Org{
		Name:        "Test Org",
		Description: "Test Description",
	}
	err := db.Create(org).Error
	require.NoError(t, err)

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	testCases := []struct {
		name    string
		orgID   int
		wantErr bool
		wantNil bool
	}{
		{
			name:    "Valid org ID",
			orgID:   org.ID,
			wantErr: false,
			wantNil: false,
		},
		{
			name:    "Non-existent org ID",
			orgID:   99999,
			wantErr: false,
			wantNil: true,
		},
		{
			name:    "Zero ID",
			orgID:   0,
			wantErr: false,
			wantNil: true,
		},
		{
			name:    "Negative ID",
			orgID:   -1,
			wantErr: false,
			wantNil: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			result, err := orgService.GetOrgByID(ctx, tc.orgID)

			if tc.wantErr {
				assert.Error(t, err)
			} else {
				if tc.wantNil {
					assert.Nil(t, result)
				} else {
					require.NoError(t, err)
					assert.NotNil(t, result)
					assert.Equal(t, org.ID, result.ID)
					assert.Equal(t, org.Name, result.Name)
					assert.Equal(t, org.Description, result.Description)
				}
			}
		})
	}
}

func TestOrgService_ListOrgs(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	orgs := []*model.Org{
		{Name: "Org 1", Description: "First org"},
		{Name: "Org 2", Description: "Second org"},
		{Name: "Org 3", Description: "Third org"},
	}
	for _, org := range orgs {
		err := db.Create(org).Error
		require.NoError(t, err)
	}

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	ctx := context.Background()
	result, err := orgService.ListOrgs(ctx)

	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.Len(t, result, 3)

	orgNames := make(map[string]bool)
	for _, org := range result {
		orgNames[org.Name] = true
	}

	assert.True(t, orgNames["Org 1"])
	assert.True(t, orgNames["Org 2"])
	assert.True(t, orgNames["Org 3"])
}

func TestOrgService_ListOrgs_Empty(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	ctx := context.Background()
	result, err := orgService.ListOrgs(ctx)

	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.Len(t, result, 0)
}

func TestOrgService_UpdateOrg(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	org := &model.Org{
		Name:        "Original Name",
		Description: "Original Description",
	}
	err := db.Create(org).Error
	require.NoError(t, err)

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	testCases := []struct {
		name        string
		orgID       int
		newName     string
		newDesc     string
		wantErr     bool
		errContains string
	}{
		{
			name:    "Valid update",
			orgID:   org.ID,
			newName: "Updated Name",
			newDesc: "Updated Description",
			wantErr: false,
		},
		{
			name:    "Update with empty description",
			orgID:   org.ID,
			newName: "Updated Name 2",
			newDesc: "",
			wantErr: false,
		},
		{
			name:        "Non-existent org",
			orgID:       99999,
			newName:     "Should Fail",
			newDesc:     "Should Fail",
			wantErr:     true,
			errContains: "organization not found",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			err := orgService.UpdateOrg(ctx, tc.orgID, tc.newName, tc.newDesc, nil)

			if tc.wantErr {
				assert.Error(t, err)
				if tc.errContains != "" {
					assert.Contains(t, err.Error(), tc.errContains)
				}
			} else {
				require.NoError(t, err)

				updatedOrg, getErr := orgService.GetOrgByID(ctx, tc.orgID)
				require.NoError(t, getErr)
				assert.Equal(t, tc.newName, updatedOrg.Name)
				assert.Equal(t, tc.newDesc, updatedOrg.Description)
			}
		})
	}
}

func TestOrgService_DeleteOrg(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	org := &model.Org{
		Name:        "To Be Deleted",
		Description: "This org will be deleted",
	}
	err := db.Create(org).Error
	require.NoError(t, err)

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	testCases := []struct {
		name    string
		orgID   int
		wantErr bool
	}{
		{
			name:    "Delete existing org",
			orgID:   org.ID,
			wantErr: false,
		},
		{
			name:    "Delete non-existent org",
			orgID:   99999,
			wantErr: false,
		},
		{
			name:    "Delete with zero ID",
			orgID:   0,
			wantErr: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			err := orgService.DeleteOrg(ctx, tc.orgID)

			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)

				deletedOrg, getErr := orgService.GetOrgByID(ctx, tc.orgID)
				assert.NoError(t, getErr)
				assert.Nil(t, deletedOrg)
			}
		})
	}
}

func TestOrgService_CreateOrg_SpecialCharacters(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	testCases := []struct {
		name        string
		orgName     string
		description string
	}{
		{
			name:        "Unicode characters",
			orgName:     "组织 🏢",
			description: "这是一个测试组织 🎉",
		},
		{
			name:        "SQL injection attempt",
			orgName:     "'; DROP TABLE orgs; --",
			description: "Testing SQL injection prevention",
		},
		{
			name:        "HTML tags",
			orgName:     "<script>alert('xss')</script>Org",
			description: "<b>Bold</b> description",
		},
		{
			name:        "Whitespace and newlines",
			orgName:     "  Org with spaces  ",
			description: "Line 1\nLine 2\r\nLine 3",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			org, err := orgService.CreateOrg(ctx, tc.orgName, tc.description, nil)

			require.NoError(t, err)
			assert.NotNil(t, org)
			assert.Equal(t, tc.orgName, org.Name)
			assert.Equal(t, tc.description, org.Description)
		})
	}
}

func TestOrgService_UpdateOrg_SameValues(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	org := &model.Org{
		Name:        "Test Org",
		Description: "Test Description",
	}
	err := db.Create(org).Error
	require.NoError(t, err)

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	ctx := context.Background()
	err = orgService.UpdateOrg(ctx, org.ID, org.Name, org.Description, nil)

	require.NoError(t, err)

	updatedOrg, getErr := orgService.GetOrgByID(ctx, org.ID)
	require.NoError(t, getErr)
	assert.Equal(t, org.Name, updatedOrg.Name)
	assert.Equal(t, org.Description, updatedOrg.Description)
}

func TestOrgService_CreateAndGet_Integration(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	ctx := context.Background()

	createdOrg, err := orgService.CreateOrg(ctx, "Integration Test Org", "Integration test", nil)
	require.NoError(t, err)
	assert.NotNil(t, createdOrg)

	fetchedOrg, err := orgService.GetOrgByID(ctx, createdOrg.ID)
	require.NoError(t, err)
	assert.NotNil(t, fetchedOrg)
	assert.Equal(t, createdOrg.ID, fetchedOrg.ID)
	assert.Equal(t, "Integration Test Org", fetchedOrg.Name)

	allOrgs, err := orgService.ListOrgs(ctx)
	require.NoError(t, err)
	assert.Len(t, allOrgs, 1)

	err = orgService.UpdateOrg(ctx, createdOrg.ID, "Updated Integration Test Org", "Updated description", nil)
	require.NoError(t, err)

	updatedOrg, err := orgService.GetOrgByID(ctx, createdOrg.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Integration Test Org", updatedOrg.Name)
	assert.Equal(t, "Updated description", updatedOrg.Description)

	err = orgService.DeleteOrg(ctx, createdOrg.ID)
	require.NoError(t, err)

	deletedOrg, err := orgService.GetOrgByID(ctx, createdOrg.ID)
	assert.NoError(t, err)
	assert.Nil(t, deletedOrg)
}

func TestOrgService_MultipleOrgsIndependent(t *testing.T) {
	db := setupTestDB(t)
	defer func() {
		db.Exec("DELETE FROM orgs")
	}()

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	ctx := context.Background()

	org1, err := orgService.CreateOrg(ctx, "Org 1", "First", nil)
	require.NoError(t, err)

	org2, err := orgService.CreateOrg(ctx, "Org 2", "Second", nil)
	require.NoError(t, err)

	org3, err := orgService.CreateOrg(ctx, "Org 3", "Third", nil)
	require.NoError(t, err)

	assert.NotEqual(t, org1.ID, org2.ID)
	assert.NotEqual(t, org2.ID, org3.ID)

	err = orgService.UpdateOrg(ctx, org2.ID, "Updated Org 2", "Updated second", nil)
	require.NoError(t, err)

	unchanged1, err := orgService.GetOrgByID(ctx, org1.ID)
	require.NoError(t, err)
	assert.Equal(t, "Org 1", unchanged1.Name)

	unchanged3, err := orgService.GetOrgByID(ctx, org3.ID)
	require.NoError(t, err)
	assert.Equal(t, "Org 3", unchanged3.Name)

	updated2, err := orgService.GetOrgByID(ctx, org2.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Org 2", updated2.Name)

	err = orgService.DeleteOrg(ctx, org2.ID)
	require.NoError(t, err)

	allOrgs, err := orgService.ListOrgs(ctx)
	require.NoError(t, err)
	assert.Len(t, allOrgs, 2)

	err = orgService.DeleteOrg(ctx, org1.ID)
	require.NoError(t, err)
	err = orgService.DeleteOrg(ctx, org3.ID)
	require.NoError(t, err)

	allOrgs, err = orgService.ListOrgs(ctx)
	require.NoError(t, err)
	assert.Len(t, allOrgs, 0)
}

func TestOrgService_NewOrgService(t *testing.T) {
	db := setupTestDB(t)

	orgRepo := repository.NewOrgRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)

	orgService := NewOrgService(orgRepo, deptRepo, bondRepo)

	assert.NotNil(t, orgService)
}
