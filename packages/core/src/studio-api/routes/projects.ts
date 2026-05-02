import type { Hono } from "hono";
import type { StudioApiAdapter } from "../types.js";
import { walkDir } from "../helpers/safePath.js";

export function registerProjectRoutes(api: Hono, adapter: StudioApiAdapter): void {
  // List all templates available for new project creation
  api.get("/templates", async (c) => {
    if (!adapter.listTemplates) return c.json({ templates: [] });
    const templates = await adapter.listTemplates();
    return c.json({ templates });
  });

  // List all projects
  api.get("/projects", async (c) => {
    const projects = await adapter.listProjects();
    return c.json({ projects });
  });

  // Create a new project from a template
  api.post("/projects", async (c) => {
    if (!adapter.createProject) return c.json({ error: "not supported" }, 501);
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      templateId?: string;
      format?: string;
    };
    const { name, templateId, format } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    const result = await adapter.createProject({
      name: name.trim(),
      templateId: templateId ?? "blank",
      format,
    });
    return c.json(result, 201);
  });

  // Delete a project
  api.delete("/projects/:id", async (c) => {
    if (!adapter.deleteProject) return c.json({ error: "not supported" }, 501);
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    await adapter.deleteProject(c.req.param("id"));
    return c.json({ success: true });
  });

  // Resolve session to project (multi-project mode)
  api.get("/resolve-session/:sessionId", async (c) => {
    if (!adapter.resolveSession) {
      return c.json({ error: "not available" }, 404);
    }
    const { sessionId } = c.req.param();
    const result = await adapter.resolveSession(sessionId);
    if (!result) return c.json({ error: "Session not found" }, 404);
    return c.json(result);
  });

  // Rename a project (updates its meta.json title)
  api.patch("/projects/:id", async (c) => {
    if (!adapter.renameProject) return c.json({ error: "not supported" }, 501);
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { title?: string };
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return c.json({ error: "title is required" }, 400);
    }
    await adapter.renameProject(c.req.param("id"), body.title.trim());
    return c.json({ success: true });
  });

  // Project file tree
  api.get("/projects/:id", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    // Exclude studio-internal files from the editor tree
    const HIDDEN_FILES = new Set(["meta.json"]);
    const files = walkDir(project.dir).filter((f) => !HIDDEN_FILES.has(f));
    return c.json({ id: project.id, files });
  });
}
