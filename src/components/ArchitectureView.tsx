import React, { useState } from 'react';
import { Folder, FileCode } from 'lucide-react';

type PriorityTier = 'All' | 'P0' | 'P1' | 'P2' | 'P3';

interface DirectoryNode {
  path: string;
  layer: string;
  role: string;
  files: string[];
}

const DIRECTORY_GUIDE: DirectoryNode[] = [
  {
    path: '/include/koda/',
    layer: 'Contratos Públicos (ECS + RHI)',
    role: 'Interfaces estáveis sem acoplamento de plataforma: Registry/Components do ECS, IRHIDevice, RenderGraph, Skeleton/Animator e C ABI para plugins.',
    files: ['core/Guid.hpp', 'core/PluginABI.h', 'ecs/Registry.hpp', 'ecs/Components.hpp', 'rhi/IRHIDevice.hpp', 'rhi/RenderGraph.hpp', 'animation/AnimatorGraph.hpp'],
  },
  {
    path: '/src/core/ & /src/ecs/',
    layer: 'Núcleo C++17, Skeleton 64-Bones & Spatial AI',
    role: 'Armazenamento orientado a dados (SparseSet/SoA), grade espacial O(1) sem alocação para IA de multidões, paleta de até 64 ossos Blender e Animator Multi-State.',
    files: ['Guid.cpp', 'Log.cpp', 'Registry.cpp', 'AnimatorSystem.cpp', 'SkeletonSystem.cpp', 'SpatialAISystem.cpp'],
  },
  {
    path: '/src/rhi/',
    layer: 'Abstração Gráfica & Detecção Automática (DX11 / WebGPU)',
    role: 'Detecção automática de ambiente em runtime/CMake: DirectX 11 + DXGI Flip-Model no Windows (.exe) e WebGPU + WGSL no navegador (Emscripten Wasm), além de DX12/Vulkan.',
    files: ['dx11/DX11Device.cpp', 'webgpu/WebGPUDevice.cpp', 'dx12/DX12Device.cpp', 'vulkan/VulkanDevice.cpp', 'legacy/DX9Device.cpp'],
  },
  {
    path: '/src/editor/',
    layer: 'Editor Estilo Unity/Godot (Dear ImGui)',
    role: 'Painéis modulares do editor: Hierarquia, Inspetor, Viewport 3D/2D com Gizmos, Animator State Graph, Timeline de Keyframes, Asset Browser e Shader Hot-Reload.',
    files: ['EditorApp.cpp', 'HierarchyPanel.cpp', 'InspectorPanel.cpp', 'ViewportPanel.cpp', 'AnimatorPanel.cpp', 'AssetBrowserPanel.cpp'],
  },
  {
    path: '/external/',
    layer: 'Dependências de Terceiros',
    role: 'Submódulos ou FetchContent gerenciados pelo CMake: Dear ImGui, Vulkan Memory Allocator, Jolt Physics, EnTT, Mono, ENet, stb_image e Tracy.',
    files: ['imgui/', 'vma/', 'jolt/', 'stb/', 'mono/', 'tracy/'],
  },
  {
    path: '/assets/ & /runtime/',
    layer: 'Recursos & Empacotamento Multiplataforma',
    role: 'Scenes (.kscene), Models (.obj/.gltf), Textures (.png/.bmp), Animations (.kanim), Shaders (.hlsl) e templates pré-compilados para .AppImage e .apk.',
    files: ['assets/Scenes/', 'assets/Textures/', 'assets/Models/', 'assets/Animations/', 'runtime/android/jniLibs/', 'runtime/linux/AppDir/'],
  },
  {
    path: '/cmake/ & /build/',
    layer: 'Build CMake & Toolchains',
    role: 'CMakeLists.txt raiz (C++17 + Windows SDK + DX11) e toolchain files para compilação cruzada sem alterar código-fonte; /build fica fora do controle de versão.',
    files: ['CMakeLists.txt', 'cmake/toolchain-windows.cmake', 'cmake/toolchain-linux.cmake', 'cmake/toolchain-android.cmake'],
  },
];

