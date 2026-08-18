// Package runtime manages application container lifecycle via the Docker API.
package runtime

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	dockerimage "github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
	"github.com/xrl/suzuran-cloud/internal/storage"
)

// RuntimeManager manages the lifecycle of application containers via the Docker API.
type RuntimeManager struct {
	docker      DockerClient
	appRepo     *repository.ApplicationRepository
	deployRepo  *repository.ApplicationDeploymentRepository
	platformNet string // "suzuran-net"
	storage     storage.FileStorage
}

// NewRuntimeManager creates a new RuntimeManager.
func NewRuntimeManager(
	dockerClient DockerClient,
	appRepo *repository.ApplicationRepository,
	deployRepo *repository.ApplicationDeploymentRepository,
	storage storage.FileStorage,
) *RuntimeManager {
	return &RuntimeManager{
		docker:      dockerClient,
		appRepo:     appRepo,
		deployRepo:  deployRepo,
		platformNet: "suzuran-net",
		storage:     storage,
	}
}

// DeployApp creates and starts a container for the given application.
func (m *RuntimeManager) DeployApp(ctx context.Context, app *model.Application) (*model.ApplicationDeployment, error) {
	if m.docker == nil {
		return nil, fmt.Errorf("docker client not available")
	}

	deployment := &model.ApplicationDeployment{
		ID:            generateID(),
		ApplicationID: app.ID,
		Version:       app.Version,
		ImageTag:      app.Runtime,
		Status:        "building",
	}
	if err := m.deployRepo.Create(ctx, deployment); err != nil {
		return nil, fmt.Errorf("failed to create deployment record: %w", err)
	}

	// 1. Pull the runtime image
	if err := m.pullImage(ctx, app.Runtime); err != nil {
		_ = m.deployRepo.UpdateStatus(ctx, deployment.ID, "failed")
		return deployment, fmt.Errorf("failed to pull image %s: %w", app.Runtime, err)
	}

	// 2. Prepare the code package (download + extract the imported zip)
	codeDir, err := m.prepareCodePackage(ctx, app)
	if err != nil {
		_ = m.deployRepo.UpdateStatus(ctx, deployment.ID, "failed")
		return deployment, fmt.Errorf("failed to prepare code package: %w", err)
	}

	// 3. Create sandbox (network)
	sandbox, err := m.CreateSandbox(ctx, app)
	if err != nil {
		_ = m.deployRepo.UpdateStatus(ctx, deployment.ID, "failed")
		return deployment, fmt.Errorf("failed to create sandbox: %w", err)
	}

	// 4. Create and start the container
	containerID, err := m.createAndStartContainer(ctx, app, sandbox, codeDir)
	if err != nil {
		_ = m.DestroySandbox(ctx, sandbox)
		_ = m.deployRepo.UpdateStatus(ctx, deployment.ID, "failed")
		return deployment, fmt.Errorf("failed to create container: %w", err)
	}

	// 5. Update records
	_ = m.deployRepo.UpdateContainerID(ctx, deployment.ID, containerID)
	_ = m.deployRepo.UpdateStatus(ctx, deployment.ID, "running")
	_ = m.appRepo.UpdateStatus(ctx, app.ID, "running", containerID)

	deployment.ContainerID = containerID
	deployment.Status = "running"

	log.Printf("App %s deployed as container %s", app.ID, containerID)
	return deployment, nil
}

// StartApp starts an existing stopped container.
func (m *RuntimeManager) StartApp(ctx context.Context, appID string) error {
	if m.docker == nil {
		return fmt.Errorf("docker client not available")
	}
	app, err := m.appRepo.GetByID(ctx, appID)
	if err != nil || app == nil {
		return fmt.Errorf("application not found: %s", appID)
	}
	if app.ContainerID == "" {
		return fmt.Errorf("application has no container, deploy first")
	}
	if err := m.docker.ContainerStart(ctx, app.ContainerID, container.StartOptions{}); err != nil {
		return fmt.Errorf("failed to start container: %w", err)
	}
	return m.appRepo.UpdateStatus(ctx, appID, "running", app.ContainerID)
}

