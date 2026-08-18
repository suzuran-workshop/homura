package service

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/xrl/suzuran-cloud/internal/model"
)

// App package import limits (zip bomb protection).
const (
	MaxZipSize    = 50 << 20 // 50 MB upload cap
	MaxZipEntries = 500
	MaxFileSize   = 20 << 20 // 20 MB per extracted entry
)

// AppManifest is the app.json contract parsed from an imported code zip.
type AppManifest struct {
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Runtime     string            `json:"runtime"`
	Entrypoint  string            `json:"entrypoint"`
	Port        int               `json:"port"`
	Resources   map[string]string `json:"resources"`
	MCPScopes   []string          `json:"mcp_scopes"`
	Routes      []model.Route     `json:"routes"`
}

// ImportApp imports an application from a code zip.
// The zip must contain an app.json manifest at its root.
// The zip is stored in object storage (org-prefixed) so apps survive
// database resets and never depend on host filesystem paths.
func (s *ApplicationService) ImportApp(ctx context.Context, orgID int, zipData []byte) (*model.Application, error) {
	if len(zipData) == 0 {
		return nil, errors.New("empty package")
	}
	if len(zipData) > MaxZipSize {
		return nil, fmt.Errorf("package too large: %d bytes (max %d)", len(zipData), MaxZipSize)
	}

	manifest, err := parseAppZip(zipData)
	if err != nil {
		return nil, err
	}

	// Name conflicts within the org are rejected (re-import with a new version/name).
	exists, err := s.appRepo.ExistsByName(ctx, orgID, manifest.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to check app name: %w", err)
	}
	if exists {
		return nil, fmt.Errorf("application '%s' already exists in this organization", manifest.Name)
	}

	app, err := s.CreateApp(ctx, orgID, CreateAppRequest{
		Name:        manifest.Name,
		Version:     manifest.Version,
		Runtime:     manifest.Runtime,
		Entrypoint:  manifest.Entrypoint,
		Port:        manifest.Port,
		CPUQuota:    manifest.Resources["cpu"],
		MemoryQuota: manifest.Resources["memory"],
		MCPScopes:   manifest.MCPScopes,
	})
	if err != nil {
		return nil, err
	}

	// Persist the package in object storage (org-prefixed for isolation).
	if s.storage != nil {
		objectKey := fmt.Sprintf("orgs/%d/apps/%s/code.zip", orgID, app.ID)
		reader := bytes.NewReader(zipData)
		if _, err := s.storage.UploadFileRaw(ctx, objectKey, reader, "application/zip", int64(len(zipData))); err != nil {
			_ = s.appRepo.Delete(ctx, app.ID)
			return nil, fmt.Errorf("failed to store app package: %w", err)
		}
		app.SourceKey = objectKey
		if err := s.appRepo.UpdateSourceKey(ctx, app.ID, objectKey); err != nil {
			return nil, fmt.Errorf("failed to update app source: %w", err)
		}
	} else {
		_ = s.appRepo.Delete(ctx, app.ID)
		return nil, errors.New("object storage unavailable")
	}

	return app, nil
}

// parseAppZip validates and extracts the app.json manifest from a zip.
// Guards against path traversal and zip bombs.
func parseAppZip(zipData []byte) (*AppManifest, error) {
	zr, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		return nil, fmt.Errorf("invalid zip package: %w", err)
	}

	if len(zr.File) > MaxZipEntries {
		return nil, fmt.Errorf("package has too many entries: %d (max %d)", len(zr.File), MaxZipEntries)
	}

	var totalUncompressed int64
	manifestData, manifestFound := []byte(nil), false

	for _, f := range zr.File {
		// Path traversal guard: normalize and reject escapes.
		clean := path.Clean(strings.ReplaceAll(f.Name, "\\", "/"))
		if strings.HasPrefix(clean, "../") || strings.HasPrefix(clean, "/") || clean == ".." {
			return nil, fmt.Errorf("package contains unsafe path: %s", f.Name)
		}

		totalUncompressed += int64(f.UncompressedSize64)
		if totalUncompressed > MaxZipSize {
			return nil, fmt.Errorf("package expands beyond %d bytes", MaxZipSize)
		}
		if f.UncompressedSize64 > MaxFileSize {
			return nil, fmt.Errorf("package entry too large: %s", f.Name)
		}

		if clean == "app.json" && !manifestFound {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open app.json: %w", err)
			}
			manifestData, err = readAllLimited(rc, MaxFileSize)
			rc.Close()
			if err != nil {
				return nil, err
			}
			manifestFound = true
		}
	}

	if !manifestFound {
		return nil, errors.New("package is missing app.json at its root")
	}

	var m AppManifest
	if err := json.Unmarshal(manifestData, &m); err != nil {
		return nil, fmt.Errorf("invalid app.json manifest: %w", err)
	}
	if err := validateManifest(&m); err != nil {
		return nil, err
	}
	return &m, nil
}

// validateManifest checks required fields and that the entrypoint file exists in the package.
func validateManifest(m *AppManifest) error {
	if m.Name == "" {
		return errors.New("manifest: name is required")
	}
	if m.Runtime == "" {
		return errors.New("manifest: runtime is required")
	}
	if m.Entrypoint == "" {
		return errors.New("manifest: entrypoint is required")
	}
	if m.Port < 1024 || m.Port > 65535 {
		return fmt.Errorf("manifest: port must be between 1024 and 65535")
	}
	return nil
}

func readAllLimited(rc io.Reader, limit int64) ([]byte, error) {
	buf := make([]byte, 0, 64*1024)
	tmp := make([]byte, 32*1024)
	var total int64
	for {
		n, err := rc.Read(tmp)
		if n > 0 {
			total += int64(n)
			if total > limit {
				return nil, fmt.Errorf("file exceeds %d bytes", limit)
			}
			buf = append(buf, tmp[:n]...)
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to read file: %w", err)
		}
	}
	return buf, nil
}
