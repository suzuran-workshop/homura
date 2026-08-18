package service

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// DataService handles business logic for app-owned tables.
type DataService struct {
	repo *repository.DataRepository
}

// NewDataService creates a new DataService.
func NewDataService(repo *repository.DataRepository) *DataService {
	return &DataService{repo: repo}
}

// CreateTable creates a new table for an app.
// Table name is prefixed with app_id for isolation: {app_id}_{table_name}.
func (s *DataService) CreateTable(ctx context.Context, appID string, orgID int, tableName string, columns []model.DataColumn) error {
	if err := validateTableName(tableName); err != nil {
		return err
	}

	for _, col := range columns {
		if err := validateColumnType(col.Type); err != nil {
			return err
		}
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(appID), tableName)

	if err := s.repo.ExecCreateTable(physicalTableName, columns); err != nil {
		return fmt.Errorf("failed to create physical table: %w", err)
	}

	// 将 columns 数组包装成 JSONB（JSONB 是 map[string]interface{}）
	columnsJSON, err := json.Marshal(columns)
	if err != nil {
		return fmt.Errorf("failed to marshal columns: %w", err)
	}

	metadata := &model.DataTable{
		AppID:       appID,
		OrgID:       orgID,
		LogicalName: tableName,
		Columns:     model.JSONB{"columns": string(columnsJSON)},
	}

	if err := s.repo.CreateTableMetadata(metadata); err != nil {
		s.repo.ExecDropTable(physicalTableName)
		return fmt.Errorf("failed to save table metadata: %w", err)
	}

	return nil
}

// DropTable drops an app-owned table.
func (s *DataService) DropTable(ctx context.Context, appID string, orgID int, tableName string) error {
	metadata, err := s.repo.GetTableMetadata(appID, tableName, orgID)
	if err != nil {
		return fmt.Errorf("table not found or access denied: %w", err)
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(metadata.AppID), tableName)

	if err := s.repo.ExecDropTable(physicalTableName); err != nil {
		return fmt.Errorf("failed to drop physical table: %w", err)
	}

	if err := s.repo.DeleteTableMetadata(appID, tableName, orgID); err != nil {
		return fmt.Errorf("failed to delete table metadata: %w", err)
	}

	return nil
}

// ListTables lists all tables owned by an app.
func (s *DataService) ListTables(ctx context.Context, appID string, orgID int) ([]model.DataTable, error) {
	return s.repo.ListTablesByApp(appID, orgID)
}

// DescribeTable gets column definitions for a table.
func (s *DataService) DescribeTable(ctx context.Context, appID string, orgID int, tableName string) (*model.DataTable, error) {
	return s.repo.GetTableMetadata(appID, tableName, orgID)
}

// Insert inserts a row into an app-owned table.
func (s *DataService) Insert(ctx context.Context, appID string, orgID int, tableName string, data map[string]interface{}) (int, error) {
	metadata, err := s.repo.GetTableMetadata(appID, tableName, orgID)
	if err != nil {
		return 0, fmt.Errorf("table not found or access denied: %w", err)
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(metadata.AppID), tableName)
	return s.repo.ExecInsert(physicalTableName, orgID, data)
}

// BatchInsert inserts multiple rows in one call.
func (s *DataService) BatchInsert(ctx context.Context, appID string, orgID int, tableName string, rows []map[string]interface{}) ([]int, error) {
	metadata, err := s.repo.GetTableMetadata(appID, tableName, orgID)
	if err != nil {
		return nil, fmt.Errorf("table not found or access denied: %w", err)
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(metadata.AppID), tableName)
	return s.repo.ExecBatchInsert(physicalTableName, orgID, rows)
}

// Query queries rows from an app-owned table.
func (s *DataService) Query(ctx context.Context, appID string, orgID int, tableName string, where map[string]interface{}, orderBy string, limit, offset int) ([]map[string]interface{}, error) {
	metadata, err := s.repo.GetTableMetadata(appID, tableName, orgID)
	if err != nil {
		return nil, fmt.Errorf("table not found or access denied: %w", err)
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(metadata.AppID), tableName)
	return s.repo.ExecQuery(physicalTableName, orgID, where, orderBy, limit, offset)
}

