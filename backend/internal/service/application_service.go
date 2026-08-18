package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
	"github.com/xrl/suzuran-cloud/internal/runtime"
	"github.com/xrl/suzuran-cloud/internal/storage"
)

// CreateAppRequest is the request body for creating an application.
type CreateAppRequest struct {
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	Runtime     string   `json:"runtime"`
	Entrypoint  string   `json:"entrypoint"`
	Port        int      `json:"port"`
	CPUQuota   string   `json:"cpuQuota"`
	MemoryQuota string   `json:"memoryQuota"`
	DBConnQuota int      `json:"dbConnQuota"`
	MCPScopes   []string `json:"mcpScopes"`
}

// UpdateAppRequest is the request body for updating an application.
type UpdateAppRequest struct {
	Name        *string  `json:"name"`
	Version     *string  `json:"version"`
	Runtime     *string  `json:"runtime"`
	Entrypoint  *string  `json:"entrypoint"`
	Port        *int     `json:"port"`
	CPUQuota   *string  `json:"cpuQuota"`
	MemoryQuota *string  `json:"memoryQuota"`
	DBConnQuota *int     `json:"dbConnQuota"`
	MCPScopes   []string `json:"mcpScopes"`
}

// ApplicationService handles application management and lifecycle.
type ApplicationService struct {
	appRepo    *repository.ApplicationRepository
	deployRepo *repository.ApplicationDeploymentRepository
	runtime    *runtime.RuntimeManager
	storage    storage.FileStorage
}

// NewApplicationService creates a new ApplicationService.
func NewApplicationService(
	appRepo *repository.ApplicationRepository,
	deployRepo *repository.ApplicationDeploymentRepository,
	rt *runtime.RuntimeManager,
	storage storage.FileStorage,
) *ApplicationService {
	return &ApplicationService{appRepo: appRepo, deployRepo: deployRepo, runtime: rt, storage: storage}
}

// CreateApp creates a new application.
func (s *ApplicationService) CreateApp(ctx context.Context, orgID int, req CreateAppRequest) (*model.Application, error) {
	if req.Name == "" {
		return nil, errors.New("application name is required")
	}
	if req.Runtime == "" {
		return nil, errors.New("runtime is required")
	}
	if req.Port < 1024 || req.Port > 65535 {
		return nil, errors.New("port must be between 1024 and 65535")
	}

	app := &model.Application{
		ID:          uuid.New().String(),
		OrgID:       orgID,
		Name:        req.Name,
		Version:     req.Version,
		Runtime:     req.Runtime,
		Entrypoint:  req.Entrypoint,
		Port:        req.Port,
		CPUQuota:    req.CPUQuota,
		MemoryQuota: req.MemoryQuota,
		DBConnQuota: req.DBConnQuota,
		MCPScopes:   model.StringArray(req.MCPScopes),
		Status:      "created",
	}

	if err := s.appRepo.Create(ctx, app); err != nil {
		return nil, fmt.Errorf("failed to create application: %w", err)
	}
	return app, nil
}

// GetApp retrieves an application by ID.
func (s *ApplicationService) GetApp(ctx context.Context, id string) (*model.Application, error) {
	app, err := s.appRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get application: %w", err)
	}
	if app == nil {
		return nil, errors.New("application not found")
	}
	return app, nil
}

// ListApps lists all applications for an organization.
func (s *ApplicationService) ListApps(ctx context.Context, orgID int) ([]*model.Application, error) {
	return s.appRepo.ListByOrgID(ctx, orgID)
}

// UpdateApp updates an application.
func (s *ApplicationService) UpdateApp(ctx context.Context, id string, req UpdateAppRequest) (*model.Application, error) {
	app, err := s.appRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get application: %w", err)
	}
	if app == nil {
		return nil, errors.New("application not found")
	}

	if req.Name != nil {
		app.Name = *req.Name
	}
	if req.Version != nil {
		app.Version = *req.Version
	}
	if req.Runtime != nil {
		app.Runtime = *req.Runtime
	}
	if req.Entrypoint != nil {
		app.Entrypoint = *req.Entrypoint
	}
	if req.Port != nil {
		app.Port = *req.Port
	}
	if req.CPUQuota != nil {
		app.CPUQuota = *req.CPUQuota
	}
	if req.MemoryQuota != nil {
		app.MemoryQuota = *req.MemoryQuota
	}
	if req.DBConnQuota != nil {
		app.DBConnQuota = *req.DBConnQuota
	}
	if req.MCPScopes != nil {
		app.MCPScopes = model.StringArray(req.MCPScopes)
	}

	if err := s.appRepo.Update(ctx, app); err != nil {
		return nil, fmt.Errorf("failed to update application: %w", err)
	}
	return app, nil
}

// DeleteApp deletes an application and its container.
func (s *ApplicationService) DeleteApp(ctx context.Context, id string) error {
	app, err := s.appRepo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get application: %w", err)
	}
	if app == nil {
		return errors.New("application not found")
	}

	// Stop and remove container if running
	if app.ContainerID != "" && s.runtime != nil {
		_ = s.runtime.DeleteApp(ctx, id)
	}

	return s.appRepo.Delete(ctx, id)
}

// DeployApp deploys an application (creates and starts container).
// oauthToken is injected into the container as the OAUTH_TOKEN env var
// so the app can authenticate to the MCP server.
func (s *ApplicationService) DeployApp(ctx context.Context, id string, oauthToken string) (*model.ApplicationDeployment, error) {
	app, err := s.appRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get application: %w", err)
	}
	if app == nil {
		return nil, errors.New("application not found")
	}
	if s.runtime == nil {
		return nil, errors.New("runtime manager not available")
	}
	app.OAuthToken = oauthToken
	return s.runtime.DeployApp(ctx, app)
}

// StartApp starts a stopped application.
func (s *ApplicationService) StartApp(ctx context.Context, id string) error {
	if s.runtime == nil {
		return errors.New("runtime manager not available")
	}
	return s.runtime.StartApp(ctx, id)
}

// StopApp stops a running application.
func (s *ApplicationService) StopApp(ctx context.Context, id string) error {
	if s.runtime == nil {
		return errors.New("runtime manager not available")
	}
	return s.runtime.StopApp(ctx, id)
}

// RestartApp restarts an application.
func (s *ApplicationService) RestartApp(ctx context.Context, id string) error {
	if s.runtime == nil {
		return errors.New("runtime manager not available")
	}
	return s.runtime.RestartApp(ctx, id)
}

// GetAppStatus returns the current status of an application.
func (s *ApplicationService) GetAppStatus(ctx context.Context, id string) (string, error) {
	if s.runtime == nil {
		return "", errors.New("runtime manager not available")
	}
	return s.runtime.GetAppStatus(ctx, id)
}

// GetAppLogs returns container logs.
func (s *ApplicationService) GetAppLogs(ctx context.Context, id string, tail int) (string, error) {
	if s.runtime == nil {
		return "", errors.New("runtime manager not available")
	}
	return s.runtime.GetAppLogs(ctx, id, tail)
}

// GetDeployments returns deployment history for an application.
func (s *ApplicationService) GetDeployments(ctx context.Context, id string) ([]*model.ApplicationDeployment, error) {
	return s.deployRepo.ListByApplicationID(ctx, id)
}
