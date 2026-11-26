export type RuntimeLaunchOrigin = 'browser' | 'windows-exe' | 'linux-app' | 'android-apk';

export type ActiveGraphicsBackend =
  | 'webgpu'
  | 'webgl2'
  | 'webgl2-software'
  | 'dx11-win32'
  | 'vulkan-linux'
  | 'vulkan-android';

export interface PlatformRuntimeInfo {
  origin: RuntimeLaunchOrigin;
  osName: 'Windows' | 'Linux' | 'macOS' | 'Android' | 'iOS' | 'Desconhecido';
  graphicsBackend: ActiveGraphicsBackend;
  backendLabel: string;
  techStackLabel: string;
  gpuName: string;
  isSoftwareRenderer: boolean;
  supportsWebGPU: boolean;
  hardwareCores: number;
  aiStaggerStride: number;
  maxPixelRatio: number;
}

interface WinBridge {
  backend?: string;
  gpuName?: string;
  dxFeatureLevel?: string;
}

declare global {
  interface Window {
    __KODA_NATIVE_WIN32__?: WinBridge;
    __KODA_ANDROID_JNI__?: boolean;
    __KODA_LINUX_HOST__?: boolean;
    chrome?: {
      webview?: {
        postMessage?: (msg: unknown) => void;
      };
    };
  }
}

function detectOSName(): PlatformRuntimeInfo['osName'] {
  if (typeof navigator === 'undefined') return 'Desconhecido';
  const ua = navigator.userAgent || '';
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    '';
  const combined = `${ua} ${platform}`.toLowerCase();
  if (combined.includes('android')) return 'Android';
  if (combined.includes('win')) return 'Windows';
  if (combined.includes('iphone') || combined.includes('ipad') || combined.includes('ios')) return 'iOS';
  if (combined.includes('mac')) return 'macOS';
  if (combined.includes('linux') || combined.includes('x11')) return 'Linux';
  return 'Desconhecido';
}

export function probeWebGL2Info(): { isSoftware: boolean; gpuName: string; hasWebGL2: boolean } {
  if (typeof document === 'undefined') {
    return { isSoftware: true, gpuName: 'SSR', hasWebGL2: false };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      return { isSoftware: true, gpuName: 'Software Fallback', hasWebGL2: false };
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpuName = String(gl.getParameter(param) || 'WebGL2 GPU');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftware = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuName);
    return { isSoftware, gpuName, hasWebGL2: true };
  } catch {
    return { isSoftware: true, gpuName: 'WebGL2 Restricted', hasWebGL2: false };
  }
}

export function getQuickPlatformInfo(): PlatformRuntimeInfo {
  const osName = detectOSName();
  const cores = typeof navigator !== 'undefined' ? Math.max(2, navigator.hardwareConcurrency || 4) : 4;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

  const isWin32Host =
    typeof window !== 'undefined' &&
    (Boolean(window.__KODA_NATIVE_WIN32__) ||
      Boolean(window.chrome?.webview) ||
      /KodaWin32|KodaGameDev-Exe/i.test(ua));

  if (isWin32Host) {
    const bridge = window.__KODA_NATIVE_WIN32__;
    return {
      origin: 'windows-exe',
      osName: 'Windows',
      graphicsBackend: 'dx11-win32',
      backendLabel: 'Win32 DX11',
      techStackLabel: 'Microsoft Windows (.EXE) · DirectX 11 + Win32 ThreadPool + XInput',
      gpuName: bridge?.gpuName || 'Direct3D 11 Hardware Adapter',
      isSoftwareRenderer: false,
      supportsWebGPU: false,
      hardwareCores: cores,
      aiStaggerStride: 2,
      maxPixelRatio: 2,
    };
  }

  if (typeof window !== 'undefined' && (window.__KODA_ANDROID_JNI__ || /KodaAndroidAPK/i.test(ua))) {
    return {
      origin: 'android-apk',
      osName: 'Android',
      graphicsBackend: 'vulkan-android',
      backendLabel: 'Vulkan NDK',
      techStackLabel: 'Android APK · Vulkan / OpenGL ES + JNI',
      gpuName: 'Mobile GPU',
      isSoftwareRenderer: false,
      supportsWebGPU: false,
      hardwareCores: cores,
      aiStaggerStride: 4,
      maxPixelRatio: 1.5,
    };
  }

  if (typeof window !== 'undefined' && (window.__KODA_LINUX_HOST__ || /KodaLinuxApp/i.test(ua))) {
    return {
      origin: 'linux-app',
      osName: 'Linux',
      graphicsBackend: 'vulkan-linux',
      backendLabel: 'Vulkan Linux',
      techStackLabel: 'Linux AppImage · Vulkan 1.3 + POSIX Threads',
      gpuName: 'Linux GPU',
      isSoftwareRenderer: false,
      supportsWebGPU: false,
      hardwareCores: cores,
      aiStaggerStride: 3,
      maxPixelRatio: 2,
    };
  }

  const glInfo = probeWebGL2Info();
  const hasNavigatorGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;

  return {
    origin: 'browser',
    osName,
    graphicsBackend: glInfo.isSoftware ? 'webgl2-software' : 'webgl2',
    backendLabel: glInfo.isSoftware ? 'WebGL2 SW' : 'WebGL2',
    techStackLabel: glInfo.isSoftware
      ? `Navegador (${osName}) · WebGL2 Software Paced`
      : hasNavigatorGpu
      ? `Navegador (${osName}) · Verificando WebGPU...`
      : `Navegador (${osName}) · WebGL2 Hardware`,
    gpuName: glInfo.gpuName,
    isSoftwareRenderer: glInfo.isSoftware,
    supportsWebGPU: hasNavigatorGpu && !glInfo.isSoftware,
    hardwareCores: cores,
    aiStaggerStride: glInfo.isSoftware ? 5 : 3,
    maxPixelRatio: glInfo.isSoftware ? 1 : 2,
  };
}

