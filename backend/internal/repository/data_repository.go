package repository

import (
	"encoding/json"
	"fmt"
	"strings"

	"gorm.io/gorm"

	"github.com/xrl/suzuran-cloud/internal/model"
)

// DataRepository handles metadata CRUD and raw SQL execution for app-owned tables.
type DataRepository struct {
	db *gorm.DB
}

// NewDataRepository creates a new DataRepository.
func NewDataRepository(db *gorm.DB) *DataRepository {
	return &DataRepository{db: db}
}

// CreateTableMetadata saves table metadata to the data_tables tracking table.
func (r *DataRepository) CreateTableMetadata(table *model.DataTable) error {
	return r.db.Create(table).Error
}

// ListTablesByApp returns all tables owned by a specific app.
func (r *DataRepository) ListTablesByApp(appID string, orgID int) ([]model.DataTable, error) {
	var tables []model.DataTable
	err := r.db.Where("app_id = ? AND org_id = ?", appID, orgID).Find(&tables).Error
	return tables, err
}

// GetTableMetadata retrieves metadata for a specific table.
func (r *DataRepository) GetTableMetadata(appID, tableName string, orgID int) (*model.DataTable, error) {
	var table model.DataTable
	err := r.db.Where("app_id = ? AND table_name = ? AND org_id = ?", appID, tableName, orgID).First(&table).Error
	if err != nil {
		return nil, err
	}
	return &table, nil
}

// DeleteTableMetadata removes table metadata.
func (r *DataRepository) DeleteTableMetadata(appID, tableName string, orgID int) error {
	return r.db.Where("app_id = ? AND table_name = ? AND org_id = ?", appID, tableName, orgID).Delete(&model.DataTable{}).Error
}
func (r *DataRepository) ExecCreateTable(physicalTableName string, columns []model.DataColumn) error {
	var colDefs []string
	colDefs = append(colDefs, `id SERIAL PRIMARY KEY`)
	colDefs = append(colDefs, `org_id INTEGER NOT NULL`)

	for _, col := range columns {
		if col.Name == "id" || col.Name == "org_id" || col.Name == "created_at" || col.Name == "updated_at" {
			continue
		}
		colType := MapColumnType(col.Type)
		if colType == "" {
			return fmt.Errorf("unsupported column type: %s", col.Type)
		}
		def := fmt.Sprintf(`%s %s`, pgQuote(col.Name), colType)
		if !col.Nullable {
			def += " NOT NULL"
		}
		if col.DefaultValue != nil {
			def += fmt.Sprintf(" DEFAULT %v", col.DefaultValue)
		}
		colDefs = append(colDefs, def)
	}

	colDefs = append(colDefs, `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
	colDefs = append(colDefs, `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)

	sql := fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (%s)", pgQuote(physicalTableName), strings.Join(colDefs, ", "))
	return r.db.Exec(sql).Error
}

// ExecDropTable drops a physical table.
func (r *DataRepository) ExecDropTable(physicalTableName string) error {
	sql := fmt.Sprintf("DROP TABLE IF EXISTS %s", pgQuote(physicalTableName))
	return r.db.Exec(sql).Error
}

// ExecInsert inserts a row into an app-owned table. Returns the new row's id.
func (r *DataRepository) ExecInsert(physicalTableName string, orgID int, data map[string]interface{}) (int, error) {
	var cols []string
	var placeholders []string
	var values []interface{}

	cols = append(cols, "org_id")
	placeholders = append(placeholders, fmt.Sprintf("$%d", len(values)+1))
	values = append(values, orgID)

	for k, v := range data {
		if k == "id" || k == "org_id" || k == "created_at" || k == "updated_at" {
			continue
		}
		cols = append(cols, pgQuote(k))
		placeholders = append(placeholders, fmt.Sprintf("$%d", len(values)+1))
		// Marshal maps/slices to JSON for JSONB columns
		values = append(values, marshalValue(v))
	}

	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING id",
		pgQuote(physicalTableName),
		strings.Join(cols, ", "),
		strings.Join(placeholders, ", "))

	var id int
	err := r.db.Raw(sql, values...).Scan(&id).Error
	return id, err
}

