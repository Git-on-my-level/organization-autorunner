import { describe, expect, it } from "vitest";

import { resolveProxyProjectTarget } from "../../src/lib/server/proxyProjectTarget.js";

function buildCatalog() {
  const defaultProject = {
    slug: "alpha",
    label: "Alpha",
    coreBaseUrl: "http://127.0.0.1:8000/",
  };
  const projectBySlug = new Map([[defaultProject.slug, defaultProject]]);
  return {
    defaultProject,
    projects: [defaultProject],
    projectBySlug,
  };
}

describe("resolveProxyProjectTarget", () => {
  it("rejects proxied requests that omit the project header", () => {
    const result = resolveProxyProjectTarget({
      catalog: buildCatalog(),
      projectSlug: "",
    });

    expect(result).toMatchObject({
      status: 400,
      payload: {
        error: {
          code: "project_header_required",
        },
      },
    });
  });

  it("rejects unknown project slugs", () => {
    const result = resolveProxyProjectTarget({
      catalog: buildCatalog(),
      projectSlug: "beta",
    });

    expect(result).toMatchObject({
      status: 404,
      payload: {
        error: {
          code: "project_not_configured",
        },
      },
    });
  });

  it("returns the normalized upstream for a configured project", () => {
    const result = resolveProxyProjectTarget({
      catalog: buildCatalog(),
      projectSlug: "alpha",
    });

    expect(result).toMatchObject({
      project: {
        slug: "alpha",
      },
      coreBaseUrl: "http://127.0.0.1:8000",
    });
  });
});
