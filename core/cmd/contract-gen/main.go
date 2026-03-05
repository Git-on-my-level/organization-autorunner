package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

type openAPIDocument struct {
	OpenAPI string              `yaml:"openapi"`
	Info    openAPIInfo         `yaml:"info"`
	Paths   map[string]pathItem `yaml:"paths"`
}

type openAPIInfo struct {
	Version string `yaml:"version"`
}

type pathItem struct {
	Get    *operation `yaml:"get"`
	Post   *operation `yaml:"post"`
	Put    *operation `yaml:"put"`
	Patch  *operation `yaml:"patch"`
	Delete *operation `yaml:"delete"`
}

type operation struct {
	OperationID string       `yaml:"operationId"`
	Summary     string       `yaml:"summary"`
	Description string       `yaml:"description"`
	CommandID   string       `yaml:"x-oar-command-id"`
	CLIPath     string       `yaml:"x-oar-cli-path"`
	Why         string       `yaml:"x-oar-why"`
	Examples    []oarExample `yaml:"x-oar-examples"`
	InputMode   string       `yaml:"x-oar-input-mode"`
	Streaming   any          `yaml:"x-oar-streaming"`
	Output      string       `yaml:"x-oar-output-envelope"`
	ErrorCodes  []string     `yaml:"x-oar-error-codes"`
	Concepts    []string     `yaml:"x-oar-concepts"`
	Stability   string       `yaml:"x-oar-stability"`
	AgentNotes  string       `yaml:"x-oar-agent-notes"`
}

type oarExample struct {
	Title       string `yaml:"title" json:"title"`
	Command     string `yaml:"command" json:"command"`
	Description string `yaml:"description,omitempty" json:"description,omitempty"`
}

type command struct {
	CommandID   string       `json:"command_id"`
	CLIPath     string       `json:"cli_path"`
	Method      string       `json:"method"`
	Path        string       `json:"path"`
	OperationID string       `json:"operation_id"`
	Summary     string       `json:"summary,omitempty"`
	Description string       `json:"description,omitempty"`
	Why         string       `json:"why,omitempty"`
	InputMode   string       `json:"input_mode,omitempty"`
	Streaming   any          `json:"streaming,omitempty"`
	Output      string       `json:"output_envelope,omitempty"`
	ErrorCodes  []string     `json:"error_codes,omitempty"`
	Concepts    []string     `json:"concepts,omitempty"`
	Stability   string       `json:"stability,omitempty"`
	AgentNotes  string       `json:"agent_notes,omitempty"`
	Examples    []oarExample `json:"examples,omitempty"`
	PathParams  []string     `json:"path_params,omitempty"`
	GoMethod    string       `json:"go_method"`
	TSMethod    string       `json:"ts_method"`
}

type metaOutput struct {
	OpenAPIVersion  string    `json:"openapi_version"`
	ContractVersion string    `json:"contract_version"`
	GeneratedBy     string    `json:"generated_by"`
	ExtensionPrefix string    `json:"extension_prefix"`
	CommandCount    int       `json:"command_count"`
	Commands        []command `json:"commands"`
}

var pathParamPattern = regexp.MustCompile(`\{([^{}]+)\}`)

func main() {
	var (
		openAPIPath = flag.String("openapi", "../contracts/oar-openapi.yaml", "path to root OpenAPI contract")
		schemaPath  = flag.String("schema", "../contracts/oar-schema.yaml", "path to root domain schema contract")
		outDir      = flag.String("out", "../contracts/gen", "output directory for generated artifacts")
	)
	flag.Parse()

	openAPIRaw, err := os.ReadFile(*openAPIPath)
	if err != nil {
		exitf("read openapi: %v", err)
	}

	var doc openAPIDocument
	if err := yaml.Unmarshal(openAPIRaw, &doc); err != nil {
		exitf("decode openapi yaml: %v", err)
	}

	if strings.TrimSpace(doc.OpenAPI) == "" {
		exitf("openapi version is missing")
	}

	if _, err := os.ReadFile(*schemaPath); err != nil {
		exitf("read schema contract: %v", err)
	}

	commands := collectCommands(doc)
	if len(commands) == 0 {
		exitf("no x-oar commands found in openapi document")
	}

	if err := generateAll(*outDir, doc, commands); err != nil {
		exitf("generate artifacts: %v", err)
	}
}

