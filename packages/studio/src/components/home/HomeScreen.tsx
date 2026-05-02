import { useState, useEffect } from "react";
import { NewProjectModal } from "./NewProjectModal";

interface Project {
  id: string;
  title?: string;
}

interface HomeScreenProps {
  onOpenProject: (id: string) => void;
}

function formatId(id: string): string {
  return id.replace(/-[a-z0-9]{4}$/, "").replace(/-/g, " ");
}

export function HomeScreen({ onOpenProject }: HomeScreenProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchProjects = () => {
    setLoading(true);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: { projects?: Project[] }) => {
        setProjects(data.projects ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (name: string, templateId: string) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, templateId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error((err as { error?: string }).error ?? "Failed to create project");
    }
    const data = (await res.json()) as { id: string };
    setShowNewModal(false);
    onOpenProject(data.id);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-neutral-950 text-neutral-100">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-6 border-b border-neutral-800/60 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-studio-accent">
            <path d="M5 3l14 9-14 9V3z" fill="currentColor" />
          </svg>
          <span className="text-sm font-semibold text-neutral-100 tracking-tight">HyperFrames Studio</span>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="h-7 flex items-center gap-1.5 px-3 rounded-md bg-studio-accent text-white text-[11px] font-semibold hover:opacity-90 transition-opacity"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Project
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-4 h-4 rounded-full bg-studio-accent animate-pulse" />
          </div>
        ) : projects.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-12 h-12 rounded-xl bg-neutral-800/60 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-600">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M12 12v6M9 15h6" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-neutral-300">No projects yet</p>
              <p className="text-[12px] text-neutral-600 mt-1">Create your first project to get started</p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="h-8 flex items-center gap-1.5 px-4 rounded-md bg-studio-accent text-white text-[12px] font-semibold hover:opacity-90 transition-opacity"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Project
            </button>
          </div>
        ) : (
          /* Project grid */
          <div>
            <h2 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-3">Projects</h2>
            <div className="grid grid-cols-3 gap-3 max-w-4xl">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative flex flex-col rounded-lg border border-neutral-800/60 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900 transition-all overflow-hidden cursor-pointer"
                  onClick={() => onOpenProject(project.id)}
                  onKeyDown={(e) => e.key === "Enter" && onOpenProject(project.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open project ${project.title ?? project.id}`}
                >
                  {/* Thumbnail placeholder */}
                  <div className="w-full bg-neutral-800/40 flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-neutral-700">
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="px-3 py-2.5">
                    <p className="text-[12px] font-medium text-neutral-200 truncate capitalize">
                      {project.title ?? formatId(project.id)}
                    </p>
                    <p className="text-[10px] text-neutral-600 mt-0.5 font-mono truncate">{project.id}</p>
                  </div>

                  {/* Delete button — appears on hover */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(project.id);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded bg-neutral-900/80 text-neutral-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-neutral-800 transition-all"
                    title="Delete project"
                    aria-label="Delete project"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-neutral-100">Delete project?</h3>
            <p className="text-[12px] text-neutral-400 mt-1.5">
              This will permanently delete <span className="font-medium text-neutral-300">{confirmDelete}</span> and all its files. This cannot be undone.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="h-7 px-3 rounded-md text-[11px] font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete}
                className="h-7 px-3 rounded-md text-[11px] font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {deleting === confirmDelete ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New project modal */}
      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