interface RoadmapItem {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  module: string;
  scope: string;
  complexity: 'Baixa' | 'Média' | 'Alta';
  reference: string;
  status: string;
}

const ROADMAP: RoadmapItem[] = [
  { priority: 'P0', module: 'Build Base CMake', scope: 'CMakeLists.txt C++17 + Windows SDK / DX11 + toolchains', complexity: 'Média', reference: 'EVEngine', status: 'Implementado' },
  { priority: 'P0', module: 'Janela e Input', scope: 'Win32 WndProc, Gizmos W/E/R, Raycast e Câmera Orbital', complexity: 'Baixa', reference: 'ART Engine', status: 'Implementado' },
  { priority: 'P0', module: 'RHI Auto (DX11 / WebGPU)', scope: 'DetectEnvironmentProfile() alternando DX11 (.exe) e WebGPU (Browser Wasm)', complexity: 'Alta', reference: 'WebGPU / DX11', status: 'Auto-Detecção ativa' },
  { priority: 'P0', module: 'ECS Orientado a Dados', scope: 'Entidades, GUID 128-bit, Skeleton 64-Bones, Physics e Spatial-Hash AI O(1)', complexity: 'Média', reference: 'EnTT', status: 'Implementado' },
  { priority: 'P1', module: 'Recursos e Texturas', scope: 'GUID, Importador .OBJ/.GLB/.FBX, Texture2D + UV Tiling, .kscene JSON', complexity: 'Média', reference: 'Flax Engine', status: 'Implementado' },
  { priority: 'P1', module: 'Editor Estilo Unity/Godot', scope: 'Hierarquia, Inspetor, Viewport 2D/3D, Project Assets, Gizmos', complexity: 'Média', reference: 'SpaRcle Engine', status: 'Implementado' },
  { priority: 'P1', module: 'Animação 2D/3D + Estados', scope: 'Rigs Blender até 64 ossos, Timeline Smooth/Linear/Step e Estados Custom', complexity: 'Alta', reference: 'glTF / Spine', status: 'Implementado' },
  { priority: 'P1', module: 'Editor de Shaders', scope: 'Edição HLSL texturizada, hot-reload e tradução de erros', complexity: 'Alta', reference: 'Shader Editor', status: 'Implementado' },
  { priority: 'P2', module: 'Renderização Visual (RDG)', scope: 'Passes do frame, barreiras, tempos por passe em ms', complexity: 'Alta', reference: 'Gigi / UE RDG', status: 'Profiler + RDG ativo' },
  { priority: 'P2', module: 'Otimização Automática', scope: 'LOD contínuo, HiZ 2-pass, streaming e meshlets', complexity: 'Alta', reference: 'Solis', status: 'Painel e parâmetros' },
  { priority: 'P2', module: 'Scripts C# / Kotlin JNI', scope: 'Mono Internal Calls e chamadas em lote JNI para Android', complexity: 'Alta', reference: 'Flax / JNI', status: 'Templates + Runtime' },
  { priority: 'P2', module: 'IA (MCP Server)', scope: 'Dispatcher local create_rig, create_entity, set_texture', complexity: 'Média', reference: 'Unreal MCP', status: 'Implementado' },
  { priority: 'P3', module: 'Build Android (.apk)', scope: 'Template .so pré-compilado + Gradle + keystore seguro', complexity: 'Média', reference: 'Build Master', status: 'Toolchain gerada' },
  { priority: 'P3', module: 'Rede e Jogos Online', scope: 'ENet / GameNetworkingSockets + replicação por Hz', complexity: 'Alta', reference: 'Valve GNS', status: 'Componente replicação' },
];

