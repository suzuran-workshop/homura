package model

import "time"

// Route defines a single route mapping from a path to a handler URL.
type Route struct {
	Path    string `json:"path"`
	Handler string `json:"handler"`
}

// Application represents an AI-native application deployed on the platform.
// Unlike the old low-code "Application", this is a code-based app that runs
// inside a managed Docker sandbox.
type Application struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	OrgID       int       `gorm:"index;not null" json:"orgId"`
	Name        string    `gorm:"not null" json:"name"`
	Version     string    `json:"version"`
	Runtime     string    `json:"runtime"`     // node:18, python:3.11, go:1.21
	Entrypoint  string    `json:"entrypoint"`  // e.g. "node server.js"
	Port        int       `json:"port"`        // container listening port
	CPUQuota   string    `json:"cpuQuota"`    // "0.5"
	MemoryQuota string   `json:"memoryQuota"` // "512Mi"
	DBConnQuota int      `json:"dbConnQuota"` // 10
	MCPScopes   StringArray `gorm:"type:jsonb" json:"mcpScopes,omitempty"`
	Routes      JSONB       `gorm:"type:jsonb" json:"routes,omitempty"`
	SourceKey   string      `gorm:"type:varchar(500)" json:"sourceKey,omitempty"` // object key of the imported code zip (MinIO)
	OAuthToken  string    `json:"oauthToken,omitempty" gorm:"-"` // not persisted; injected at deploy time
	Status      string    `gorm:"default:created" json:"status"` // created, building, running, stopped, error
	ContainerID string    `json:"containerId,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// TableName overrides the table name.
func (Application) TableName() string {
	return "applications"
}
