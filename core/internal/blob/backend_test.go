package blob

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestFilesystemBackendContentLocator(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	backend := NewFilesystemBackend(rootDir)

	hash := "abc123def456"
	locator := backend.ContentLocator(hash)

	expected := filepath.Join(rootDir, hash)
	if locator != expected {
		t.Errorf("ContentLocator(%q) = %q, want %q", hash, locator, expected)
	}
}

func TestFilesystemBackendWriteAndRead(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	backend := NewFilesystemBackend(rootDir)

	ctx := context.Background()
	hash := "abc123def456"
	data := []byte("test content")

	if err := backend.Write(ctx, hash, data); err != nil {
		t.Fatalf("Write(%q, %q) error: %v", hash, data, err)
	}

	readData, err := backend.Read(ctx, backend.ContentLocator(hash))
	if err != nil {
		t.Fatalf("Read(%q) error: %v", backend.ContentLocator(hash), err)
	}

	if string(readData) != string(data) {
		t.Errorf("Read() = %q, want %q", readData, data)
	}
}

func TestFilesystemBackendReadNotFound(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	backend := NewFilesystemBackend(rootDir)

	ctx := context.Background()
	_, err := backend.Read(ctx, backend.ContentLocator("nonexistent"))
	if err == nil {
		t.Fatal("Read(nonexistent) expected error, got nil")
	}
	if !os.IsNotExist(err) && err != ErrNotFound {
		t.Errorf("Read(nonexistent) error = %v, want ErrNotFound or os.ErrNotExist", err)
	}
}

func TestFilesystemBackendStageWritePromoteAndCleanup(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	backend := NewFilesystemBackend(rootDir)

	ctx := context.Background()
	hash := "staged123"
	data := []byte("staged content")

	staged, err := backend.StageWrite(ctx, hash, data)
	if err != nil {
		t.Fatalf("StageWrite(%q, %q) error: %v", hash, data, err)
	}

	locator := staged.Locator()
	expectedLocator := backend.ContentLocator(hash)
	if locator != expectedLocator {
		t.Errorf("staged.Locator() = %q, want %q", locator, expectedLocator)
	}

	if err := staged.Promote(); err != nil {
		t.Fatalf("staged.Promote() error: %v", err)
	}

	readData, err := backend.Read(ctx, locator)
	if err != nil {
		t.Fatalf("Read(%q) after promote error: %v", locator, err)
	}
	if string(readData) != string(data) {
		t.Errorf("Read() after promote = %q, want %q", readData, data)
	}
}

func TestFilesystemBackendStageWriteCleanupRemovesTempFile(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	backend := NewFilesystemBackend(rootDir)

	ctx := context.Background()
	hash := "cleanup123"
	data := []byte("cleanup content")

	staged, err := backend.StageWrite(ctx, hash, data)
	if err != nil {
		t.Fatalf("StageWrite(%q, %q) error: %v", hash, data, err)
	}

	sw := staged.(*filesystemStagedWrite)
	tempPath := sw.tempPath

	if _, err := os.Stat(tempPath); err != nil {
		t.Fatalf("temp file should exist before cleanup: %v", err)
	}

	if err := staged.Cleanup(); err != nil {
		t.Fatalf("staged.Cleanup() error: %v", err)
	}

	if _, err := os.Stat(tempPath); !os.IsNotExist(err) {
		t.Errorf("temp file should not exist after cleanup: %v", err)
	}
}

func TestFilesystemBackendPromoteIdempotentWhenTargetExists(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	backend := NewFilesystemBackend(rootDir)

	ctx := context.Background()
	hash := "idempotent123"
	data := []byte("idempotent content")

	if err := backend.Write(ctx, hash, data); err != nil {
		t.Fatalf("Write(%q) error: %v", hash, err)
	}

	staged, err := backend.StageWrite(ctx, hash, []byte("different content"))
	if err != nil {
		t.Fatalf("StageWrite(%q) error: %v", hash, err)
	}

	if err := staged.Promote(); err != nil {
		t.Fatalf("Promote() when target exists should succeed, got error: %v", err)
	}

	readData, err := backend.Read(ctx, backend.ContentLocator(hash))
	if err != nil {
		t.Fatalf("Read(%q) error: %v", hash, err)
	}

	if string(readData) != string(data) {
		t.Errorf("content should remain unchanged = %q, want %q", readData, data)
	}
}

func TestFilesystemBackendRootDir(t *testing.T) {
	t.Parallel()

	rootDir := "/tmp/testblobs"
	backend := NewFilesystemBackend(rootDir)

	if backend.RootDir() != rootDir {
		t.Errorf("RootDir() = %q, want %q", backend.RootDir(), rootDir)
	}
}
