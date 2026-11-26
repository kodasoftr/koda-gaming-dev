/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Box,
  Download,
  FileCode2,
  ImagePlus,
  Layers,
  Package,
  Pencil,
  X,
} from 'lucide-react';
import { EditorWorkspace } from './components/EditorWorkspace';
import { CppSourceViewer } from './components/CppSourceViewer';
import { ArchitectureView } from './components/ArchitectureView';
import { BuildExportView } from './components/BuildExportView';
import { ProjectHub, ProjectIconGlyph } from './components/ProjectHub';
import {
  PROJECT_ICON_OPTIONS,
  createStarterEntities,
  getDefaultDemoProjects,
  loadProjects,
  parseImportedProjectJson,
  saveProjects,
} from './utils/projectStorage';
import { INITIAL_SCRIPTS } from './utils/scriptRuntime';
import {
  DEFAULT_ANIMATOR_TRANSITIONS,
  DEFAULT_INPUT_SETTINGS,
  type KodaProject,
  type ProjectIconId,
} from './types/engine';

type ActiveTab = 'editor' | 'source' | 'architecture' | 'build';

export default function App() {
  const [projects, setProjects] = useState<KodaProject[]>(() => loadProjects());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [importError, setImportError] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const iconFileRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    if (!showIconPicker) return;
    const handleOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowIconPicker(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowIconPicker(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showIconPicker]);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const handleOpenProject = (proj: KodaProject) => {
    setImportError(null);
    setActiveProjectId(proj.id);
    setActiveTab('editor');
    setShowIconPicker(false);
  };

  const handleCreateProject = (
    name: string,
    mode: '3D' | '2D',
    iconId: ProjectIconId,
    iconColor: string
  ) => {
    const created: KodaProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      mode,
      iconId,
      iconColor,
      updatedAt: new Date().toLocaleDateString('pt-BR'),
      inputSettings: { ...DEFAULT_INPUT_SETTINGS },
      entities: createStarterEntities(mode),
      scripts: JSON.parse(JSON.stringify(INITIAL_SCRIPTS)),
      transitions: JSON.parse(JSON.stringify(DEFAULT_ANIMATOR_TRANSITIONS)),
    };
    setProjects((prev) => [created, ...prev]);
    setImportError(null);
    setActiveProjectId(created.id);
    setActiveTab('editor');
    setShowIconPicker(false);
  };

  const handleImportProjectFile = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseImportedProjectJson(text, file.name);
      setProjects((prev) => [imported, ...prev]);
      setImportError(null);
      setActiveProjectId(imported.id);
      setActiveTab('editor');
      setShowIconPicker(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao importar arquivo de projeto.';
      setImportError(msg);
    }
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
  };

  const handleUpdateProject = (updated: KodaProject) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleUploadCustomProjectIcon = (file: File) => {
    if (!activeProject) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : undefined;
      if (!dataUrl) return;
      handleUpdateProject({
        ...activeProject,
        customIconUrl: dataUrl,
        updatedAt: new Date().toLocaleDateString('pt-BR'),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadCpp = async () => {
    const res = await fetch('/engine/koda_game_dev.cpp');
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'koda_game_dev.cpp';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!activeProject) {
    return (
      <ProjectHub
        projects={projects}
        onOpenProject={handleOpenProject}
        onCreateProject={handleCreateProject}
        onImportProjectFile={handleImportProjectFile}
        onDeleteProject={handleDeleteProject}
        onRestoreDemos={() => setProjects(getDefaultDemoProjects())}
        importError={importError}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D11] text-[#E6E9EF]">
      <input
        ref={iconFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadCustomProjectIcon(f);
          e.target.value = '';
        }}
      />

      {/* Barra superior minimalista (48px + 1px borda = 49px) */}
      <header className="h-12 flex items-center justify-between gap-4 px-4 bg-[#11141B] border-b border-white/[0.08] shrink-0">
        {/* Esquerda: Voltar para Pastas + Ícone/Nome do Projeto */}
        <div className="flex items-center gap-2 min-w-0 relative" ref={pickerRef}>
          <button
            onClick={() => {
              setShowIconPicker(false);
              setActiveProjectId(null);
            }}
            title="Voltar para lista de projetos"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projetos</span>
          </button>

          <button
            onClick={() => setShowIconPicker((v) => !v)}
            title="Escolher ícone e nome do projeto"
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-colors min-w-0"
          >
            <span
              className="w-6 h-6 rounded flex items-center justify-center bg-[#0B0D11] border shrink-0"
              style={{ borderColor: `${activeProject.iconColor}55` }}
            >
              <ProjectIconGlyph
                iconId={activeProject.iconId}
                color={activeProject.iconColor}
                customIconUrl={activeProject.customIconUrl}
                sizeClass="w-4 h-4"
              />
            </span>
            <span className="font-display text-xs font-semibold text-white truncate max-w-[160px]">
              {activeProject.name}
            </span>
            <Pencil className="w-3 h-3 text-slate-500 shrink-0" />
          </button>

          {/* Popover para escolher ícone da pasta dentro do projeto */}
          {showIconPicker && (
            <div className="absolute left-0 top-11 z-50 w-72 rounded-lg bg-[#141821] border border-white/15 shadow-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Pasta do Projeto</span>
                <button
                  onClick={() => setShowIconPicker(false)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                Nome
                <input
                  value={activeProject.name}
                  onChange={(e) =>
                    handleUpdateProject({
                      ...activeProject,
                      name: e.target.value,
                      updatedAt: new Date().toLocaleDateString('pt-BR'),
                    })
                  }
                  className="bg-[#0B0D11] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </label>

              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400">Escolher Ícone</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {PROJECT_ICON_OPTIONS.map((opt) => {
                    const active = !activeProject.customIconUrl && activeProject.iconId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          handleUpdateProject({
                            ...activeProject,
                            iconId: opt.id,
                            iconColor: opt.defaultColor,
                            customIconUrl: undefined,
                            updatedAt: new Date().toLocaleDateString('pt-BR'),
                          })
                        }
                        title={opt.label}
                        className={`flex flex-col items-center gap-1 p-1.5 rounded border text-[10px] transition-colors ${
                          active
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-[#0B0D11] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        <ProjectIconGlyph
                          iconId={opt.id}
                          color={opt.defaultColor}
                          sizeClass="w-4 h-4"
                        />
                        <span className="truncate w-full text-center">{opt.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-1 border-t border-white/[0.08] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => iconFileRef.current?.click()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] text-slate-200"
                >
                  <ImagePlus className="w-3.5 h-3.5" /> Enviar Imagem
                </button>
                {activeProject.customIconUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateProject({
                        ...activeProject,
                        customIconUrl: undefined,
                        updatedAt: new Date().toLocaleDateString('pt-BR'),
                      })
                    }
                    className="px-2.5 py-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-slate-400 hover:text-white"
                  >
                    Padrão
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Centro: Navegação minimalista com ícones */}
        <nav className="flex items-center gap-1 bg-[#0B0D11] border border-white/[0.08] rounded-md p-0.5 overflow-x-auto">
          {(
            [
              { id: 'editor', label: 'Editor', icon: Box },
              { id: 'source', label: 'C++17', icon: FileCode2 },
              { id: 'architecture', label: 'Arquitetura', icon: Layers },
              { id: 'build', label: 'Exportar', icon: Package },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* Direita: Download .CPP */}
        <div className="shrink-0">
          <button
            onClick={handleDownloadCpp}
            title="Baixar código-fonte C++17 (koda_game_dev.cpp)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Baixar .CPP</span>
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        {activeTab === 'editor' && (
          <EditorWorkspace project={activeProject} onUpdateProject={handleUpdateProject} />
        )}
        {activeTab === 'source' && <CppSourceViewer />}
        {activeTab === 'architecture' && <ArchitectureView />}
        {activeTab === 'build' && <BuildExportView />}
      </main>
    </div>
  );
}
