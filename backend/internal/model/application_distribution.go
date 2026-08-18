package model

import "time"

// ApplicationDistribution represents an app being distributed to an org.
// An app can be distributed to multiple orgs (multi-tenant sharing); row-level
// data isolation is enforced by org_id on every data table.
type ApplicationDistribution struct {
	ID        int       `gorm:"primaryKey" json:"id"`
	AppID     string    `gorm:"not null" json:"appId"`
	OrgID     int       `gorm:"not null" json:"orgId"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// TableName overrides the table name.
func (ApplicationDistribution) TableName() string {
	return "application_distributions"
}

// ApplicationAdmin grants a user full read/write access to an app's data
// within one org. An org can have multiple admins for the same app.
// The provider (org 1 members) is implicitly an admin of every app.
type ApplicationAdmin struct {
	ID        int       `gorm:"primaryKey" json:"id"`
	AppID     string    `gorm:"not null" json:"appId"`
	OrgID     int       `gorm:"not null" json:"orgId"`
	UserID    int       `gorm:"not null" json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// TableName overrides the table name.
func (ApplicationAdmin) TableName() string {
	return "application_admins"
}
