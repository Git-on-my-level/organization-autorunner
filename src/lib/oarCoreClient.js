import { EXPECTED_SCHEMA_VERSION, oarCoreBaseUrl } from "$lib/config";

function encodePathSegment(value) {
  return encodeURIComponent(String(value));
}

function appendQuery(path, query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params.set(key, String(value));
  });

  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function toAbsoluteUrl(baseUrl, pathWithQuery) {
  if (!baseUrl) {
    return pathWithQuery;
  }

  return new URL(pathWithQuery, `${baseUrl}/`).toString();
}

export function createOarCoreClient(options = {}) {
  const baseUrl = options.baseUrl ?? oarCoreBaseUrl;
  const fetchFn = options.fetchFn ?? fetch;

  async function request(method, path, config = {}) {
    const pathWithQuery = appendQuery(path, config.query);
    const url = toAbsoluteUrl(baseUrl, pathWithQuery);

    const headers = {
      accept: "application/json",
      ...config.headers,
    };

    let body;
    if (config.body !== undefined) {
      body = JSON.stringify(config.body);
      headers["content-type"] = "application/json";
    }

    const response = await fetchFn(url, { method, headers, body });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const detailSuffix = details ? ` - ${details}` : "";
      throw new Error(
        `oar-core request failed: ${method} ${path} (${response.status} ${response.statusText})${detailSuffix}`,
      );
    }

    if (config.responseType === "raw") {
      return response;
    }

    return response.json();
  }

  return {
    baseUrl,
    getVersion: () => request("GET", "/version"),

    createActor: (payload) => request("POST", "/actors", { body: payload }),
    listActors: () => request("GET", "/actors"),

    createThread: (payload) => request("POST", "/threads", { body: payload }),
    listThreads: (filters) => request("GET", "/threads", { query: filters }),
    getThread: (threadId) =>
      request("GET", `/threads/${encodePathSegment(threadId)}`),
    updateThread: (threadId, payload) =>
      request("PATCH", `/threads/${encodePathSegment(threadId)}`, {
        body: payload,
      }),
    listThreadTimeline: (threadId) =>
      request("GET", `/threads/${encodePathSegment(threadId)}/timeline`),

    createArtifact: (payload) =>
      request("POST", "/artifacts", { body: payload }),
    listArtifacts: (filters) =>
      request("GET", "/artifacts", { query: filters }),
    getArtifact: (artifactId) =>
      request("GET", `/artifacts/${encodePathSegment(artifactId)}`),
    getArtifactContent: async (artifactId) => {
      const response = await request(
        "GET",
        `/artifacts/${encodePathSegment(artifactId)}/content`,
        { responseType: "raw" },
      );

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        return { contentType, content: await response.json() };
      }

      if (contentType.startsWith("text/")) {
        return { contentType, content: await response.text() };
      }

      return { contentType, content: await response.arrayBuffer() };
    },

    createEvent: (payload) => request("POST", "/events", { body: payload }),
    getEvent: (eventId) =>
      request("GET", `/events/${encodePathSegment(eventId)}`),

    createWorkOrder: (payload) =>
      request("POST", "/work_orders", { body: payload }),
    createReceipt: (payload) => request("POST", "/receipts", { body: payload }),
    createReview: (payload) => request("POST", "/reviews", { body: payload }),

    listInboxItems: () => request("GET", "/inbox"),
    ackInboxItem: (payload) => request("POST", "/inbox/ack", { body: payload }),
  };
}

export async function verifyCoreSchemaVersion(
  client,
  expectedSchemaVersion = EXPECTED_SCHEMA_VERSION,
) {
  const target = client.baseUrl || "same-origin";

  let version;
  try {
    version = await client.getVersion();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to verify oar-core schema version at ${target}: ${reason}`,
    );
  }

  if (version?.schema_version !== expectedSchemaVersion) {
    throw new Error(
      `oar-core schema mismatch at ${target}: expected ${expectedSchemaVersion}, received ${version?.schema_version ?? "unknown"}.`,
    );
  }
}
