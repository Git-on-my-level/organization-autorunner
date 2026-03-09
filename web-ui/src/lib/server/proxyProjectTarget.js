import { normalizeBaseUrl } from "../config.js";
import { PROJECT_HEADER } from "../projectPaths.js";

export function resolveProxyProjectTarget({ catalog, projectSlug }) {
  const slug = String(projectSlug ?? "").trim();
  if (!slug) {
    return {
      status: 400,
      payload: {
        error: {
          code: "project_header_required",
          message: `Missing ${PROJECT_HEADER} header on proxied request.`,
        },
      },
    };
  }

  const project = catalog.projectBySlug.get(slug);
  if (!project) {
    return {
      status: 404,
      payload: {
        error: {
          code: "project_not_configured",
          message: `Project '${slug}' is not configured in OAR_PROJECTS.`,
        },
      },
    };
  }

  return {
    project,
    coreBaseUrl: normalizeBaseUrl(project.coreBaseUrl),
  };
}
