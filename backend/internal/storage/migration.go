package storage

import (
	"context"
	"fmt"
	"log"
)

// MigrationService handles data migration between storage backends
type MigrationService struct {
	source FileStorage
	target FileStorage
}

// NewMigrationService creates a new migration service
func NewMigrationService(source, target FileStorage) *MigrationService {
	return &MigrationService{
		source: source,
		target: target,
	}
}

// MigrateOrgFiles migrates all files for a specific organization
func (s *MigrationService) MigrateOrgFiles(ctx context.Context, orgID int) (int, error) {
	// List all files in the source storage for this org
	files, err := s.source.ListFiles(ctx, orgID, "", 0)
	if err != nil {
		return 0, fmt.Errorf("failed to list files: %w", err)
	}

	migrated := 0
	for _, fileInfo := range files {
		if err := s.migrateFile(ctx, fileInfo.ObjectKey); err != nil {
			log.Printf("Warning: failed to migrate %s: %v", fileInfo.ObjectKey, err)
			continue
		}
		migrated++
	}

	return migrated, nil
}

// MigrateAllFiles migrates all files across all organizations
func (s *MigrationService) MigrateAllFiles(ctx context.Context, orgIDs []int) (int, error) {
	total := 0
	for _, orgID := range orgIDs {
		count, err := s.MigrateOrgFiles(ctx, orgID)
		if err != nil {
			log.Printf("Warning: failed to migrate org %d: %v", orgID, err)
			continue
		}
		total += count
	}
	return total, nil
}

// migrateFile migrates a single file from source to target
func (s *MigrationService) migrateFile(ctx context.Context, objectKey string) error {
	// Download from source
	reader, size, err := s.source.DownloadFile(ctx, objectKey)
	if err != nil {
		return fmt.Errorf("failed to download from source: %w", err)
	}
	defer reader.Close()

	// Upload to target
	_, err = s.target.UploadFileRaw(ctx, objectKey, reader, "", size)
	if err != nil {
		return fmt.Errorf("failed to upload to target: %w", err)
	}

	return nil
}

// VerifyMigration verifies that all files were successfully migrated
func (s *MigrationService) VerifyMigration(ctx context.Context, orgID int) (int, int, error) {
	sourceFiles, err := s.source.ListFiles(ctx, orgID, "", 0)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to list source files: %w", err)
	}

	targetFiles, err := s.target.ListFiles(ctx, orgID, "", 0)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to list target files: %w", err)
	}

	// Create a map of target files for quick lookup
	targetMap := make(map[string]bool)
	for _, f := range targetFiles {
		targetMap[f.ObjectKey] = true
	}

	verified := 0
	missing := 0
	for _, sourceFile := range sourceFiles {
		if targetMap[sourceFile.ObjectKey] {
			verified++
		} else {
			missing++
		}
	}

	return verified, missing, nil
}
