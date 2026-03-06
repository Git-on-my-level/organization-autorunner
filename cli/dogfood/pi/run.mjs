import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = here;
const repoRoot = path.resolve(packageRoot, "../../..");

function parseArgs(argv) {
  const options = {
    scenario: "zesty-bots",
    provider: "zai",
    model: "glm-5",
    baseUrl: "",
    reportDir: path.join(repoRoot, "cli", ".tmp", "pi-dogfood"),
    apiKey: "",
    apiKeyFile: "",
    oarBin: "",
    coreBin: "",
    maxSeconds: 900,
    agentCount: 1,
    agentPrefix: "pi-dogfood-agent",
  };

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === "--") {
      continue;
    }
    switch (arg) {
      case "--scenario":
        options.scenario = argv[++idx] ?? "";
        break;
      case "--provider":
        options.provider = argv[++idx] ?? "";
        break;
      case "--model":
        options.model = argv[++idx] ?? "";
        break;
      case "--base-url":
        options.baseUrl = argv[++idx] ?? "";
        break;
      case "--report-dir":
        options.reportDir = argv[++idx] ?? "";
        break;
      case "--api-key":
        options.apiKey = argv[++idx] ?? "";
        break;
      case "--api-key-file":
        options.apiKeyFile = argv[++idx] ?? "";
        break;
      case "--oar-bin":
        options.oarBin = argv[++idx] ?? "";
        break;
      case "--core-bin":
        options.coreBin = argv[++idx] ?? "";
        break;
      case "--max-seconds":
        options.maxSeconds = Number(argv[++idx] ?? "0");
        break;
      case "--agent-count":
        options.agentCount = Number(argv[++idx] ?? "0");
        break;
      case "--agent-prefix":
        options.agentPrefix = argv[++idx] ?? "";
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!options.apiKey && !options.apiKeyFile) {
    throw new Error("set --api-key or --api-key-file");
  }
  if (!options.scenario) {
    throw new Error("--scenario is required");
  }
  if (!Number.isFinite(options.maxSeconds) || options.maxSeconds <= 0) {
    throw new Error("--max-seconds must be a positive number");
  }
  if (!Number.isFinite(options.agentCount) || options.agentCount < 1) {
    throw new Error("--agent-count must be at least 1");
  }
  if (!options.agentPrefix.trim()) {
    throw new Error("--agent-prefix is required");
  }
  return options;
}

function resolveApiKey(options) {
  if (options.apiKey.trim()) {
    return options.apiKey.trim();
  }
  return fs.readFileSync(path.resolve(packageRoot, options.apiKeyFile), "utf8").trim();
}

function runToken() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "T");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function renderScenario(content, baseUrl) {
  return content.replace(/`http:\/\/127\.0\.0\.1:8000`/g, `\`${baseUrl}\``);
}

function commandGuide(baseUrl, defaultUsername) {
  return `# OAR Command Guide

Use these exact command shapes. Prefer them over guessing.

Base URL:
- ${baseUrl}

Auth:
- Show auth subcommands: \`oar auth\`
- Register default profile: \`oar auth register --username ${defaultUsername}\`
- Verify current profile: \`oar auth whoami\`

Read workflow state:
- List threads: \`oar threads list\`
- Read thread: \`oar threads get --thread-id <thread-id>\`
- Read thread context: \`oar threads context --thread-id <thread-id>\`
- List inbox items: \`oar inbox list\`
- List artifacts: \`oar artifacts list --thread-id <thread-id>\`
- Read artifact metadata: \`oar artifacts get --artifact-id <artifact-id>\`
- Read artifact content: \`oar artifacts content --artifact-id <artifact-id>\`

Write workflow state:
- Edit \`event-template.json\` in place, then create the event: \`oar events create --from-file event-template.json\`

Working event type for this scenario:
- \`actor_statement\`

Minimal event JSON shape:
\`\`\`json
{
  "event": {
    "type": "actor_statement",
    "thread_id": "<thread-id>",
    "refs": [
      "thread:<thread-id>"
    ],
    "summary": "Operational recommendation for lemon supply disruption",
    "payload": {
      "recommendation": "Place emergency order with backup supplier and throttle menu exposure.",
      "confidence": "medium"
    },
    "provenance": {
      "sources": [
        "inferred"
      ]
    }
  }
}
\`\`\`
`;
}

