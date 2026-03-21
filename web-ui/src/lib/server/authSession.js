import { json } from "@sveltejs/kit";

import { buildProxyRequestInit } from "./coreProxy.js";
import { loadWorkspaceCatalog } from "./workspaceCatalog.js";
import {
  DEFAULT_WORKSPACE_SLUG,
  WORKSPACE_HEADER,
  normalizeWorkspaceSlug,
} from "../workspacePaths.js";
import { getWorkspaceHeader } from "../compat/workspaceCompat.js";

const sessionStateByWorkspace = new Map();

function getWorkspaceSlug(value) {
  return normalizeWorkspaceSlug(value) || DEFAULT_WORKSPACE_SLUG;
}

export function getAuthSessionCookieName(workspaceSlug) {
  return `oar_ui_session_${getWorkspaceSlug(workspaceSlug)}`;
}

function isSecureCookieRequest(event) {
  return event.url.protocol === "https:";
}

function buildAuthSessionCookieOptions(event) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookieRequest(event),
    path: "/",
  };
}

function readJSONPayload(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createRequestError(status, payload) {
  const message =
    payload?.error?.message || payload?.message || `request failed (${status})`;
  const error = new Error(message);
  error.status = status;
  error.details = payload;
  return error;
}

async function requestCoreJSON(coreBaseUrl, pathname, options = {}) {
  const url = new URL(pathname, `${coreBaseUrl}/`).toString();
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = readJSONPayload(await response.text());
  if (!response.ok) {
    throw createRequestError(response.status, payload);
  }

  return payload;
}

function getWorkspaceState(workspaceSlug) {
  const slug = getWorkspaceSlug(workspaceSlug);
  if (!sessionStateByWorkspace.has(slug)) {
    sessionStateByWorkspace.set(slug, {
      refreshToken: "",
      accessToken: "",
      agent: null,
    });
  }

  return sessionStateByWorkspace.get(slug);
}

export function getWorkspaceAuthSession(workspaceSlug) {
  const state = sessionStateByWorkspace.get(getWorkspaceSlug(workspaceSlug));
  if (!state) {
    return null;
  }

  return {
    refreshToken: state.refreshToken,
    accessToken: state.accessToken,
    agent: state.agent,
  };
}

export function clearWorkspaceAuthSession(workspaceSlug) {
  sessionStateByWorkspace.delete(getWorkspaceSlug(workspaceSlug));
}

export function readWorkspaceRefreshToken(event, workspaceSlug) {
  return event.cookies.get(getAuthSessionCookieName(workspaceSlug)) ?? "";
}

export function writeWorkspaceRefreshToken(event, workspaceSlug, refreshToken) {
  const normalized = String(refreshToken ?? "").trim();
  if (!normalized) {
    clearWorkspaceRefreshToken(event, workspaceSlug);
    return;
  }

  event.cookies.set(
    getAuthSessionCookieName(workspaceSlug),
    normalized,
    buildAuthSessionCookieOptions(event),
  );
}

export function clearWorkspaceRefreshToken(event, workspaceSlug) {
  event.cookies.delete(getAuthSessionCookieName(workspaceSlug), {
    path: "/",
  });
}

export function resolveWorkspaceSlugFromEvent(event) {
  const catalog = loadWorkspaceCatalog();
  const headerSlug = getWorkspaceHeader(event.request.headers);
  const rawSlug = headerSlug || event.params?.workspace || "";
  const workspaceSlug = getWorkspaceSlug(rawSlug);

  if (!catalog.workspaceBySlug.has(workspaceSlug)) {
    return {
      catalog,
      workspaceSlug,
      workspace: null,
      coreBaseUrl: "",
      error: {
        status: 404,
        payload: {
          error: {
            code: "workspace_not_configured",
            message: `Workspace '${String(rawSlug ?? "").trim()}' is not configured in OAR_WORKSPACES.`,
          },
        },
      },
    };
  }

  const workspace = catalog.workspaceBySlug.get(workspaceSlug);
  return {
    catalog,
    workspaceSlug,
    workspace,
    coreBaseUrl: workspace.coreBaseUrl,
    error: null,
  };
}

export async function refreshWorkspaceAuthSession({
  event,
  workspaceSlug,
  coreBaseUrl,
}) {
  if (!coreBaseUrl) {
    return null;
  }

  const refreshToken = readWorkspaceRefreshToken(event, workspaceSlug);
  if (!refreshToken) {
    clearWorkspaceAuthSession(workspaceSlug);
    return null;
  }

  const tokenResponse = await requestCoreJSON(coreBaseUrl, "/auth/token", {
    method: "POST",
    body: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });

  const nextTokens = tokenResponse.tokens ?? {};
  const nextRefreshToken =
    String(nextTokens.refresh_token ?? "").trim() || refreshToken;
  const accessToken = String(nextTokens.access_token ?? "").trim();

  if (!accessToken) {
    throw createRequestError(502, {
      message: "oar-core returned an empty access token.",
    });
  }

  const state = getWorkspaceState(workspaceSlug);
  state.refreshToken = nextRefreshToken;
  state.accessToken = accessToken;
  state.agent = null;

  if (nextRefreshToken !== refreshToken) {
    writeWorkspaceRefreshToken(event, workspaceSlug, nextRefreshToken);
  }

  return {
    refreshToken: nextRefreshToken,
    accessToken,
  };
}

export async function loadWorkspaceAuthenticatedAgent({
  event,
  workspaceSlug,
  coreBaseUrl,
}) {
  if (!coreBaseUrl) {
    return null;
  }

  const state = getWorkspaceState(workspaceSlug);
  const refreshToken = readWorkspaceRefreshToken(event, workspaceSlug);

  if (!refreshToken) {
    clearWorkspaceAuthSession(workspaceSlug);
    return null;
  }

  if (state.refreshToken !== refreshToken) {
    state.refreshToken = refreshToken;
    state.accessToken = "";
    state.agent = null;
  }

  async function fetchCurrentAgent() {
    if (!state.accessToken) {
      await refreshWorkspaceAuthSession({
        event,
        workspaceSlug,
        coreBaseUrl,
      });
    }

    if (!state.accessToken) {
      return null;
    }

    const agentResponse = await requestCoreJSON(coreBaseUrl, "/agents/me", {
      token: state.accessToken,
    });

    state.agent = agentResponse.agent ?? null;
    return state.agent;
  }

  try {
    return await fetchCurrentAgent();
  } catch (error) {
    if (error?.status !== 401) {
      throw error;
    }

    await refreshWorkspaceAuthSession({
      event,
      workspaceSlug,
      coreBaseUrl,
    });
    if (!state.accessToken) {
      return null;
    }

    const agentResponse = await requestCoreJSON(coreBaseUrl, "/agents/me", {
      token: state.accessToken,
    });
    state.agent = agentResponse.agent ?? null;
    return state.agent;
  }
}

export async function handleWorkspaceAuthVerifyResponse({
  event,
  workspaceSlug,
  upstreamResponse,
}) {
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-encoding");

  const payload = readJSONPayload(
    await upstreamResponse.text().catch(() => ""),
  );
  if (!upstreamResponse.ok) {
    return new Response(JSON.stringify(payload), {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: {
        ...Object.fromEntries(responseHeaders.entries()),
        "cache-control": "no-store",
      },
    });
  }

  const tokens = payload.tokens ?? {};
  const refreshToken = String(tokens.refresh_token ?? "").trim();
  const accessToken = String(tokens.access_token ?? "").trim();
  const agent = payload.agent ?? null;

  if (refreshToken) {
    writeWorkspaceRefreshToken(event, workspaceSlug, refreshToken);
  }

  const state = getWorkspaceState(workspaceSlug);
  state.refreshToken = refreshToken || state.refreshToken;
  state.accessToken = accessToken || state.accessToken;
  state.agent = agent;

  const sanitizedPayload = {
    agent,
  };

  return json(sanitizedPayload, {
    status: upstreamResponse.status,
    headers: {
      ...Object.fromEntries(responseHeaders.entries()),
      "cache-control": "no-store",
    },
  });
}

export async function proxyWorkspaceAuthVerify({
  event,
  workspaceSlug,
  coreBaseUrl,
  pathname,
}) {
  const targetUrl = new URL(pathname, `${coreBaseUrl}/`).toString();
  const requestInit = buildProxyRequestInit(event);
  requestInit.headers.delete("cookie");
  requestInit.headers.delete("authorization");
  requestInit.headers.delete(WORKSPACE_HEADER);

  const upstreamResponse = await fetch(targetUrl, requestInit);
  return handleWorkspaceAuthVerifyResponse({
    event,
    workspaceSlug,
    upstreamResponse,
  });
}