// StopApp stops a running container.
func (m *RuntimeManager) StopApp(ctx context.Context, appID string) error {
	if m.docker == nil {
		return fmt.Errorf("docker client not available")
	}
	app, err := m.appRepo.GetByID(ctx, appID)
	if err != nil || app == nil {
		return fmt.Errorf("application not found: %s", appID)
	}
	if app.ContainerID == "" {
		return fmt.Errorf("application has no container")
	}
	timeout := 10
	if err := m.docker.ContainerStop(ctx, app.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
		return fmt.Errorf("failed to stop container: %w", err)
	}
	return m.appRepo.UpdateStatus(ctx, appID, "stopped", app.ContainerID)
}

// RestartApp restarts a container.
func (m *RuntimeManager) RestartApp(ctx context.Context, appID string) error {
	if m.docker == nil {
		return fmt.Errorf("docker client not available")
	}
	app, err := m.appRepo.GetByID(ctx, appID)
	if err != nil || app == nil {
		return fmt.Errorf("application not found: %s", appID)
	}
	if app.ContainerID == "" {
		return fmt.Errorf("application has no container")
	}
	timeout := 10
	if err := m.docker.ContainerRestart(ctx, app.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
		return fmt.Errorf("failed to restart container: %w", err)
	}
	return m.appRepo.UpdateStatus(ctx, appID, "running", app.ContainerID)
}

// DeleteApp removes a container and its sandbox.
func (m *RuntimeManager) DeleteApp(ctx context.Context, appID string) error {
	if m.docker == nil {
		return fmt.Errorf("docker client not available")
	}
	app, err := m.appRepo.GetByID(ctx, appID)
	if err != nil || app == nil {
		return fmt.Errorf("application not found: %s", appID)
	}
	if app.ContainerID != "" {
		_ = m.docker.ContainerRemove(ctx, app.ContainerID, container.RemoveOptions{Force: true})
	}
	sandbox := &Sandbox{ContainerID: app.ContainerID, NetworkID: fmt.Sprintf("app-%s-net", appID)}
	_ = m.DestroySandbox(ctx, sandbox)
	return m.appRepo.UpdateStatus(ctx, appID, "deleted", "")
}

// GetAppStatus returns the current container status.
func (m *RuntimeManager) GetAppStatus(ctx context.Context, appID string) (string, error) {
	if m.docker == nil {
		return "", fmt.Errorf("docker client not available")
	}
	app, err := m.appRepo.GetByID(ctx, appID)
	if err != nil || app == nil {
		return "", fmt.Errorf("application not found: %s", appID)
	}
	if app.ContainerID == "" {
		return app.Status, nil
	}
	containerJSON, err := m.docker.ContainerInspect(ctx, app.ContainerID)
	if err != nil {
		return app.Status, nil
	}
	return string(containerJSON.State.Status), nil
}

// GetAppLogs returns container logs.
func (m *RuntimeManager) GetAppLogs(ctx context.Context, appID string, tail int) (string, error) {
	if m.docker == nil {
		return "", fmt.Errorf("docker client not available")
	}
	app, err := m.appRepo.GetByID(ctx, appID)
	if err != nil || app == nil {
		return "", fmt.Errorf("application not found: %s", appID)
	}
	if app.ContainerID == "" {
		return "", fmt.Errorf("application has no container")
	}
	if tail <= 0 {
		tail = 100
	}
	reader, err := m.docker.ContainerLogs(ctx, app.ContainerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       fmt.Sprintf("%d", tail),
	})
	if err != nil {
		return "", fmt.Errorf("failed to get logs: %w", err)
	}
	defer reader.Close()
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 4096)
	for {
		n, err := reader.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			break
		}
	}
	return string(buf), nil
}

// pullImage pulls a Docker image.
func (m *RuntimeManager) pullImage(ctx context.Context, image string) error {
	reader, err := m.docker.ImagePull(ctx, image, dockerimage.PullOptions{})
	if err != nil {
		return err
	}
	defer reader.Close()
	buf := make([]byte, 4096)
	for {
		if _, err := reader.Read(buf); err != nil {
			break
		}
	}
	return nil
}

