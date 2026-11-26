import React, { useEffect, useState } from 'react';
import { Copy, Check, Download, Search, FileCode } from 'lucide-react';

interface SourceFileEntry {
  id: string;
  label: string;
  path: string;
  downloadName: string;
  description: string;
}

const SOURCE_FILES: SourceFileEntry[] = [
  {
    id: 'cpp',
    label: 'koda_game_dev.cpp',
    path: '/engine/koda_game_dev.cpp',
    downloadName: 'koda_game_dev.cpp',
    description: 'Núcleo C++17 Multiambiente · Auto DirectX 11 (Windows) / WebGPU (Browser) + Skeleton 64-Bones + Spatial-Hash AI',
  },
  {
    id: 'cmake',
    label: 'CMakeLists.txt',
    path: '/engine/CMakeLists.txt',
    downloadName: 'CMakeLists.txt',
    description: 'Configuração CMake C++17 com auto-detecção Win32 DX11 e Emscripten WebGPU',
  },
  {
    id: 'linux',
    label: 'cmake/toolchain-linux.cmake',
    path: '/engine/cmake/toolchain-linux.cmake',
    downloadName: 'toolchain-linux.cmake',
    description: 'Toolchain para compilação nativa Linux + empacotamento .AppImage',
  },
  {
    id: 'android',
    label: 'cmake/toolchain-android.cmake',
    path: '/engine/cmake/toolchain-android.cmake',
    downloadName: 'toolchain-android.cmake',
    description: 'Toolchain NDK arm64-v8a para vinculação com template Gradle (.apk)',
  },
  {
    id: 'guide',
    label: 'docs/ARCHITECTURE_DIRECTORY_GUIDE.md',
    path: '/engine/ARCHITECTURE_DIRECTORY_GUIDE.md',
    downloadName: 'ARCHITECTURE_DIRECTORY_GUIDE.md',
    description: 'Guia completo de diretórios (/src, /include, /external, /build) focado em ECS e RHI',
  },
];

export const CppSourceViewer: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('cpp');
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const activeFile = SOURCE_FILES.find((f) => f.id === selectedId) ?? SOURCE_FILES[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(
      SOURCE_FILES.map(async (file) => {
        const res = await fetch(file.path);
        if (!res.ok) throw new Error(`Falha ao carregar ${file.label}`);
        return [file.id, await res.text()] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const [k, v] of entries) map[k] = v;
        setContents(map);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar arquivos fonte.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const code = contents[activeFile.id] ?? '';
  const lines = code.split('\n');
  const trimmedSearch = search.trim().toLowerCase();

  const matchingLines = trimmedSearch
    ? lines
        .map((text, idx) => ({ num: idx + 1, text }))
        .filter((l) => l.text.toLowerCase().includes(trimmedSearch))
    : lines.map((text, idx) => ({ num: idx + 1, text }));

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.downloadName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-6 space-y-6">
      <div className="bg-[#12151C] border border-white/10 rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-semibold text-white">
              Código-Fonte Nativo C++17 para Visual Studio
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {activeFile.description} · {lines.length} linhas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!code}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar código'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!code}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar {activeFile.downloadName}
            </button>
          </div>
        </div>

        <div className="bg-[#0B0D11] border border-white/10 rounded-md p-3 font-mono text-xs text-slate-300 overflow-x-auto space-y-1.5">
          <div className="text-slate-500">Windows x64 (DirectX 11 Auto via Visual Studio 2022):</div>
          <div>cmake -B build-win -G "Visual Studio 17 2022" -A x64 -DKODA_FETCH_IMGUI=ON && cmake --build build-win --config Release</div>
          <div className="text-slate-500 pt-1">Navegador WebGPU (Emscripten Wasm + WGPU):</div>
          <div>emcmake cmake -B build-web -DKODA_RHI_BACKEND=WebGPU -DKODA_FETCH_IMGUI=ON && cmake --build build-web -j</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <aside className="bg-[#12151C] border border-white/10 rounded-lg p-3 space-y-1 h-fit">
          <p className="px-2 py-1 font-display text-xs font-semibold text-slate-400">
            Arquivos do Projeto
          </p>
          {SOURCE_FILES.map((file) => (
            <button
              key={file.id}
              onClick={() => setSelectedId(file.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-left text-xs transition-colors ${
                file.id === selectedId
                  ? 'bg-blue-600/20 text-white border border-blue-500/40'
                  : 'text-slate-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span className="font-mono truncate">{file.label}</span>
            </button>
          ))}
        </aside>

        <div className="bg-[#12151C] border border-white/10 rounded-lg flex flex-col min-h-[560px] max-h-[72vh]">
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-white/10">
            <span className="font-mono text-xs text-slate-300">{activeFile.label}</span>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar símbolo ou função..."
                className="w-full bg-[#0B0D11] border border-white/10 rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed">
            {loading ? (
              <div className="space-y-2 p-2">
                <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-white/5 rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-white/5 rounded animate-pulse" />
              </div>
            ) : error ? (
              <p className="text-red-400 p-2">{error}</p>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {matchingLines.map((line) => (
                    <tr key={line.num} className="hover:bg-white/[0.03]">
                      <td className="select-none pr-4 text-right text-slate-600 w-12 align-top tabular-nums">
                        {line.num}
                      </td>
                      <td className="text-slate-200 whitespace-pre">{line.text || ' '}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
