#!/usr/bin/env node

import { getMockSeedData } from "../src/lib/mockCoreData.js";

const coreBaseUrl = normalizeBaseUrl(
  process.env.OAR_CORE_BASE_URL ?? "http://127.0.0.1:8000",
);
const forceSeed = process.env.OAR_FORCE_SEED === "1";
const skipIfPresent = process.env.OAR_SEED_SKIP_IF_PRESENT !== "0";
const waitTimeoutMs = Number(process.env.OAR_CORE_WAIT_TIMEOUT_MS ?? 20000);

if (!coreBaseUrl) {
  fail("OAR_CORE_BASE_URL must be set or defaultable.");
}

const seed = getMockSeedData();
const defaultActorId = seed.actors[0]?.id ?? "actor-ops-ai";

const threadIdMap = new Map();
const snapshotIdMap = new Map();

main().catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  fail(reason);
});

async function main() {
  await waitForCore(coreBaseUrl, waitTimeoutMs);

  if (skipIfPresent && !forceSeed) {
    const alreadySeeded = await detectSeededState();
    if (alreadySeeded) {
      console.log("Seed data already present; skipping.");
      return;
    }
  }

  await seedActors();
  await seedThreads();
  await seedCommitments();
  await seedArtifacts();
  const eventStats = await seedEvents();
  await rebuildDerived();

  console.log(
    `Seed complete. Events posted=${eventStats.posted}, events skipped=${eventStats.skipped}.`,
  );
}

async function detectSeededState() {
  const [actorsBody, threadsBody] = await Promise.all([
    request("GET", "/actors"),
    request("GET", "/threads"),
  ]);

  const actorIds = new Set((actorsBody?.actors ?? []).map((actor) => actor?.id));
  const threadTitles = new Set(
    (threadsBody?.threads ?? []).map((thread) => String(thread?.title ?? "")),
  );

  return (
    actorIds.has("actor-ops-ai") &&
    threadTitles.has("Emergency: Lemon Supply Disruption")
  );
}

async function seedActors() {
  for (const actor of seed.actors) {
    const body = { actor };
    await request("POST", "/actors", body, [201, 409]);
  }
}

async function seedThreads() {
  for (const sourceThread of seed.threads) {
    const actorId = pickActorId(sourceThread.updated_by);
    const threadPayload = {
      type: sourceThread.type,
      title: sourceThread.title,
      status: sourceThread.status,
      priority: sourceThread.priority,
      tags: sourceThread.tags,
      key_artifacts: normalizeArtifactRefs(sourceThread.key_artifacts),
      cadence: sourceThread.cadence,
      current_summary: sourceThread.current_summary,
      next_actions: sourceThread.next_actions,
      next_check_in_at: sourceThread.next_check_in_at,
      provenance: sourceThread.provenance,
    };

    const response = await request("POST", "/threads", {
      actor_id: actorId,
      thread: threadPayload,
    });

    const created = response?.thread;
    const newId = String(created?.id ?? "").trim();
    if (!newId) {
      throw new Error(`Thread create returned no id for ${sourceThread.title}`);
    }

    threadIdMap.set(sourceThread.id, newId);
    snapshotIdMap.set(sourceThread.id, newId);
  }
}

async function seedCommitments() {
  for (const sourceCommitment of seed.commitments) {
    const actorId = pickActorId(sourceCommitment.updated_by);
    const newThreadId = mustMapThreadId(sourceCommitment.thread_id);

    const payload = {
      thread_id: newThreadId,
      title: sourceCommitment.title,
      owner: sourceCommitment.owner,
      due_at: sourceCommitment.due_at,
      status: sourceCommitment.status,
      definition_of_done: sourceCommitment.definition_of_done,
      links: mapRefs(sourceCommitment.links),
      provenance: sourceCommitment.provenance,
    };

    const response = await request("POST", "/commitments", {
      actor_id: actorId,
      commitment: payload,
    });

    const created = response?.commitment;
    const newId = String(created?.id ?? "").trim();
    if (!newId) {
      throw new Error(`Commitment create returned no id for ${sourceCommitment.title}`);
    }

    snapshotIdMap.set(sourceCommitment.id, newId);
  }
}

