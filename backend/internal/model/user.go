package model

import "time"

// User represents a user account with OAuth (WebAuthn / DingTalk) integration.
type User struct {
	ID           int       `gorm:"primaryKey" json:"id"`
	Phone        string    `gorm:"index" json:"phone,omitempty"`
	Email        string    `gorm:"index" json:"email,omitempty"`
	EmailVerified bool     `gorm:"default:false" json:"emailVerified,omitempty"`
	Name         string    `json:"name"`
	AvatarURL    string    `gorm:"column:avatar_url" json:"avatarUrl,omitempty"`
	Position     string    `json:"position,omitempty"`

	// DingTalk integration (pointers so unset values are NULL, avoiding unique-constraint collisions)
	DingtalkUserID  *string `gorm:"column:dingtalk_userid;uniqueIndex" json:"dingtalkUserId,omitempty"`
	DingtalkUnionID *string `gorm:"column:dingtalk_unionid;index" json:"dingtalkUnionId,omitempty"`
	DingtalkOpenID  *string `gorm:"column:dingtalk_openid" json:"dingtalkOpenId,omitempty"`

	IsActive      bool      `gorm:"column:is_active;default:true" json:"isActive"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// TableName overrides the table name.
func (User) TableName() string {
	return "users"
}
