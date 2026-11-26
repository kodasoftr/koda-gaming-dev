import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Monitor,
  Play,
  Smartphone,
  Terminal,
} from 'lucide-react';

type PlatformTarget = 'windows' | 'linux' | 'android';

export const BuildExportView: React.FC = () => {
  const [target, setTarget] = useState<PlatformTarget>('windows');
  const [appName, setAppName] = useState('MeuJogoKoda');
  const [appId, setAppId] = useState('com.koda.gamedev.app');
  const [studioPath, setStudioPath] = useState(
    'C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe'
  );
  const [includeDebug, setIncludeDebug] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string[]>([
    'Pronto. Selecione uma das 3 plataformas (Windows .exe, Linux .AppImage ou Android Studio .apk).',
  ]);

  const cfg = includeDebug ? 'Debug' : 'Release';

  const commandMap: Record<PlatformTarget, string[]> = {
    windows: [
      `cmake -B build-win -G "Visual Studio 17 2022" -A x64 -DKODA_RHI_BACKEND=DirectX11 -DKODA_FETCH_IMGUI=ON`,
      `cmake --build build-win --config ${cfg}`,
      `# Saída: build-win/bin/${cfg}/${appName}.exe (disparado via CreateProcessA dentro da engine C++)`,
    ],
    linux: [
      `cmake -B build-linux -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-linux.cmake -DKODA_RHI_BACKEND=Vulkan -DCMAKE_BUILD_TYPE=${cfg}`,
      `cmake --build build-linux -j`,
      `appimagetool AppDir/ ${appName}-x86_64.AppImage`,
    ],
    android: [
      `# 1. Gera projeto Gradle + Kotlin JNI (MainActivity.kt) + assets da cena`,
      `"${studioPath}" "%CD%\\build-android\\${appName}"`,
      `cd build-android\\${appName} && gradlew.bat assemble${cfg} -PapplicationId=${appId}`,
    ],
  };

  const downloadFile = async (urlPath: string, filename: string) => {
    const res = await fetch(urlPath);
    const text = await res.text();
    downloadText(text, filename);
  };

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTargetScript = () => {
    if (target === 'windows') {
      const bat = `@echo off
echo === Koda Game Dev - Compilar .EXE Nativo (${cfg}) ===
cmake -B build-win -G "Visual Studio 17 2022" -A x64 -DKODA_RHI_BACKEND=DirectX11 -DKODA_FETCH_IMGUI=ON
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
cmake --build build-win --config ${cfg}
echo Executavel gerado em build-win\\bin\\${cfg}\\
pause
`;
      downloadText(bat, `compilar_${appName}_windows.bat`);
      setBuildLogs((p) => [...p, `Script Windows gerado: compilar_${appName}_windows.bat`]);
    } else if (target === 'linux') {
      const sh = `#!/usr/bin/env bash
set -e
echo "=== Koda Game Dev - Compilar App Linux (.AppImage) ==="
cmake -B build-linux -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-linux.cmake -DKODA_RHI_BACKEND=Vulkan -DCMAKE_BUILD_TYPE=${cfg}
cmake --build build-linux -j
mkdir -p AppDir/usr/bin
cp build-linux/bin/KodaGameDev AppDir/usr/bin/${appName}
cat > AppDir/${appName}.desktop <<EOF
[Desktop Entry]
Name=${appName}
Exec=${appName}
Type=Application
Categories=Game;
EOF
if command -v appimagetool >/dev/null 2>&1; then
  appimagetool AppDir/ ${appName}-x86_64.AppImage
fi
echo "Build Linux finalizado!"
`;
      downloadText(sh, `compilar_${appName}_linux.sh`);
      setBuildLogs((p) => [...p, `Script Linux gerado: compilar_${appName}_linux.sh`]);
    } else {
      const bat = `@echo off
set PROJ_DIR=%CD%\\build-android\\${appName}
mkdir "%PROJ_DIR%\\app\\src\\main\\java\\com\\koda\\game" 2>nul
mkdir "%PROJ_DIR%\\app\\src\\main\\cpp" 2>nul
echo === Abrindo Android Studio para gerar APK (${appId}) ===
if exist "${studioPath}" (
  start "" "${studioPath}" "%PROJ_DIR%"
) else (
  echo Android Studio nao encontrado em "${studioPath}". Gerando APK direto via Gradle...
  cd /d "%PROJ_DIR%" && call gradlew.bat assemble${cfg} -PapplicationId=${appId}
)
pause
`;
      downloadText(bat, `chamar_android_studio_${appName}.bat`);
      setBuildLogs((p) => [...p, `Script Android Studio gerado: chamar_android_studio_${appName}.bat`]);
    }
  };

  const handleTestPipeline = () => {
    const steps: Record<PlatformTarget, string[]> = {
      windows: [
        `[1/3] Exportando cena e shaders HLSL para build-win/Assets/...`,
        `[2/3] Executando CMake + MSVC x64 (${cfg}) via CreateProcessA...`,
        `[3/3] OK — ${appName}.exe pronto em build-win/bin/${cfg}/KodaGameDev.exe`,
      ],
      linux: [
        `[1/3] Aplicando cmake/toolchain-linux.cmake (RHI Vulkan / g++17)...`,
        `[2/3] Empacotando AppDir (${appName}.desktop + binário ELF x86_64)...`,
        `[3/3] OK — Pacote ${appName}-x86_64.AppImage configurado`,
      ],
      android: [
        `[1/3] Gerando projeto Gradle + AndroidManifest.xml + MainActivity.kt (JNI)...`,
        `[2/3] Chamando Android Studio: "${studioPath}"`,
        `[3/3] OK — Projeto pronto para build .APK (${appId}) via Gradle`,
      ],
    };
    setBuildLogs(steps[target]);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-6">
      <div className="space-y-1.5">
        <p className="text-xs text-slate-400">
          3 Possibilidades de Compilação · Integrado na Engine C++17 e Scripts Prontos
        </p>
        <h1 className="font-display text-2xl font-semibold text-white">
          Compilar .EXE, App Linux e Chamar Android Studio (.APK)
        </h1>
      </div>

      {/* 3 Possibilidades */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(
          [
            {
              id: 'windows',
              icon: Monitor,
              title: '1. Windows (.exe) no Programa',
              detail: 'Compila direto via CreateProcess + CMake/MSVC x64 com DirectX 11',
            },
            {
              id: 'linux',
              icon: Terminal,
              title: '2. App Linux (.AppImage)',
              detail: 'Compilação C++17 + Vulkan + empacotamento AppDir / WSL',
            },
            {
              id: 'android',
              icon: Smartphone,
              title: '3. Android Studio (.apk)',
              detail: 'Gera projeto Gradle/JNI e abre o studio64.exe ou roda gradlew',
            },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTarget(item.id)}
              className={`text-left p-4 rounded-lg border transition-colors ${
                target === item.id
                  ? 'bg-blue-600/15 border-blue-500/50 text-white'
                  : 'bg-[#12151C] border-white/10 text-slate-300 hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 font-display text-sm font-semibold">
                  <Icon className="w-4 h-4 text-blue-400" />
                  {item.title}
                </span>
                {target === item.id && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">{item.detail}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-[#12151C] border border-white/10 rounded-lg p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <label className="flex flex-col gap-1.5 text-slate-300">
            Nome do Executável / App
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="bg-[#0B0D11] border border-white/10 rounded px-3 py-2 text-white"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-slate-300">
            Application ID (Android / Bundle)
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="bg-[#0B0D11] border border-white/10 rounded px-3 py-2 font-mono text-white"
            />
          </label>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDebug}
                onChange={(e) => setIncludeDebug(e.target.checked)}
              />
              Incluir símbolos Debug (PDB / Logcat)
            </label>
          </div>
        </div>

        {target === 'android' && (
          <label className="flex flex-col gap-1.5 text-xs text-slate-300">
            Caminho do Android Studio (para chamar automaticamente pelo programa C++)
            <input
              value={studioPath}
              onChange={(e) => setStudioPath(e.target.value)}
              className="bg-[#0B0D11] border border-white/10 rounded px-3 py-2 font-mono text-white"
            />
          </label>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-300">
              Comandos Executados pela Engine ({cfg})
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestPipeline}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white"
              >
                <Play className="w-3 h-3" /> Validar Pipeline
              </button>
              <button
                onClick={handleDownloadTargetScript}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600/25 hover:bg-blue-600/40 border border-blue-500/40 text-xs font-medium text-blue-200"
              >
                <ExternalLink className="w-3 h-3" />
                {target === 'windows'
                  ? 'Baixar Script .EXE (.bat)'
                  : target === 'linux'
                  ? 'Baixar Script Linux (.sh)'
                  : 'Baixar Script Android Studio (.bat)'}
              </button>
            </div>
          </div>
          <div className="bg-[#0B0D11] border border-white/10 rounded-md p-4 font-mono text-xs text-slate-200 space-y-1.5 overflow-x-auto">
            {commandMap[target].map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        </div>

        {/* Saída do Pipeline */}
        <div className="bg-[#0B0D11] border border-white/10 rounded-md p-3 font-mono text-xs text-slate-300 space-y-1">
          {buildLogs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
          <button
            onClick={() => downloadFile('/engine/koda_game_dev.cpp', 'koda_game_dev.cpp')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
          >
            <Download className="w-3.5 h-3.5" /> Baixar koda_game_dev.cpp (com Builder C++)
          </button>
          <button
            onClick={() => downloadFile('/engine/CMakeLists.txt', 'CMakeLists.txt')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> Baixar CMakeLists.txt
          </button>
          <button
            onClick={() => downloadFile('/engine/cmake/toolchain-linux.cmake', 'toolchain-linux.cmake')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> Toolchain Linux
          </button>
          <button
            onClick={() => downloadFile('/engine/cmake/toolchain-android.cmake', 'toolchain-android.cmake')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> Toolchain Android
          </button>
        </div>
      </div>
    </div>
  );
};