async function seedArtifacts() {
  const packetOrder = {
    work_order: 1,
    receipt: 2,
    review: 3,
  };

  const sortedArtifacts = [...seed.artifacts].sort((a, b) => {
    const aOrder = packetOrder[String(a?.kind ?? "")] ?? 0;
    const bOrder = packetOrder[String(b?.kind ?? "")] ?? 0;
    return aOrder - bOrder;
  });

  for (const sourceArtifact of sortedArtifacts) {
    const actorId = pickActorId(sourceArtifact.created_by);
    const kind = String(sourceArtifact.kind ?? "").trim();

    if (kind === "work_order") {
      await request("POST", "/work_orders", {
        actor_id: actorId,
        artifact: {
          id: sourceArtifact.id,
          kind,
          thread_id: mapThreadId(sourceArtifact.thread_id),
          summary: sourceArtifact.summary,
          refs: mapRefs(sourceArtifact.refs),
          provenance: sourceArtifact.provenance,
        },
        packet: {
          ...sourceArtifact.packet,
          thread_id: mapThreadId(sourceArtifact.packet?.thread_id),
          context_refs: mapRefs(sourceArtifact.packet?.context_refs),
        },
      });
      continue;
    }

    if (kind === "receipt") {
      await request("POST", "/receipts", {
        actor_id: actorId,
        artifact: {
          id: sourceArtifact.id,
          kind,
          thread_id: mapThreadId(sourceArtifact.thread_id),
          summary: sourceArtifact.summary,
          refs: mapRefs(sourceArtifact.refs),
          provenance: sourceArtifact.provenance,
        },
        packet: {
          ...sourceArtifact.packet,
          thread_id: mapThreadId(sourceArtifact.packet?.thread_id),
          outputs: mapRefs(sourceArtifact.packet?.outputs),
          verification_evidence: mapRefs(
            sourceArtifact.packet?.verification_evidence,
          ),
        },
      });
      continue;
    }

    if (kind === "review") {
      await request("POST", "/reviews", {
        actor_id: actorId,
        artifact: {
          id: sourceArtifact.id,
          kind,
          thread_id: mapThreadId(sourceArtifact.thread_id),
          summary: sourceArtifact.summary,
          refs: mapRefs(sourceArtifact.refs),
          provenance: sourceArtifact.provenance,
        },
        packet: {
          ...sourceArtifact.packet,
          evidence_refs: mapRefs(sourceArtifact.packet?.evidence_refs),
        },
      });
      continue;
    }

    let contentType = "structured";
    let content = {
      artifact_id: sourceArtifact.id,
      summary: sourceArtifact.summary ?? "",
    };

    if (sourceArtifact.packet && typeof sourceArtifact.packet === "object") {
      contentType = "structured";
      content = sourceArtifact.packet;
    } else if (typeof sourceArtifact.content_text === "string") {
      contentType = "text";
      content = sourceArtifact.content_text;
    }

    await request("POST", "/artifacts", {
      actor_id: actorId,
      artifact: {
        id: sourceArtifact.id,
        kind,
        thread_id: mapThreadId(sourceArtifact.thread_id),
        summary: sourceArtifact.summary,
        refs: mapRefs(sourceArtifact.refs),
        provenance: sourceArtifact.provenance,
      },
      content_type: contentType,
      content,
    });
  }
}

