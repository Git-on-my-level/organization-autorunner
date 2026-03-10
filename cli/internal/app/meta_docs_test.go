package app

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRunMetaDocsPrintsBundledRuntimeReference(t *testing.T) {
	t.Parallel()

	output := runHelpCommand(t, "meta", "docs")
	if !strings.Contains(output, "# OAR Runtime Help Reference") {
		t.Fatalf("expected runtime docs header output=%s", output)
	}
	if !strings.Contains(output, "## `threads`") {
		t.Fatalf("expected threads topic in runtime docs output=%s", output)
	}
	if !strings.Contains(output, "## `docs tombstone`") {
		t.Fatalf("expected docs tombstone topic in runtime docs output=%s", output)
	}
	if !strings.Contains(output, "## `threads workspace`") {
		t.Fatalf("expected local helper topic in runtime docs output=%s", output)
	}
}

func TestRunMetaDocPrintsSingleTopicMarkdown(t *testing.T) {
	t.Parallel()

	output := runHelpCommand(t, "meta", "doc", "threads")
	if !strings.Contains(output, "## `threads`") {
		t.Fatalf("expected threads markdown header output=%s", output)
	}
	if !strings.Contains(output, "Generated Help: threads") {
		t.Fatalf("expected embedded threads help text output=%s", output)
	}
	if strings.Contains(output, "## `docs`") {
		t.Fatalf("expected single-topic markdown output=%s", output)
	}
}

func TestRuntimeHelpDocMarkdownCoversCatalogTopics(t *testing.T) {
	t.Parallel()

	for _, topic := range runtimeHelpDocTopics() {
		markdown, err := RuntimeHelpDocMarkdown(topic.Path)
		if err != nil {
			t.Fatalf("render markdown for %q: %v", topic.Path, err)
		}
		if !strings.Contains(markdown, "## `"+topic.Path+"`") {
			t.Fatalf("expected markdown header for %q output=%s", topic.Path, markdown)
		}
	}
}

func TestRuntimeHelpCatalogCoversGeneratedRuntimePaths(t *testing.T) {
	t.Parallel()

	for _, path := range runtimeGeneratedRegistryPaths() {
		runtimePath := strings.Join(strings.Fields(strings.TrimSpace(path)), " ")
		if runtimePath == "" {
			continue
		}
		markdown, err := RuntimeHelpDocMarkdown(runtimePath)
		if err != nil {
			t.Fatalf("render runtime path %q: %v", runtimePath, err)
		}
		if !strings.Contains(markdown, "## `"+runtimePath+"`") {
			t.Fatalf("expected runtime path heading for %q output=%s", runtimePath, markdown)
		}
	}
}

func TestRuntimeHelpDocsArtifactIsCurrent(t *testing.T) {
	t.Parallel()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve current file path")
	}
	artifactPath := filepath.Join(filepath.Dir(currentFile), "..", "..", "docs", "generated", "runtime-help.md")
	content, err := os.ReadFile(artifactPath)
	if err != nil {
		t.Fatalf("read generated artifact: %v", err)
	}
	want, err := RuntimeHelpDocsMarkdown()
	if err != nil {
		t.Fatalf("render runtime docs markdown: %v", err)
	}
	if string(content) != want {
		t.Fatalf("runtime help artifact is stale; run `cd cli && go run ./cmd/oar-docs-gen`")
	}
}