// prepareCodePackage downloads the app's imported zip from object storage
// and extracts it to a local cache directory (data/app-packages/<appID>).
// Returns the extracted directory.
func (m *RuntimeManager) prepareCodePackage(ctx context.Context, app *model.Application) (string, error) {
	if app.SourceKey == "" {
		return "", fmt.Errorf("application has no code package; import it first")
	}
	if m.storage == nil {
		return "", fmt.Errorf("object storage unavailable")
	}

	reader, _, err := m.storage.DownloadFile(ctx, app.SourceKey)
	if err != nil {
		return "", err
	}
	defer reader.Close()

	zipData, err := io.ReadAll(reader)
	if err != nil {
		return "", fmt.Errorf("failed to read package: %w", err)
	}

	cacheDir := filepath.Join("data", "app-packages", app.ID)
	if err := os.RemoveAll(cacheDir); err != nil {
		return "", fmt.Errorf("failed to clean cache dir: %w", err)
	}
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create cache dir: %w", err)
	}

	if err := extractZip(zipData, cacheDir); err != nil {
		return "", err
	}
	return cacheDir, nil
}

// extractZip extracts a zip into dir with path-traversal protection.
func extractZip(zipData []byte, dir string) error {
	zr, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		return fmt.Errorf("invalid zip package: %w", err)
	}

	for _, f := range zr.File {
		clean := path.Clean(strings.ReplaceAll(f.Name, "\\", "/"))
		if strings.HasPrefix(clean, "../") || strings.HasPrefix(clean, "/") || clean == ".." {
			return fmt.Errorf("package contains unsafe path: %s", f.Name)
		}

		dest := filepath.Join(dir, clean)
		if !strings.HasPrefix(dest, filepath.Clean(dir)+string(os.PathSeparator)) && dest != filepath.Clean(dir) {
			return fmt.Errorf("package entry escapes target dir: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(dest, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			rc.Close()
			return err
		}
		if _, err := io.Copy(out, rc); err != nil {
			out.Close()
			rc.Close()
			return err
		}
		out.Close()
		rc.Close()
	}
	return nil
}

// createAndStartContainer creates and starts a Docker container for the application.
// codeDir is the host directory with the app code, mounted at /workspace.
func (m *RuntimeManager) createAndStartContainer(ctx context.Context, app *model.Application, sandbox *Sandbox, codeDir string) (string, error) {
	env := []string{
		fmt.Sprintf("APP_ID=%s", app.ID),
		fmt.Sprintf("ORG_ID=%d", app.OrgID),
		"MCP_ENDPOINT=http://backend:8888/mcp",
		fmt.Sprintf("PORT=%d", app.Port),
		fmt.Sprintf("OAUTH_TOKEN=%s", app.OAuthToken),
	}

	// Run the entrypoint from the mounted code directory.
	cmd := []string{"sh", "-c", fmt.Sprintf("cd /workspace && %s", app.Entrypoint)}

	hostConfig := container.HostConfig{
		Resources: container.Resources{
			NanoCPUs: parseCPUQuota(app.CPUQuota),
			Memory:   parseMemoryQuota(app.MemoryQuota),
		},
		SecurityOpt: []string{"no-new-privileges"},
	}
	if codeDir != "" {
		hostConfig.Binds = []string{fmt.Sprintf("%s:/workspace", codeDir)}
	}

	appNetName := fmt.Sprintf("app-%s-net", app.ID)
	resp, err := m.docker.ContainerCreate(
		ctx,
		&container.Config{
			Image: app.Runtime,
			Cmd:   cmd,
			Env:   env,
			ExposedPorts: natPortSet(app.Port),
		},
		&hostConfig,
		&network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				appNetName: {
					NetworkID: sandbox.NetworkID,
				},
				m.platformNet: {}, // also connect to platform network for MCP access
			},
		},
		nil,
		fmt.Sprintf("app-%s", app.ID),
	)
	if err != nil {
		return "", err
	}

	if err := m.docker.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		_ = m.docker.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})
		return "", err
	}

	return resp.ID, nil
}

// natPortSet builds the ExposedPorts map for a given port.
func natPortSet(port int) map[natPort]struct{} {
	return map[natPort]struct{}{
		natPort(fmt.Sprintf("%d/tcp", port)): {},
	}
}

// generateID generates a short unique ID for deployments.
func generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
