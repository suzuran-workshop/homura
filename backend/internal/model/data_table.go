package model

import "time"

// DataTable tracks metadata about app-owned tables.
// Each app's tables are stored in the same PostgreSQL database with a naming convention: {app_id}_{table_name}.
// Every row in app tables implicitly carries an org_id column for tenant isolation.
type DataTable struct {
	ID          int       `gorm:"primaryKey" json:"id"`
	AppID       string    `gorm:"not null;index" json:"appId"`          // UUID of the application
	OrgID       int       `gorm:"not null;index" json:"orgId"`          // Tenant isolation
	LogicalName string    `gorm:"not null;column:table_name" json:"tableName"` // Logical name (without app prefix)
	Columns     JSONB     `gorm:"type:jsonb" json:"columns"`            // [{name, type, nullable, primaryKey, defaultValue}]
	CreatedAt   time.Time `json:"createdAt"`
}

func (DataTable) TableName() string {
	return "data_tables"
}

// DataColumn describes a single column in an app-owned table.
type DataColumn struct {
	Name         string      `json:"name"`
	Type         string      `json:"type"` // text, integer, boolean, timestamp, jsonb, numeric, date
	Nullable     bool        `json:"nullable"`
	PrimaryKey   bool        `json:"primaryKey"`
	DefaultValue interface{} `json:"defaultValue,omitempty"`
}
