package model

import "time"

type Department struct {
	ID                int       `gorm:"primaryKey" json:"id"`
	OrgID             int       `gorm:"not null;index" json:"orgId"`
	Name              string    `gorm:"not null" json:"name"`
	ParentID          *int      `json:"parentId"` // nil for root department
	Level             int       `gorm:"default:1" json:"level"`
	ManagerUserID     *int      `json:"managerUserId"`
	Description       string    `json:"description"`
	DingtalkDeptID    *int64    `gorm:"column:dingtalk_dept_id;uniqueIndex:idx_departments_dingtalk_dept_id" json:"dingtalkDeptId,omitempty"`
	SortOrder         int       `gorm:"column:sort_order;default:0" json:"sortOrder"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`

	// Relationships
	Manager *User `gorm:"foreignKey:ManagerUserID" json:"manager,omitempty"`
}

func (Department) TableName() string {
	return "departments"
}