func collectCommands(doc openAPIDocument) []command {
	paths := make([]string, 0, len(doc.Paths))
	for path := range doc.Paths {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	commands := make([]command, 0, len(paths)*2)
	for _, path := range paths {
		item := doc.Paths[path]
		for _, pair := range []struct {
			method string
			op     *operation
		}{
			{method: "GET", op: item.Get},
			{method: "POST", op: item.Post},
			{method: "PUT", op: item.Put},
			{method: "PATCH", op: item.Patch},
			{method: "DELETE", op: item.Delete},
		} {
			if pair.op == nil {
				continue
			}
			if strings.TrimSpace(pair.op.CommandID) == "" {
				continue
			}

			commandID := strings.TrimSpace(pair.op.CommandID)
			cmd := command{
				CommandID:   commandID,
				CLIPath:     strings.TrimSpace(pair.op.CLIPath),
				Method:      pair.method,
				Path:        path,
				OperationID: strings.TrimSpace(pair.op.OperationID),
				Summary:     strings.TrimSpace(pair.op.Summary),
				Description: strings.TrimSpace(pair.op.Description),
				Why:         strings.TrimSpace(pair.op.Why),
				InputMode:   strings.TrimSpace(pair.op.InputMode),
				Streaming:   pair.op.Streaming,
				Output:      strings.TrimSpace(pair.op.Output),
				ErrorCodes:  compactStrings(pair.op.ErrorCodes),
				Concepts:    compactStrings(pair.op.Concepts),
				Stability:   strings.TrimSpace(pair.op.Stability),
				AgentNotes:  strings.TrimSpace(pair.op.AgentNotes),
				Examples:    compactExamples(pair.op.Examples),
				PathParams:  extractPathParams(path),
				GoMethod:    toPascalCase(commandID),
				TSMethod:    toCamelCase(commandID),
			}
			commands = append(commands, cmd)
		}
	}

	sort.Slice(commands, func(i, j int) bool {
		if commands[i].CommandID != commands[j].CommandID {
			return commands[i].CommandID < commands[j].CommandID
		}
		if commands[i].Method != commands[j].Method {
			return commands[i].Method < commands[j].Method
		}
		return commands[i].Path < commands[j].Path
	})

	seen := make(map[string]struct{}, len(commands))
	for _, cmd := range commands {
		if _, ok := seen[cmd.CommandID]; ok {
			exitf("duplicate x-oar-command-id detected: %s", cmd.CommandID)
		}
		seen[cmd.CommandID] = struct{}{}
	}

	return commands
}

func generateAll(outDir string, doc openAPIDocument, commands []command) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}

	if err := writeMeta(filepath.Join(outDir, "meta", "commands.json"), doc, commands); err != nil {
		return err
	}
	if err := writeMarkdown(filepath.Join(outDir, "docs", "commands.md"), doc, commands); err != nil {
		return err
	}
	if err := writeGoClient(filepath.Join(outDir, "go"), commands); err != nil {
		return err
	}
	if err := writeTSClient(filepath.Join(outDir, "ts"), commands); err != nil {
		return err
	}

	return nil
}

func writeMeta(path string, doc openAPIDocument, commands []command) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	payload := metaOutput{
		OpenAPIVersion:  doc.OpenAPI,
		ContractVersion: strings.TrimSpace(doc.Info.Version),
		GeneratedBy:     "core/cmd/contract-gen",
		ExtensionPrefix: "x-oar-",
		CommandCount:    len(commands),
		Commands:        commands,
	}

	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	return os.WriteFile(path, b, 0o644)
}