// ExecBatchInsert inserts multiple rows in one call.
func (r *DataRepository) ExecBatchInsert(physicalTableName string, orgID int, rows []map[string]interface{}) ([]int, error) {
	var ids []int
	for _, row := range rows {
		id, err := r.ExecInsert(physicalTableName, orgID, row)
		if err != nil {
			return ids, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// ExecQuery queries rows from an app-owned table with filters.
func (r *DataRepository) ExecQuery(physicalTableName string, orgID int, where map[string]interface{}, orderBy string, limit, offset int) ([]map[string]interface{}, error) {
	var conditions []string
	var values []interface{}

	conditions = append(conditions, "org_id = $1")
	values = append(values, orgID)

	for k, v := range where {
		conditions = append(conditions, fmt.Sprintf("%s = $%d", pgQuote(k), len(values)+1))
		values = append(values, marshalValue(v))
	}

	sql := fmt.Sprintf("SELECT * FROM %s WHERE %s", pgQuote(physicalTableName), strings.Join(conditions, " AND "))

	if orderBy != "" {
		sql += fmt.Sprintf(" ORDER BY %s", pgQuote(orderBy))
	}
	if limit > 0 {
		sql += fmt.Sprintf(" LIMIT %d", limit)
	}
	if offset > 0 {
		sql += fmt.Sprintf(" OFFSET %d", offset)
	}

	return r.queryRows(sql, values)
}

// ExecUpdate updates rows in an app-owned table.
func (r *DataRepository) ExecUpdate(physicalTableName string, orgID int, where, data map[string]interface{}) (int64, error) {
	var setClauses []string
	var conditions []string
	var values []interface{}

	for k, v := range data {
		if k == "id" || k == "org_id" {
			continue
		}
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", pgQuote(k), len(values)+1))
		values = append(values, marshalValue(v))
	}

	setClauses = append(setClauses, fmt.Sprintf("updated_at = CURRENT_TIMESTAMP"))

	conditions = append(conditions, fmt.Sprintf("org_id = $%d", len(values)+1))
	values = append(values, orgID)

	for k, v := range where {
		conditions = append(conditions, fmt.Sprintf("%s = $%d", pgQuote(k), len(values)+1))
		values = append(values, marshalValue(v))
	}

	sql := fmt.Sprintf("UPDATE %s SET %s WHERE %s",
		pgQuote(physicalTableName),
		strings.Join(setClauses, ", "),
		strings.Join(conditions, " AND "))

	result := r.db.Exec(sql, values...)
	return result.RowsAffected, result.Error
}

// ExecDelete deletes rows from an app-owned table.
func (r *DataRepository) ExecDelete(physicalTableName string, orgID int, where map[string]interface{}) (int64, error) {
	var conditions []string
	var values []interface{}

	conditions = append(conditions, fmt.Sprintf("org_id = $%d", len(values)+1))
	values = append(values, orgID)

	for k, v := range where {
		conditions = append(conditions, fmt.Sprintf("%s = $%d", pgQuote(k), len(values)+1))
		values = append(values, marshalValue(v))
	}

	sql := fmt.Sprintf("DELETE FROM %s WHERE %s", pgQuote(physicalTableName), strings.Join(conditions, " AND "))
	result := r.db.Exec(sql, values...)
	return result.RowsAffected, result.Error
}

// ExecCount counts rows matching a filter.
func (r *DataRepository) ExecCount(physicalTableName string, orgID int, where map[string]interface{}) (int64, error) {
	var conditions []string
	var values []interface{}

	conditions = append(conditions, fmt.Sprintf("org_id = $%d", len(values)+1))
	values = append(values, orgID)

	for k, v := range where {
		conditions = append(conditions, fmt.Sprintf("%s = $%d", pgQuote(k), len(values)+1))
		values = append(values, marshalValue(v))
	}

	sql := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s", pgQuote(physicalTableName), strings.Join(conditions, " AND "))
	var count int64
	err := r.db.Raw(sql, values...).Scan(&count).Error
	return count, err
}

// ExecAddColumn adds a column to an existing table.
func (r *DataRepository) ExecAddColumn(physicalTableName string, col model.DataColumn) error {
	colType := MapColumnType(col.Type)
	if colType == "" {
		return fmt.Errorf("unsupported column type: %s", col.Type)
	}
	sql := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s",
		pgQuote(physicalTableName), pgQuote(col.Name), colType)
	if !col.Nullable {
		sql += " NOT NULL"
	}
	if col.DefaultValue != nil {
		sql += fmt.Sprintf(" DEFAULT %v", col.DefaultValue)
	}
	return r.db.Exec(sql).Error
}

// ExecRaw executes a parameterized SQL statement.
func (r *DataRepository) ExecRaw(sql string, params []interface{}) ([]map[string]interface{}, error) {
	return r.queryRows(sql, params)
}

// queryRows is a shared helper for executing SELECT queries and scanning results.
func (r *DataRepository) queryRows(sql string, values []interface{}) ([]map[string]interface{}, error) {
	rows, err := r.db.Raw(sql, values...).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var results []map[string]interface{}
	for rows.Next() {
		row := make(map[string]interface{})
		vals := make([]interface{}, len(columns))
		ptrs := make([]interface{}, len(columns))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		for i, col := range columns {
			row[col] = normalizeValue(vals[i])
		}
		results = append(results, row)
	}
	return results, nil
}

// --- helpers ---

// pgQuote quotes a PostgreSQL identifier with double quotes.
func pgQuote(name string) string {
	// Escape any embedded double quotes
	escaped := strings.ReplaceAll(name, `"`, `""`)
	return `"` + escaped + `"`
}

// MapColumnType maps logical column type names to PostgreSQL types.
func MapColumnType(colType string) string {
	switch strings.ToLower(colType) {
	case "text", "string":
		return "TEXT"
	case "integer", "int":
		return "INTEGER"
	case "boolean", "bool":
		return "BOOLEAN"
	case "timestamp", "datetime":
		return "TIMESTAMP"
	case "jsonb", "json":
		return "JSONB"
	case "numeric", "decimal", "float":
		return "NUMERIC"
	case "date":
		return "DATE"
	default:
		return ""
	}
}

// marshalValue converts maps/slices to JSON strings for JSONB storage.
func marshalValue(v interface{}) interface{} {
	switch v.(type) {
	case map[string]interface{}, []interface{}:
		b, err := json.Marshal(v)
		if err != nil {
			return v
		}
		return string(b)
	default:
		return v
	}
}

// normalizeValue converts database driver values to Go-friendly types.
func normalizeValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	// Convert []byte to string for text columns
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return v
}
