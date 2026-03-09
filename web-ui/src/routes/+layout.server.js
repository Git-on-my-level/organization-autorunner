import {
  loadProjectCatalog,
  toPublicProjectCatalog,
} from "$lib/server/projectCatalog";

export function load() {
  return toPublicProjectCatalog(loadProjectCatalog());
}