func writeMarkdown(path string, doc openAPIDocument, commands []command) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	var b strings.Builder
	b.WriteString("# OAR Command Registry\n\n")
	b.WriteString("Generated from `contracts/oar-openapi.yaml`.\n\n")
	b.WriteString(fmt.Sprintf("- OpenAPI version: `%s`\n", doc.OpenAPI))
	b.WriteString(fmt.Sprintf("- Contract version: `%s`\n", strings.TrimSpace(doc.Info.Version)))
	b.WriteString(fmt.Sprintf("- Commands: `%d`\n\n", len(commands)))

	for _, cmd := range commands {
		b.WriteString(fmt.Sprintf("## `%s`\n\n", cmd.CommandID))
		b.WriteString(fmt.Sprintf("- CLI path: `%s`\n", cmd.CLIPath))
		b.WriteString(fmt.Sprintf("- HTTP: `%s %s`\n", cmd.Method, cmd.Path))
		if cmd.Stability != "" {
			b.WriteString(fmt.Sprintf("- Stability: `%s`\n", cmd.Stability))
		}
		if cmd.InputMode != "" {
			b.WriteString(fmt.Sprintf("- Input mode: `%s`\n", cmd.InputMode))
		}
		if cmd.Why != "" {
			b.WriteString(fmt.Sprintf("- Why: %s\n", cmd.Why))
		}
		if len(cmd.Concepts) > 0 {
			b.WriteString(fmt.Sprintf("- Concepts: `%s`\n", strings.Join(cmd.Concepts, "`, `")))
		}
		if len(cmd.ErrorCodes) > 0 {
			b.WriteString(fmt.Sprintf("- Error codes: `%s`\n", strings.Join(cmd.ErrorCodes, "`, `")))
		}
		if cmd.Output != "" {
			b.WriteString(fmt.Sprintf("- Output: %s\n", cmd.Output))
		}
		if cmd.AgentNotes != "" {
			b.WriteString(fmt.Sprintf("- Agent notes: %s\n", cmd.AgentNotes))
		}
		if len(cmd.Examples) > 0 {
			b.WriteString("- Examples:\n")
			for _, ex := range cmd.Examples {
				title := strings.TrimSpace(ex.Title)
				if title == "" {
					title = "Example"
				}
				b.WriteString(fmt.Sprintf("  - %s: `%s`\n", title, strings.TrimSpace(ex.Command)))
				if strings.TrimSpace(ex.Description) != "" {
					b.WriteString(fmt.Sprintf("    - %s\n", strings.TrimSpace(ex.Description)))
				}
			}
		}
		b.WriteString("\n")
	}

	return os.WriteFile(path, []byte(b.String()), 0o644)
}