// Update updates rows in an app-owned table.
func (s *DataService) Update(ctx context.Context, appID string, orgID int, tableName string, where, data map[string]interface{}) (int64, error) {
	metadata, err := s.repo.GetTableMetadata(appID, tableName, orgID)
	if err != nil {
		return 0, fmt.Errorf("table not found or access denied: %w", err)
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(metadata.AppID), tableName)
	return s.repo.ExecUpdate(physicalTableName, orgID, where, data)
}

// Delete deletes rows from an app-owned table.
func (s *DataService) Delete(ctx context.Context, appID string, orgID int, tableName string, where map[string]interface{}) (int64, error) {
	metadata, err := s.repo.GetTableMetadata(appID, tableName, orgID)
	if err != nil {
		return 0, fmt.Errorf("table not found or access denied: %w", err)
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(metadata.AppID), tableName)
	return s.repo.ExecDelete(physicalTableName, orgID, where)
}

// Count counts rows matching a filter.
func (s *DataService) Count(ctx context.Context, appID string, orgID int, tableName string, where map[string]interface{}) (int64, error) {
	metadata, err := s.repo.GetTableMetadata(appID, tableName, orgID)
	if err != nil {
		return 0, fmt.Errorf("table not found or access denied: %w", err)
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(metadata.AppID), tableName)
	return s.repo.ExecCount(physicalTableName, orgID, where)
}

// AddColumn adds a column to an existing table.
func (s *DataService) AddColumn(ctx context.Context, appID string, orgID int, tableName string, col model.DataColumn) error {
	metadata, err := s.repo.GetTableMetadata(appID, tableName, orgID)
	if err != nil {
		return fmt.Errorf("table not found or access denied: %w", err)
	}

	if err := validateColumnType(col.Type); err != nil {
		return err
	}

	physicalTableName := fmt.Sprintf("%s_%s", sanitizeAppID(metadata.AppID), tableName)
	return s.repo.ExecAddColumn(physicalTableName, col)
}

// ExecRaw executes a parameterized SQL statement.
func (s *DataService) ExecRaw(ctx context.Context, appID string, orgID int, sql string, params []interface{}) ([]map[string]interface{}, error) {
	if err := validateRawSQL(sql, appID); err != nil {
		return nil, err
	}

	return s.repo.ExecRaw(sql, params)
}

// Validation helpers

func validateTableName(name string) error {
	if name == "" {
		return fmt.Errorf("table name cannot be empty")
	}
	if len(name) > 63 {
		return fmt.Errorf("table name too long (max 63 characters)")
	}
	matched, _ := regexp.MatchString(`^[a-z0-9_]+$`, name)
	if !matched {
		return fmt.Errorf("table name must only contain lowercase letters, numbers, and underscores")
	}
	return nil
}

func validateColumnType(colType string) error {
	allowedTypes := map[string]bool{
		"text":      true,
		"string":    true,
		"integer":   true,
		"int":       true,
		"boolean":   true,
		"bool":      true,
		"timestamp": true,
		"datetime":  true,
		"jsonb":     true,
		"json":      true,
		"numeric":   true,
		"decimal":   true,
		"float":     true,
		"date":      true,
	}

	if !allowedTypes[strings.ToLower(colType)] {
		return fmt.Errorf("unsupported column type: %s", colType)
	}
	return nil
}

func sanitizeAppID(appID string) string {
	reg := regexp.MustCompile(`[^a-zA-Z0-9]+`)
	return reg.ReplaceAllString(appID, "_")
}

func validateRawSQL(sql string, appID string) error {
	lowerSQL := strings.ToLower(sql)
	appPrefix := sanitizeAppID(appID)

	keywords := []string{"from ", "into ", "update ", "join "}
	for _, keyword := range keywords {
		if idx := strings.Index(lowerSQL, keyword); idx >= 0 {
			rest := lowerSQL[idx+len(keyword):]
			rest = strings.TrimSpace(rest)
			tableName := strings.Split(rest, " ")[0]
			tableName = strings.Trim(tableName, `"'`)

			if !strings.HasPrefix(tableName, appPrefix) {
				return fmt.Errorf("SQL references table '%s' which does not belong to this app", tableName)
			}
		}
	}

	return nil
}
