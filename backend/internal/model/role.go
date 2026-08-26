package model

import "time"

// Role represents an organization-scoped role ("flowing position").
// This is orthogonal to the system-level provider/tenant distinction.
type Role struct {
	ID          int       `gorm:"primaryKey" json:"id"`
	OrgID       int       `gorm:"not null;uniqueIndex:idx_roles_org_name" json:"orgId"`
	Name        string    `gorm:"not null;uniqueIndex:idx_roles_org_name" json:"name"`
	Description string    `json:"description"`
	Permissions JSONB     `gorm:"type:jsonb" json:"permissions"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (Role) TableName() string { return "roles" }

// UserRole is the many-to-many junction between users and roles within an org.
type UserRole struct {
	ID        int       `gorm:"primaryKey" json:"id"`
	OrgID     int       `gorm:"not null;uniqueIndex:idx_user_roles_unique" json:"orgId"`
	UserID    int       `gorm:"not null;uniqueIndex:idx_user_roles_unique" json:"userId"`
	RoleID    int       `gorm:"not null;uniqueIndex:idx_user_roles_unique" json:"roleId"`
	CreatedAt time.Time `json:"createdAt"`

	Role *Role `gorm:"foreignKey:RoleID" json:"role,omitempty"`
	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (UserRole) TableName() string { return "user_roles" }