func writeGoClient(goOutDir string, commands []command) error {
	clientDir := filepath.Join(goOutDir, "client")
	if err := os.MkdirAll(clientDir, 0o755); err != nil {
		return err
	}

	goMod := "module organization-autorunner-contracts-go-client\n\ngo 1.23.0\n"
	if err := os.WriteFile(filepath.Join(goOutDir, "go.mod"), []byte(goMod), 0o644); err != nil {
		return err
	}

	if err := os.WriteFile(filepath.Join(clientDir, "client_gen_test.go"), []byte("package client\n\nimport \"testing\"\n\nfunc TestGeneratedRegistryHasCommands(t *testing.T) {\n\tif len(CommandRegistry) == 0 {\n\t\tt.Fatal(\"expected non-empty command registry\")\n\t}\n}\n"), 0o644); err != nil {
		return err
	}

	var src bytes.Buffer
	src.WriteString("package client\n\n")
	src.WriteString("import (\n")
	src.WriteString("\t\"bytes\"\n")
	src.WriteString("\t\"context\"\n")
	src.WriteString("\t\"encoding/json\"\n")
	src.WriteString("\t\"fmt\"\n")
	src.WriteString("\t\"io\"\n")
	src.WriteString("\t\"net/http\"\n")
	src.WriteString("\t\"net/url\"\n")
	src.WriteString("\t\"strings\"\n")
	src.WriteString(")\n\n")

	src.WriteString("type Example struct {\n")
	src.WriteString("\tTitle       string `json:\"title\"`\n")
	src.WriteString("\tCommand     string `json:\"command\"`\n")
	src.WriteString("\tDescription string `json:\"description,omitempty\"`\n")
	src.WriteString("}\n\n")

	src.WriteString("type CommandSpec struct {\n")
	src.WriteString("\tCommandID  string   `json:\"command_id\"`\n")
	src.WriteString("\tCLIPath    string   `json:\"cli_path\"`\n")
	src.WriteString("\tMethod     string   `json:\"method\"`\n")
	src.WriteString("\tPath       string   `json:\"path\"`\n")
	src.WriteString("\tPathParams []string `json:\"path_params,omitempty\"`\n")
	src.WriteString("\tInputMode  string   `json:\"input_mode,omitempty\"`\n")
	src.WriteString("\tStability  string   `json:\"stability,omitempty\"`\n")
	src.WriteString("\tConcepts   []string `json:\"concepts,omitempty\"`\n")
	src.WriteString("\tExamples   []Example `json:\"examples,omitempty\"`\n")
	src.WriteString("}\n\n")

	src.WriteString("var CommandRegistry = []CommandSpec{\n")
	for _, cmd := range commands {
		src.WriteString("\t{\n")
		src.WriteString(fmt.Sprintf("\t\tCommandID: %q,\n", cmd.CommandID))
		src.WriteString(fmt.Sprintf("\t\tCLIPath: %q,\n", cmd.CLIPath))
		src.WriteString(fmt.Sprintf("\t\tMethod: %q,\n", cmd.Method))
		src.WriteString(fmt.Sprintf("\t\tPath: %q,\n", cmd.Path))
		if len(cmd.PathParams) > 0 {
			src.WriteString("\t\tPathParams: []string{")
			for i, p := range cmd.PathParams {
				if i > 0 {
					src.WriteString(", ")
				}
				src.WriteString(fmt.Sprintf("%q", p))
			}
			src.WriteString("},\n")
		}
		if cmd.InputMode != "" {
			src.WriteString(fmt.Sprintf("\t\tInputMode: %q,\n", cmd.InputMode))
		}
		if cmd.Stability != "" {
			src.WriteString(fmt.Sprintf("\t\tStability: %q,\n", cmd.Stability))
		}
		if len(cmd.Concepts) > 0 {
			src.WriteString("\t\tConcepts: []string{")
			for i, c := range cmd.Concepts {
				if i > 0 {
					src.WriteString(", ")
				}
				src.WriteString(fmt.Sprintf("%q", c))
			}
			src.WriteString("},\n")
		}
		if len(cmd.Examples) > 0 {
			src.WriteString("\t\tExamples: []Example{\n")
			for _, ex := range cmd.Examples {
				src.WriteString("\t\t\t{\n")
				src.WriteString(fmt.Sprintf("\t\t\t\tTitle: %q,\n", ex.Title))
				src.WriteString(fmt.Sprintf("\t\t\t\tCommand: %q,\n", ex.Command))
				if ex.Description != "" {
					src.WriteString(fmt.Sprintf("\t\t\t\tDescription: %q,\n", ex.Description))
				}
				src.WriteString("\t\t\t},\n")
			}
			src.WriteString("\t\t},\n")
		}
		src.WriteString("\t},\n")
	}
	src.WriteString("}\n\n")

	src.WriteString("var commandIndex = func() map[string]CommandSpec {\n")
	src.WriteString("\tindex := make(map[string]CommandSpec, len(CommandRegistry))\n")
	src.WriteString("\tfor _, cmd := range CommandRegistry {\n")
	src.WriteString("\t\tindex[cmd.CommandID] = cmd\n")
	src.WriteString("\t}\n")
	src.WriteString("\treturn index\n")
	src.WriteString("}()\n\n")

	src.WriteString("type RequestOptions struct {\n")
	src.WriteString("\tQuery   map[string][]string\n")
	src.WriteString("\tHeaders map[string]string\n")
	src.WriteString("\tBody    any\n")
	src.WriteString("}\n\n")

	src.WriteString("type Client struct {\n")
	src.WriteString("\tBaseURL    string\n")
	src.WriteString("\tHTTPClient *http.Client\n")
	src.WriteString("}\n\n")

	src.WriteString("func New(baseURL string, httpClient *http.Client) *Client {\n")
	src.WriteString("\tif httpClient == nil {\n")
	src.WriteString("\t\thttpClient = &http.Client{}\n")
	src.WriteString("\t}\n")
	src.WriteString("\treturn &Client{BaseURL: strings.TrimRight(baseURL, \"/\"), HTTPClient: httpClient}\n")
	src.WriteString("}\n\n")

	src.WriteString("func (c *Client) Invoke(ctx context.Context, commandID string, pathParams map[string]string, opts RequestOptions) (*http.Response, []byte, error) {\n")
	src.WriteString("\tif c == nil {\n")
	src.WriteString("\t\treturn nil, nil, fmt.Errorf(\"client is nil\")\n")
	src.WriteString("\t}\n")
	src.WriteString("\tif strings.TrimSpace(c.BaseURL) == \"\" {\n")
	src.WriteString("\t\treturn nil, nil, fmt.Errorf(\"base url is required\")\n")
	src.WriteString("\t}\n")
	src.WriteString("\tif c.HTTPClient == nil {\n")
	src.WriteString("\t\treturn nil, nil, fmt.Errorf(\"http client is required\")\n")
	src.WriteString("\t}\n")
	src.WriteString("\tcmd, ok := commandIndex[commandID]\n")
	src.WriteString("\tif !ok {\n")
	src.WriteString("\t\treturn nil, nil, fmt.Errorf(\"unknown command id: %s\", commandID)\n")
	src.WriteString("\t}\n")
	src.WriteString("\tpath, err := renderPath(cmd.Path, pathParams)\n")
	src.WriteString("\tif err != nil {\n")
	src.WriteString("\t\treturn nil, nil, err\n")
	src.WriteString("\t}\n")
	src.WriteString("\turlString := c.BaseURL + path\n")
	src.WriteString("\tu, err := url.Parse(urlString)\n")
	src.WriteString("\tif err != nil {\n")
	src.WriteString("\t\treturn nil, nil, fmt.Errorf(\"parse request url: %w\", err)\n")
	src.WriteString("\t}\n")
	src.WriteString("\tif len(opts.Query) > 0 {\n")
	src.WriteString("\t\tq := u.Query()\n")
	src.WriteString("\t\tfor key, values := range opts.Query {\n")
	src.WriteString("\t\t\tfor _, value := range values {\n")
	src.WriteString("\t\t\t\tq.Add(key, value)\n")
	src.WriteString("\t\t\t}\n")
	src.WriteString("\t\t}\n")
	src.WriteString("\t\tu.RawQuery = q.Encode()\n")
	src.WriteString("\t}\n")
	src.WriteString("\tvar body io.Reader\n")
	src.WriteString("\tif opts.Body != nil {\n")
	src.WriteString("\t\tencoded, err := json.Marshal(opts.Body)\n")
	src.WriteString("\t\tif err != nil {\n")
	src.WriteString("\t\t\treturn nil, nil, fmt.Errorf(\"encode request body: %w\", err)\n")
	src.WriteString("\t\t}\n")
	src.WriteString("\t\tbody = bytes.NewReader(encoded)\n")
	src.WriteString("\t}\n")
	src.WriteString("\treq, err := http.NewRequestWithContext(ctx, cmd.Method, u.String(), body)\n")
	src.WriteString("\tif err != nil {\n")
	src.WriteString("\t\treturn nil, nil, fmt.Errorf(\"build request: %w\", err)\n")
	src.WriteString("\t}\n")
	src.WriteString("\treq.Header.Set(\"Accept\", \"application/json\")\n")
	src.WriteString("\tif opts.Body != nil {\n")
	src.WriteString("\t\treq.Header.Set(\"Content-Type\", \"application/json\")\n")
	src.WriteString("\t}\n")
	src.WriteString("\tfor key, value := range opts.Headers {\n")
	src.WriteString("\t\tif strings.TrimSpace(key) == \"\" {\n")
	src.WriteString("\t\t\tcontinue\n")
	src.WriteString("\t\t}\n")
	src.WriteString("\t\treq.Header.Set(key, value)\n")
	src.WriteString("\t}\n")
	src.WriteString("\tresp, err := c.HTTPClient.Do(req)\n")
	src.WriteString("\tif err != nil {\n")
	src.WriteString("\t\treturn nil, nil, fmt.Errorf(\"perform request: %w\", err)\n")
	src.WriteString("\t}\n")
	src.WriteString("\tbodyBytes, readErr := io.ReadAll(resp.Body)\n")
	src.WriteString("\t_ = resp.Body.Close()\n")
	src.WriteString("\tif readErr != nil {\n")
	src.WriteString("\t\treturn resp, nil, fmt.Errorf(\"read response: %w\", readErr)\n")
	src.WriteString("\t}\n")
	src.WriteString("\tif resp.StatusCode >= http.StatusBadRequest {\n")
	src.WriteString("\t\treturn resp, bodyBytes, fmt.Errorf(\"request failed: status=%d body=%s\", resp.StatusCode, string(bodyBytes))\n")
	src.WriteString("\t}\n")
	src.WriteString("\treturn resp, bodyBytes, nil\n")
	src.WriteString("}\n\n")

	src.WriteString("func renderPath(template string, pathParams map[string]string) (string, error) {\n")
	src.WriteString("\tb := template\n")
	src.WriteString("\tfor {\n")
	src.WriteString("\t\tstart := strings.IndexByte(b, '{')\n")
	src.WriteString("\t\tif start < 0 {\n")
	src.WriteString("\t\t\treturn b, nil\n")
	src.WriteString("\t\t}\n")
	src.WriteString("\t\tend := strings.IndexByte(b[start:], '}')\n")
	src.WriteString("\t\tif end < 0 {\n")
	src.WriteString("\t\t\treturn \"\", fmt.Errorf(\"invalid path template: %s\", template)\n")
	src.WriteString("\t\t}\n")
	src.WriteString("\t\tend += start\n")
	src.WriteString("\t\tname := b[start+1 : end]\n")
	src.WriteString("\t\tvalue, ok := pathParams[name]\n")
	src.WriteString("\t\tif !ok {\n")
	src.WriteString("\t\t\treturn \"\", fmt.Errorf(\"missing path param %q\", name)\n")
	src.WriteString("\t\t}\n")
	src.WriteString("\t\tb = b[:start] + url.PathEscape(value) + b[end+1:]\n")
	src.WriteString("\t}\n")
	src.WriteString("}\n\n")

	for _, cmd := range commands {
		if len(cmd.PathParams) == 0 {
			src.WriteString(fmt.Sprintf("func (c *Client) %s(ctx context.Context, opts RequestOptions) (*http.Response, []byte, error) {\n", cmd.GoMethod))
			src.WriteString(fmt.Sprintf("\treturn c.Invoke(ctx, %q, nil, opts)\n", cmd.CommandID))
			src.WriteString("}\n\n")
			continue
		}
		src.WriteString(fmt.Sprintf("func (c *Client) %s(ctx context.Context, pathParams map[string]string, opts RequestOptions) (*http.Response, []byte, error) {\n", cmd.GoMethod))
		src.WriteString(fmt.Sprintf("\treturn c.Invoke(ctx, %q, pathParams, opts)\n", cmd.CommandID))
		src.WriteString("}\n\n")
	}

	formatted, err := format.Source(src.Bytes())
	if err != nil {
		return fmt.Errorf("format go source: %w", err)
	}

	return os.WriteFile(filepath.Join(clientDir, "client_gen.go"), formatted, 0o644)
}