function eventTemplate(targets) {
  const threadId = targets?.thread?.id ?? "<thread-id>";
  const refs = [`thread:${threadId}`];
  if (targets?.artifact?.id) {
    refs.push(`artifact:${targets.artifact.id}`);
  }
  if (targets?.commitment?.id) {
    refs.push(`commitment:${targets.commitment.id}`);
  }
  return `{
  "event": {
    "type": "actor_statement",
    "thread_id": "${threadId}",
    "refs": ${JSON.stringify(refs, null, 6)},
    "summary": "Operational recommendation for lemon supply disruption",
    "payload": {
      "recommendation": "Replace this with a concrete recommendation grounded in the thread and artifacts.",
      "evidence": [
        "Replace with concrete evidence."
      ]
    },
    "provenance": {
      "sources": [
        "inferred"
      ]
    }
  }
}
`;
}

function resultTemplate() {
  return `# Result

## Summary

## OAR Commands Attempted

## Friction

## Concrete Suggestions
`;
}

function valueFrom(object, ...keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

async function apiJSON(baseUrl, apiPath) {
  const response = await fetch(`${baseUrl}${apiPath}`);
  if (!response.ok) {
    throw new Error(`GET ${apiPath} failed with status ${response.status}`);
  }
  return response.json();
}

async function resolveScenarioTargets(baseUrl) {
  const threadsResponse = await apiJSON(baseUrl, "/threads");
  const threads = Array.isArray(threadsResponse?.threads) ? threadsResponse.threads : [];
  const thread = threads.find((candidate) => valueFrom(candidate, "title", "summary") === "Emergency: Lemon Supply Disruption");
  if (!thread?.id) {
    throw new Error("failed to resolve target thread");
  }

  const artifactsResponse = await apiJSON(baseUrl, `/artifacts?thread_id=${encodeURIComponent(thread.id)}`);
  const artifacts = Array.isArray(artifactsResponse?.artifacts) ? artifactsResponse.artifacts : [];
  const artifact = artifacts.find((candidate) => {
    const id = valueFrom(candidate, "id");
    const summary = valueFrom(candidate, "summary", "title");
    return id === "artifact-supplier-sla" || summary.includes("Supplier SLA");
  }) ?? null;

  const commitmentsResponse = await apiJSON(baseUrl, `/commitments?thread_id=${encodeURIComponent(thread.id)}&status=open`);
  const commitments = Array.isArray(commitmentsResponse?.commitments) ? commitmentsResponse.commitments : [];
  const commitment = commitments.find((candidate) => {
    const title = valueFrom(candidate, "title", "summary");
    return title.includes("emergency lemon restock order");
  }) ?? commitments[0] ?? null;

  const inboxResponse = await apiJSON(baseUrl, "/inbox");
  const inboxItems = Array.isArray(inboxResponse?.items) ? inboxResponse.items : [];
  const relatedInboxItems = inboxItems.filter((item) => valueFrom(item, "thread_id", "threadId") === thread.id);

  return {
    thread,
    artifact,
    commitment,
    inboxItems: relatedInboxItems,
  };
}

function targetsGuide(targets) {
  const lines = [
    "# Scenario Targets",
    "",
    "Use these resolved IDs directly. Do not spend turns rediscovering them.",
    "",
    `Target thread: ${targets.thread.id}`,
    `Target thread title: ${valueFrom(targets.thread, "title", "summary")}`,
    `Read thread: oar threads get --thread-id ${targets.thread.id}`,
    `Read thread context: oar threads context --thread-id ${targets.thread.id}`,
    `List artifacts: oar artifacts list --thread-id ${targets.thread.id}`,
    `List open commitments: oar commitments list --thread-id ${targets.thread.id} --status open`,
  ];

  if (targets.artifact?.id) {
    lines.push(
      `Key artifact: ${targets.artifact.id}`,
      `Artifact summary: ${valueFrom(targets.artifact, "summary", "title")}`,
      `Read artifact metadata: oar artifacts get --artifact-id ${targets.artifact.id}`,
      `Read artifact content: oar artifacts content --artifact-id ${targets.artifact.id}`,
    );
  }

  if (targets.commitment?.id) {
    lines.push(
      `Key commitment: ${targets.commitment.id}`,
      `Commitment title: ${valueFrom(targets.commitment, "title", "summary")}`,
    );
  }

  if (targets.inboxItems.length > 0) {
    lines.push("", "Related inbox items:");
    for (const item of targets.inboxItems) {
      lines.push(`- ${valueFrom(item, "id", "inbox_item_id")} (${valueFrom(item, "category", "kind", "type")})`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function agentRole(agentIndex) {
  const presets = [
    {
      name: "coordinator",
      focus: "Synthesize the incident context and publish a clear operational recommendation.",
    },
    {
      name: "procurement",
      focus: "Inspect supplier, pricing, and artifact evidence. Publish a procurement-specific recommendation.",
    },
    {
      name: "reviewer",
      focus: "Challenge assumptions, inspect risk, and publish a review recommendation grounded in the same thread.",
    },
  ];
  return presets[agentIndex] ?? {
    name: `analyst-${String(agentIndex + 1).padStart(2, "0")}`,
    focus: "Read the same thread carefully and publish one useful, non-duplicate actor_statement.",
  };
}

function buildGoBinary(runDir, providedPath, moduleDir, packageDir, outputName) {
  if (providedPath) {
    return path.resolve(packageRoot, providedPath);
  }
  const outPath = path.join(runDir, "bin", outputName);
  ensureDir(path.dirname(outPath));
  const result = spawnSync("go", ["build", "-o", outPath, packageDir], {
    cwd: path.join(repoRoot, moduleDir),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`failed to build ${outputName}`);
  }
  return outPath;
}

function buildOarBinary(runDir, providedPath) {
  return buildGoBinary(runDir, providedPath, "cli", "./cmd/oar", "oar");
}

function buildCoreBinary(runDir, providedPath) {
  return buildGoBinary(runDir, providedPath, "core", "./cmd/oar-core", "oar-core");
}

function piExecutable() {
  const binName = process.platform === "win32" ? "pi.cmd" : "pi";
  return path.join(packageRoot, "node_modules", ".bin", binName);
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to allocate free port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForCore(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`core did not become healthy: ${lastError}`);
}

async function seedCore(baseUrl) {
  const result = spawnSync("node", ["./web-ui/scripts/seed-core-from-mock.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      OAR_CORE_BASE_URL: baseUrl,
      OAR_FORCE_SEED: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error("failed to seed core from mock data");
  }
}

async function startManagedCore(runDir, coreBin, requestedBaseUrl) {
  if (requestedBaseUrl) {
    await waitForCore(requestedBaseUrl, 20000);
    return {
      baseUrl: requestedBaseUrl,
      stop: async () => {},
      managed: false,
      workspaceDir: "",
      logPath: "",
    };
  }

  const workspaceDir = path.join(runDir, "core-workspace");
  const logPath = path.join(runDir, "core.log");
  const schemaPath = path.join(repoRoot, "contracts", "oar-schema.yaml");
  const host = "127.0.0.1";
  const port = await findFreePort();
  const baseUrl = `http://${host}:${port}`;
  ensureDir(workspaceDir);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const child = spawn(coreBin, [
    "--host",
    host,
    "--port",
    String(port),
    "--schema-path",
    schemaPath,
    "--workspace-root",
    workspaceDir,
  ], {
    cwd: path.join(repoRoot, "core"),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    logStream.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    logStream.write(chunk);
  });

  const stop = async () => {
    if (child.exitCode !== null) {
      logStream.end();
      return;
    }
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }, 5000);
      child.on("exit", () => {
        clearTimeout(timeout);
        logStream.end();
        resolve();
      });
    });
  };

  await Promise.race([
    waitForCore(baseUrl, 20000),
    new Promise((_, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        reject(new Error(`managed core exited before ready (code=${code ?? "null"} signal=${signal ?? "none"})`));
      });
    }),
  ]);
  await seedCore(baseUrl);

  return {
    baseUrl,
    stop,
    managed: true,
    workspaceDir,
    logPath,
  };
}

