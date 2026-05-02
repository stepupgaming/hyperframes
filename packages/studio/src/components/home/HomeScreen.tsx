import { useState, useEffect, useRef, useCallback } from "react";
import { NewProjectModal } from "./NewProjectModal";

interface Project {
  id: string;
  title?: string;
}

interface HomeScreenProps {
  onOpenProject: (id: string) => void;
}

function formatId(id: string): string {
  return id
    .replace(/-[a-z0-9]{4}$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayName(project: Project): string {
  return project.title && project.title !== project.id
    ? project.title
    : formatId(project.id);
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
  onRename,
  onDuplicate,
}: {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onDuplicate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(displayName(project));
  const [thumbError, setThumbError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const thumbUrl = `/api/projects/${project.id}/thumbnail/index.html?t=0.5&w=640&h=360`;

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftName(displayName(project));
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const commitEdit = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== displayName(project)) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftName(displayName(project));
    setEditing(false);
  };

  return (
    <div
      className="group relative flex flex-col rounded-lg border border-neutral-800/60 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900 transition-all overflow-hidden cursor-pointer"
      onClick={() => !editing && onOpen()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !editing) onOpen();
      }}
      tabIndex={editing ? -1 : 0}
      role="button"
      aria-label={`Open project ${displayName(project)}`}
    >
      {/* Thumbnail */}
      <div
        className="w-full bg-neutral-800/40 flex items-center justify-center relative overflow-hidden"
        style={{ aspectRatio: "16/9" }}
      >
        {!thumbError ? (
          <img
            src={thumbUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setThumbError(true)}
            loading="lazy"
          />
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            className="text-neutral-700"
          >
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-[12px] font-medium bg-neutral-800 border border-studio-accent/60 rounded px-1.5 py-0.5 text-neutral-100 focus:outline-none"
          />
        ) : (
          <p
            className="text-[12px] font-medium text-neutral-200 truncate"
            onDoubleClick={startEdit}
            title="Double-click to rename"
          >
            {displayName(project)}
          </p>
        )}
        <p className="text-[10px] text-neutral-600 mt-0.5 font-mono truncate">{project.id}</p>
      </div>

      {/* Action buttons — shown on hover */}
      {!editing && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Rename */}
          <button
            type="button"
            onClick={startEdit}
            className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900/80 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title="Rename project"
            aria-label="Rename project"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
          {/* Duplicate */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900/80 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title="Duplicate project"
            aria-label="Duplicate project"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          {/* Export ZIP */}
          <a
            href={`/api/projects/${project.id}/export.zip`}
            download
            onClick={(e) => e.stopPropagation()}
            className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900/80 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title="Export as ZIP"
            aria-label="Export project as ZIP"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
          {/* Delete */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900/80 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
            title="Delete project"
            aria-label="Delete project"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export function HomeScreen({ onOpenProject }: HomeScreenProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const fetchProjects = useCallback(() => {
    setLoading(true);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: { projects?: Project[] }) => {
        setProjects(data.projects ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (name: string, templateId: string, format: string, description?: string) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, templateId, format, description }),
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

  const handleRename = async (id: string, title: string) => {
    try {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, title } : p)),
      );
    } catch {
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicating(id);
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error("Duplicate failed");
      fetchProjects();
    } catch {
    } finally {
      setDuplicating(null);
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
          <span className="text-sm font-semibold text-neutral-100 tracking-tight">
            HyperFrames Studio
          </span>
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
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-12 h-12 rounded-xl bg-neutral-800/60 flex items-center justify-center">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-neutral-600"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M12 12v6M9 15h6" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-neutral-300">No projects yet</p>
              <p className="text-[12px] text-neutral-600 mt-1">
                Create your first project to get started
              </p>
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
          <div>
            <h2 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-3">
              Projects
            </h2>
            <div className="grid grid-cols-3 gap-3 max-w-4xl">
              {projects.map((project) => (
                <div key={project.id} className="relative">
                  <ProjectCard
                    project={project}
                    onOpen={() => onOpenProject(project.id)}
                    onDelete={() => setConfirmDelete(project.id)}
                    onRename={(title) => void handleRename(project.id, title)}
                    onDuplicate={() => void handleDuplicate(project.id)}
                  />
                  {duplicating === project.id && (
                    <div className="absolute inset-0 rounded-lg bg-neutral-900/70 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full border-2 border-studio-accent border-t-transparent animate-spin" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-neutral-100">Delete project?</h3>
            <p className="text-[12px] text-neutral-400 mt-1.5">
              This will permanently delete{" "}
              <span className="font-medium text-neutral-300">
                {displayName(projects.find((p) => p.id === confirmDelete) ?? { id: confirmDelete })}
              </span>{" "}
              and all its files. This cannot be undone.
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
