package blob

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

type Backend interface {
	ContentLocator(hash string) string
	Write(ctx context.Context, hash string, data []byte) error
	Read(ctx context.Context, locator string) ([]byte, error)
	StageWrite(ctx context.Context, hash string, data []byte) (StagedWrite, error)
}

type StagedWrite interface {
	Locator() string
	Promote() error
	Cleanup() error
}

var ErrNotFound = errors.New("blob not found")

type FilesystemBackend struct {
	rootDir string
}

func NewFilesystemBackend(rootDir string) *FilesystemBackend {
	return &FilesystemBackend{rootDir: rootDir}
}

func (b *FilesystemBackend) ContentLocator(hash string) string {
	return filepath.Join(b.rootDir, hash)
}

func (b *FilesystemBackend) Write(ctx context.Context, hash string, data []byte) error {
	locator := b.ContentLocator(hash)
	return os.WriteFile(locator, data, 0o644)
}

func (b *FilesystemBackend) Read(ctx context.Context, locator string) ([]byte, error) {
	data, err := os.ReadFile(locator)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("read blob: %w", err)
	}
	return data, nil
}

func (b *FilesystemBackend) StageWrite(ctx context.Context, hash string, data []byte) (StagedWrite, error) {
	locator := b.ContentLocator(hash)
	return newFilesystemStagedWrite(locator, data)
}

type filesystemStagedWrite struct {
	tempPath string
	locator  string
}

func newFilesystemStagedWrite(locator string, data []byte) (*filesystemStagedWrite, error) {
	dir := filepath.Dir(locator)
	file, err := os.CreateTemp(dir, ".cas-*")
	if err != nil {
		return nil, fmt.Errorf("create temp file: %w", err)
	}
	tempPath := file.Name()

	cleanupOnError := func() {
		_ = file.Close()
		_ = os.Remove(tempPath)
	}

	if _, err := file.Write(data); err != nil {
		cleanupOnError()
		return nil, fmt.Errorf("write temp file: %w", err)
	}
	if err := file.Chmod(0o644); err != nil {
		cleanupOnError()
		return nil, fmt.Errorf("chmod temp file: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(tempPath)
		return nil, fmt.Errorf("close temp file: %w", err)
	}

	return &filesystemStagedWrite{
		tempPath: tempPath,
		locator:  locator,
	}, nil
}

func (w *filesystemStagedWrite) Locator() string {
	return w.locator
}

func (w *filesystemStagedWrite) Promote() error {
	if w == nil || w.tempPath == "" {
		return nil
	}

	if _, err := os.Stat(w.locator); err == nil {
		return w.Cleanup()
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat target: %w", err)
	}

	if err := os.Rename(w.tempPath, w.locator); err != nil {
		if _, statErr := os.Stat(w.locator); statErr == nil {
			return w.Cleanup()
		}
		return fmt.Errorf("rename staged content: %w", err)
	}

	w.tempPath = ""
	return nil
}

func (w *filesystemStagedWrite) Cleanup() error {
	if w == nil || w.tempPath == "" {
		return nil
	}
	err := os.Remove(w.tempPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	w.tempPath = ""
	return nil
}

func (b *FilesystemBackend) RootDir() string {
	return b.rootDir
}