let cachedRuntimePromise: Promise<PlatformRuntimeInfo> | null = null;

export function detectPlatformRuntime(): Promise<PlatformRuntimeInfo> {
  if (cachedRuntimePromise) return cachedRuntimePromise;

  cachedRuntimePromise = (async () => {
    const quick = getQuickPlatformInfo();
    if (quick.origin !== 'browser' || quick.isSoftwareRenderer) {
      return quick;
    }

    interface ProbeGPUAdapterInfo {
      description?: string;
      vendor?: string;
      architecture?: string;
      isFallbackAdapter?: boolean;
    }
    interface ProbeGPUAdapter {
      isFallbackAdapter?: boolean;
      info?: ProbeGPUAdapterInfo;
      requestAdapterInfo?: () => Promise<ProbeGPUAdapterInfo>;
    }
    const navGpu = (
      navigator as unknown as {
        gpu?: {
          requestAdapter: (opts?: { powerPreference?: string }) => Promise<ProbeGPUAdapter | null>;
        };
      }
    ).gpu;

    if (!navGpu || typeof navGpu.requestAdapter !== 'function') {
      return {
        ...quick,
        supportsWebGPU: false,
        techStackLabel: `Navegador (${quick.osName}) · WebGL2 Hardware`,
      };
    }

    try {
      const adapter = await navGpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        return {
          ...quick,
          supportsWebGPU: false,
          techStackLabel: `Navegador (${quick.osName}) · WebGL2 Hardware`,
        };
      }

      const info =
        adapter.info ??
        (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : undefined);
      const adapterDesc = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' ').trim();
      const isFallback =
        Boolean(adapter.isFallbackAdapter) ||
        Boolean(adapter.info?.isFallbackAdapter) ||
        /SwiftShader|llvmpipe|softpipe|Basic Render/i.test(adapterDesc);

      if (isFallback) {
        return {
          ...quick,
          supportsWebGPU: false,
          techStackLabel: `Navegador (${quick.osName}) · WebGL2 Hardware`,
        };
      }

      return {
        ...quick,
        graphicsBackend: 'webgpu',
        backendLabel: 'WebGPU',
        techStackLabel: `Navegador (${quick.osName}) · WebGPU (WGSL Hardware)`,
        gpuName: adapterDesc || quick.gpuName,
        supportsWebGPU: true,
        aiStaggerStride: 2,
      };
    } catch {
      return {
        ...quick,
        supportsWebGPU: false,
        techStackLabel: `Navegador (${quick.osName}) · WebGL2 Hardware`,
      };
    }
  })();

  return cachedRuntimePromise;
}
