import { describe, it, expect } from "vitest";
import {
  loadProjectCatalog,
  toPublicProjectCatalog,
} from "$lib/server/projectCatalog";

describe("projectCatalog", () => {
  describe("loadProjectCatalog", () => {
    it("should parse OAR_DEV_ACTOR_MODE=true", () => {
      const env = {
        OAR_DEV_ACTOR_MODE: "true",
      };
      const catalog = loadProjectCatalog(env);
      expect(catalog.devActorMode).toBe(true);
    });

    it("should parse OAR_DEV_ACTOR_MODE=1", () => {
      const env = {
        OAR_DEV_ACTOR_MODE: "1",
      };
      const catalog = loadProjectCatalog(env);
      expect(catalog.devActorMode).toBe(true);
    });

    it("should treat missing OAR_DEV_ACTOR_MODE as false", () => {
      const env = {};
      const catalog = loadProjectCatalog(env);
      expect(catalog.devActorMode).toBe(false);
    });

    it("should treat OAR_DEV_ACTOR_MODE=false as false", () => {
      const env = {
        OAR_DEV_ACTOR_MODE: "false",
      };
      const catalog = loadProjectCatalog(env);
      expect(catalog.devActorMode).toBe(false);
    });
  });

  describe("toPublicProjectCatalog", () => {
    it("should expose devActorMode in public catalog", () => {
      const catalog = {
        defaultProject: { slug: "test", label: "Test", description: "" },
        projects: [{ slug: "test", label: "Test", description: "" }],
        projectBySlug: new Map(),
        devActorMode: true,
      };
      const publicCatalog = toPublicProjectCatalog(catalog);
      expect(publicCatalog.devActorMode).toBe(true);
    });

    it("should default devActorMode to false when not set", () => {
      const catalog = {
        defaultProject: { slug: "test", label: "Test", description: "" },
        projects: [{ slug: "test", label: "Test", description: "" }],
        projectBySlug: new Map(),
      };
      const publicCatalog = toPublicProjectCatalog(catalog);
      expect(publicCatalog.devActorMode).toBe(false);
    });
  });
});