async function seedEvents() {
  let posted = 0;
  let skipped = 0;

  const sortedEvents = [...seed.events].sort((a, b) => {
    return String(a?.ts ?? "").localeCompare(String(b?.ts ?? ""));
  });

  for (const sourceEvent of sortedEvents) {
    const actorId = pickActorId(sourceEvent.actor_id);
    const mappedThreadId = mapThreadId(sourceEvent.thread_id);
    const payload = normalizeEventPayload(sourceEvent.type, sourceEvent.payload);
    const refs = normalizeEventRefs(
      sourceEvent.type,
      mapRefs(sourceEvent.refs),
      mappedThreadId,
    );
    const eventPayload = {
      type: sourceEvent.type,
      thread_id: mappedThreadId,
      refs,
      summary: sourceEvent.summary,
      payload,
      provenance: sourceEvent.provenance,
    };

    try {
      await request("POST", "/events", {
        actor_id: actorId,
        event: eventPayload,
      });
      posted += 1;
    } catch (error) {
      skipped += 1;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `Skipping event ${sourceEvent.id} (${sourceEvent.type}): ${reason}`,
      );
    }
  }

  return { posted, skipped };
}

async function rebuildDerived() {
  await request("POST", "/derived/rebuild", { actor_id: defaultActorId });
}

function mapThreadId(threadId) {
  const raw = String(threadId ?? "").trim();
  if (!raw) {
    return raw;
  }

  return threadIdMap.get(raw) ?? raw;
}

function mustMapThreadId(threadId) {
  const mapped = mapThreadId(threadId);
  if (!mapped) {
    throw new Error(`Missing thread mapping for ${String(threadId ?? "")}`);
  }
  return mapped;
}

function mapRef(ref) {
  const text = String(ref ?? "").trim();
  if (!text) {
    return text;
  }

  const separator = text.indexOf(":");
  if (separator <= 0) {
    return text;
  }

  const prefix = text.slice(0, separator);
  const value = text.slice(separator + 1);

  if (prefix === "thread") {
    const mapped = mapThreadId(value);
    return `${prefix}:${mapped}`;
  }

  if (prefix === "snapshot") {
    const mapped = snapshotIdMap.get(value) ?? value;
    return `${prefix}:${mapped}`;
  }

  return text;
}

function mapRefs(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((entry) => mapRef(entry)).filter(Boolean);
}

function normalizeArtifactRefs(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .map((entry) => (entry.includes(":") ? mapRef(entry) : `artifact:${entry}`));
}

function pickActorId(candidate) {
  const id = String(candidate ?? "").trim();
  return id || defaultActorId;
}

function normalizeEventPayload(type, payload) {
  const next = payload && typeof payload === "object" ? { ...payload } : {};

  if (type === "exception_raised" && !String(next.subtype ?? "").trim()) {
    next.subtype = "stale_thread";
  }
  if (
    type === "exception_raised" &&
    !String(next["subtype (e.g. stale_thread)"] ?? "").trim()
  ) {
    next["subtype (e.g. stale_thread)"] = String(next.subtype ?? "stale_thread");
  }

  return next;
}

function normalizeEventRefs(type, refs, mappedThreadId) {
  const nextRefs = Array.isArray(refs) ? [...refs] : [];

  if (type === "snapshot_updated") {
    const hasSnapshotRef = nextRefs.some((ref) => ref.startsWith("snapshot:"));
    if (!hasSnapshotRef && mappedThreadId) {
      nextRefs.push(`snapshot:${mappedThreadId}`);
    }
  }

  return nextRefs;
}

async function request(method, path, body, okStatuses = [200, 201]) {
  const response = await fetch(`${coreBaseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  const parsed = parseJson(rawText);

  if (!okStatuses.includes(response.status)) {
    const message =
      parsed?.error?.message ?? rawText ?? `${method} ${path} failed`;
    throw new Error(`${method} ${path} -> ${response.status}: ${message}`);
  }

  return parsed;
}

async function waitForCore(baseUrl, timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore until timeout.
    }

    await sleep(500);
  }

  throw new Error(
    `Timed out waiting for oar-core at ${baseUrl} after ${timeoutMs}ms.`,
  );
}

function normalizeBaseUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function parseJson(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fail(message) {
  console.error(`seed-core-from-mock failed: ${message}`);
  process.exit(1);
}
