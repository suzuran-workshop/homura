package model

import "time"

// UserDepartment represents a user's membership in a department.
// A user can belong to multiple departments within an org.
type UserDepartment struct {
	ID           int       `gorm:"primaryKey" json:"id"`
	OrgID        int       `gorm:"not null;index" json:"orgId"`
	UserID       int       `gorm:"not null;index" json:"userId"`
	DepartmentID int       `gorm:"not null;index" json:"departmentId"`
	IsPrimary    bool      `gorm:"default:false" json:"isPrimary"`
	CreatedAt    time.Time `json:"createdAt"`

	User       *User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Department *Department `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`
}

func (UserDepartment) TableName() string { return "user_departments" }
