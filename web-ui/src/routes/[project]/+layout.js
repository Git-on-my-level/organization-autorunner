import {
  createOarCoreClient,
  verifyCoreSchemaVersion,
} from "$lib/oarCoreClient";
import { PROJECT_HEADER } from "$lib/projectPaths";

const schemaCheckPromises = new Map();

export async function load({ fetch, data }) {
  const projectSlug = data.project?.slug ?? "";
  if (!projectSlug) {
    return;
  }

  if (!schemaCheckPromises.has(projectSlug)) {
    const client = createOarCoreClient({
      fetchFn: fetch,
      requestContextHeadersProvider: () => ({
        [PROJECT_HEADER]: projectSlug,
      }),
    });
    const promise = verifyCoreSchemaVersion(client).catch((error) => {
      schemaCheckPromises.delete(projectSlug);
      throw error;
    });
    schemaCheckPromises.set(projectSlug, promise);
  }

  await schemaCheckPromises.get(projectSlug);
}
