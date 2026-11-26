import React, { useRef, useState } from 'react';
import {
  Box,
  Car,
  Folder,
  FolderOpen,
  Gamepad2,
  Ghost,
  Plus,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Sword,
  Trash2,
  Upload,
} from 'lucide-react';
import { PROJECT_ICON_OPTIONS } from '../utils/projectStorage';
import type { KodaProject, ProjectIconId } from '../types/engine';

interface ProjectIconGlyphProps {
  iconId: ProjectIconId;
  color: string;
  customIconUrl?: string;
  sizeClass?: string;
}

export const ProjectIconGlyph: React.FC<ProjectIconGlyphProps> = ({
  iconId,
  color,
  customIconUrl,
  sizeClass = 'w-6 h-6',
}) => {
  if (customIconUrl) {
    return (
      <img
        src={customIconUrl}
        alt="Ícone do projeto"
        className={`${sizeClass} rounded object-cover`}
      />
    );
  }
  const props = { className: sizeClass, style: { color } };
  switch (iconId) {
    case 'sword':
      return <Sword {...props} />;
    case 'rocket':
      return <Rocket {...props} />;
    case 'box':
      return <Box {...props} />;
    case 'ghost':
      return <Ghost {...props} />;
    case 'car':
      return <Car {...props} />;
    case 'shield':
      return <Shield {...props} />;
    case 'sparkles':
      return <Sparkles {...props} />;
    case 'gamepad':
    default:
      return <Gamepad2 {...props} />;
  }
};

interface ProjectHubProps {
  projects: KodaProject[];
  onOpenProject: (project: KodaProject) => void;
  onCreateProject: (name: string, mode: '3D' | '2D', iconId: ProjectIconId, iconColor: string) => void;
  onImportProjectFile: (file: File) => void;
  onDeleteProject: (projectId: string) => void;
  onRestoreDemos?: () => void;
  importError: string | null;
}

export const ProjectHub: React.FC<ProjectHubProps> = ({
  projects,
  onOpenProject,
  onCreateProject,
  onImportProjectFile,
  onDeleteProject,
  onRestoreDemos,
  importError,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(projects[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KodaProject | null>(null);

  const [newName, setNewName] = useState('');
  const [newMode, setNewMode] = useState<'3D' | '2D'>('3D');
  const [newIconId, setNewIconId] = useState<ProjectIconId>('gamepad');
  const [newIconColor, setNewIconColor] = useState('#3B82F6');

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;
  const visibleProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const handleConfirmCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newName.trim() || `Projeto_${projects.length + 1}`;
    onCreateProject(clean, newMode, newIconId, newIconColor);
    setNewName('');
    setShowCreateModal(false);
  };

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#E6E9EF] flex flex-col">
      <input
        ref={importInputRef}
        type="file"
        accept=".kproj,.kscene,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportProjectFile(f);
          e.target.value = '';
        }}
      />

      {/* Cabeçalho minimalista */}
      <header className="h-14 flex items-center justify-between px-6 bg-[#11141B] border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <Gamepad2 className="w-5 h-5 text-blue-400" />
          <span className="font-display text-sm font-bold tracking-tight text-white">
            Koda Game Dev
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-medium text-slate-200 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Importar
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Criar Projeto
          </button>
        </div>
      </header>

      {/* Conteúdo central */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Projetos</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Selecione uma pasta para abrir, personalizar o ícone ou remover.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto..."
                className="w-48 bg-[#12151C] border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            {selectedProject && (
              <>
                <button
                  onClick={() => onOpenProject(selectedProject)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-xs font-medium text-blue-200"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Abrir
                </button>
                <button
                  onClick={() => setDeleteTarget(selectedProject)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              </>
            )}
          </div>
        </div>

        {importError && (
          <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {importError}
          </div>
        )}

            {visibleProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-[#11141B]/50 py-16 text-center space-y-3">
                <Folder className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm text-slate-300">Nenhum projeto encontrado</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
                  >
                    <Plus className="w-3.5 h-3.5" /> Criar Primeiro Projeto
                  </button>
                  {projects.length === 0 && onRestoreDemos && (
                    <button
                      onClick={onRestoreDemos}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-200"
                    >
                      Restaurar Demos
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {visibleProjects.map((proj) => {
                  const isSelected = proj.id === selectedId;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => setSelectedId(proj.id)}
                      onDoubleClick={() => onOpenProject(proj)}
                      className={`group relative rounded-lg p-4 cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-[#161B26] border-blue-500/60 shadow-sm'
                          : 'bg-[#11141B] border-white/[0.08] hover:border-white/20 hover:bg-[#141821]'
                      }`}
                    >
                      {/* Topo estilo pasta */}
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className="w-11 h-11 rounded-lg flex items-center justify-center border border-white/10 bg-[#0B0D11]"
                          style={{ borderColor: `${proj.iconColor}40` }}
                        >
                          <ProjectIconGlyph
                            iconId={proj.iconId}
                            color={proj.iconColor}
                            customIconUrl={proj.customIconUrl}
                            sizeClass="w-6 h-6"
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setDeleteTarget(proj);
                            }}
                            title="Excluir projeto"
                            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                  <div className="mt-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-display text-sm font-semibold text-white truncate">
                        {proj.name}
                      </h2>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {proj.mode}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        {proj.entities.length} objetos · {proj.scripts.length} scripts
                      </span>
                      <span>{proj.updatedAt}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <Folder className="w-3 h-3" /> Pasta do Projeto
                    </span>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpenProject(proj);
                      }}
                      className="text-xs font-medium text-blue-400 hover:text-blue-300"
                    >
                      Abrir →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Criar Novo Projeto */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCreate}
            className="w-full max-w-md rounded-lg bg-[#141821] border border-white/10 p-5 space-y-4"
          >
            <h2 className="font-display text-base font-semibold text-white">Novo Projeto</h2>

            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              Nome do Projeto
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={`Projeto_${projects.length + 1}`}
                className="bg-[#0B0D11] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              {(['3D', '2D'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNewMode(m)}
                  className={`py-2 rounded border text-xs font-medium ${
                    newMode === m
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-[#0B0D11] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Jogo {m}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-slate-300">Ícone da Pasta</span>
              <div className="grid grid-cols-4 gap-2">
                {PROJECT_ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setNewIconId(opt.id);
                      setNewIconColor(opt.defaultColor);
                    }}
                    className={`flex flex-col items-center gap-1 p-2 rounded border text-[11px] ${
                      newIconId === opt.id
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-[#0B0D11] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <ProjectIconGlyph iconId={opt.id} color={opt.defaultColor} sizeClass="w-5 h-5" />
                    <span className="truncate w-full text-center">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
              >
                Criar e Abrir
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Confirmação ao Excluir Projeto */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-lg bg-[#141821] border border-white/10 p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-white">Excluir projeto?</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Você selecionou a pasta <span className="font-semibold text-white">{deleteTarget.name}</span>.
              Deseja realmente excluir este projeto? Essa ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onDeleteProject(deleteTarget.id);
                  if (selectedId === deleteTarget.id) setSelectedId(null);
                  setDeleteTarget(null);
                }}
                className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-xs font-medium text-white"
              >
                Excluir Projeto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