function agentWorkspaceDir(runDir, agentCount, agentId) {
  if (agentCount === 1) {
    return path.join(runDir, "workspace");
  }
  return path.join(runDir, "workspace", agentId);
}

function agentEventsPath(runDir, agentCount, agentId) {
  if (agentCount === 1) {
    return path.join(runDir, "events.jsonl");
  }
  return path.join(runDir, `events-${agentId}.jsonl`);
}

function agentResultPath(workspaceDir) {
  return path.join(workspaceDir, "result.md");
}

async function runPiAgent({
  runDir,
  piHomeDir,
  oarBin,
  coreBaseUrl,
  provider,
  model,
  apiKey,
  maxSeconds,
  agentId,
  agentCount,
  agentUsername,
  scenarioMarkdown,
  role,
  targets,
}) {
  const workspaceDir = agentWorkspaceDir(runDir, agentCount, agentId);
  const eventsPath = agentEventsPath(runDir, agentCount, agentId);
  const resultPath = agentResultPath(workspaceDir);
  ensureDir(workspaceDir);

  const agentsContent = `# Pi Dogfood Run

You are evaluating the OAR CLI, not editing the repository.

Rules:
- Use the \`oar\` binary on PATH for all OAR interactions.
- Do not use \`curl\` for OAR API calls.
- Do not edit repository source files.
- Keep notes and artifacts inside the current working directory.
- Register with username \`${agentUsername}\`.
- Before finishing, write \`result.md\` containing:
  - summary
  - oar commands attempted
  - friction
  - concrete suggestions

Agent role:
- Agent id: ${agentId}
- Role: ${role.name}
- Focus: ${role.focus}

Environment:
- OAR base URL: ${coreBaseUrl}
- Working directory: ${workspaceDir}
- Scenario brief: ./SCENARIO.md
- Command guide: ./COMMANDS.md
- Scenario targets: ./TARGETS.md
- Event template: ./event-template.json
- Result template: ./result-template.md
`;
  writeFile(path.join(workspaceDir, "AGENTS.md"), agentsContent);
  writeFile(path.join(workspaceDir, "SCENARIO.md"), scenarioMarkdown);
  writeFile(path.join(workspaceDir, "COMMANDS.md"), commandGuide(coreBaseUrl, agentUsername));
  writeFile(path.join(workspaceDir, "TARGETS.md"), targetsGuide(targets));
  writeFile(path.join(workspaceDir, "event-template.json"), eventTemplate(targets));
  writeFile(path.join(workspaceDir, "result-template.md"), resultTemplate());

  const prompt = "Read SCENARIO.md, COMMANDS.md, and TARGETS.md, execute the scenario with the real oar CLI, edit event-template.json in place, create the event from that file, write result.md, and then give a short final summary.";
  const piArgs = [
    "--print",
    "--mode",
    "json",
    "--provider",
    provider,
    "--model",
    model,
    "--api-key",
    apiKey,
    "--no-session",
    "--tools",
    "read,bash,edit,write,grep,find,ls",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--append-system-prompt",
    `Use oar on PATH for OAR interactions. Do not use curl. Work only inside the current directory. Register with username ${agentUsername}.`,
    "@SCENARIO.md",
    prompt,
  ];

  const eventStream = fs.createWriteStream(eventsPath, { flags: "a" });
  const homeDir = path.join(runDir, `home-${agentId}`);
  ensureDir(homeDir);
  const env = {
    ...process.env,
    HOME: homeDir,
    PATH: `${path.dirname(oarBin)}${path.delimiter}${process.env.PATH ?? ""}`,
    PI_CODING_AGENT_DIR: path.join(piHomeDir, agentId),
    OAR_BASE_URL: coreBaseUrl,
  };
  ensureDir(env.PI_CODING_AGENT_DIR);

  return new Promise((resolve, reject) => {
    const child = spawn(piExecutable(), piArgs, {
      cwd: workspaceDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }, maxSeconds * 1000);

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      eventStream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      eventStream.end();
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      eventStream.end();
      if (signal) {
        reject(new Error(`${agentId}: pi terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${agentId}: pi exited with code ${code}`));
        return;
      }
      resolve({
        agentId,
        agentUsername,
        workspaceDir,
        eventsPath,
        resultPath,
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = resolveApiKey(options);
  const scenarioPath = path.join(packageRoot, "scenarios", `${options.scenario}.md`);
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`scenario file not found: ${scenarioPath}`);
  }

  const runId = `${options.scenario}-${runToken()}`;
  const runDir = path.join(path.resolve(options.reportDir), runId);
  const piHomeDir = path.join(runDir, "pi-home");
  ensureDir(piHomeDir);

  const oarBin = buildOarBinary(runDir, options.oarBin);
  const coreBin = buildCoreBinary(runDir, options.coreBin);
  const core = await startManagedCore(runDir, coreBin, options.baseUrl);
  const scenarioContent = fs.readFileSync(scenarioPath, "utf8");
  const renderedScenario = renderScenario(scenarioContent, core.baseUrl);
  const targets = await resolveScenarioTargets(core.baseUrl);

  console.log(`pi dogfood run: ${runId}`);
  console.log(`base url: ${core.baseUrl}`);
  console.log(`agents: ${options.agentCount}`);

  let agentRuns = [];
  try {
    const pendingAgents = Array.from({ length: options.agentCount }, (_, agentIndex) => {
      const agentId = `agent-${String(agentIndex + 1).padStart(2, "0")}`;
      const role = agentRole(agentIndex);
      const agentUsername = `${options.agentPrefix}-${role.name}`;
      return runPiAgent({
        runDir,
        piHomeDir,
        oarBin,
        coreBaseUrl: core.baseUrl,
        provider: options.provider,
        model: options.model,
        apiKey,
        maxSeconds: options.maxSeconds,
        agentId,
        agentCount: options.agentCount,
        agentUsername,
        scenarioMarkdown: renderedScenario,
        role,
        targets,
      });
    });
    const settled = await Promise.allSettled(pendingAgents);
    agentRuns = settled.map((result, index) => {
      if (result.status === "fulfilled") {
        return { status: "ok", ...result.value };
      }
      return {
        status: "failed",
        agentId: `agent-${String(index + 1).padStart(2, "0")}`,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });
    const failedAgents = agentRuns.filter((agent) => agent.status !== "ok");
    if (failedAgents.length > 0) {
      throw new Error(`pi dogfood failed for ${failedAgents.map((agent) => `${agent.agentId}: ${agent.error}`).join(", ")}`);
    }
  } finally {
    await core.stop();
  }

  const metadata = {
    run_id: runId,
    scenario: options.scenario,
    provider: options.provider,
    model: options.model,
    base_url: core.baseUrl,
    managed_core: core.managed,
    core_workspace_dir: core.workspaceDir,
    core_log_path: core.logPath,
    agent_count: options.agentCount,
    targets,
    agents: agentRuns,
    oar_bin: oarBin,
    core_bin: coreBin,
  };
  writeFile(path.join(runDir, "run-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

  for (const agent of agentRuns) {
    if (agent.status !== "ok") {
      continue;
    }
    console.log(`workspace (${agent.agentId}): ${agent.workspaceDir}`);
    console.log(`events (${agent.agentId}): ${agent.eventsPath}`);
    if (fs.existsSync(agent.resultPath)) {
      console.log(`result (${agent.agentId}): ${agent.resultPath}`);
    } else {
      console.log(`warning: ${agent.agentId} did not write result.md`);
    }
  }
  console.log(`metadata: ${path.join(runDir, "run-metadata.json")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