export const ArchitectureView: React.FC = () => {
  const [filter, setFilter] = useState<PriorityTier>('All');
  const [selectedDir, setSelectedDir] = useState<DirectoryNode>(DIRECTORY_GUIDE[0]);

  const rows = ROADMAP.filter((r) => filter === 'All' || r.priority === filter);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-10">
      <section className="space-y-3">
        <p className="text-xs text-slate-400">
          Documento de Arquitetura e Estrutura de Diretórios · Núcleo C++17 · ECS + RHI + Editor
        </p>
        <h1 className="font-display text-3xl font-semibold text-white tracking-tight text-balance max-w-3xl">
          Estrutura de Diretórios (ECS + RHI) e Plano de Execução
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
          Organização modular recomendada para separar interfaces públicas (<code className="text-slate-200">/include</code>), implementações nativas (<code className="text-slate-200">/src</code>), dependências (<code className="text-slate-200">/external</code>) e saída de compilação (<code className="text-slate-200">/build</code>).
        </p>
      </section>

      {/* Guia Interativo de Diretórios */}
      <section className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        <div className="bg-[#12151C] border border-white/10 rounded-lg p-3 space-y-1">
          <div className="px-2 py-1 text-xs font-display font-semibold text-slate-400">
            Árvore do Projeto KodaGameDev/
          </div>
          {DIRECTORY_GUIDE.map((node) => (
            <button
              key={node.path}
              onClick={() => setSelectedDir(node)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left text-xs transition-colors ${
                selectedDir.path === node.path
                  ? 'bg-blue-600/20 text-white border border-blue-500/40'
                  : 'text-slate-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Folder className="w-4 h-4 shrink-0 text-blue-400" />
              <div className="min-w-0">
                <div className="font-mono font-medium truncate">{node.path}</div>
                <div className="text-[11px] text-slate-400 truncate">{node.layer}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="bg-[#12151C] border border-white/10 rounded-lg p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="text-xs font-mono text-blue-400">{selectedDir.path}</div>
            <h2 className="font-display text-xl font-semibold text-white">{selectedDir.layer}</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{selectedDir.role}</p>
          </div>

          <div className="space-y-2 pt-4 border-t border-white/10">
            <div className="text-xs font-medium text-slate-400">Arquivos e Subpastas Principais</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedDir.files.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 px-3 py-2 rounded bg-[#0B0D11] border border-white/10 font-mono text-xs text-slate-200"
                >
                  <FileCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Regra de Dependência */}
      <section className="bg-[#12151C] border border-white/10 rounded-lg p-5 space-y-2">
        <h3 className="font-display text-sm font-semibold text-white">
          Regra de Dependência entre Módulos (ECS & RHI)
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          <span className="font-mono text-slate-200">core</span> não depende de ninguém;{' '}
          <span className="font-mono text-slate-200">ecs</span> armazena apenas{' '}
          <span className="font-mono text-slate-200">Guid</span> de malhas/texturas (nunca ponteiros de GPU);{' '}
          <span className="font-mono text-slate-200">rhi</span> isola DX11/DX12/Vulkan atrás de{' '}
          <span className="font-mono text-slate-200">IRHIDevice</span>; e{' '}
          <span className="font-mono text-slate-200">editor</span> consome todos sem vazar para o runtime exportado.
        </p>
      </section>

      {/* Matriz P0-P3 */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold text-white">
            Matriz de Prioridades (P0 a P3)
          </h2>
          <div className="flex items-center gap-1 p-1 bg-[#12151C] border border-white/10 rounded-lg">
            {(['All', 'P0', 'P1', 'P2', 'P3'] as PriorityTier[]).map((tier) => (
              <button
                key={tier}
                onClick={() => setFilter(tier)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filter === tier ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tier === 'All' ? 'Todos' : tier}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#12151C] border border-white/10 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-slate-400">
                  <th className="py-3 px-4 font-medium">Prioridade</th>
                  <th className="py-3 px-4 font-medium">Módulo</th>
                  <th className="py-3 px-4 font-medium">Escopo Técnico</th>
                  <th className="py-3 px-4 font-medium">Complexidade</th>
                  <th className="py-3 px-4 font-medium">Referência</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {rows.map((row) => (
                  <tr key={row.module} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono text-xs text-blue-400 tabular-nums">{row.priority}</td>
                    <td className="py-3 px-4 font-medium text-white whitespace-nowrap">{row.module}</td>
                    <td className="py-3 px-4 text-slate-300">{row.scope}</td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{row.complexity}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">{row.reference}</td>
                    <td className="py-3 px-4 text-xs text-emerald-400 whitespace-nowrap">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
