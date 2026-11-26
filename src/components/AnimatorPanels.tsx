import React, { useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Plus,
  Trash2,
  Zap,
  Circle,
  SkipBack,
  SkipForward,
  Sparkles,
  Film,
  Copy,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  GitBranch,
  Repeat,
  X,
} from 'lucide-react';
import {
  BUILTIN_RIG_BONES,
  DEFAULT_ANIMATOR_STATES,
  type AnimationClipData,
  type AnimatorStateDef,
  type AnimatorStateName,
  type AnimatorTransition,
  type EngineEntity,
  type TimelineKeyframe,
} from '../types/engine';
import {
  ANIMATION_LIBRARY,
  buildClipFromLibraryPreset,
  type AnimationLibraryCategory,
  type AnimationLibraryPreset,
} from '../utils/animationLibrary';

interface AnimatorStateGraphProps {
  entity: EngineEntity | null;
  transitions: AnimatorTransition[];
  onUpdateEntity: (updater: (ent: EngineEntity) => EngineEntity) => void;
  onAddTransition: (tr: AnimatorTransition) => void;
  onDeleteTransition?: (id: string) => void;
}

const STATE_COLOR_SWATCHES = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#06B6D4'];

export const AnimatorStateGraph: React.FC<AnimatorStateGraphProps> = ({
  entity,
  transitions,
  onUpdateEntity,
  onAddTransition,
  onDeleteTransition,
}) => {
  const [newFrom, setNewFrom] = useState<AnimatorStateName>('Idle');
  const [newTo, setNewTo] = useState<AnimatorStateName>('Attack');
  const [newCond, setNewCond] = useState('triggerAttack');

  const [showNewStateForm, setShowNewStateForm] = useState(false);
  const [stateName, setStateName] = useState('');
  const [stateColor, setStateColor] = useState('#EC4899');
  const [stateSource, setStateSource] = useState<AnimatorStateDef['source']>('library');
  const [stateClipId, setStateClipId] = useState<string>('');
  const [stateLibId, setStateLibId] = useState<string>(ANIMATION_LIBRARY[0]?.id ?? '');
  const [stateBlenderClip, setStateBlenderClip] = useState<string>('');
  const [stateSpeed, setStateSpeed] = useState<number>(1.0);
  const [stateLoop, setStateLoop] = useState<boolean>(true);
  const [stateIsDefault, setStateIsDefault] = useState<boolean>(false);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const states: AnimatorStateDef[] = useMemo(() => {
    if (!entity) return DEFAULT_ANIMATOR_STATES;
    if (entity.animator.states && entity.animator.states.length > 0) {
      return entity.animator.states;
    }
    return DEFAULT_ANIMATOR_STATES;
  }, [entity]);

  const nodePos = (name: AnimatorStateName) =>
    states.find((n) => n.name === name) ?? states[0] ?? { x: 170, y: 145 };

  if (
    !entity ||
    (entity.kind !== 'Rig3D' &&
      entity.kind !== 'Rig2D' &&
      entity.blenderClips.length === 0 &&
      entity.boneNames.length === 0 &&
      entity.animator.clips.length === 0 &&
      (!entity.animator.states || entity.animator.states.length === 0))
  ) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0E1117] text-slate-400 p-6 text-center">
        <p className="font-display text-sm font-semibold text-slate-200">
          Animator Controller (Máquina de Estados Multi-Estado)
        </p>
        <p className="text-xs text-slate-400 mt-1 max-w-md">
          Selecione um <span className="text-slate-200 font-medium">Rig 3D / 2D</span>, um modelo{' '}
          <span className="text-slate-200 font-medium">.FBX / .GLB</span> ou crie uma animação na{' '}
          <span className="text-slate-200 font-medium">Animation Timeline</span> para criar múltiplos estados e transições.
        </p>
      </div>
    );
  }

  const activeState = entity.animator.currentState;
  const activeCustomClip = entity.animator.clips.find((c) => c.id === entity.animator.activeClipId);
  const entryNode = states.find((s) => s.isDefault) ?? states[0];

  const activateState = (node: AnimatorStateDef) => {
    onUpdateEntity((ent) => {
      const baseStates = ent.animator.states && ent.animator.states.length > 0 ? ent.animator.states : DEFAULT_ANIMATOR_STATES;
      if (node.source === 'clip' && node.clipId) {
        const clip = ent.animator.clips.find((c) => c.id === node.clipId);
        if (clip) {
          return {
            ...ent,
            activeBlenderClip: null,
            animator: {
              ...ent.animator,
              enabled: true,
              states: baseStates,
              currentState: node.name,
              useKeyframes: true,
              activeClipId: clip.id,
              clipDuration: clip.duration,
              keyframes: clip.keyframes,
              libraryPresetId: null,
              clipSpeed: node.speed,
              clipLoop: node.loop,
            },
          };
        }
      }
      if (node.source === 'library' && node.libraryPresetId) {
        return {
          ...ent,
          activeBlenderClip: null,
          animator: {
            ...ent.animator,
            enabled: true,
            states: baseStates,
            currentState: node.name,
            useKeyframes: false,
            libraryPresetId: node.libraryPresetId,
            clipSpeed: node.speed,
            clipLoop: node.loop,
          },
        };
      }
      if (node.source === 'blender' && node.blenderClipName && ent.blenderClips.includes(node.blenderClipName)) {
        return {
          ...ent,
          activeBlenderClip: node.blenderClipName,
          blenderClipSpeed: node.speed,
          blenderClipLoop: node.loop,
          animator: {
            ...ent.animator,
            enabled: true,
            states: baseStates,
            currentState: node.name,
            useKeyframes: false,
            libraryPresetId: null,
          },
        };
      }
      return {
        ...ent,
        activeBlenderClip: null,
        animator: {
          ...ent.animator,
          enabled: true,
          states: baseStates,
          currentState: node.name,
          useKeyframes: false,
          libraryPresetId: null,
          clipSpeed: node.speed,
          clipLoop: node.loop,
        },
      };
    });
  };

  const handleCreateState = () => {
    const baseName = stateName.trim() || `Estado_${states.length + 1}`;
    const uniqueName = states.some((s) => s.name.toLowerCase() === baseName.toLowerCase())
      ? `${baseName}_${states.length + 1}`
      : baseName;

    const col = states.length % 3;
    const row = Math.floor(states.length / 3);
    const libObj = ANIMATION_LIBRARY.find((l) => l.id === stateLibId);
    const clipObj = entity.animator.clips.find((c) => c.id === stateClipId) ?? entity.animator.clips[0];

    const resolvedSource: AnimatorStateDef['source'] =
      stateSource === 'clip' && !clipObj
        ? 'library'
        : stateSource === 'blender' && entity.blenderClips.length === 0
        ? 'procedural'
        : stateSource;

    const desc =
      resolvedSource === 'library'
        ? `Biblioteca: ${libObj?.name ?? 'Preset'}`
        : resolvedSource === 'clip'
        ? `Clipe: ${clipObj?.name ?? 'Timeline'}`
        : resolvedSource === 'blender'
        ? `Blender: ${stateBlenderClip || entity.blenderClips[0]}`
        : `Procedural · ${stateLoop ? 'Loop' : 'One-shot'}`;

    const created: AnimatorStateDef = {
      id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: uniqueName,
      x: 170 + col * 225,
      y: 65 + row * 110,
      color: stateColor,
      source: resolvedSource,
      clipId: resolvedSource === 'clip' ? clipObj?.id ?? null : null,
      libraryPresetId: resolvedSource === 'library' ? stateLibId : null,
      blenderClipName: resolvedSource === 'blender' ? stateBlenderClip || entity.blenderClips[0] || null : null,
      speed: Math.max(0.2, Math.min(3, stateSpeed || 1)),
      loop: stateLoop,
      isDefault: stateIsDefault,
      description: desc,
    };

    onUpdateEntity((ent) => {
      const base = ent.animator.states && ent.animator.states.length > 0 ? ent.animator.states : DEFAULT_ANIMATOR_STATES;
      const nextStates = [...base.map((s) => (stateIsDefault ? { ...s, isDefault: false } : s)), created];
      return {
        ...ent,
        animator: {
          ...ent.animator,
          enabled: true,
          states: nextStates,
        },
      };
    });

    activateState(created);
    setNewTo(created.name);
    setStateName('');
    setShowNewStateForm(false);
  };

  const handleDeleteState = (st: AnimatorStateDef) => {
    if (states.length <= 1) return;
    onUpdateEntity((ent) => {
      const base = ent.animator.states && ent.animator.states.length > 0 ? ent.animator.states : DEFAULT_ANIMATOR_STATES;
      const remaining = base.filter((s) => s.id !== st.id);
      if (st.isDefault && remaining[0]) remaining[0] = { ...remaining[0], isDefault: true };
      const fallbackName = remaining[0]?.name ?? 'Idle';
      return {
        ...ent,
        animator: {
          ...ent.animator,
          states: remaining,
          currentState: ent.animator.currentState === st.name ? fallbackName : ent.animator.currentState,
        },
      };
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0E1117] overflow-hidden">
      {/* Barra superior do Animator */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#12151C] border-b border-white/10 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display font-semibold text-white">
            {entity.name} · Estado:{' '}
            <span className="text-blue-400">
              {activeState}
              {entity.animator.useKeyframes && activeCustomClip ? ` (${activeCustomClip.name})` : ''}
            </span>
          </span>

          <button
            onClick={() => setShowNewStateForm((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Estado ({states.length})
          </button>

          <label className="flex items-center gap-1.5 text-slate-300">
            speed ({entity.animator.paramSpeed.toFixed(1)})
            <input
              type="range"
              min={0}
              max={6}
              step={0.1}
              value={entity.animator.paramSpeed}
              onChange={(e) => {
                const spd = parseFloat(e.target.value);
                onUpdateEntity((ent) => ({
                  ...ent,
                  animator: {
                    ...ent.animator,
                    paramSpeed: spd,
                    useKeyframes: false,
                    libraryPresetId: null,
                    currentState: !ent.animator.paramGrounded
                      ? 'Jump'
                      : spd > 3.5
                      ? 'Run'
                      : spd > 0.1
                      ? 'Walk'
                      : 'Idle',
                  },
                }));
              }}
            />
          </label>

          <label className="flex items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={entity.animator.paramGrounded}
              onChange={(e) => {
                const grounded = e.target.checked;
                onUpdateEntity((ent) => ({
                  ...ent,
                  animator: {
                    ...ent.animator,
                    paramGrounded: grounded,
                    useKeyframes: false,
                    libraryPresetId: null,
                    currentState: !grounded
                      ? 'Jump'
                      : ent.animator.paramSpeed > 3.5
                      ? 'Run'
                      : ent.animator.paramSpeed > 0.1
                      ? 'Walk'
                      : 'Idle',
                  },
                }));
              }}
            />
            isGrounded
          </label>

          <button
            onClick={() =>
              onUpdateEntity((ent) => ({
                ...ent,
                animator: { ...ent.animator, useKeyframes: false, libraryPresetId: null, currentState: 'Attack', triggerAttack: true },
              }))
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
          >
            <Zap className="w-3.5 h-3.5" /> Attack
          </button>
        </div>

        {/* Criar transição entre quaisquer estados */}
        <div className="flex items-center gap-1.5">
          <select
            value={newFrom}
            onChange={(e) => setNewFrom(e.target.value)}
            className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200 max-w-[115px]"
          >
            {states.map((n) => (
              <option key={n.id} value={n.name}>{n.name}</option>
            ))}
          </select>
          <span className="text-slate-500">→</span>
          <select
            value={newTo}
            onChange={(e) => setNewTo(e.target.value)}
            className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200 max-w-[115px]"
          >
            {states.map((n) => (
              <option key={n.id} value={n.name}>{n.name}</option>
            ))}
          </select>
          <input
            value={newCond}
            onChange={(e) => setNewCond(e.target.value)}
            placeholder="condição"
            className="w-28 bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200"
          />
          <button
            onClick={() => {
              if (newFrom === newTo) return;
              onAddTransition({
                id: `tr_${Date.now()}`,
                from: newFrom,
                to: newTo,
                condition: newCond || 'auto',
                duration: 0.15,
              });
            }}
            className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200"
          >
            + Transição
          </button>
        </div>
      </div>

      {/* Formulário de criação de novo Estado */}
      {showNewStateForm && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-[#161B26] border-b border-emerald-500/30 text-xs">
          <span className="text-emerald-300 font-semibold">Criar Estado:</span>
          <input
            value={stateName}
            onChange={(e) => setStateName(e.target.value)}
            placeholder="Nome (ex: ComboChute, Defesa...)"
            className="w-44 bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-white"
          />

          <select
            value={stateSource}
            onChange={(e) => setStateSource(e.target.value as AnimatorStateDef['source'])}
            className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200"
          >
            <option value="library">Biblioteca de Animações</option>
            <option value="clip">Clipe da Timeline</option>
            <option value="procedural">Pose Procedural</option>
            {entity.blenderClips.length > 0 && <option value="blender">Clipe do Blender</option>}
          </select>

          {stateSource === 'library' && (
            <select
              value={stateLibId}
              onChange={(e) => setStateLibId(e.target.value)}
              className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200 max-w-[190px]"
            >
              {ANIMATION_LIBRARY.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.category}] {p.name}
                </option>
              ))}
            </select>
          )}

          {stateSource === 'clip' && (
            <select
              value={stateClipId || entity.animator.clips[0]?.id || ''}
              onChange={(e) => setStateClipId(e.target.value)}
              className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200 max-w-[180px]"
            >
              {entity.animator.clips.length === 0 ? (
                <option value="">(Nenhum clipe criado)</option>
              ) : (
                entity.animator.clips.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
          )}

          {stateSource === 'blender' && (
            <select
              value={stateBlenderClip || entity.blenderClips[0] || ''}
              onChange={(e) => setStateBlenderClip(e.target.value)}
              className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200 max-w-[170px]"
            >
              {entity.blenderClips.map((bc) => (
                <option key={bc} value={bc}>{bc}</option>
              ))}
            </select>
          )}

          <label className="flex items-center gap-1 text-slate-300">
            Vel:
            <input
              type="number"
              step={0.1}
              min={0.2}
              max={3}
              value={stateSpeed}
              onChange={(e) => setStateSpeed(parseFloat(e.target.value) || 1)}
              className="w-14 bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200"
            />
          </label>

          <label className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" checked={stateLoop} onChange={(e) => setStateLoop(e.target.checked)} />
            Loop
          </label>
          <label className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" checked={stateIsDefault} onChange={(e) => setStateIsDefault(e.target.checked)} />
            Entry
          </label>

          <div className="flex items-center gap-1">
            {STATE_COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setStateColor(c)}
                style={{ backgroundColor: c }}
                className={`w-4 h-4 rounded-full border ${
                  stateColor === c ? 'border-white scale-110' : 'border-black/50 opacity-70'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleCreateState}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            Adicionar Estado
          </button>
          <button
            onClick={() => setShowNewStateForm(false)}
            className="px-2 py-1 rounded bg-white/5 text-slate-300 hover:text-white"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Canvas do Grafo com nós arrastáveis */}
      <div
        ref={canvasRef}
        onPointerMove={(e) => {
          if (!draggingNodeId || !canvasRef.current) return;
          const rect = canvasRef.current.getBoundingClientRect();
          const nx = Math.max(96, Math.round(e.clientX - rect.left + canvasRef.current.scrollLeft - dragOffsetRef.current.dx));
          const ny = Math.max(18, Math.round(e.clientY - rect.top + canvasRef.current.scrollTop - dragOffsetRef.current.dy));
          onUpdateEntity((ent) => {
            const base = ent.animator.states && ent.animator.states.length > 0 ? ent.animator.states : DEFAULT_ANIMATOR_STATES;
            return {
              ...ent,
              animator: {
                ...ent.animator,
                states: base.map((s) => (s.id === draggingNodeId ? { ...s, x: nx, y: ny } : s)),
              },
            };
          });
        }}
        onPointerUp={() => setDraggingNodeId(null)}
        className="relative flex-1 overflow-auto bg-[radial-gradient(#1f2430_1px,transparent_1px)] [background-size:20px_20px] select-none"
      >
        <svg className="absolute inset-0 w-[1200px] h-[540px] pointer-events-none">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#64748B" />
            </marker>
            <marker id="arrowActive" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#3B82F6" />
            </marker>
          </defs>
          {entryNode && (
            <line
              x1="78"
              y1="172"
              x2={entryNode.x}
              y2={entryNode.y + 26}
              stroke="#10B981"
              strokeWidth="2"
              markerEnd="url(#arrow)"
            />
          )}
          {transitions.map((tr) => {
            const p1 = nodePos(tr.from);
            const p2 = nodePos(tr.to);
            const isOutOfActive = tr.from === activeState && !entity.animator.useKeyframes;
            return (
              <line
                key={tr.id}
                x1={p1.x + 78}
                y1={p1.y + 28}
                x2={p2.x + 78}
                y2={p2.y + 28}
                stroke={isOutOfActive ? '#3B82F6' : '#475569'}
                strokeWidth={isOutOfActive ? 2.2 : 1.3}
                strokeDasharray={isOutOfActive ? undefined : '4 3'}
                markerEnd={isOutOfActive ? 'url(#arrowActive)' : 'url(#arrow)'}
              />
            );
          })}
        </svg>

        <div
          style={{ left: 16, top: 152 }}
          className="absolute w-16 py-2 text-center rounded bg-emerald-600/20 border border-emerald-500/50 text-xs font-medium text-emerald-300"
        >
          Entry
        </div>

        {states.map((node) => {
          const isActive = node.name === activeState;
          return (
            <div
              key={node.id}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button[data-del="true"]')) return;
                if (!canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                dragOffsetRef.current = {
                  dx: e.clientX - rect.left + canvasRef.current.scrollLeft - node.x,
                  dy: e.clientY - rect.top + canvasRef.current.scrollTop - node.y,
                };
                setDraggingNodeId(node.id);
                activateState(node);
              }}
              style={{
                left: node.x,
                top: node.y,
                borderColor: isActive ? node.color : 'rgba(255,255,255,0.14)',
              }}
              className={`group absolute w-[166px] text-left rounded-md px-3 py-2 border cursor-grab active:cursor-grabbing transition-shadow ${
                isActive
                  ? 'bg-[#1A2233] text-white shadow-lg'
                  : 'bg-[#161A23] text-slate-200 hover:bg-[#1A1F2A]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
                  <span className="font-display text-xs font-semibold truncate">{node.name}</span>
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {isActive && <span className="font-mono text-[9px] text-blue-300">ATIVO</span>}
                  {states.length > 1 && (
                    <button
                      type="button"
                      data-del="true"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleDeleteState(node);
                      }}
                      title="Excluir estado"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                {node.description ?? `${node.source} · ${node.speed}x`}
              </div>
            </div>
          );
        })}

        {/* Painel lateral direito: Clipes Criados + Transições */}
        <div className="sticky float-right m-4 w-72 bg-[#12151C]/95 border border-white/10 rounded-md p-3 text-xs space-y-3 z-10">
          {entity.animator.clips.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-display font-semibold text-slate-200">
                Clipes da Timeline ({entity.animator.clips.length})
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {entity.animator.clips.map((clip) => {
                  const isClipActive = entity.animator.useKeyframes && entity.animator.activeClipId === clip.id;
                  return (
                    <button
                      key={clip.id}
                      onClick={() =>
                        onUpdateEntity((ent) => ({
                          ...ent,
                          activeBlenderClip: null,
                          animator: {
                            ...ent.animator,
                            enabled: true,
                            useKeyframes: true,
                            libraryPresetId: null,
                            activeClipId: clip.id,
                            clipDuration: clip.duration,
                            keyframes: clip.keyframes,
                          },
                        }))
                      }
                      className={`w-full flex items-center justify-between px-2 py-1 rounded border text-left ${
                        isClipActive
                          ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                          : 'bg-[#0B0D11] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <span className="truncate font-medium">{clip.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {clip.duration.toFixed(1)}s · {clip.keyframes.length} kf
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="font-display font-semibold text-slate-200">
              Transições ({transitions.length})
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[11px]">
              {transitions.map((tr) => (
                <div
                  key={tr.id}
                  className="flex items-center justify-between gap-1.5 text-slate-300 py-0.5 border-b border-white/[0.05]"
                >
                  <span className="truncate">{tr.from} → {tr.to}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className="text-slate-500 truncate max-w-[90px]">{tr.condition}</span>
                    {onDeleteTransition && (
                      <button
                        onClick={() => onDeleteTransition(tr.id)}
                        title="Remover transição"
                        className="text-slate-500 hover:text-red-400 p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface AnimationTimelinePanelProps {
  entity: EngineEntity | null;
  scrubTime: number;
  isPreviewPlaying: boolean;
  isRecording: boolean;
  onToggleRecord: () => void;
  onTogglePreview: () => void;
  onScrubChange: (t: number) => void;
  onUpdateEntity: (updater: (ent: EngineEntity) => EngineEntity) => void;
  onBakeBlenderClip: (clipName: string) => void;
  onOpenAnimator?: () => void;
}

export const AnimationTimelinePanel: React.FC<AnimationTimelinePanelProps> = ({
  entity,
  scrubTime,
  isPreviewPlaying,
  isRecording,
  onToggleRecord,
  onTogglePreview,
  onScrubChange,
  onUpdateEntity,
  onBakeBlenderClip,
  onOpenAnimator,
}) => {
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const trackLaneRef = useRef<HTMLDivElement | null>(null);
  const [draggingScrub, setDraggingScrub] = useState(false);
  const [draggingKfId, setDraggingKfId] = useState<string | null>(null);
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);
  const [propType, setPropType] = useState<'rotation' | 'position' | 'scale'>('rotation');
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('x');
  const [keyValue, setKeyValue] = useState<number>(35);

  const [showNewClipForm, setShowNewClipForm] = useState(false);
  const [newClipName, setNewClipName] = useState('');
  const [newClipDuration, setNewClipDuration] = useState(2.0);

  const [showLibrary, setShowLibrary] = useState(false);
  const [libCategory, setLibCategory] = useState<'Todas' | AnimationLibraryCategory>('Todas');

  if (!entity) {
    return (
      <div className="text-xs text-slate-500 py-4">
        Selecione qualquer objeto, modelo do Blender (.FBX/.GLB/.OBJ) ou Rig 2D/3D para criar animações, usar a Biblioteca de Animações e editar na linha do tempo.
      </div>
    );
  }

  const activeClip = entity.animator.clips.find((c) => c.id === entity.animator.activeClipId) ?? null;
  const dur = Math.max(0.5, activeClip?.duration ?? entity.animator.clipDuration);
  const boneList =
    entity.kind === 'Rig3D' || entity.kind === 'Rig2D'
      ? BUILTIN_RIG_BONES
      : entity.boneNames;

  const trackRows: { targetName: string; label: string; isBone: boolean }[] = [
    { targetName: '__root__', label: `${entity.name} (Objeto)`, isBone: false },
    ...boneList.map((b) => ({ targetName: b, label: b, isBone: true })),
  ];

  const activeTarget = entity.selectedBone ?? '__root__';
  const selectedKf = entity.animator.keyframes.find((k) => k.id === selectedKfId) ?? null;
  const clipSpeed = entity.animator.clipSpeed ?? 1.0;
  const clipLoop = activeClip?.loop ?? entity.animator.clipLoop ?? true;

  const timeFromClientX = (clientX: number, el: HTMLDivElement | null) => {
    if (!el) return scrubTime;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    return Number((ratio * dur).toFixed(2));
  };

  const updateScrubFromClientX = (clientX: number) => {
    onScrubChange(timeFromClientX(clientX, rulerRef.current));
  };

  const syncKeyframesToActiveClip = (ent: EngineEntity, nextKeyframes: TimelineKeyframe[]): EngineEntity => {
    if (ent.animator.activeClipId) {
      return {
        ...ent,
        activeBlenderClip: null,
        animator: {
          ...ent.animator,
          enabled: true,
          useKeyframes: true,
          libraryPresetId: null,
          keyframes: nextKeyframes,
          clips: ent.animator.clips.map((c) =>
            c.id === ent.animator.activeClipId ? { ...c, keyframes: nextKeyframes } : c
          ),
        },
      };
    }
    const autoClip: AnimationClipData = {
      id: `clip_${Date.now()}`,
      name: 'Animacao_1',
      duration: Math.max(0.5, ent.animator.clipDuration),
      loop: true,
      keyframes: nextKeyframes,
    };
    return {
      ...ent,
      activeBlenderClip: null,
      animator: {
        ...ent.animator,
        enabled: true,
        useKeyframes: true,
        libraryPresetId: null,
        activeClipId: autoClip.id,
        keyframes: nextKeyframes,
        clips: [...ent.animator.clips, autoClip],
      },
    };
  };

  const handleCreateNewClip = () => {
    const clipIndex = entity.animator.clips.length + 1;
    const cleanName = newClipName.trim() || `Animacao_${clipIndex}`;
    const safeDur = Math.max(0.5, Math.min(30, newClipDuration || 2.0));
    const created: AnimationClipData = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      duration: safeDur,
      loop: true,
      keyframes: [],
    };
    onUpdateEntity((ent) => ({
      ...ent,
      activeBlenderClip: null,
      animator: {
        ...ent.animator,
        enabled: true,
        useKeyframes: true,
        libraryPresetId: null,
        activeClipId: created.id,
        clipDuration: created.duration,
        keyframes: created.keyframes,
        clips: [...ent.animator.clips, created],
      },
    }));
    onScrubChange(0);
    setNewClipName('');
    setShowNewClipForm(false);
  };

  const handleApplyLibraryPreset = (preset: AnimationLibraryPreset, alsoCreateState: boolean) => {
    const newClip = buildClipFromLibraryPreset(preset);
    onUpdateEntity((ent) => {
      const baseStates =
        ent.animator.states && ent.animator.states.length > 0 ? ent.animator.states : DEFAULT_ANIMATOR_STATES;
      let nextStates = baseStates;
      let nextStateName = ent.animator.currentState;
      if (alsoCreateState) {
        const cleanName = preset.name.replace(/[^A-Za-z0-9À-ÿ_ ]/g, '').trim() || `Estado_${baseStates.length + 1}`;
        const col = baseStates.length % 3;
        const row = Math.floor(baseStates.length / 3);
        const stateDef: AnimatorStateDef = {
          id: `st_${Date.now()}`,
          name: baseStates.some((s) => s.name === cleanName) ? `${cleanName}_${baseStates.length + 1}` : cleanName,
          x: 170 + col * 225,
          y: 65 + row * 110,
          color: '#EC4899',
          source: 'clip',
          clipId: newClip.id,
          speed: 1.0,
          loop: newClip.loop,
          description: `Biblioteca: ${preset.name}`,
        };
        nextStates = [...baseStates, stateDef];
        nextStateName = stateDef.name;
      }
      return {
        ...ent,
        activeBlenderClip: null,
        animator: {
          ...ent.animator,
          enabled: true,
          useKeyframes: true,
          libraryPresetId: null,
          currentState: nextStateName,
          states: nextStates,
          activeClipId: newClip.id,
          clipDuration: newClip.duration,
          clipLoop: newClip.loop,
          keyframes: newClip.keyframes,
          clips: [...ent.animator.clips, newClip],
        },
      };
    });
    onScrubChange(0);
    setShowLibrary(false);
    if (alsoCreateState && onOpenAnimator) {
      onOpenAnimator();
    }
  };

  const handleCapturePoseAtPlayhead = () => {
    const t = Number(scrubTime.toFixed(2));
    const additions: TimelineKeyframe[] = [];
    const stamp = Date.now();
    if (entity.kind === 'Rig3D' || entity.kind === 'Rig2D') {
      for (const bone of BUILTIN_RIG_BONES) {
        const ov = entity.boneOverrides[bone]?.rotation ?? entity.rigPose[bone as keyof typeof entity.rigPose];
        if (!ov) continue;
        (['x', 'y', 'z'] as const).forEach((ax, i) => {
          additions.push({
            id: `pose_${bone}_${ax}_${stamp}_${i}`,
            time: t,
            targetName: bone,
            property: 'rotation',
            axis: ax,
            value: Number(ov[ax].toFixed(1)),
            interpolation: 'smooth',
          });
        });
      }
    } else {
      (['x', 'y', 'z'] as const).forEach((ax, i) => {
        additions.push({
          id: `pose_root_${ax}_${stamp}_${i}`,
          time: t,
          targetName: '__root__',
          property: 'rotation',
          axis: ax,
          value: Number(entity.rotation[ax].toFixed(1)),
          interpolation: 'smooth',
        });
      });
    }
    onUpdateEntity((ent) => {
      const kept = ent.animator.keyframes.filter(
        (k) =>
          !additions.some(
            (a) =>
              Math.abs(a.time - k.time) < 0.02 &&
              a.targetName === k.targetName &&
              a.property === k.property &&
              a.axis === k.axis
          )
      );
      return syncKeyframesToActiveClip(ent, [...kept, ...additions].sort((a, b) => a.time - b.time));
    });
  };

  const handlePromoteClipToState = () => {
    if (!activeClip) return;
    onUpdateEntity((ent) => {
      const baseStates =
        ent.animator.states && ent.animator.states.length > 0 ? ent.animator.states : DEFAULT_ANIMATOR_STATES;
      const existing = baseStates.find((s) => s.clipId === activeClip.id);
      if (existing) {
        return {
          ...ent,
          animator: { ...ent.animator, currentState: existing.name, useKeyframes: true },
        };
      }
      const col = baseStates.length % 3;
      const row = Math.floor(baseStates.length / 3);
      const stName = baseStates.some((s) => s.name === activeClip.name)
        ? `${activeClip.name}_${baseStates.length + 1}`
        : activeClip.name;
      const newState: AnimatorStateDef = {
        id: `st_${Date.now()}`,
        name: stName,
        x: 170 + col * 225,
        y: 65 + row * 110,
        color: '#F59E0B',
        source: 'clip',
        clipId: activeClip.id,
        speed: clipSpeed,
        loop: clipLoop,
        description: `Clipe: ${activeClip.name}`,
      };
      return {
        ...ent,
        animator: {
          ...ent.animator,
          states: [...baseStates, newState],
          currentState: newState.name,
          useKeyframes: true,
        },
      };
    });
    onOpenAnimator?.();
  };

  const handleDuplicateActiveClip = () => {
    if (!activeClip) return;
    const created: AnimationClipData = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${activeClip.name}_Copia`,
      duration: activeClip.duration,
      loop: activeClip.loop,
      keyframes: activeClip.keyframes.map((k) => ({ ...k, id: `kf_${Date.now()}_${Math.random()}` })),
    };
    onUpdateEntity((ent) => ({
      ...ent,
      activeBlenderClip: null,
      animator: {
        ...ent.animator,
        enabled: true,
        useKeyframes: true,
        activeClipId: created.id,
        clipDuration: created.duration,
        keyframes: created.keyframes,
        clips: [...ent.animator.clips, created],
      },
    }));
  };

  const handleDeleteActiveClip = () => {
    if (!activeClip) return;
    onUpdateEntity((ent) => {
      const remaining = ent.animator.clips.filter((c) => c.id !== activeClip.id);
      const next = remaining[0] ?? null;
      return {
        ...ent,
        animator: {
          ...ent.animator,
          clips: remaining,
          activeClipId: next?.id ?? null,
          clipDuration: next?.duration ?? 2.0,
          keyframes: next?.keyframes ?? [],
          useKeyframes: Boolean(next),
        },
      };
    });
  };

  const addKeyframeAtPlayhead = () => {
    const kf: TimelineKeyframe = {
      id: `kf_${Date.now()}_${Math.random()}`,
      time: Number(scrubTime.toFixed(2)),
      targetName: activeTarget,
      property: propType,
      axis,
      value: keyValue,
      interpolation: 'smooth',
    };
    onUpdateEntity((ent) => {
      const merged = [
        ...ent.animator.keyframes.filter(
          (k) =>
            !(
              Math.abs(k.time - kf.time) < 0.02 &&
              k.targetName === kf.targetName &&
              k.property === kf.property &&
              k.axis === kf.axis
            )
        ),
        kf,
      ].sort((a, b) => a.time - b.time);
      return syncKeyframesToActiveClip(ent, merged);
    });
    setSelectedKfId(kf.id);
  };

  const updateSelectedKeyframe = (patch: Partial<TimelineKeyframe>) => {
    if (!selectedKfId) return;
    onUpdateEntity((ent) => {
      const updated = ent.animator.keyframes
        .map((k) => (k.id === selectedKfId ? { ...k, ...patch } : k))
        .sort((a, b) => a.time - b.time);
      return syncKeyframesToActiveClip(ent, updated);
    });
  };

  const removeKeyframe = (id: string) => {
    onUpdateEntity((ent) => {
      const filtered = ent.animator.keyframes.filter((k) => k.id !== id);
      return syncKeyframesToActiveClip(ent, filtered);
    });
    if (selectedKfId === id) setSelectedKfId(null);
  };

  const filteredPresets =
    libCategory === 'Todas'
      ? ANIMATION_LIBRARY
      : ANIMATION_LIBRARY.filter((p) => p.category === libCategory);

  const ticks = [0, 0.25, 0.5, 0.75, 1.0].map((r) => Number((r * dur).toFixed(2)));

  return (
    <div className="flex flex-col h-full gap-1.5 font-sans select-none">
      {/* Barra superior da Timeline + Biblioteca + Promoção para Estado */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={onToggleRecord}
            title="Auto-Key (REC): gravar keyframes automaticamente ao mover ossos ou objeto"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-medium transition-colors ${
              isRecording
                ? 'bg-red-600/25 border-red-500 text-red-300'
                : 'bg-[#0B0D11] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <Circle className={`w-3 h-3 ${isRecording ? 'fill-red-500 text-red-500' : ''}`} />
            REC
          </button>

          <button
            onClick={() => onScrubChange(0)}
            title="Início"
            className="p-1 rounded bg-[#0B0D11] border border-white/10 text-slate-300 hover:text-white"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onScrubChange(Math.max(0, Number((scrubTime - 1 / 30).toFixed(2))))}
            title="Voltar 1 frame (30 FPS)"
            className="p-1 rounded bg-[#0B0D11] border border-white/10 text-slate-300 hover:text-white"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onTogglePreview}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            {isPreviewPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isPreviewPlaying ? 'Pausar' : 'Play'}
          </button>

          <button
            onClick={() => onScrubChange(Math.min(dur, Number((scrubTime + 1 / 30).toFixed(2))))}
            title="Avançar 1 frame (30 FPS)"
            className="p-1 rounded bg-[#0B0D11] border border-white/10 text-slate-300 hover:text-white"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onScrubChange(dur)}
            title="Fim"
            className="p-1 rounded bg-[#0B0D11] border border-white/10 text-slate-300 hover:text-white"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono text-slate-300 tabular-nums px-1">
            {scrubTime.toFixed(2)}s / {dur.toFixed(1)}s
          </span>

          <select
            value={clipSpeed}
            onChange={(e) =>
              onUpdateEntity((ent) => ({
                ...ent,
                animator: { ...ent.animator, clipSpeed: parseFloat(e.target.value) || 1 },
              }))
            }
            title="Velocidade de reprodução"
            className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-[11px] text-slate-300"
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1.0x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2.0x</option>
          </select>

          <button
            onClick={() =>
              onUpdateEntity((ent) => ({
                ...ent,
                animator: {
                  ...ent.animator,
                  clipLoop: !clipLoop,
                  clips: ent.animator.clips.map((c) =>
                    c.id === activeClip?.id ? { ...c, loop: !clipLoop } : c
                  ),
                },
              }))
            }
            title="Alternar Loop do clipe"
            className={`p-1 rounded border ${
              clipLoop
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'bg-[#0B0D11] border-white/10 text-slate-500'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          {/* Seletor de Clipe + Botões Nova Animação / Biblioteca */}
          <div className="flex items-center gap-1 ml-1">
            <Film className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <select
              value={
                entity.activeBlenderClip
                  ? `blender:${entity.activeBlenderClip}`
                  : activeClip
                  ? `clip:${activeClip.id}`
                  : '__none__'
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('blender:')) {
                  const cname = val.slice(8);
                  onUpdateEntity((ent) => ({
                    ...ent,
                    activeBlenderClip: cname,
                    animator: { ...ent.animator, useKeyframes: false, libraryPresetId: null },
                  }));
                } else if (val.startsWith('clip:')) {
                  const cid = val.slice(5);
                  const found = entity.animator.clips.find((c) => c.id === cid);
                  if (found) {
                    onUpdateEntity((ent) => ({
                      ...ent,
                      activeBlenderClip: null,
                      animator: {
                        ...ent.animator,
                        enabled: true,
                        useKeyframes: true,
                        libraryPresetId: null,
                        activeClipId: found.id,
                        clipDuration: found.duration,
                        keyframes: found.keyframes,
                      },
                    }));
                    onScrubChange(0);
                  }
                }
              }}
              className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200 max-w-[155px]"
            >
              {entity.animator.clips.length === 0 && entity.blenderClips.length === 0 && (
                <option value="__none__">Sem clipe selecionado</option>
              )}
              {entity.animator.clips.map((c) => (
                <option key={c.id} value={`clip:${c.id}`}>
                  {c.name} ({c.duration.toFixed(1)}s)
                </option>
              ))}
              {entity.blenderClips.map((c) => (
                <option key={c} value={`blender:${c}`}>
                  Blender: {c}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setShowNewClipForm((v) => !v);
                setShowLibrary(false);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 whitespace-nowrap"
              title="Criar novo clipe vazio"
            >
              <Plus className="w-3 h-3" /> Clipe
            </button>

            <button
              onClick={() => {
                setShowLibrary((v) => !v);
                setShowNewClipForm(false);
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border whitespace-nowrap ${
                showLibrary
                  ? 'bg-purple-600/30 border-purple-400 text-purple-200'
                  : 'bg-purple-600/15 hover:bg-purple-600/25 border-purple-500/35 text-purple-200'
              }`}
              title="Abrir Biblioteca de Animações Prontas (Combate, Locomoção, Reações, Criaturas)"
            >
              <BookOpen className="w-3 h-3" /> Biblioteca ({ANIMATION_LIBRARY.length})
            </button>

            {activeClip && !entity.activeBlenderClip && (
              <>
                <button
                  onClick={handlePromoteClipToState}
                  title="Transformar clipe atual em um Estado no Animator"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 whitespace-nowrap"
                >
                  <GitBranch className="w-3 h-3" /> + Estado
                </button>
                <button
                  onClick={handleDuplicateActiveClip}
                  title="Duplicar animação atual"
                  className="p-1 rounded bg-[#0B0D11] border border-white/10 text-slate-300 hover:text-white"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDeleteActiveClip}
                  title="Excluir animação atual"
                  className="p-1 rounded bg-[#0B0D11] border border-white/10 text-red-300 hover:bg-red-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {entity.activeBlenderClip && (
              <button
                onClick={() => onBakeBlenderClip(entity.activeBlenderClip!)}
                title="Converter animação do Blender em clipe editável na linha do tempo"
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 whitespace-nowrap"
              >
                <Sparkles className="w-3 h-3 text-amber-400" /> Editar Keyframes
              </button>
            )}
          </div>
        </div>

        {/* Inserir Keyframe / Capturar Pose */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={handleCapturePoseAtPlayhead}
            title="Capturar rotação atual de todos os ossos neste instante"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-200 whitespace-nowrap"
          >
            <Crosshair className="w-3 h-3" /> Pose
          </button>
          <select
            value={propType}
            onChange={(e) => setPropType(e.target.value as typeof propType)}
            className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 text-slate-200"
          >
            <option value="rotation">Rotação</option>
            <option value="position">Posição</option>
            <option value="scale">Escala</option>
          </select>
          <select
            value={axis}
            onChange={(e) => setAxis(e.target.value as 'x' | 'y' | 'z')}
            className="bg-[#0B0D11] border border-white/10 rounded px-1 py-1 text-slate-200"
          >
            <option value="x">X</option>
            <option value="y">Y</option>
            <option value="z">Z</option>
          </select>
          <input
            type="number"
            step={propType === 'rotation' ? 5 : 0.1}
            value={keyValue}
            onChange={(e) => setKeyValue(parseFloat(e.target.value) || 0)}
            className="w-14 bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200 tabular-nums"
          />
          <button
            onClick={addKeyframeAtPlayhead}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-white whitespace-nowrap"
          >
            <Plus className="w-3 h-3" /> Keyframe
          </button>
        </div>
      </div>

      {/* Biblioteca de Animações embutida */}
      {showLibrary && (
        <div className="p-2 rounded bg-[#141822] border border-purple-500/35 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-purple-300" />
              <span className="font-display font-semibold text-white">Biblioteca de Animações</span>
              <div className="flex items-center gap-1 ml-2">
                {(['Todas', 'Combate', 'Locomoção', 'Reações', 'Criaturas'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setLibCategory(cat)}
                    className={`px-2 py-0.5 rounded text-[11px] border ${
                      libCategory === cat
                        ? 'bg-purple-600/30 border-purple-400 text-white'
                        : 'bg-[#0B0D11] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setShowLibrary(false)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
            {filteredPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex flex-col justify-between gap-1 p-2 rounded bg-[#0B0D11] border border-white/10 hover:border-purple-400/50"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-slate-100 truncate">{preset.name}</span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                    {preset.duration.toFixed(1)}s · {preset.loop ? 'Loop' : '1x'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-1">{preset.description}</p>
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    onClick={() => handleApplyLibraryPreset(preset, false)}
                    className="flex-1 py-0.5 rounded bg-purple-600/25 hover:bg-purple-600/40 text-purple-200 text-[10px] font-medium"
                  >
                    Carregar Clipe
                  </button>
                  <button
                    onClick={() => handleApplyLibraryPreset(preset, true)}
                    className="flex-1 py-0.5 rounded bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 text-[10px] font-medium"
                  >
                    + Estado Animator
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário inline para criar novo clipe */}
      {showNewClipForm && (
        <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 rounded bg-[#161A23] border border-emerald-500/30 text-xs">
          <span className="text-emerald-300 font-medium">Nova Animação:</span>
          <input
            value={newClipName}
            onChange={(e) => setNewClipName(e.target.value)}
            placeholder={`Ex: AtaqueEspecial (${entity.animator.clips.length + 1})`}
            className="w-48 bg-[#0B0D11] border border-white/10 rounded px-2 py-0.5 text-white"
          />
          <label className="flex items-center gap-1 text-slate-300">
            Duração (s):
            <input
              type="number"
              step={0.5}
              min={0.5}
              max={30}
              value={newClipDuration}
              onChange={(e) => setNewClipDuration(parseFloat(e.target.value) || 2.0)}
              className="w-16 bg-[#0B0D11] border border-white/10 rounded px-1.5 py-0.5 font-mono text-slate-200"
            />
          </label>
          <button
            onClick={handleCreateNewClip}
            className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            Criar Clipe
          </button>
          <button
            onClick={() => setShowNewClipForm(false)}
            className="px-2 py-0.5 rounded bg-white/5 text-slate-300 hover:text-white"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Barra de edição rápida do Keyframe selecionado */}
      {selectedKf && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 rounded bg-[#151A25] border border-blue-500/30 text-[11px]">
          <span className="font-mono text-blue-300">
            KF: {selectedKf.targetName}.{selectedKf.property}.{selectedKf.axis}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-slate-300">
              Tempo:
              <input
                type="number"
                step={0.05}
                min={0}
                max={dur}
                value={selectedKf.time}
                onChange={(e) =>
                  updateSelectedKeyframe({ time: Math.min(dur, Math.max(0, parseFloat(e.target.value) || 0)) })
                }
                className="w-14 bg-[#0B0D11] border border-white/10 rounded px-1 py-0.5 font-mono text-white"
              />
            </label>
            <label className="flex items-center gap-1 text-slate-300">
              Valor:
              <input
                type="number"
                step={selectedKf.property === 'rotation' ? 5 : 0.1}
                value={selectedKf.value}
                onChange={(e) => updateSelectedKeyframe({ value: parseFloat(e.target.value) || 0 })}
                className="w-16 bg-[#0B0D11] border border-white/10 rounded px-1 py-0.5 font-mono text-white"
              />
            </label>
            <label className="flex items-center gap-1 text-slate-300">
              Curva:
              <select
                value={selectedKf.interpolation ?? 'smooth'}
                onChange={(e) =>
                  updateSelectedKeyframe({ interpolation: e.target.value as 'linear' | 'smooth' | 'step' })
                }
                className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-0.5 text-slate-200"
              >
                <option value="smooth">Suave (Ease)</option>
                <option value="linear">Linear</option>
                <option value="step">Step (Instantâneo)</option>
              </select>
            </label>
            <button
              onClick={() => removeKeyframe(selectedKf.id)}
              className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
            >
              Remover
            </button>
          </div>
        </div>
      )}

      {/* Área principal da Dopesheet com RÉGUA HORIZONTAL + LINHA VERTICAL CONTÍNUA */}
      <div className="flex-1 min-h-0 flex flex-col border border-white/10 rounded bg-[#0B0D11] overflow-hidden">
        <div className="grid grid-cols-[190px_1fr] border-b border-white/10 bg-[#151922] shrink-0">
          <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400 border-r border-white/10 flex items-center justify-between">
            <span>Ossos / Objeto</span>
            <span className="font-mono text-[10px] text-slate-500">30 FPS</span>
          </div>

          <div
            ref={rulerRef}
            onPointerDown={(e) => {
              setDraggingScrub(true);
              updateScrubFromClientX(e.clientX);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (draggingScrub) updateScrubFromClientX(e.clientX);
            }}
            onPointerUp={() => setDraggingScrub(false)}
            className="relative h-6 cursor-ew-resize"
          >
            {ticks.map((t, idx) => (
              <div
                key={`${t}_${idx}`}
                style={{ left: `${(idx / (ticks.length - 1)) * 100}%` }}
                className="absolute top-0 bottom-0 flex flex-col justify-end pointer-events-none"
              >
                <span className="font-mono text-[10px] text-slate-400 -translate-x-1/2 px-1 tabular-nums">
                  {t.toFixed(2)}s
                </span>
                <div className="h-1.5 w-px bg-white/25" />
              </div>
            ))}

            {/* Cabeça da Linha Vertical */}
            <div
              style={{ left: `${Math.min(100, (scrubTime / dur) * 100)}%` }}
              className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20"
            >
              <div className={`w-2.5 h-3 rounded-b-sm ${isRecording ? 'bg-red-500' : 'bg-blue-400'}`} />
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-y-auto">
          <div className="grid grid-cols-[190px_1fr] min-h-full">
            <div className="border-r border-white/10 divide-y divide-white/[0.05]">
              {trackRows.map((row) => {
                const isSelected =
                  (row.targetName === '__root__' && entity.selectedBone === null) ||
                  row.targetName === entity.selectedBone;
                return (
                  <button
                    key={row.targetName}
                    onClick={() =>
                      onUpdateEntity((ent) => ({
                        ...ent,
                        selectedBone: row.isBone ? row.targetName : null,
                      }))
                    }
                    className={`w-full h-7 px-2.5 text-left text-[11px] flex items-center justify-between transition-colors ${
                      isSelected ? 'bg-blue-600/20 text-white' : 'text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="truncate font-mono">{row.label}</span>
                    {row.isBone && <span className="text-[10px] text-amber-400/80">Osso</span>}
                  </button>
                );
              })}
            </div>

            <div
              ref={trackLaneRef}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).dataset.kf) return;
                updateScrubFromClientX(e.clientX);
              }}
              onPointerMove={(e) => {
                if (!draggingKfId) return;
                const nextT = timeFromClientX(e.clientX, trackLaneRef.current);
                onUpdateEntity((ent) => {
                  const updated = ent.animator.keyframes.map((k) =>
                    k.id === draggingKfId ? { ...k, time: nextT } : k
                  );
                  return syncKeyframesToActiveClip(ent, updated);
                });
                onScrubChange(nextT);
              }}
              onPointerUp={() => setDraggingKfId(null)}
              className="relative divide-y divide-white/[0.05]"
            >
              {/* LINHA VERTICAL TRADICIONAL (Unity Playhead Line) */}
              <div
                style={{ left: `${Math.min(100, (scrubTime / dur) * 100)}%` }}
                className={`absolute top-0 bottom-0 w-[2px] -translate-x-1/2 pointer-events-none z-10 ${
                  isRecording ? 'bg-red-500/90' : 'bg-blue-400/90'
                }`}
              />

              {trackRows.map((row) => {
                const rowKfs = entity.animator.keyframes.filter((k) => k.targetName === row.targetName);
                return (
                  <div key={row.targetName} className="relative h-7 flex items-center">
                    {rowKfs.map((kf) => (
                      <button
                        key={kf.id}
                        data-kf="true"
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          setSelectedKfId(kf.id);
                          setDraggingKfId(kf.id);
                          onScrubChange(kf.time);
                          (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
                        }}
                        onDoubleClick={(ev) => {
                          ev.stopPropagation();
                          removeKeyframe(kf.id);
                        }}
                        title={`${kf.targetName}.${kf.property}.${kf.axis} = ${kf.value} (${kf.time}s) · Arraste para mover / Duplo clique remove`}
                        style={{ left: `${Math.min(98.5, Math.max(1.5, (kf.time / dur) * 100))}%` }}
                        className={`absolute -translate-x-1/2 w-2.5 h-2.5 rotate-45 border z-20 cursor-ew-resize transition-transform ${
                          selectedKfId === kf.id
                            ? 'bg-blue-400 border-white scale-125'
                            : 'bg-amber-400 border-black hover:scale-110'
                        }`}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