func writeTSClient(tsOutDir string, commands []command) error {
	if err := os.MkdirAll(tsOutDir, 0o755); err != nil {
		return err
	}

	metaJSON, err := json.MarshalIndent(commands, "", "  ")
	if err != nil {
		return err
	}

	var b strings.Builder
	b.WriteString("export type HttpMethod = \"GET\" | \"POST\" | \"PUT\" | \"PATCH\" | \"DELETE\";\n\n")
	b.WriteString("export interface Example {\n")
	b.WriteString("  title: string;\n")
	b.WriteString("  command: string;\n")
	b.WriteString("  description?: string;\n")
	b.WriteString("}\n\n")
	b.WriteString("export interface CommandSpec {\n")
	b.WriteString("  command_id: string;\n")
	b.WriteString("  cli_path: string;\n")
	b.WriteString("  method: HttpMethod;\n")
	b.WriteString("  path: string;\n")
	b.WriteString("  operation_id: string;\n")
	b.WriteString("  summary?: string;\n")
	b.WriteString("  description?: string;\n")
	b.WriteString("  why?: string;\n")
	b.WriteString("  path_params?: string[];\n")
	b.WriteString("  input_mode?: string;\n")
	b.WriteString("  streaming?: unknown;\n")
	b.WriteString("  output_envelope?: string;\n")
	b.WriteString("  error_codes?: string[];\n")
	b.WriteString("  stability?: string;\n")
	b.WriteString("  agent_notes?: string;\n")
	b.WriteString("  concepts?: string[];\n")
	b.WriteString("  examples?: Example[];\n")
	b.WriteString("  go_method: string;\n")
	b.WriteString("  ts_method: string;\n")
	b.WriteString("}\n\n")
	b.WriteString("export interface RequestOptions {\n")
	b.WriteString("  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;\n")
	b.WriteString("  headers?: Record<string, string>;\n")
	b.WriteString("  body?: unknown;\n")
	b.WriteString("}\n\n")
	b.WriteString("export interface InvokeResult {\n")
	b.WriteString("  status: number;\n")
	b.WriteString("  headers: Headers;\n")
	b.WriteString("  body: string;\n")
	b.WriteString("}\n\n")

	b.WriteString("export const commandRegistry: CommandSpec[] = ")
	b.Write(metaJSON)
	b.WriteString(" as CommandSpec[];\n\n")

	b.WriteString("const commandIndex = new Map(commandRegistry.map((command) => [command.command_id, command] as const));\n\n")

	b.WriteString("function renderPath(pathTemplate: string, pathParams: Record<string, string> = {}): string {\n")
	b.WriteString("  return pathTemplate.replace(/\\{([^{}]+)\\}/g, (_match, name: string) => {\n")
	b.WriteString("    const value = pathParams[name];\n")
	b.WriteString("    if (value === undefined) {\n")
	b.WriteString("      throw new Error(`missing path param ${name}`);\n")
	b.WriteString("    }\n")
	b.WriteString("    return encodeURIComponent(value);\n")
	b.WriteString("  });\n")
	b.WriteString("}\n\n")

	b.WriteString("function withQuery(path: string, query: RequestOptions[\"query\"]): string {\n")
	b.WriteString("  if (!query) {\n")
	b.WriteString("    return path;\n")
	b.WriteString("  }\n")
	b.WriteString("  const params = new URLSearchParams();\n")
	b.WriteString("  for (const [key, value] of Object.entries(query)) {\n")
	b.WriteString("    if (value === undefined) {\n")
	b.WriteString("      continue;\n")
	b.WriteString("    }\n")
	b.WriteString("    if (Array.isArray(value)) {\n")
	b.WriteString("      for (const entry of value) {\n")
	b.WriteString("        params.append(key, String(entry));\n")
	b.WriteString("      }\n")
	b.WriteString("      continue;\n")
	b.WriteString("    }\n")
	b.WriteString("    params.set(key, String(value));\n")
	b.WriteString("  }\n")
	b.WriteString("  const encoded = params.toString();\n")
	b.WriteString("  if (!encoded) {\n")
	b.WriteString("    return path;\n")
	b.WriteString("  }\n")
	b.WriteString("  return `${path}?${encoded}`;\n")
	b.WriteString("}\n\n")

	b.WriteString("export class OarClient {\n")
	b.WriteString("  private readonly baseUrl: string;\n")
	b.WriteString("  private readonly fetchFn: typeof fetch;\n\n")
	b.WriteString("  constructor(baseUrl: string, fetchFn: typeof fetch = fetch) {\n")
	b.WriteString("    this.baseUrl = String(baseUrl || \"\").replace(/\\/+$/, \"\");\n")
	b.WriteString("    this.fetchFn = fetchFn;\n")
	b.WriteString("  }\n\n")
	b.WriteString("  async invoke(commandId: string, pathParams: Record<string, string> = {}, options: RequestOptions = {}): Promise<InvokeResult> {\n")
	b.WriteString("    if (!this.baseUrl) {\n")
	b.WriteString("      throw new Error(\"baseUrl is required\");\n")
	b.WriteString("    }\n")
	b.WriteString("    const command = commandIndex.get(commandId);\n")
	b.WriteString("    if (!command) {\n")
	b.WriteString("      throw new Error(`unknown command id: ${commandId}`);\n")
	b.WriteString("    }\n")
	b.WriteString("    const path = withQuery(renderPath(command.path, pathParams), options.query);\n")
	b.WriteString("    const response = await this.fetchFn(`${this.baseUrl}${path}`, {\n")
	b.WriteString("      method: command.method,\n")
	b.WriteString("      headers: {\n")
	b.WriteString("        accept: \"application/json\",\n")
	b.WriteString("        ...(options.body !== undefined ? { \"content-type\": \"application/json\" } : {}),\n")
	b.WriteString("        ...(options.headers ?? {}),\n")
	b.WriteString("      },\n")
	b.WriteString("      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,\n")
	b.WriteString("    });\n")
	b.WriteString("    const body = await response.text();\n")
	b.WriteString("    if (!response.ok) {\n")
	b.WriteString("      throw new Error(`request failed for ${commandId}: ${response.status} ${response.statusText} ${body}`);\n")
	b.WriteString("    }\n")
	b.WriteString("    return { status: response.status, headers: response.headers, body };\n")
	b.WriteString("  }\n\n")

	for _, cmd := range commands {
		if len(cmd.PathParams) == 0 {
			b.WriteString(fmt.Sprintf("  %s(options: RequestOptions = {}): Promise<InvokeResult> {\n", cmd.TSMethod))
			b.WriteString(fmt.Sprintf("    return this.invoke(%q, {}, options);\n", cmd.CommandID))
			b.WriteString("  }\n\n")
			continue
		}
		b.WriteString(fmt.Sprintf("  %s(pathParams: Record<string, string>, options: RequestOptions = {}): Promise<InvokeResult> {\n", cmd.TSMethod))
		b.WriteString(fmt.Sprintf("    return this.invoke(%q, pathParams, options);\n", cmd.CommandID))
		b.WriteString("  }\n\n")
	}

	b.WriteString("}\n")

	if err := os.WriteFile(filepath.Join(tsOutDir, "client.ts"), []byte(b.String()), 0o644); err != nil {
		return err
	}

	index := "export * from \"./client\";\n"
	if err := os.WriteFile(filepath.Join(tsOutDir, "index.ts"), []byte(index), 0o644); err != nil {
		return err
	}

	tsconfig := `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["client.ts", "index.ts"]
}
`
	if err := os.WriteFile(filepath.Join(tsOutDir, "tsconfig.json"), []byte(tsconfig), 0o644); err != nil {
		return err
	}

	pkg := `{
  "name": "organization-autorunner-contracts-ts-client",
  "private": true,
  "type": "module"
}
`
	if err := os.WriteFile(filepath.Join(tsOutDir, "package.json"), []byte(pkg), 0o644); err != nil {
		return err
	}

	return nil
}

func compactStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		out = append(out, value)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func compactExamples(values []oarExample) []oarExample {
	if len(values) == 0 {
		return nil
	}
	out := make([]oarExample, 0, len(values))
	for _, value := range values {
		value.Title = strings.TrimSpace(value.Title)
		value.Command = strings.TrimSpace(value.Command)
		value.Description = strings.TrimSpace(value.Description)
		if value.Title == "" && value.Command == "" {
			continue
		}
		out = append(out, value)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func extractPathParams(path string) []string {
	matches := pathParamPattern.FindAllStringSubmatch(path, -1)
	if len(matches) == 0 {
		return nil
	}

	params := make([]string, 0, len(matches))
	seen := make(map[string]struct{}, len(matches))
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		name := strings.TrimSpace(m[1])
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		params = append(params, name)
	}
	if len(params) == 0 {
		return nil
	}
	return params
}

func toCamelCase(value string) string {
	pascal := toPascalCase(value)
	if pascal == "" {
		return "command"
	}
	if len(pascal) == 1 {
		return strings.ToLower(pascal)
	}
	return strings.ToLower(pascal[:1]) + pascal[1:]
}

func toPascalCase(value string) string {
	parts := strings.FieldsFunc(value, func(r rune) bool {
		if r >= 'a' && r <= 'z' {
			return false
		}
		if r >= 'A' && r <= 'Z' {
			return false
		}
		if r >= '0' && r <= '9' {
			return false
		}
		return true
	})
	if len(parts) == 0 {
		return "Command"
	}

	var b strings.Builder
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		lower := strings.ToLower(part)
		b.WriteString(strings.ToUpper(lower[:1]))
		if len(lower) > 1 {
			b.WriteString(lower[1:])
		}
	}
	result := b.String()
	if result == "" {
		return "Command"
	}
	if result[0] >= '0' && result[0] <= '9' {
		return "Command" + result
	}
	return result
}

func exitf(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
