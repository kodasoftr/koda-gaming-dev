import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Code2,
  FolderCode,
  Link2,
  Play,
  Plus,
  Square,
  Trash2,
  Unlink,
} from 'lucide-react';
import { compileUnityScript, SCRIPT_TEMPLATES } from '../utils/scriptRuntime';
import type { EngineEntity, ScriptAsset, ScriptLanguage } from '../types/engine';

type ScriptWindowTab = 'code' | 'files' | 'bindings' | 'api';

interface ScriptEditorPanelProps {
  scripts: ScriptAsset[];
  activeScriptId: string | null;
  onSelectScript: (id: string) => void;
  onCreateScript: (templateKey: keyof typeof SCRIPT_TEMPLATES, customName?: string) => void;
  onUpdateScript: (id: string, updater: (scr: ScriptAsset) => ScriptAsset) => void;
  onDeleteScript: (id: string) => void;
  entities: EngineEntity[];
  selectedEntity: EngineEntity | null;
  onBindScriptToEntity: (entityId: number, scriptId: string | null) => void;
  onUpdateEntity?: (entityId: number, updater: (ent: EngineEntity) => EngineEntity) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

const API_SNIPPETS: { title: string; category: string; snippet: string; desc: string }[] = [
  {
    category: 'Controles (Teclado / Touch / Controle / Mouse)',
    title: 'Movimento Eixos 1P/2P',
    desc: 'Lê WASD, Setas, D-Pad Touch e Analógico do Controle automaticamente.',
    snippet: `float h = Input.GetAxis("Horizontal");\nfloat v = Input.GetAxis("Vertical");`,
  },
  {
    category: 'Controles (Teclado / Touch / Controle / Mouse)',
    title: 'Botões de Ação (Pulo / Ataque / Tiro)',
    desc: 'Detecta Espaço, F, Clique do Mouse, Botões Touch e Controle (A/X/RT).',
    snippet: `if (Input.GetButton("Jump") && Rigidbody.isGrounded) {\n    Rigidbody.AddForce(0.0f, params.jumpForce, 0.0f);\n}\nif (Input.GetButton("Attack")) {\n    Combat.Attack();\n}`,
  },
  {
    category: 'Combate & Tiro',
    title: 'Disparar Projétil 2D/3D',
    desc: 'Dispara projétil na direção atual do objeto e causa dano nos inimigos.',
    snippet: `if (Input.GetButton("Attack")) {\n    Combat.Shoot();\n}`,
  },
  {
    category: 'Cena & Câmera',
    title: 'Encontrar Jogador Mais Próximo',
    desc: 'Útil para IA de Zumbis e Câmeras em modo 1P ou 2P Split-Screen.',
    snippet: `var target = Scene.FindNearestPlayer(transform.position);\nif (target != null) {\n    transform.lookAt(target.position);\n}`,
  },
];

export const ScriptEditorPanel: React.FC<ScriptEditorPanelProps> = ({
  scripts,
  activeScriptId,
  onSelectScript,
  onCreateScript,
  onUpdateScript,
  onDeleteScript,
  entities,
  selectedEntity,
  onBindScriptToEntity,
  onUpdateEntity,
  isPlaying,
  onTogglePlay,
}) => {
  const [activeSubWindow, setActiveSubWindow] = useState<ScriptWindowTab>('code');
  const [templateChoice, setTemplateChoice] = useState<keyof typeof SCRIPT_TEMPLATES>('brawler3d');
  const [newScriptName, setNewScriptName] = useState('');

  const activeScript = scripts.find((s) => s.id === activeScriptId) ?? scripts[0] ?? null;

  const compileResult = useMemo(() => {
    if (!activeScript) return { fn: null, error: null };
    return compileUnityScript(activeScript.code);
  }, [activeScript?.code]);

  const linkedEntities = useMemo(() => {
    if (!activeScript) return [];
    return entities.filter((e) => e.script.scriptAssetId === activeScript.id);
  }, [entities, activeScript]);

  const lines = activeScript ? activeScript.code.split('\n') : [];

  const handleInsertSnippet = (snippet: string) => {
    if (!activeScript) return;
    onUpdateScript(activeScript.id, (s) => ({
      ...s,
      code: `${s.code}\n// Snippet inserido:\n// ${snippet.replace(/\n/g, '\n// ')}\n`,
    }));
    setActiveSubWindow('code');
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0D1016] text-xs min-h-0">
      {/* Barra Superior Limpa com Botões para Escolher Cada Janela */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#131720] border-b border-white/10 shrink-0">
        {/* Esquerda: Seletor rápido de Script + Status */}
        <div className="flex items-center gap-2 min-w-0">
          <select
            value={activeScript?.id ?? ''}
            onChange={(e) => onSelectScript(e.target.value)}
            className="bg-[#0B0D11] border border-white/10 rounded px-2.5 py-1 font-mono text-xs text-white max-w-[190px]"
          >
            {scripts.map((scr) => (
              <option key={scr.id} value={scr.id}>
                {scr.name}
              </option>
            ))}
          </select>

          {activeScript &&
            (compileResult.error ? (
              <span className="inline-flex items-center gap-1 text-red-400 font-mono text-[11px] truncate max-w-[200px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {compileResult.error}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px] whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Pronto
              </span>
            ))}
        </div>

        {/* Centro: Botões para Escolher Cada Sub-Janela */}
        <div className="flex items-center gap-1 bg-[#0B0D11] border border-white/10 rounded-md p-0.5">
          {(
            [
              { id: 'code', label: 'Código', icon: Code2 },
              { id: 'files', label: `Arquivos (${scripts.length})`, icon: FolderCode },
              { id: 'bindings', label: `Vínculos (${linkedEntities.length})`, icon: Link2 },
              { id: 'api', label: 'API Engine', icon: BookOpen },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSubWindow(id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                activeSubWindow === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Direita: Testar Play */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onTogglePlay}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded font-medium whitespace-nowrap ${
              isPlaying
                ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isPlaying ? 'Stop' : 'Testar'}
          </button>
        </div>
      </div>

      {/* Conteúdo da Sub-Janela Selecionada */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* 1. JANELA: CÓDIGO */}
        {activeSubWindow === 'code' && (
          !activeScript ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
              <p>Nenhum script selecionado.</p>
              <button
                onClick={() => setActiveSubWindow('files')}
                className="px-3 py-1.5 rounded bg-blue-600 text-white"
              >
                Abrir Arquivos e Criar Script
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#10131A] border-b border-white/[0.06] text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-200">{activeScript.name}</span>
                  <span>·</span>
                  <span>
                    {activeScript.language === 'CSharp_Mono'
                      ? 'C# (Mono)'
                      : activeScript.language === 'Kotlin_JNI'
                      ? 'Kotlin (JNI)'
                      : 'C++ (Nativo)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>
                    {linkedEntities.length === 0
                      ? 'Não vinculado'
                      : `Em: ${linkedEntities.map((e) => e.name).join(', ')}`}
                  </span>
                  <button
                    onClick={() => setActiveSubWindow('bindings')}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Vincular →
                  </button>
                </div>
              </div>

              <div className="flex-1 flex min-h-0 overflow-hidden bg-[#0A0C10]">
                <div className="w-11 py-3 pr-2.5 text-right font-mono text-[11px] leading-5 text-slate-600 select-none bg-[#0D1016] border-r border-white/[0.06] overflow-hidden">
                  {lines.map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>
                <textarea
                  value={activeScript.code}
                  onChange={(e) =>
                    onUpdateScript(activeScript.id, (s) => ({ ...s, code: e.target.value }))
                  }
                  spellCheck={false}
                  className="flex-1 w-full h-full p-3 bg-transparent font-mono text-xs leading-5 text-slate-200 resize-none focus:outline-none overflow-auto"
                />
              </div>
            </div>
          )
        )}

        {/* 2. JANELA: ARQUIVOS DE SCRIPTS & CRIAR NOVO */}
        {activeSubWindow === 'files' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Criar novo script */}
            <div className="rounded-lg bg-[#121620] border border-white/10 p-3.5 space-y-2.5">
              <p className="font-display font-semibold text-white">Novo Script do Projeto</p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={newScriptName}
                  onChange={(e) => setNewScriptName(e.target.value)}
                  placeholder="Nome da classe (ex: ZumbiRapido, PoderEspecial)"
                  className="flex-1 min-w-[200px] bg-[#0B0D11] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <select
                  value={templateChoice}
                  onChange={(e) => setTemplateChoice(e.target.value as keyof typeof SCRIPT_TEMPLATES)}
                  className="bg-[#0B0D11] border border-white/10 rounded px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="brawler3d">Modelo: Briga de Rua 3D</option>
                  <option value="shooter2d">Modelo: Tiro 2D</option>
                  <option value="zombie_ai">Modelo: IA de Zumbi</option>
                  <option value="player_wasd">Modelo: Jogador 3D (WASD)</option>
                  <option value="platformer2d">Modelo: Plataforma 2D</option>
                  <option value="patrol">Modelo: Patrulha</option>
                  <option value="collectible">Modelo: Item Coletável</option>
                  <option value="camera_follow">Modelo: Câmera</option>
                  <option value="blank">Em Branco</option>
                </select>
                <button
                  onClick={() => {
                    onCreateScript(templateChoice, newScriptName.trim() || undefined);
                    setNewScriptName('');
                    setActiveSubWindow('code');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Criar Script
                </button>
              </div>
            </div>

            {/* Lista de scripts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {scripts.map((scr) => {
                const isSel = activeScript?.id === scr.id;
                const boundCount = entities.filter((e) => e.script.scriptAssetId === scr.id).length;
                return (
                  <div
                    key={scr.id}
                    className={`rounded-lg p-3 border space-y-2.5 transition-colors ${
                      isSel
                        ? 'bg-blue-600/15 border-blue-500/50'
                        : 'bg-[#121620] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <input
                          value={scr.name}
                          onChange={(e) =>
                            onUpdateScript(scr.id, (s) => ({ ...s, name: e.target.value }))
                          }
                          className="w-full bg-[#0B0D11] border border-white/10 rounded px-2 py-1 font-mono text-xs text-white"
                        />
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <select
                            value={scr.language}
                            onChange={(e) =>
                              onUpdateScript(scr.id, (s) => ({
                                ...s,
                                language: e.target.value as Exclude<ScriptLanguage, 'None'>,
                              }))
                            }
                            className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-slate-300"
                          >
                            <option value="CSharp_Mono">C# (Mono)</option>
                            <option value="Kotlin_JNI">Kotlin (JNI)</option>
                            <option value="Native_CPP">C++ (Nativo)</option>
                          </select>
                          <span>{boundCount} vinculado(s)</span>
                        </div>
                      </div>

                      {scripts.length > 1 && (
                        <button
                          onClick={() => onDeleteScript(scr.id)}
                          title="Excluir script"
                          className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          onSelectScript(scr.id);
                          setActiveSubWindow('code');
                        }}
                        className="flex-1 py-1.5 rounded bg-blue-600/25 hover:bg-blue-600/35 border border-blue-500/40 text-blue-100 font-medium"
                      >
                        Abrir Código
                      </button>
                      <button
                        onClick={() => {
                          onSelectScript(scr.id);
                          setActiveSubWindow('bindings');
                        }}
                        className="px-2.5 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200"
                      >
                        Vincular
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. JANELA: VÍNCULOS COM OBJETOS & PARÂMETROS (ESTILO UNITY) */}
        {activeSubWindow === 'bindings' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeScript ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                  <div>
                    <p className="font-display font-semibold text-white">
                      Vincular &ldquo;{activeScript.name}&rdquo; aos Objetos da Cena
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Escolha quais objetos executam este script e ajuste velocidade, força e jogador (1P/2P).
                    </p>
                  </div>
                  {selectedEntity && (
                    <span className="text-[11px] text-blue-300">
                      Selecionado na cena: {selectedEntity.name}
                    </span>
                  )}
                </div>

                {/* Valores padrão do Script */}
                <div className="rounded-lg bg-[#121620] border border-white/10 p-3 space-y-2">
                  <span className="text-[11px] font-semibold text-slate-300">
                    Parâmetros Padrão do Script
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { key: 'moveSpeed', label: 'Velocidade' },
                        { key: 'jumpForce', label: 'Força Pulo' },
                        { key: 'rotateSpeed', label: 'Rotação' },
                        { key: 'amplitude', label: 'Alcance / Amp' },
                      ] as const
                    ).map(({ key, label }) => (
                      <label key={key} className="flex flex-col gap-0.5 text-[11px] text-slate-400">
                        {label}
                        <input
                          type="number"
                          step={0.25}
                          value={activeScript.defaultParams[key]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            onUpdateScript(activeScript.id, (s) => ({
                              ...s,
                              defaultParams: { ...s.defaultParams, [key]: val },
                            }));
                          }}
                          className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 font-mono text-white"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Lista de Objetos da Cena */}
                <div className="space-y-2">
                  {entities.map((ent) => {
                    const isBoundHere = ent.script.scriptAssetId === activeScript.id;
                    const otherBound =
                      ent.script.scriptAssetId && ent.script.scriptAssetId !== activeScript.id
                        ? scripts.find((s) => s.id === ent.script.scriptAssetId)?.name
                        : null;
                    return (
                      <div
                        key={ent.id}
                        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg p-2.5 border ${
                          isBoundHere
                            ? 'bg-blue-600/15 border-blue-500/40'
                            : 'bg-[#121620] border-white/10'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{ent.name}</span>
                            <span className="text-[11px] text-slate-500">{ent.kind}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {isBoundHere
                              ? `Executando ${activeScript.name} · Vel ${ent.script.params.moveSpeed}`
                              : otherBound
                              ? `Vinculado a: ${otherBound}`
                              : `Mecânica rápida: ${ent.script.mechanicPreset}`}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {onUpdateEntity && (
                            <select
                              value={ent.playerSlot ?? 1}
                              onChange={(e) =>
                                onUpdateEntity(ent.id, (prev) => ({
                                  ...prev,
                                  playerSlot: Number(e.target.value) as 1 | 2,
                                }))
                              }
                              title="Controle associado"
                              className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-[11px] text-slate-200"
                            >
                              <option value={1}>Controle 1P</option>
                              <option value={2}>Controle 2P</option>
                            </select>
                          )}

                          {isBoundHere ? (
                            <button
                              onClick={() => onBindScriptToEntity(ent.id, null)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30"
                            >
                              <Unlink className="w-3.5 h-3.5" /> Desvincular
                            </button>
                          ) : (
                            <button
                              onClick={() => onBindScriptToEntity(ent.id, activeScript.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                            >
                              <Link2 className="w-3.5 h-3.5" /> Vincular
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-slate-400">Crie ou selecione um script primeiro.</p>
            )}
          </div>
        )}

        {/* 4. JANELA: API ENGINE & SNIPPETS */}
        {activeSubWindow === 'api' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="pb-2 border-b border-white/10">
              <p className="font-display font-semibold text-white">API Nativa da Koda Engine</p>
              <p className="text-[11px] text-slate-400">
                Todos os scripts funcionam com Teclado, Mouse, Touchscreen, Controles (Gamepad) e Câmeras.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {API_SNIPPETS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg bg-[#121620] border border-white/10 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white">{item.title}</span>
                    <button
                      onClick={() => handleInsertSnippet(item.snippet)}
                      className="px-2 py-0.5 rounded bg-blue-600/25 border border-blue-500/40 text-[11px] text-blue-200 hover:bg-blue-600/35"
                    >
                      Inserir
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">{item.desc}</p>
                  <pre className="p-2 rounded bg-[#0A0C10] border border-white/[0.06] font-mono text-[11px] text-emerald-300 overflow-x-auto">
                    {item.snippet}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
