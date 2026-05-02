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
    };
    const { name, templateId } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    const result = await adapter.createProject({ name: name.trim(), templateId: templateId ?? "blank" });
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

  // Project file tree
  api.get("/projects/:id", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const files = walkDir(project.dir);
    return c.json({ id: project.id, files });
  });
}
