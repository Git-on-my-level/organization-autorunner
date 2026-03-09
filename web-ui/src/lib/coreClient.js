import { browser } from "$app/environment";
import {
  createAuthTokenProvider,
  getAuthenticatedActorId,
} from "$lib/authSession";
import { getSelectedActorId } from "$lib/actorSession";
import { createOarCoreClient } from "$lib/oarCoreClient";
import { getCurrentProjectSlug } from "$lib/projectContext";
import { PROJECT_HEADER } from "$lib/projectPaths";

let browserClient;

function resolveBrowserClient() {
  if (!browser) {
    throw new Error(
      "coreClient cannot run during SSR. Use onMount or a load-scoped client created with createOarCoreClient({ fetchFn: fetch }).",
    );
  }

  if (!browserClient) {
    const fetchFn = globalThis.fetch.bind(globalThis);
    browserClient = createOarCoreClient({
      actorIdProvider: () => getAuthenticatedActorId() || getSelectedActorId(),
      lockActorIdProvider: () => Boolean(getAuthenticatedActorId()),
      tokenProvider: createAuthTokenProvider(fetchFn, {
        projectSlugProvider: () => getCurrentProjectSlug(),
      }),
      requestContextHeadersProvider: () => ({
        [PROJECT_HEADER]: getCurrentProjectSlug(),
      }),
      fetchFn,
    });
  }

  return browserClient;
}

export const coreClient = new Proxy(
  {},
  {
    get(_target, property) {
      const client = resolveBrowserClient();
      const value = client[property];

      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);
