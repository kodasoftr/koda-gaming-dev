// =============================================================================
//  Koda Game Dev v2.5 - Editor Estilo Unity/Godot & Engine 3D/2D em C++17
//  Tecnologias: Win32 + DirectX 11 (RHI/RDG) + Dear ImGui + C++17
//
//  Recursos desta versao:
//    - Layout estilo Unity/Godot: Hierarquia a esquerda, Cena 3D + Animator Graph
//      no centro, Inspetor a direita, Project/Timeline/Console/Shaders embaixo
//    - Suporte a Texturas 2D em DX11 (ShaderResourceView + SamplerState):
//      texturas procedurais (White, Checkerboard, UV Grid, Metal) + Loader .BMP
//    - Rig Esqueletico 3D e Rig 2D articulados (Spine, Head, ArmL/R, LegL/R)
//    - Editor de Animacao 2D/3D com Timeline de Keyframes + Maquina de Estados
//      (Idle, Walk, Run, Jump, Attack) com transicoes automaticas por parametros
//    - ECS com GUIDs 128-bit, Loader .OBJ real, Picking Raycast, Hot-Reload HLSL
//      com traducao de erros, RDG Profiler, CMake Generator e Dispatcher MCP
//
//  Compilacao no Visual Studio 2022 (x64, C++17):
//    cmake -B build -G "Visual Studio 17 2022" -A x64 -DKODA_FETCH_IMGUI=ON
//    cmake --build build --config Release
// =============================================================================

#define _CRT_SECURE_NO_WARNINGS
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include <windows.h>
#include <commdlg.h>
#include <shellapi.h>
#include <mmsystem.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <d3dcompiler.h>
#include <DirectXMath.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <memory>
#include <random>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include "imgui.h"
#include "imgui_impl_win32.h"
#include "imgui_impl_dx11.h"

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "d3dcompiler.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "comdlg32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "winmm.lib")

using namespace DirectX;
namespace fs = std::filesystem;

// =============================================================================
// Utilitarios & Console
// =============================================================================
template <class T>
static void SafeRelease(T*& p) {
    if (p) { p->Release(); p = nullptr; }
}

enum class LogLevel { Info = 0, Warning = 1, Error = 2 };

struct LogEntry {
    LogLevel    level;
    std::string timestamp;
    std::string message;
};

static std::vector<LogEntry> g_log;
static bool g_logAutoScroll = true;
static int  g_logFilter     = 0;

static std::string CurrentTimeStr() {
    SYSTEMTIME st{};
    GetLocalTime(&st);
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%02d:%02d:%02d", st.wHour, st.wMinute, st.wSecond);
    return buf;
}

static void Log(const std::string& msg, LogLevel level = LogLevel::Info) {
    g_log.push_back({ level, CurrentTimeStr(), msg });
    if (g_log.size() > 500) g_log.erase(g_log.begin());
    OutputDebugStringA((msg + "\n").c_str());
}

// =============================================================================
// GUID 128-bit
// =============================================================================
struct Guid {
    uint64_t hi = 0;
    uint64_t lo = 0;

    static Guid Generate() {
        static std::mt19937_64 rng(
            static_cast<uint64_t>(std::chrono::high_resolution_clock::now().time_since_epoch().count()));
        Guid g;
        g.hi = rng();
        g.lo = rng();
        if (g.hi == 0 && g.lo == 0) g.lo = 1;
        return g;
    }

    std::string ToString() const {
        char buf[40];
        std::snprintf(buf, sizeof(buf), "%08llx-%04llx-%04llx-%04llx-%012llx",
            (unsigned long long)(hi >> 32),
            (unsigned long long)((hi >> 16) & 0xFFFF),
            (unsigned long long)(hi & 0xFFFF),
            (unsigned long long)(lo >> 48),
            (unsigned long long)(lo & 0xFFFFFFFFFFFFULL));
        return buf;
    }

    static Guid FromString(const std::string& s) {
        Guid g;
        unsigned long long a = 0, b = 0, c = 0, d = 0, e = 0;
        if (std::sscanf(s.c_str(), "%8llx-%4llx-%4llx-%4llx-%12llx", &a, &b, &c, &d, &e) == 5) {
            g.hi = (a << 32) | (b << 16) | c;
            g.lo = (d << 48) | e;
        } else {
            g = Generate();
        }
        return g;
    }
};

// =============================================================================
// RHI & Render Dependency Graph (RDG)
// =============================================================================
enum class RHIBackend {
    DirectX11 = 0,
    DirectX12,
    Vulkan,
    DirectX9_Legacy,
    OpenGL_Legacy
};

static const char* RHIBackendName(RHIBackend b) {
    switch (b) {
    case RHIBackend::DirectX11:       return "DirectX 11 (Ativo)";
    case RHIBackend::DirectX12:       return "DirectX 12 (Moderno)";
    case RHIBackend::Vulkan:          return "Vulkan 1.3 (Multiplataforma)";
    case RHIBackend::DirectX9_Legacy: return "DirectX 9 (Legado XP/7)";
    case RHIBackend::OpenGL_Legacy:   return "OpenGL 3.3 (Legado)";
    default:                          return "Desconhecido";
    }
}

class IRHIDevice {
public:
    virtual ~IRHIDevice() = default;
    virtual RHIBackend GetBackend() const = 0;
    virtual const char* GetDeviceName() const = 0;
};

class DX11RHIDevice final : public IRHIDevice {
public:
    RHIBackend GetBackend() const override { return RHIBackend::DirectX11; }
    const char* GetDeviceName() const override { return "ID3D11Device (WDDM Hardware)"; }
};

struct RenderPassNode {
    std::string name;
    std::string reads;
    std::string writes;
    bool        enabled      = true;
    bool        asyncCompute = false;
    float       lastTimeMs   = 0.0f;
};

struct RenderGraph {
    std::vector<RenderPassNode> passes;
    void InitDefault() {
        passes = {
            { "ShadowDepthPass",   "SceneMeshes",              "ShadowMap_D32",     true,  false, 0.0f },
            { "HiZ_OcclusionPass", "PrevDepthBuffer",          "HiZ_Pyramid",       true,  true,  0.0f },
            { "OpaqueForwardPass", "ShadowMap, AlbedoTex",     "ViewportColor_RGBA8", true, false, 0.0f },
            { "GridAndGizmoPass",  "ViewportDepth",            "ViewportColor_RGBA8", true, false, 0.0f },
            { "ImGuiCompositePass","ViewportColor_RGBA8",      "SwapChainBackBuffer", true, false, 0.0f }
        };
    }
};

// =============================================================================
// Estado global Direct3D 11 e Janela
// =============================================================================
static HWND g_hwnd = nullptr;
static bool g_running = true;

static UINT g_width = 1600;
static UINT g_height = 900;
static bool g_resizePending = false;
static bool g_vsync = true;

static ID3D11Device*           g_device   = nullptr;
static ID3D11DeviceContext*    g_ctx      = nullptr;
static IDXGISwapChain*         g_swap     = nullptr;
static ID3D11RenderTargetView* g_backRTV  = nullptr;

static std::unique_ptr<IRHIDevice> g_rhiDevice;
static RHIBackend  g_selectedBackend = RHIBackend::DirectX11;
static RenderGraph g_renderGraph;

static ID3D11Texture2D*          g_vpTex      = nullptr;
static ID3D11RenderTargetView*   g_vpRTV      = nullptr;
static ID3D11ShaderResourceView* g_vpSRV      = nullptr;
static ID3D11Texture2D*          g_vpDepthTex = nullptr;
static ID3D11DepthStencilView*   g_vpDSV      = nullptr;
static UINT g_vpW = 800, g_vpH = 600;
static UINT g_wantVpW = 800, g_wantVpH = 600;

static ID3D11VertexShader*      g_vs         = nullptr;
static ID3D11PixelShader*       g_ps         = nullptr;
static ID3D11InputLayout*       g_layout     = nullptr;
static ID3D11Buffer*            g_cb         = nullptr;
static ID3D11SamplerState*      g_sampler    = nullptr;
static ID3D11RasterizerState*   g_rsSolid    = nullptr;
static ID3D11RasterizerState*   g_rsWire     = nullptr;
static ID3D11DepthStencilState* g_dss        = nullptr;

static ID3D11VertexShader*      g_lineVS     = nullptr;
static ID3D11PixelShader*       g_linePS     = nullptr;
static ID3D11InputLayout*       g_lineLayout = nullptr;
static ID3D11Buffer*            g_lineCB     = nullptr;
static ID3D11Buffer*            g_gridVB     = nullptr;
static UINT                     g_gridVertCount = 0;

// Cache de estado DX11 para eliminar chamadas redundantes ao driver por frame
static int  g_cachedMeshIdx   = -1;
static int  g_cachedTexIdx    = -1;
static int  g_cachedWireState = -1;
static uint32_t g_simFrameIndex = 0;

// =============================================================================
// Tecnologias Nativas Microsoft Windows (Hardware Probe, XInput, Win32 ThreadPool)
// =============================================================================
struct WindowsRuntimeInfo {
    std::string gpuName         = "Hardware DirectX 11";
    UINT        vramMB          = 0;
    UINT        logicalCores    = 4;
    bool        flipModelActive = false;
    bool        xinputReady     = false;
};

static WindowsRuntimeInfo g_winRuntime;

struct KodaXInputGamepad {
    WORD  wButtons;
    BYTE  bLeftTrigger;
    BYTE  bRightTrigger;
    SHORT sThumbLX;
    SHORT sThumbLY;
    SHORT sThumbRX;
    SHORT sThumbRY;
};
struct KodaXInputState {
    DWORD              dwPacketNumber;
    KodaXInputGamepad  Gamepad;
};
using PFN_XInputGetState = DWORD(WINAPI*)(DWORD, KodaXInputState*);
static HMODULE            g_xinputDll      = nullptr;
static PFN_XInputGetState g_pfnXInputState = nullptr;

static void InitWindowsPlatformTechnologies() {
    SYSTEM_INFO si{};
    GetSystemInfo(&si);
    g_winRuntime.logicalCores = std::max<UINT>(1u, si.dwNumberOfProcessors);

    g_xinputDll = LoadLibraryA("xinput1_4.dll");
    if (!g_xinputDll) g_xinputDll = LoadLibraryA("xinput9_1_0.dll");
    if (g_xinputDll) {
        g_pfnXInputState = reinterpret_cast<PFN_XInputGetState>(GetProcAddress(g_xinputDll, "XInputGetState"));
        g_winRuntime.xinputReady = (g_pfnXInputState != nullptr);
    }
}

class Win32ThreadPool {
public:
    void Init(UINT hardwareCores) {
        if (m_initialized) return;
        UINT workers = std::clamp(hardwareCores > 1 ? hardwareCores - 1 : 1u, 1u, 8u);
        InitializeCriticalSection(&m_cs);
        InitializeConditionVariable(&m_cvWork);
        InitializeConditionVariable(&m_cvDone);
        m_stop = false;
        m_initialized = true;
        for (UINT i = 0; i < workers; ++i) {
            HANDLE th = CreateThread(nullptr, 0, WorkerProc, this, 0, nullptr);
            if (th) m_threads.push_back(th);
        }
    }

    template <typename Fn>
    void ParallelFor(size_t count, Fn&& fn) {
        if (!m_initialized || m_threads.empty() || count < 16) {
            for (size_t i = 0; i < count; ++i) fn(i);
            return;
        }
        size_t numChunks = std::min(count, m_threads.size() + 1);
        size_t perChunk = (count + numChunks - 1) / numChunks;
        auto invoker = +[](void* ctx, size_t idx) { (*static_cast<Fn*>(ctx))(idx); };

        EnterCriticalSection(&m_cs);
        m_taskFn = invoker;
        m_taskCtx = &fn;
        m_totalCount = count;
        m_chunkSize = perChunk;
        m_nextIndex = 0;
        m_pendingTasks = numChunks - 1;
        m_generation++;
        WakeAllConditionVariable(&m_cvWork);
        LeaveCriticalSection(&m_cs);

        // Main thread also executes its share immediately
        while (true) {
            size_t start = 0, end = 0;
            EnterCriticalSection(&m_cs);
            start = m_nextIndex;
            end = std::min(m_totalCount, start + m_chunkSize);
            m_nextIndex = end;
            LeaveCriticalSection(&m_cs);
            if (start >= end) break;
            for (size_t i = start; i < end; ++i) fn(i);
        }

        EnterCriticalSection(&m_cs);
        while (m_pendingTasks > 0) {
            SleepConditionVariableCS(&m_cvDone, &m_cs, INFINITE);
        }
        LeaveCriticalSection(&m_cs);
    }

    void Shutdown() {
        if (!m_initialized) return;
        EnterCriticalSection(&m_cs);
        m_stop = true;
        WakeAllConditionVariable(&m_cvWork);
        LeaveCriticalSection(&m_cs);
        if (!m_threads.empty()) {
            WaitForMultipleObjects((DWORD)m_threads.size(), m_threads.data(), TRUE, 2000);
            for (HANDLE h : m_threads) CloseHandle(h);
            m_threads.clear();
        }
        DeleteCriticalSection(&m_cs);
        m_initialized = false;
    }

private:
    static DWORD WINAPI WorkerProc(LPVOID param) {
        auto* self = static_cast<Win32ThreadPool*>(param);
        uint64_t seenGen = 0;
        while (true) {
            void (*fn)(void*, size_t) = nullptr;
            void* ctx = nullptr;
            size_t start = 0, end = 0;

            EnterCriticalSection(&self->m_cs);
            while (!self->m_stop && (self->m_generation == seenGen || self->m_nextIndex >= self->m_totalCount)) {
                SleepConditionVariableCS(&self->m_cvWork, &self->m_cs, INFINITE);
            }
            if (self->m_stop) {
                LeaveCriticalSection(&self->m_cs);
                return 0;
            }
            seenGen = self->m_generation;
            fn = self->m_taskFn;
            ctx = self->m_taskCtx;
            start = self->m_nextIndex;
            end = std::min(self->m_totalCount, start + self->m_chunkSize);
            self->m_nextIndex = end;
            LeaveCriticalSection(&self->m_cs);

            if (fn && start < end) {
                for (size_t i = start; i < end; ++i) fn(ctx, i);
            }

            EnterCriticalSection(&self->m_cs);
            if (self->m_pendingTasks > 0) {
                self->m_pendingTasks--;
                if (self->m_pendingTasks == 0) WakeAllConditionVariable(&self->m_cvDone);
            }
            LeaveCriticalSection(&self->m_cs);
        }
    }

    CRITICAL_SECTION   m_cs{};
    CONDITION_VARIABLE m_cvWork{};
    CONDITION_VARIABLE m_cvDone{};
    std::vector<HANDLE> m_threads;
    void (*m_taskFn)(void*, size_t) = nullptr;
    void*    m_taskCtx      = nullptr;
    size_t   m_totalCount   = 0;
    size_t   m_chunkSize    = 1;
    size_t   m_nextIndex    = 0;
    size_t   m_pendingTasks = 0;
    uint64_t m_generation   = 0;
    bool     m_stop         = false;
    bool     m_initialized  = false;
};

static Win32ThreadPool g_threadPool;

// =============================================================================
// Recursos de Textura 2D (DX11 SRV) e Malhas 3D
// =============================================================================
struct TextureAsset {
    Guid                      guid;
    std::string               name;
    std::string               sourcePath;
    UINT                      width  = 0;
    UINT                      height = 0;
    ID3D11Texture2D*          tex    = nullptr;
    ID3D11ShaderResourceView* srv    = nullptr;
};

static std::vector<TextureAsset> g_textures;

struct Vertex {
    XMFLOAT3 pos;
    XMFLOAT3 nrm;
    XMFLOAT2 uv;
};

struct LineVertex {
    XMFLOAT3 pos;
    XMFLOAT4 color;
};

struct MeshAsset {
    Guid          guid;
    std::string   name;
    std::string   sourcePath;
    ID3D11Buffer* vb          = nullptr;
    ID3D11Buffer* ib          = nullptr;
    UINT          vertexCount = 0;
    UINT          indexCount  = 0;
    XMFLOAT3      boundsMin{-0.5f, -0.5f, -0.5f};
    XMFLOAT3      boundsMax{ 0.5f,  0.5f,  0.5f};
};

static std::vector<MeshAsset> g_meshes;

enum class MeshPrimitive {
    Cube = 0,
    Sphere = 1,
    Plane = 2,
    Cylinder = 3,
    Cone = 4
};

// =============================================================================
// ECS, Rigging 2D/3D, Keyframes & Maquina de Estados Animator
// =============================================================================
enum class EntityKind {
    Mesh3D = 0,
    Rig3D,
    Rig2D,
    Sprite2D,
    PointLight,
    Camera
};

enum class ScriptLanguage {
    None = 0,
    CSharp_Mono,
    Kotlin_JNI,
    Native_CPP
};

enum class AnimatorState {
    Idle = 0,
    Walk,
    Run,
    Jump,
    Attack
};

static const char* AnimatorStateName(AnimatorState s) {
    switch (s) {
    case AnimatorState::Idle:   return "Idle";
    case AnimatorState::Walk:   return "Walk";
    case AnimatorState::Run:    return "Run";
    case AnimatorState::Jump:   return "Jump";
    case AnimatorState::Attack: return "Attack";
    default:                    return "Idle";
    }
}

struct RigPose {
    XMFLOAT3 spine{0.0f, 0.0f, 0.0f};
    XMFLOAT3 head {0.0f, 0.0f, 0.0f};
    XMFLOAT3 armL {0.0f, 0.0f, 8.0f};
    XMFLOAT3 armR {0.0f, 0.0f, -8.0f};
    XMFLOAT3 legL {0.0f, 0.0f, 0.0f};
    XMFLOAT3 legR {0.0f, 0.0f, 0.0f};
};

struct AnimationKeyframe {
    float time       = 0.0f; // segundos [0.0 .. 3.0]
    int   boneIndex  = 2;    // 0=Spine, 1=Head, 2=ArmL, 3=ArmR, 4=LegL, 5=LegR
    int   axis       = 0;    // 0=X, 1=Y, 2=Z
    float angleDeg   = 0.0f;
};

struct AnimatorTransition {
    AnimatorState from;
    AnimatorState to;
    std::string   condition;
    float         blendDuration = 0.15f;
};

struct AnimationClipData {
    std::string name = "Animacao_1";
    float duration = 2.0f;
    bool loop = true;
    std::vector<AnimationKeyframe> keyframes;
};

struct AnimatorComponent {
    bool          enabled       = true;
    bool          useKeyframes  = false;
    AnimatorState currentState  = AnimatorState::Idle;
    float         stateTime     = 0.0f;
    float         clipDuration  = 2.0f;
    int           activeClipIdx = 0;
    std::vector<AnimationClipData> clips;
    float         paramSpeed    = 0.0f;  // 0=Idle, >0.1=Walk, >3.5=Run
    bool          paramGrounded = true;
    bool          triggerAttack = false;
    std::vector<AnimationKeyframe> keyframes;
};

struct TransformComponent {
    XMFLOAT3 position{0.0f, 0.0f, 0.0f};
    XMFLOAT3 rotation{0.0f, 0.0f, 0.0f};
    XMFLOAT3 scale{1.0f, 1.0f, 1.0f};
};

struct MeshRendererComponent {
    int      meshIndex    = 0;
    int      textureIndex = 0; // 0 = Branco 1x1
    XMFLOAT2 uvTiling{1.0f, 1.0f};
    XMFLOAT4 color{0.30f, 0.62f, 0.98f, 1.0f};
    float    metallic     = 0.15f;
    float    roughness    = 0.45f;
    bool     wireframe    = false;
};

struct PhysicsBodyComponent {
    bool     enabled     = false;
    bool     useGravity  = true;
    bool     isStatic    = false;
    float    mass        = 1.0f;
    float    restitution = 0.45f;
    XMFLOAT3 velocity{0.0f, 0.0f, 0.0f};
};

struct ScriptAsset {
    std::string    name = "PlayerController";
    ScriptLanguage language = ScriptLanguage::CSharp_Mono;
    std::string    code;
};

struct ScriptComponent {
    ScriptLanguage language     = ScriptLanguage::None;
    std::string    className    = "PlayerController";
    int            scriptIndex  = -1;
    std::string    code;
    float          spinSpeedDeg = 0.0f;
    float          moveSpeed    = 4.5f;
};

static std::vector<ScriptAsset> g_scripts = {
    { "PlayerController", ScriptLanguage::CSharp_Mono,
      "// C# MonoBehaviour estilo Unity\nvoid OnUpdate(float dt) {\n    float h = Input.GetAxis(\"Horizontal\");\n    transform.position.x += h * moveSpeed * dt;\n}" },
    { "CoinSpin", ScriptLanguage::Kotlin_JNI,
      "// Kotlin JNI Script\nfun onUpdate(dt: Float) {\n    transform.rotation.y += 90f * dt\n}" }
};
static int g_activeScriptIdx = 0;
static char g_scriptEditorBuf[4096] = "// C# MonoBehaviour estilo Unity\nvoid OnUpdate(float dt) {\n    transform.rotation.y += 45.0f * dt;\n}\n";

struct CameraComponent {
    bool        enabled        = true;
    bool        showMonitor    = false;
    bool        isOrthographic = false;
    float       fovDeg         = 55.0f;
    float       orthoSize      = 7.0f;
    int         playerSlot     = 1;
    std::string followTarget;
    XMFLOAT3    followOffset   { 0.0f, 3.8f, 8.5f };
};

struct HealthComponent {
    bool  enabled        = false;
    float maxHp          = 100.0f;
    float currentHp      = 100.0f;
    float attackDamage   = 22.0f;
    float attackRange    = 2.1f;
    float attackCooldown = 0.45f;
    float cooldownTimer  = 0.0f;
};

struct NativeInputState {
    bool     touchscreenEnabled = true;
    bool     keyboardEnabled    = true;
    bool     gamepadEnabled     = true;
    bool     splitScreenOnHybrid = true;
    bool     touchActive        = false;
    bool     keyboardActive     = false;
    XMFLOAT2 touchMove          { 0.0f, 0.0f };
    bool     touchAttack        = false;
    bool     touchJump          = false;
};

static NativeInputState g_nativeInput;

struct Entity {
    uint32_t   id     = 0;
    Guid       guid;
    std::string name;
    EntityKind kind   = EntityKind::Mesh3D;
    bool       active = true;

    TransformComponent    transform;
    MeshRendererComponent mesh;
    RigPose               rigPose;
    AnimatorComponent     animator;
    PhysicsBodyComponent  physics;
    ScriptComponent       script;
    CameraComponent       camera;
    HealthComponent       health;
};

struct Scene {
    std::string         name     = "Main";
    std::string         filePath = "Scenes/Main.kscene";
    std::vector<Entity> entities;
    int                 selected = -1;
    uint32_t            nextId   = 1;
};

static Scene g_scene;
static Scene g_playSnapshot;
static bool  g_isPlaying = false;
static bool  g_isPaused  = false;
static float g_playTime  = 0.0f;

static std::vector<AnimatorTransition> g_defaultTransitions = {
    { AnimatorState::Idle,   AnimatorState::Walk,   "speed > 0.1",         0.18f },
    { AnimatorState::Walk,   AnimatorState::Run,    "speed > 3.5",         0.15f },
    { AnimatorState::Run,    AnimatorState::Walk,   "speed <= 3.5",        0.15f },
    { AnimatorState::Walk,   AnimatorState::Idle,   "speed <= 0.1",        0.20f },
    { AnimatorState::Idle,   AnimatorState::Jump,   "isGrounded == false", 0.10f },
    { AnimatorState::Walk,   AnimatorState::Jump,   "isGrounded == false", 0.10f },
    { AnimatorState::Run,    AnimatorState::Jump,   "isGrounded == false", 0.10f },
    { AnimatorState::Jump,   AnimatorState::Idle,   "isGrounded == true",  0.15f },
    { AnimatorState::Idle,   AnimatorState::Attack, "triggerAttack",       0.08f },
    { AnimatorState::Attack, AnimatorState::Idle,   "clipNormalized >= 1", 0.12f },
};

// Camera & Iluminacao
static float    g_camYaw    = 0.65f;
static float    g_camPitch  = 0.38f;
static float    g_camDist   = 10.0f;
static XMFLOAT3 g_camTarget{0.0f, 0.7f, 0.0f};
static XMFLOAT3 g_lightDir{0.45f, 0.85f, 0.55f};
static float    g_ambientIntensity = 0.28f;
static bool     g_showGrid  = true;
static bool     g_showWireOverlay = false;
static char     g_hierarchyFilter[64] = {};

// =============================================================================
// Shaders HLSL com Texture2D + UV Tiling + Blinn-Phong + Rim
// =============================================================================
static const char* kDefaultShaderSrc = R"(Texture2D gAlbedoMap : register(t0);
SamplerState gSampler : register(s0);

cbuffer CB : register(b0)
{
    float4x4 gWVP;
    float4x4 gWorld;
    float4   gColor;
    float4   gCameraPos;   // xyz = pos, w = roughness
    float4   gLightDir;    // xyz = dir, w = ambient
    float4   gMaterial;    // x = metallic, y = selectedGlow, zw = uvTiling
};

struct VSOut
{
    float4 pos      : SV_POSITION;
    float3 worldPos : TEXCOORD0;
    float3 nrm      : NORMAL;
    float2 uv       : TEXCOORD1;
};

VSOut VS(float3 p : POSITION, float3 n : NORMAL, float2 uv : TEXCOORD)
{
    VSOut o;
    float4 wp = mul(float4(p, 1.0f), gWorld);
    o.worldPos = wp.xyz;
    o.pos = mul(float4(p, 1.0f), gWVP);
    o.nrm = mul(float4(n, 0.0f), gWorld).xyz;
    o.uv  = uv * gMaterial.zw;
    return o;
}

float4 PS(VSOut i) : SV_Target
{
    float3 texel = gAlbedoMap.Sample(gSampler, i.uv).rgb;
    float3 N = normalize(i.nrm);
    float3 L = normalize(gLightDir.xyz);
    float3 V = normalize(gCameraPos.xyz - i.worldPos);
    float3 H = normalize(L + V);

    float NdotL = saturate(dot(N, L));
    float specPower = lerp(64.0f, 8.0f, saturate(gCameraPos.w));
    float spec = pow(saturate(dot(N, H)), specPower) * (0.25f + gMaterial.x * 0.75f);

    float rim = pow(1.0f - saturate(dot(N, V)), 3.0f) * 0.16f;
    float3 base = gColor.rgb * texel;
    float3 lit = base * (gLightDir.w + NdotL * 0.85f) + float3(spec, spec, spec) + base * rim;

    if (gMaterial.y > 0.5f) {
        lit = lerp(lit, float3(1.0f, 0.85f, 0.35f), 0.18f);
    }
    return float4(saturate(lit), 1.0f);
}
)";

static const char* kLineShaderSrc = R"(cbuffer LineCB : register(b0)
{
    float4x4 gVP;
};
struct VSIn {
    float3 pos : POSITION;
    float4 col : COLOR;
};
struct VSOut {
    float4 pos : SV_POSITION;
    float4 col : COLOR;
};
VSOut VSLine(VSIn i) {
    VSOut o;
    o.pos = mul(float4(i.pos, 1.0f), gVP);
    o.col = i.col;
    return o;
}
float4 PSLine(VSOut i) : SV_Target {
    return i.col;
}
)";

static char        g_shaderEditorBuf[16384] = {};
static std::string g_shaderDiagnostic = "Shader texturizado compilado (vs_5_0 / ps_5_0).";
static bool        g_shaderHasError   = false;

struct CBData {
    XMFLOAT4X4 wvp;
    XMFLOAT4X4 world;
    XMFLOAT4   color;
    XMFLOAT4   cameraPos;
    XMFLOAT4   lightDir;
    XMFLOAT4   material;
};

struct LineCBData {
    XMFLOAT4X4 vp;
};

// =============================================================================
// Otimizacao, Profiler, Build & MCP
// =============================================================================
struct OptimizationSettings {
    bool  autoLOD         = true;
    float lodBias         = 1.0f;
    bool  hiZCulling      = true;
    int   quantBits       = 12;
    int   clusterRadius   = 64;
    int   hlodLevels      = 3;
};

static OptimizationSettings g_opt;
static std::array<float, 120> g_frameTimeHistory{};
static int   g_frameHistoryIdx = 0;
static float g_lastFrameMs     = 16.6f;
static UINT  g_lastDrawCalls   = 0;
static UINT  g_lastTriangles   = 0;

static char g_mcpPromptBuf[512] = "create_rig Rig_MCP 2 0 0";
static std::vector<std::string> g_mcpHistory;

// =============================================================================
// Compilacao HLSL + Traducao de Erros
// =============================================================================
static std::string TranslateShaderError(const std::string& raw) {
    std::ostringstream out;
    std::istringstream iss(raw);
    std::string line;
    while (std::getline(iss, line)) {
        if (line.empty()) continue;
        out << line << "\n";
        if (line.find("X3004") != std::string::npos) out << "  -> Dica: Identificador nao declarado.\n";
        else if (line.find("X3000") != std::string::npos) out << "  -> Dica: Erro de sintaxe (';' ou chaves).\n";
        else if (line.find("X3017") != std::string::npos) out << "  -> Dica: Conversao implicita de tipo invalida.\n";
    }
    return out.str();
}

static ID3DBlob* CompileHLSL(const char* src, const char* entry, const char* target, std::string& errOut) {
    ID3DBlob* blob = nullptr;
    ID3DBlob* err  = nullptr;
    HRESULT hr = D3DCompile(src, std::strlen(src), "KodaEditorShader.hlsl",
                            nullptr, nullptr, entry, target,
                            D3DCOMPILE_ENABLE_STRICTNESS, 0, &blob, &err);
    if (FAILED(hr)) {
        errOut = err ? TranslateShaderError(static_cast<const char*>(err->GetBufferPointer()))
                     : "Erro desconhecido HLSL.";
        SafeRelease(err);
        SafeRelease(blob);
        return nullptr;
    }
    SafeRelease(err);
    return blob;
}

static bool HotReloadMainShader() {
    std::string errVS, errPS;
    ID3DBlob* vsBlob = CompileHLSL(g_shaderEditorBuf, "VS", "vs_5_0", errVS);
    if (!vsBlob) {
        g_shaderHasError = true;
        g_shaderDiagnostic = "[VS] " + errVS;
        Log(g_shaderDiagnostic, LogLevel::Error);
        return false;
    }
    ID3DBlob* psBlob = CompileHLSL(g_shaderEditorBuf, "PS", "ps_5_0", errPS);
    if (!psBlob) {
        vsBlob->Release();
        g_shaderHasError = true;
        g_shaderDiagnostic = "[PS] " + errPS;
        Log(g_shaderDiagnostic, LogLevel::Error);
        return false;
    }

    ID3D11VertexShader* newVS = nullptr;
    ID3D11PixelShader*  newPS = nullptr;
    ID3D11InputLayout*  newIL = nullptr;

    HRESULT h1 = g_device->CreateVertexShader(vsBlob->GetBufferPointer(), vsBlob->GetBufferSize(), nullptr, &newVS);
    HRESULT h2 = g_device->CreatePixelShader(psBlob->GetBufferPointer(), psBlob->GetBufferSize(), nullptr, &newPS);
    D3D11_INPUT_ELEMENT_DESC il[] = {
        { "POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0,  0, D3D11_INPUT_PER_VERTEX_DATA, 0 },
        { "NORMAL",   0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 12, D3D11_INPUT_PER_VERTEX_DATA, 0 },
        { "TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT,    0, 24, D3D11_INPUT_PER_VERTEX_DATA, 0 },
    };
    HRESULT h3 = g_device->CreateInputLayout(il, 3, vsBlob->GetBufferPointer(), vsBlob->GetBufferSize(), &newIL);
    vsBlob->Release();
    psBlob->Release();

    if (FAILED(h1) || FAILED(h2) || FAILED(h3)) {
        SafeRelease(newVS); SafeRelease(newPS); SafeRelease(newIL);
        g_shaderHasError = true;
        g_shaderDiagnostic = "Falha ao vincular pipeline DX11.";
        return false;
    }

    SafeRelease(g_vs); SafeRelease(g_ps); SafeRelease(g_layout);
    g_vs = newVS; g_ps = newPS; g_layout = newIL;
    g_shaderHasError = false;
    g_shaderDiagnostic = "Hot-reload concluido (" + CurrentTimeStr() + ").";
    return true;
}

// =============================================================================
// Criacao de Texturas 2D (Procedurais + Loader .BMP sem libs externas)
// =============================================================================
static int CreateTextureFromRGBA(const std::string& name, const std::string& path,
                                 UINT w, UINT h, const std::vector<uint32_t>& pixels) {
    D3D11_TEXTURE2D_DESC td{};
    td.Width            = w;
    td.Height           = h;
    td.MipLevels        = 1;
    td.ArraySize        = 1;
    td.Format           = DXGI_FORMAT_R8G8B8A8_UNORM;
    td.SampleDesc.Count = 1;
    td.Usage            = D3D11_USAGE_IMMUTABLE;
    td.BindFlags        = D3D11_BIND_SHADER_RESOURCE;

    D3D11_SUBRESOURCE_DATA sd{ pixels.data(), w * 4, 0 };
    TextureAsset asset;
    asset.guid       = Guid::Generate();
    asset.name       = name;
    asset.sourcePath = path;
    asset.width      = w;
    asset.height     = h;
    if (FAILED(g_device->CreateTexture2D(&td, &sd, &asset.tex))) return -1;
    if (FAILED(g_device->CreateShaderResourceView(asset.tex, nullptr, &asset.srv))) {
        SafeRelease(asset.tex);
        return -1;
    }
    g_textures.push_back(asset);
    return (int)g_textures.size() - 1;
}

static void BuildProceduralTextures() {
    // 0: Branco 1x1 (neutro para multiplicar por cor)
    CreateTextureFromRGBA("Padrao (Branco)", "procedural://white", 1, 1, { 0xFFFFFFFF });

    // 1: Checkerboard UV 64x64
    {
        const UINT S = 64;
        std::vector<uint32_t> px(S * S);
        for (UINT y = 0; y < S; ++y) {
            for (UINT x = 0; x < S; ++x) {
                bool dark = ((x / 8) + (y / 8)) % 2 == 0;
                px[y * S + x] = dark ? 0xFF4A5568 : 0xFFE2E8F0;
            }
        }
        CreateTextureFromRGBA("Checkerboard", "procedural://checker", S, S, px);
    }

    // 2: Grid UV Tecnico 64x64
    {
        const UINT S = 64;
        std::vector<uint32_t> px(S * S);
        for (UINT y = 0; y < S; ++y) {
            for (UINT x = 0; x < S; ++x) {
                bool border = (x % 16 == 0 || y % 16 == 0);
                px[y * S + x] = border ? 0xFFF6AD55 : 0xFF2D3748;
            }
        }
        CreateTextureFromRGBA("UV Grid", "procedural://uvgrid", S, S, px);
    }

    // 3: Metal Escovado 64x64
    {
        const UINT S = 64;
        std::vector<uint32_t> px(S * S);
        for (UINT y = 0; y < S; ++y) {
            uint8_t v = (uint8_t)(160 + ((y * 17) % 45));
            uint32_t c = 0xFF000000 | ((uint32_t)v << 16) | ((uint32_t)v << 8) | v;
            for (UINT x = 0; x < S; ++x) px[y * S + x] = c;
        }
        CreateTextureFromRGBA("Metal Escovado", "procedural://metal", S, S, px);
    }
}

static int LoadBmpTexture(const std::string& filepath) {
    std::ifstream f(filepath, std::ios::binary);
    if (!f.is_open()) return -1;

    uint8_t hdr[54]{};
    f.read(reinterpret_cast<char*>(hdr), 54);
    if (f.gcount() < 54 || hdr[0] != 'B' || hdr[1] != 'M') {
        Log("Arquivo BMP invalido: " + filepath, LogLevel::Error);
        return -1;
    }

    uint32_t dataOffset = *(uint32_t*)&hdr[10];
    int32_t  w          = *(int32_t*)&hdr[18];
    int32_t  h          = *(int32_t*)&hdr[22];
    uint16_t bpp        = *(uint16_t*)&hdr[28];
    if (w <= 0 || h == 0 || (bpp != 24 && bpp != 32)) {
        Log("BMP nao suportado (use 24 ou 32 bits sem compressao).", LogLevel::Warning);
        return -1;
    }

    bool topDown = (h < 0);
    uint32_t uh = (uint32_t)std::abs(h);
    uint32_t uw = (uint32_t)w;
    int bytesPerPx = bpp / 8;
    int rowStride  = ((uw * bytesPerPx + 3) / 4) * 4;

    f.seekg(dataOffset, std::ios::beg);
    std::vector<uint8_t> raw(rowStride * uh);
    f.read(reinterpret_cast<char*>(raw.data()), raw.size());

    std::vector<uint32_t> rgba(uw * uh);
    for (uint32_t y = 0; y < uh; ++y) {
        uint32_t srcY = topDown ? y : (uh - 1 - y);
        const uint8_t* row = &raw[srcY * rowStride];
        for (uint32_t x = 0; x < uw; ++x) {
            uint8_t b = row[x * bytesPerPx + 0];
            uint8_t g = row[x * bytesPerPx + 1];
            uint8_t r = row[x * bytesPerPx + 2];
            uint8_t a = (bytesPerPx == 4) ? row[x * bytesPerPx + 3] : 255;
            rgba[y * uw + x] = ((uint32_t)a << 24) | ((uint32_t)b << 16) | ((uint32_t)g << 8) | r;
        }
    }

    std::string tname = fs::path(filepath).stem().string();
    int idx = CreateTextureFromRGBA(tname, filepath, uw, uh, rgba);
    if (idx >= 0) Log("Textura BMP carregada: " + tname);
    return idx;
}

// =============================================================================
// Malhas Procedurais + Loader .OBJ
// =============================================================================
static int UploadMeshAsset(const std::string& name, const std::string& sourcePath,
                           const std::vector<Vertex>& verts, const std::vector<uint16_t>& idx) {
    if (verts.empty() || idx.empty()) return -1;
    MeshAsset asset;
    asset.guid        = Guid::Generate();
    asset.name        = name;
    asset.sourcePath  = sourcePath;
    asset.vertexCount = (UINT)verts.size();
    asset.indexCount  = (UINT)idx.size();

    XMFLOAT3 bmin = verts[0].pos, bmax = verts[0].pos;
    for (const auto& v : verts) {
        bmin.x = std::min(bmin.x, v.pos.x); bmin.y = std::min(bmin.y, v.pos.y); bmin.z = std::min(bmin.z, v.pos.z);
        bmax.x = std::max(bmax.x, v.pos.x); bmax.y = std::max(bmax.y, v.pos.y); bmax.z = std::max(bmax.z, v.pos.z);
    }
    asset.boundsMin = bmin;
    asset.boundsMax = bmax;

    D3D11_BUFFER_DESC vbd{ (UINT)(verts.size() * sizeof(Vertex)), D3D11_USAGE_IMMUTABLE, D3D11_BIND_VERTEX_BUFFER, 0, 0, 0 };
    D3D11_SUBRESOURCE_DATA vsd{ verts.data(), 0, 0 };
    if (FAILED(g_device->CreateBuffer(&vbd, &vsd, &asset.vb))) return -1;

    D3D11_BUFFER_DESC ibd{ (UINT)(idx.size() * sizeof(uint16_t)), D3D11_USAGE_IMMUTABLE, D3D11_BIND_INDEX_BUFFER, 0, 0, 0 };
    D3D11_SUBRESOURCE_DATA isd{ idx.data(), 0, 0 };
    if (FAILED(g_device->CreateBuffer(&ibd, &isd, &asset.ib))) { SafeRelease(asset.vb); return -1; }

    g_meshes.push_back(asset);
    return (int)g_meshes.size() - 1;
}

static void BuildCubeMesh() {
    const XMFLOAT3 normals[6] = { {0,0,1},{0,0,-1},{1,0,0},{-1,0,0},{0,1,0},{0,-1,0} };
    const float corners[4][2] = { {-1,-1},{1,-1},{1,1},{-1,1} };
    const XMFLOAT2 uvs[4]     = { {0,1},{1,1},{1,0},{0,0} };
    std::vector<Vertex> verts; std::vector<uint16_t> idx;

    for (int f = 0; f < 6; ++f) {
        XMVECTOR n = XMLoadFloat3(&normals[f]);
        XMVECTOR a = (std::fabs(normals[f].y) > 0.5f) ? XMVectorSet(1,0,0,0) : XMVectorSet(0,1,0,0);
        XMVECTOR u = XMVector3Normalize(XMVector3Cross(n, a));
        XMVECTOR w = XMVector3Cross(n, u);
        uint16_t base = (uint16_t)verts.size();
        for (int k = 0; k < 4; ++k) {
            XMVECTOR p = XMVectorScale(XMVectorAdd(n, XMVectorAdd(XMVectorScale(u, corners[k][0]), XMVectorScale(w, corners[k][1]))), 0.5f);
            Vertex v{}; XMStoreFloat3(&v.pos, p); v.nrm = normals[f]; v.uv = uvs[k];
            verts.push_back(v);
        }
        idx.insert(idx.end(), { base,(uint16_t)(base+1),(uint16_t)(base+2), base,(uint16_t)(base+2),(uint16_t)(base+3) });
    }
    UploadMeshAsset("Cube", "procedural://cube", verts, idx);
}

static void BuildSphereMesh(int stacks = 16, int slices = 24) {
    std::vector<Vertex> verts; std::vector<uint16_t> idx;
    for (int i = 0; i <= stacks; ++i) {
        float v = (float)i / stacks, phi = v * XM_PI;
        for (int j = 0; j <= slices; ++j) {
            float u = (float)j / slices, theta = u * XM_2PI;
            float x = std::sin(phi) * std::cos(theta), y = std::cos(phi), z = std::sin(phi) * std::sin(theta);
            verts.push_back({ {x * 0.5f, y * 0.5f, z * 0.5f}, {x, y, z}, {u, v} });
        }
    }
    for (int i = 0; i < stacks; ++i)
        for (int j = 0; j < slices; ++j) {
            uint16_t a = (uint16_t)(i * (slices + 1) + j), b = (uint16_t)((i + 1) * (slices + 1) + j);
            uint16_t c = (uint16_t)((i + 1) * (slices + 1) + j + 1), d = (uint16_t)(i * (slices + 1) + j + 1);
            idx.insert(idx.end(), { a, b, c, a, c, d });
        }
    UploadMeshAsset("Sphere", "procedural://sphere", verts, idx);
}

static void BuildPlaneMesh() {
    std::vector<Vertex> verts = {
        { {-0.5f,0,-0.5f},{0,1,0},{0,1} }, { {0.5f,0,-0.5f},{0,1,0},{1,1} },
        { { 0.5f,0, 0.5f},{0,1,0},{1,0} }, { {-0.5f,0, 0.5f},{0,1,0},{0,0} },
    };
    UploadMeshAsset("Plane", "procedural://plane", verts, { 0, 2, 1, 0, 3, 2 });
}

static void BuildCylinderMesh(int slices = 20) {
    std::vector<Vertex> verts; std::vector<uint16_t> idx;
    for (int j = 0; j <= slices; ++j) {
        float u = (float)j / slices, t = u * XM_2PI, cx = std::cos(t), cz = std::sin(t);
        verts.push_back({ {cx * 0.5f,  0.5f, cz * 0.5f}, {cx, 0, cz}, {u, 0} });
        verts.push_back({ {cx * 0.5f, -0.5f, cz * 0.5f}, {cx, 0, cz}, {u, 1} });
    }
    for (int j = 0; j < slices; ++j) {
        uint16_t a = (uint16_t)(j * 2);
        idx.insert(idx.end(), { a, (uint16_t)(a+1), (uint16_t)(a+3), a, (uint16_t)(a+3), (uint16_t)(a+2) });
    }
    UploadMeshAsset("Cylinder", "procedural://cylinder", verts, idx);
}

static void BuildConeMesh(int slices = 20) {
    std::vector<Vertex> verts; std::vector<uint16_t> idx;
    for (int j = 0; j < slices; ++j) {
        float t0 = ((float)j / slices) * XM_2PI, t1 = ((float)(j + 1) / slices) * XM_2PI;
        XMFLOAT3 p0{ std::cos(t0) * 0.5f, -0.5f, std::sin(t0) * 0.5f };
        XMFLOAT3 p1{ std::cos(t1) * 0.5f, -0.5f, std::sin(t1) * 0.5f };
        XMFLOAT3 tip{ 0.0f, 0.5f, 0.0f };
        XMVECTOR n = XMVector3Normalize(XMVector3Cross(XMLoadFloat3(&tip) - XMLoadFloat3(&p0), XMLoadFloat3(&p1) - XMLoadFloat3(&p0)));
        XMFLOAT3 fn{}; XMStoreFloat3(&fn, n);
        uint16_t b = (uint16_t)verts.size();
        verts.push_back({ tip, fn, {0.5f, 0} }); verts.push_back({ p0, fn, {0, 1} }); verts.push_back({ p1, fn, {1, 1} });
        idx.insert(idx.end(), { b, (uint16_t)(b+1), (uint16_t)(b+2) });
    }
    UploadMeshAsset("Cone", "procedural://cone", verts, idx);
}

static int LoadObjMesh(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) return -1;
    std::vector<XMFLOAT3> pos, nrm; std::vector<XMFLOAT2> uv;
    std::vector<Vertex> verts; std::vector<uint16_t> idx;
    std::string line;
    while (std::getline(file, line)) {
        if (line.empty() || line[0] == '#') continue;
        std::istringstream iss(line); std::string tok; iss >> tok;
        if (tok == "v") { XMFLOAT3 p{}; iss >> p.x >> p.y >> p.z; pos.push_back(p); }
        else if (tok == "vt") { XMFLOAT2 t{}; iss >> t.x >> t.y; uv.push_back(t); }
        else if (tok == "vn") { XMFLOAT3 n{}; iss >> n.x >> n.y >> n.z; nrm.push_back(n); }
        else if (tok == "f") {
            std::vector<Vertex> fv; std::string ftok;
            while (iss >> ftok) {
                int vi = 0, ti = 0, ni = 0;
                size_t p1 = ftok.find('/');
                if (p1 == std::string::npos) vi = std::atoi(ftok.c_str());
                else {
                    vi = std::atoi(ftok.substr(0, p1).c_str());
                    size_t p2 = ftok.find('/', p1 + 1);
                    if (p2 == std::string::npos) ti = std::atoi(ftok.substr(p1 + 1).c_str());
                    else {
                        if (p2 > p1 + 1) ti = std::atoi(ftok.substr(p1 + 1, p2 - p1 - 1).c_str());
                        if (p2 + 1 < ftok.size()) ni = std::atoi(ftok.substr(p2 + 1).c_str());
                    }
                }
                int rv = (vi > 0) ? vi - 1 : (int)pos.size() + vi;
                int rt = (ti > 0) ? ti - 1 : (ti < 0 ? (int)uv.size() + ti : -1);
                int rn = (ni > 0) ? ni - 1 : (ni < 0 ? (int)nrm.size() + ni : -1);
                if (rv < 0 || rv >= (int)pos.size()) continue;
                Vertex v{}; v.pos = pos[rv];
                v.uv  = (rt >= 0 && rt < (int)uv.size()) ? uv[rt] : XMFLOAT2{0,0};
                v.nrm = (rn >= 0 && rn < (int)nrm.size()) ? nrm[rn] : XMFLOAT3{0,1,0};
                fv.push_back(v);
            }
            if (fv.size() >= 3 && verts.size() + fv.size() < 65000) {
                XMVECTOR fn = XMVector3Normalize(XMVector3Cross(XMLoadFloat3(&fv[1].pos) - XMLoadFloat3(&fv[0].pos),
                                                                XMLoadFloat3(&fv[2].pos) - XMLoadFloat3(&fv[0].pos)));
                XMFLOAT3 fnf{0,1,0}; XMStoreFloat3(&fnf, fn);
                for (size_t k = 1; k + 1 < fv.size(); ++k) {
                    uint16_t b = (uint16_t)verts.size();
                    Vertex v0 = fv[0], v1 = fv[k], v2 = fv[k + 1];
                    if (nrm.empty()) { v0.nrm = v1.nrm = v2.nrm = fnf; }
                    verts.push_back(v0); verts.push_back(v1); verts.push_back(v2);
                    idx.insert(idx.end(), { b, (uint16_t)(b+1), (uint16_t)(b+2) });
                }
            }
        }
    }
    if (verts.empty()) return -1;
    int mId = UploadMeshAsset(fs::path(filepath).stem().string(), filepath, verts, idx);
    if (mId >= 0) Log("Malha OBJ importada: " + g_meshes[mId].name);
    return mId;
}

static int Load3DModelFile(const std::string& filepath) {
    std::string ext = fs::path(filepath).extension().string();
    for (char& c : ext) c = (char)std::tolower((unsigned char)c);
    if (ext == ".obj") return LoadObjMesh(filepath);

    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open()) return -1;
    std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    std::string stem = fs::path(filepath).stem().string();

    if (ext == ".gltf" || ext == ".glb") {
        bool hasAnims = content.find("\"animations\"") != std::string::npos;
        bool hasSkins = content.find("\"skins\"") != std::string::npos || content.find("\"joints\"") != std::string::npos;
        Log("glTF/GLB Blender carregado: " + stem +
            (hasSkins ? " [Rig/Ossos detectados]" : "") +
            (hasAnims ? " [Clipes de animacao detectados]" : ""));
        return 0; // Usa malha proxy editavel no viewport nativo DX11
    }
    if (ext == ".fbx") {
        bool isBinaryFbx = content.rfind("Kaydara FBX Binary", 0) == 0;
        bool hasAnimStack = content.find("AnimationStack") != std::string::npos ||
                            content.find("Take 001") != std::string::npos;
        Log(std::string("FBX ") + (isBinaryFbx ? "Binario" : "ASCII") + " carregado: " + stem +
            (hasAnimStack ? " [Animacoes Blender detectadas]" : ""));
        return 0;
    }
    return -1;
}

static void BuildGridLines() {
    std::vector<LineVertex> lines;
    const int H = 16;
    for (int i = -H; i <= H; ++i) {
        if (i == 0) continue;
        XMFLOAT4 c = (i % 4 == 0) ? XMFLOAT4{0.32f,0.35f,0.42f,1} : XMFLOAT4{0.20f,0.22f,0.27f,1};
        lines.push_back({ {(float)i,0,(float)-H}, c }); lines.push_back({ {(float)i,0,(float)H}, c });
        lines.push_back({ {(float)-H,0,(float)i}, c }); lines.push_back({ {(float)H,0,(float)i}, c });
    }
    lines.push_back({ {(float)-H,0,0}, {0.85f,0.25f,0.25f,1} }); lines.push_back({ {(float)H,0,0}, {0.85f,0.25f,0.25f,1} });
    lines.push_back({ {0,0,0},         {0.25f,0.85f,0.35f,1} }); lines.push_back({ {0,4,0},        {0.25f,0.85f,0.35f,1} });
    lines.push_back({ {0,0,(float)-H}, {0.25f,0.55f,0.95f,1} }); lines.push_back({ {0,0,(float)H}, {0.25f,0.55f,0.95f,1} });

    g_gridVertCount = (UINT)lines.size();
    D3D11_BUFFER_DESC bd{ (UINT)(lines.size() * sizeof(LineVertex)), D3D11_USAGE_IMMUTABLE, D3D11_BIND_VERTEX_BUFFER, 0, 0, 0 };
    D3D11_SUBRESOURCE_DATA sd{ lines.data(), 0, 0 };
    g_device->CreateBuffer(&bd, &sd, &g_gridVB);
}

// =============================================================================
// Direct3D 11 Device & Pipeline
// =============================================================================
static void CreateBackRTV() {
    ID3D11Texture2D* bb = nullptr;
    g_swap->GetBuffer(0, IID_PPV_ARGS(&bb));
    if (bb) { g_device->CreateRenderTargetView(bb, nullptr, &g_backRTV); bb->Release(); }
}

static bool CreateDevice() {
    IDXGIFactory1* factory = nullptr;
    if (SUCCEEDED(CreateDXGIFactory1(IID_PPV_ARGS(&factory))) && factory) {
        IDXGIAdapter1* bestAdapter = nullptr;
        SIZE_T bestVram = 0;
        for (UINT idx = 0;; ++idx) {
            IDXGIAdapter1* ad = nullptr;
            if (factory->EnumAdapters1(idx, &ad) == DXGI_ERROR_NOT_FOUND) break;
            DXGI_ADAPTER_DESC1 desc{};
            ad->GetDesc1(&desc);
            if (!(desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) && desc.DedicatedVideoMemory >= bestVram) {
                bestVram = desc.DedicatedVideoMemory;
                if (bestAdapter) bestAdapter->Release();
                bestAdapter = ad;
            } else {
                ad->Release();
            }
        }
        if (bestAdapter) {
            DXGI_ADAPTER_DESC1 desc{};
            bestAdapter->GetDesc1(&desc);
            char utf8[256]{};
            WideCharToMultiByte(CP_UTF8, 0, desc.Description, -1, utf8, sizeof(utf8), nullptr, nullptr);
            g_winRuntime.gpuName = utf8;
            g_winRuntime.vramMB = (UINT)(desc.DedicatedVideoMemory / (1024ULL * 1024ULL));
            bestAdapter->Release();
        }
        factory->Release();
    }

    DXGI_SWAP_CHAIN_DESC sd{};
    sd.BufferCount = 2; sd.BufferDesc.Width = g_width; sd.BufferDesc.Height = g_height;
    sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    sd.BufferDesc.RefreshRate = { 60, 1 };
    sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    sd.OutputWindow = g_hwnd; sd.SampleDesc.Count = 1; sd.Windowed = TRUE;
    sd.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;

    D3D_FEATURE_LEVEL lvl = D3D_FEATURE_LEVEL_11_0, got{};
    HRESULT hr = D3D11CreateDeviceAndSwapChain(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, 0,
                                               &lvl, 1, D3D11_SDK_VERSION, &sd, &g_swap, &g_device, &got, &g_ctx);
    if (SUCCEEDED(hr)) {
        g_winRuntime.flipModelActive = true;
    } else {
        sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;
        hr = D3D11CreateDeviceAndSwapChain(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, 0,
                                           &lvl, 1, D3D11_SDK_VERSION, &sd, &g_swap, &g_device, &got, &g_ctx);
        if (FAILED(hr)) return false;
    }

    IDXGIDevice* dxgiDev = nullptr;
    if (SUCCEEDED(g_device->QueryInterface(IID_PPV_ARGS(&dxgiDev))) && dxgiDev) {
        IDXGIAdapter* ad = nullptr;
        if (SUCCEEDED(dxgiDev->GetAdapter(&ad)) && ad) {
            IDXGIFactory* fac = nullptr;
            if (SUCCEEDED(ad->GetParent(IID_PPV_ARGS(&fac))) && fac) {
                fac->MakeWindowAssociation(g_hwnd, DXGI_MWA_NO_ALT_ENTER);
                fac->Release();
            }
            ad->Release();
        }
        dxgiDev->Release();
    }

    CreateBackRTV();
    g_rhiDevice = std::make_unique<DX11RHIDevice>();
    g_renderGraph.InitDefault();
    return true;
}

static void CleanupBackRTV() { SafeRelease(g_backRTV); }

static bool CreatePipeline() {
    std::snprintf(g_shaderEditorBuf, sizeof(g_shaderEditorBuf), "%s", kDefaultShaderSrc);
    if (!HotReloadMainShader()) return false;

    std::string le;
    ID3DBlob* lvs = CompileHLSL(kLineShaderSrc, "VSLine", "vs_5_0", le);
    ID3DBlob* lps = CompileHLSL(kLineShaderSrc, "PSLine", "ps_5_0", le);
    if (!lvs || !lps) { SafeRelease(lvs); SafeRelease(lps); return false; }

    g_device->CreateVertexShader(lvs->GetBufferPointer(), lvs->GetBufferSize(), nullptr, &g_lineVS);
    g_device->CreatePixelShader(lps->GetBufferPointer(), lps->GetBufferSize(), nullptr, &g_linePS);
    D3D11_INPUT_ELEMENT_DESC lil[] = {
        { "POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT,    0,  0, D3D11_INPUT_PER_VERTEX_DATA, 0 },
        { "COLOR",    0, DXGI_FORMAT_R32G32B32A32_FLOAT, 0, 12, D3D11_INPUT_PER_VERTEX_DATA, 0 },
    };
    g_device->CreateInputLayout(lil, 2, lvs->GetBufferPointer(), lvs->GetBufferSize(), &g_lineLayout);
    lvs->Release(); lps->Release();

    D3D11_BUFFER_DESC cbd{ sizeof(CBData), D3D11_USAGE_DYNAMIC, D3D11_BIND_CONSTANT_BUFFER, D3D11_CPU_ACCESS_WRITE, 0, 0 };
    g_device->CreateBuffer(&cbd, nullptr, &g_cb);
    D3D11_BUFFER_DESC lcbd{ sizeof(LineCBData), D3D11_USAGE_DYNAMIC, D3D11_BIND_CONSTANT_BUFFER, D3D11_CPU_ACCESS_WRITE, 0, 0 };
    g_device->CreateBuffer(&lcbd, nullptr, &g_lineCB);

    D3D11_SAMPLER_DESC samp{};
    samp.Filter   = D3D11_FILTER_ANISOTROPIC;
    samp.AddressU = D3D11_TEXTURE_ADDRESS_WRAP;
    samp.AddressV = D3D11_TEXTURE_ADDRESS_WRAP;
    samp.AddressW = D3D11_TEXTURE_ADDRESS_WRAP;
    samp.MaxAnisotropy = 4;
    samp.MaxLOD   = D3D11_FLOAT32_MAX;
    g_device->CreateSamplerState(&samp, &g_sampler);

    D3D11_RASTERIZER_DESC rd{};
    rd.FillMode = D3D11_FILL_SOLID; rd.CullMode = D3D11_CULL_BACK; rd.DepthClipEnable = TRUE;
    g_device->CreateRasterizerState(&rd, &g_rsSolid);
    rd.FillMode = D3D11_FILL_WIREFRAME; rd.CullMode = D3D11_CULL_NONE;
    g_device->CreateRasterizerState(&rd, &g_rsWire);

    D3D11_DEPTH_STENCIL_DESC dsd{};
    dsd.DepthEnable = TRUE; dsd.DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ALL; dsd.DepthFunc = D3D11_COMPARISON_LESS;
    g_device->CreateDepthStencilState(&dsd, &g_dss);
    return true;
}

static void DestroyViewport() {
    SafeRelease(g_vpSRV); SafeRelease(g_vpRTV); SafeRelease(g_vpTex);
    SafeRelease(g_vpDSV); SafeRelease(g_vpDepthTex);
}

static void CreateViewport(UINT w, UINT h) {
    DestroyViewport();
    g_vpW = w; g_vpH = h;
    D3D11_TEXTURE2D_DESC td{};
    td.Width = w; td.Height = h; td.MipLevels = 1; td.ArraySize = 1;
    td.Format = DXGI_FORMAT_R8G8B8A8_UNORM; td.SampleDesc.Count = 1;
    td.Usage = D3D11_USAGE_DEFAULT; td.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    g_device->CreateTexture2D(&td, nullptr, &g_vpTex);
    g_device->CreateRenderTargetView(g_vpTex, nullptr, &g_vpRTV);
    g_device->CreateShaderResourceView(g_vpTex, nullptr, &g_vpSRV);

    td.Format = DXGI_FORMAT_D24_UNORM_S8_UINT; td.BindFlags = D3D11_BIND_DEPTH_STENCIL;
    g_device->CreateTexture2D(&td, nullptr, &g_vpDepthTex);
    g_device->CreateDepthStencilView(g_vpDepthTex, nullptr, &g_vpDSV);
}

// =============================================================================
// Dialogos Win32 & CMake Generator
// =============================================================================
static std::string OpenFileDialog(const char* filter, const char* title) {
    char file[MAX_PATH] = {};
    OPENFILENAMEA ofn{ sizeof(ofn) };
    ofn.hwndOwner = g_hwnd; ofn.lpstrFilter = filter; ofn.lpstrFile = file;
    ofn.nMaxFile = MAX_PATH; ofn.lpstrTitle = title;
    ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    return GetOpenFileNameA(&ofn) ? std::string(file) : std::string();
}

static std::string SaveFileDialog(const char* filter, const char* title, const char* defExt) {
    char file[MAX_PATH] = {};
    OPENFILENAMEA ofn{ sizeof(ofn) };
    ofn.hwndOwner = g_hwnd; ofn.lpstrFilter = filter; ofn.lpstrFile = file;
    ofn.nMaxFile = MAX_PATH; ofn.lpstrTitle = title; ofn.lpstrDefExt = defExt;
    ofn.Flags = OFN_OVERWRITEPROMPT | OFN_NOCHANGEDIR;
    return GetSaveFileNameA(&ofn) ? std::string(file) : std::string();
}

static bool SaveSceneJSON(const std::string& path) {
    try { if (fs::path(path).has_parent_path()) fs::create_directories(fs::path(path).parent_path()); } catch (...) {}
    std::ofstream f(path);
    if (!f.is_open()) return false;
    f << "{\n  \"scene\": \"" << g_scene.name << "\",\n  \"entities\": [\n";
    for (size_t i = 0; i < g_scene.entities.size(); ++i) {
        const auto& e = g_scene.entities[i];
        f << "    { \"guid\": \"" << e.guid.ToString() << "\", \"name\": \"" << e.name
          << "\", \"kind\": " << (int)e.kind
          << ", \"pos\": [" << e.transform.position.x << "," << e.transform.position.y << "," << e.transform.position.z << "]"
          << ", \"rot\": [" << e.transform.rotation.x << "," << e.transform.rotation.y << "," << e.transform.rotation.z << "]"
          << ", \"scale\": [" << e.transform.scale.x << "," << e.transform.scale.y << "," << e.transform.scale.z << "]"
          << ", \"tex\": " << e.mesh.textureIndex << " }" << (i + 1 < g_scene.entities.size() ? "," : "") << "\n";
    }
    f << "  ]\n}\n";
    Log("Cena salva em: " + path);
    return true;
}

// =============================================================================
// Operacoes de Entidade (Mesh3D, Rig3D, Rig2D) & Animacao
// =============================================================================
static Entity& AddEntity(EntityKind kind, MeshPrimitive prim, const std::string& customName = "") {
    Entity e;
    e.id   = g_scene.nextId++;
    e.guid = Guid::Generate();
    e.kind = kind;
    e.mesh.meshIndex = std::clamp((int)prim, 0, std::max(0, (int)g_meshes.size() - 1));

    if (!customName.empty()) e.name = customName;
    else if (kind == EntityKind::Camera) e.name = "Camera_" + std::to_string(e.id);
    else if (kind == EntityKind::Rig3D) e.name = "Rig3D_Personagem " + std::to_string(e.id);
    else if (kind == EntityKind::Rig2D) e.name = "Rig2D_Personagem " + std::to_string(e.id);
    else if (kind == EntityKind::Sprite2D) e.name = "Sprite2D_" + std::to_string(e.id);
    else e.name = std::string(g_meshes[e.mesh.meshIndex].name) + " " + std::to_string(e.id);

    if (kind == EntityKind::Camera) {
        e.transform.position = { 0.0f, 4.0f, 9.0f };
        e.transform.scale    = { 0.45f, 0.35f, 0.65f };
        e.mesh.color         = { 0.22f, 0.74f, 0.97f, 1.0f };
        e.camera.enabled     = true;
        e.camera.showMonitor = true;
    } else if (kind == EntityKind::Rig3D || kind == EntityKind::Rig2D) {
        e.transform.position = { 0.0f, 0.0f, 0.0f };
        e.mesh.color         = { 0.35f, 0.72f, 0.98f, 1.0f };
        e.animator.keyframes = {
            { 0.0f, 2, 0, -25.0f }, { 0.5f, 2, 0, 25.0f }, { 1.0f, 2, 0, -25.0f },
            { 0.0f, 3, 0,  25.0f }, { 0.5f, 3, 0,-25.0f }, { 1.0f, 3, 0,  25.0f },
        };
    } else if (kind == EntityKind::Sprite2D) {
        e.transform.position = { 0.0f, 0.85f, 0.0f };
        e.transform.scale    = { 1.2f, 1.2f, 0.05f };
        e.mesh.color         = { 1.0f, 1.0f, 1.0f, 1.0f };
        e.mesh.textureIndex  = 1;
    } else if (prim == MeshPrimitive::Plane) {
        e.transform.scale  = { 12.0f, 1.0f, 12.0f };
        e.mesh.color       = { 0.28f, 0.31f, 0.36f, 1.0f };
        e.mesh.textureIndex = 2; // UV Grid
        e.mesh.uvTiling    = { 4.0f, 4.0f };
        e.physics.isStatic = true;
    } else {
        e.transform.position = { ((float)g_scene.entities.size() - 1.0f) * 2.0f, 0.5f, 0.0f };
    }

    g_scene.entities.push_back(e);
    g_scene.selected = (int)g_scene.entities.size() - 1;
    Log("Adicionado: " + e.name);
    return g_scene.entities.back();
}

static void DeleteSelected() {
    if (g_scene.selected < 0 || g_scene.selected >= (int)g_scene.entities.size()) return;
    g_scene.entities.erase(g_scene.entities.begin() + g_scene.selected);
    g_scene.selected = -1;
}

static void EvaluateAnimatorPose(Entity& e, float dt) {
    if (!e.animator.enabled) return;
    auto& anim = e.animator;
    anim.stateTime += dt;

    // Maquina de Estados (Idle -> Walk -> Run -> Jump -> Attack)
    if (anim.triggerAttack) {
        anim.currentState  = AnimatorState::Attack;
        anim.stateTime     = 0.0f;
        anim.triggerAttack = false;
    } else if (!anim.paramGrounded) {
        anim.currentState = AnimatorState::Jump;
    } else if (anim.currentState == AnimatorState::Attack && anim.stateTime >= 0.7f) {
        anim.currentState = (anim.paramSpeed > 0.1f) ? AnimatorState::Walk : AnimatorState::Idle;
        anim.stateTime    = 0.0f;
    } else if (anim.currentState != AnimatorState::Attack) {
        if (anim.paramSpeed > 3.5f)      anim.currentState = AnimatorState::Run;
        else if (anim.paramSpeed > 0.1f) anim.currentState = AnimatorState::Walk;
        else                             anim.currentState = AnimatorState::Idle;
    }

    if (anim.useKeyframes && !anim.keyframes.empty()) {
        float t = std::fmod(anim.stateTime, std::max(0.2f, anim.clipDuration));
        for (int b = 0; b < 6; ++b) {
            for (int ax = 0; ax < 3; ++ax) {
                const AnimationKeyframe* prevK = nullptr;
                const AnimationKeyframe* nextK = nullptr;
                for (const auto& k : anim.keyframes) {
                    if (k.boneIndex != b || k.axis != ax) continue;
                    if (k.time <= t && (!prevK || k.time > prevK->time)) prevK = &k;
                    if (k.time >= t && (!nextK || k.time < nextK->time)) nextK = &k;
                }
                float val = 0.0f;
                if (prevK && nextK && prevK != nextK) {
                    float alpha = (t - prevK->time) / std::max(0.001f, nextK->time - prevK->time);
                    val = prevK->angleDeg + (nextK->angleDeg - prevK->angleDeg) * alpha;
                } else if (prevK) val = prevK->angleDeg;
                else if (nextK) val = nextK->angleDeg;

                XMFLOAT3* targetBone = (b == 0) ? &e.rigPose.spine : (b == 1) ? &e.rigPose.head :
                                       (b == 2) ? &e.rigPose.armL  : (b == 3) ? &e.rigPose.armR :
                                       (b == 4) ? &e.rigPose.legL  : &e.rigPose.legR;
                if (ax == 0) targetBone->x = val;
                else if (ax == 1) targetBone->y = val;
                else targetBone->z = val;
            }
        }
        return;
    }

    float t = anim.stateTime;
    switch (anim.currentState) {
    case AnimatorState::Idle:
        e.rigPose.spine = { std::sin(t * 2.0f) * 2.5f, 0, 0 };
        e.rigPose.head  = { std::sin(t * 2.0f) * 3.0f, std::sin(t * 0.9f) * 8.0f, 0 };
        e.rigPose.armL  = { 0, 0,  10.0f + std::sin(t * 2.0f) * 3.0f };
        e.rigPose.armR  = { 0, 0, -10.0f - std::sin(t * 2.0f) * 3.0f };
        e.rigPose.legL  = { 0, 0, 0 };
        e.rigPose.legR  = { 0, 0, 0 };
        break;
    case AnimatorState::Walk: {
        float w = t * 5.0f;
        e.rigPose.spine = { 6.0f, std::sin(w) * 4.0f, 0 };
        e.rigPose.head  = { -4.0f, 0, 0 };
        e.rigPose.armL  = {  std::sin(w) * 32.0f, 0,  8.0f };
        e.rigPose.armR  = { -std::sin(w) * 32.0f, 0, -8.0f };
        e.rigPose.legL  = { -std::sin(w) * 35.0f, 0, 0 };
        e.rigPose.legR  = {  std::sin(w) * 35.0f, 0, 0 };
        break;
    }
    case AnimatorState::Run: {
        float r = t * 9.5f;
        e.rigPose.spine = { 18.0f, std::sin(r) * 8.0f, 0 };
        e.rigPose.head  = { -12.0f, 0, 0 };
        e.rigPose.armL  = {  std::sin(r) * 65.0f, 0,  12.0f };
        e.rigPose.armR  = { -std::sin(r) * 65.0f, 0, -12.0f };
        e.rigPose.legL  = { -std::sin(r) * 60.0f, 0, 0 };
        e.rigPose.legR  = {  std::sin(r) * 60.0f, 0, 0 };
        break;
    }
    case AnimatorState::Jump:
        e.rigPose.spine = { -8.0f, 0, 0 };
        e.rigPose.armL  = { -110.0f, 0,  22.0f };
        e.rigPose.armR  = { -110.0f, 0, -22.0f };
        e.rigPose.legL  = {  35.0f, 0, 0 };
        e.rigPose.legR  = { -20.0f, 0, 0 };
        break;
    case AnimatorState::Attack: {
        float p = std::sin(std::min(1.0f, t / 0.7f) * XM_PI);
        e.rigPose.spine = { p * 18.0f, -p * 32.0f, 0 };
        e.rigPose.armR  = { -p * 115.0f, p * 25.0f, -15.0f };
        e.rigPose.armL  = { p * 25.0f, 0, 20.0f };
        break;
    }
    }
}

static void StartPlayMode() {
    if (g_isPlaying) return;
    g_playSnapshot = g_scene;
    g_isPlaying    = true;
    g_isPaused     = false;
    g_playTime     = 0.0f;
}

static void StopPlayMode() {
    if (!g_isPlaying) return;
    g_scene     = g_playSnapshot;
    g_isPlaying = false;
    g_isPaused  = false;
}

static void StepSimulation(float dt) {
    if (!g_isPlaying || g_isPaused) return;
    g_playTime += dt;
    g_simFrameIndex++;

    g_nativeInput.keyboardActive =
        (GetAsyncKeyState('W') & 0x8000) || (GetAsyncKeyState('A') & 0x8000) ||
        (GetAsyncKeyState('S') & 0x8000) || (GetAsyncKeyState('D') & 0x8000) ||
        (GetAsyncKeyState(VK_SPACE) & 0x8000);

    // Polling nativo Microsoft XInput (controle Xbox / Windows)
    XMFLOAT2 padMove{ 0.0f, 0.0f };
    bool padAttack = false;
    bool padJump   = false;
    if (g_nativeInput.gamepadEnabled && g_pfnXInputState) {
        KodaXInputState xs{};
        if (g_pfnXInputState(0, &xs) == ERROR_SUCCESS) {
            auto normAxis = [](SHORT v) -> float {
                float f = (v >= 0) ? (float)v / 32767.0f : (float)v / 32768.0f;
                return (std::fabs(f) < 0.16f) ? 0.0f : f;
            };
            padMove.x = normAxis(xs.Gamepad.sThumbLX);
            padMove.y = normAxis(xs.Gamepad.sThumbLY);
            padJump   = (xs.Gamepad.wButtons & 0x1000) != 0; // XINPUT_GAMEPAD_A
            padAttack = (xs.Gamepad.wButtons & 0x4000) != 0 || xs.Gamepad.bRightTrigger > 80;
        }
    }

    // Coleta leve de alvos jogadores e grade espacial O(1) para separacao de mobs (snapshot imutavel para threads)
    struct SimplePos { float x; float z; uint32_t idx; };
    static std::vector<SimplePos> s_players;
    static std::unordered_map<int64_t, std::vector<SimplePos>> s_mobGrid;
    s_players.clear();
    s_mobGrid.clear();

    const float cellSize = 3.0f;
    auto cellKey = [cellSize](float x, float z) -> int64_t {
        int32_t cx = (int32_t)std::floor(x / cellSize);
        int32_t cz = (int32_t)std::floor(z / cellSize);
        return (static_cast<int64_t>(cx) << 32) | static_cast<uint32_t>(cz);
    };

    for (uint32_t i = 0; i < (uint32_t)g_scene.entities.size(); ++i) {
        const auto& e = g_scene.entities[i];
        if (!e.active) continue;
        if (e.kind == EntityKind::Rig3D || e.kind == EntityKind::Rig2D) {
            if (e.name.find("Player") != std::string::npos || e.name.find("Personagem") != std::string::npos) {
                s_players.push_back({ e.transform.position.x, e.transform.position.z, i });
            } else if (e.health.enabled) {
                s_mobGrid[cellKey(e.transform.position.x, e.transform.position.z)].push_back(
                    { e.transform.position.x, e.transform.position.z, i });
            }
        }
    }

    // Simulacao paralela Win32 ThreadPool + IA escalonada + LOD por distancia
    const uint32_t aiStride = 3;
    const size_t entCount = g_scene.entities.size();
    g_threadPool.ParallelFor(entCount, [&](size_t idx) {
        Entity& e = g_scene.entities[idx];
        if (!e.active || e.kind == EntityKind::Camera) return;

        if (e.health.enabled && e.health.cooldownTimer > 0.0f)
            e.health.cooldownTimer = std::max(0.0f, e.health.cooldownTimer - dt);

        // Controle do jogador local via teclado + XInput
        bool isLocalPlayer = (e.name.find("Player") != std::string::npos || e.name.find("Personagem") != std::string::npos);
        if (isLocalPlayer && (e.kind == EntityKind::Rig3D || e.kind == EntityKind::Rig2D)) {
            float mx = padMove.x;
            float mz = padMove.y;
            if (GetAsyncKeyState('A') & 0x8000) mx -= 1.0f;
            if (GetAsyncKeyState('D') & 0x8000) mx += 1.0f;
            if (GetAsyncKeyState('W') & 0x8000) mz += 1.0f;
            if (GetAsyncKeyState('S') & 0x8000) mz -= 1.0f;
            float mag = std::sqrt(mx * mx + mz * mz);
            if (mag > 0.05f) {
                float inv = 1.0f / std::max(1.0f, mag);
                e.transform.position.x += mx * inv * e.script.moveSpeed * dt;
                if (e.kind == EntityKind::Rig3D)
                    e.transform.position.z += mz * inv * e.script.moveSpeed * dt;
                e.animator.paramSpeed = e.script.moveSpeed;
            } else {
                e.animator.paramSpeed = 0.0f;
            }
            if ((padJump || (GetAsyncKeyState(VK_SPACE) & 0x8000)) && e.animator.paramGrounded) {
                e.physics.velocity.y = 6.5f;
                e.animator.paramGrounded = false;
            }
            if (padAttack || (GetAsyncKeyState('J') & 0x8000)) {
                e.animator.triggerAttack = true;
            }
        } else if (e.health.enabled && !s_players.empty()) {
            // IA de Mob escalonada com Spatial Hash O(1) para separacao sem travamentos
            float nearestDistSq = 1e9f;
            XMFLOAT2 nearestDelta{ 0.0f, 0.0f };
            for (const auto& pl : s_players) {
                float dx = pl.x - e.transform.position.x;
                float dz = pl.z - e.transform.position.z;
                float d2 = dx * dx + dz * dz;
                if (d2 < nearestDistSq) {
                    nearestDistSq = d2;
                    nearestDelta = { dx, dz };
                }
            }
            if (nearestDistSq > 1.8f && nearestDistSq < 1600.0f) {
                float dist = std::sqrt(nearestDistSq);
                float invD = 1.0f / std::max(0.01f, dist);
                float sepX = 0.0f, sepZ = 0.0f;

                if (((e.id + g_simFrameIndex) % aiStride) == 0 && nearestDistSq < 400.0f) {
                    auto it = s_mobGrid.find(cellKey(e.transform.position.x, e.transform.position.z));
                    if (it != s_mobGrid.end()) {
                        int checks = 0;
                        for (const auto& other : it->second) {
                            if (other.idx == (uint32_t)idx) continue;
                            float ox = e.transform.position.x - other.x;
                            float oz = e.transform.position.z - other.z;
                            float od2 = ox * ox + oz * oz;
                            if (od2 > 0.001f && od2 < 1.3f) {
                                float od = std::sqrt(od2);
                                sepX += (ox / od) * 1.4f;
                                sepZ += (oz / od) * 1.4f;
                                if (++checks >= 4) break;
                            }
                        }
                    }
                }
                e.transform.position.x += (nearestDelta.x * invD * e.script.moveSpeed + sepX) * dt;
                e.transform.position.z += (nearestDelta.y * invD * e.script.moveSpeed + sepZ) * dt;
                e.animator.paramSpeed = e.script.moveSpeed;
            }
        }

        if (e.script.language != ScriptLanguage::None || std::fabs(e.script.spinSpeedDeg) > 0.001f)
            e.transform.rotation.y += e.script.spinSpeedDeg * dt;

        // LOD de animacao: mobs distantes (>24m) avaliam pose a 1/3 da taxa
        if (e.kind == EntityKind::Rig3D || e.kind == EntityKind::Rig2D) {
            bool skipLodPose = false;
            if (!isLocalPlayer && !s_players.empty()) {
                float dx = s_players[0].x - e.transform.position.x;
                float dz = s_players[0].z - e.transform.position.z;
                if ((dx * dx + dz * dz) > 576.0f && ((e.id + g_simFrameIndex) % 3 != 0)) {
                    skipLodPose = true;
                }
            }
            if (!skipLodPose) EvaluateAnimatorPose(e, dt);
        }

        if (e.physics.enabled && !e.physics.isStatic) {
            if (e.physics.useGravity) e.physics.velocity.y -= 9.81f * dt;
            e.transform.position.y += e.physics.velocity.y * dt;
            float floorY = (e.kind == EntityKind::Rig3D || e.kind == EntityKind::Rig2D) ? 0.0f : e.transform.scale.y * 0.5f;
            if (e.transform.position.y < floorY) {
                e.transform.position.y = floorY;
                e.animator.paramGrounded = true;
                e.physics.velocity.y = (e.physics.velocity.y < -0.25f) ? -e.physics.velocity.y * e.physics.restitution : 0.0f;
            }
        }
    });

    // Atualiza Cameras de seguimento apos o passo paralelo (sem disputa de leitura/escrita)
    for (auto& cam : g_scene.entities) {
        if (!cam.active || cam.kind != EntityKind::Camera || !cam.camera.enabled || cam.camera.followTarget.empty())
            continue;
        for (const auto& target : g_scene.entities) {
            if (target.active && target.name == cam.camera.followTarget) {
                float lerpA = std::min(1.0f, dt * 8.0f);
                cam.transform.position.x += (target.transform.position.x + cam.camera.followOffset.x - cam.transform.position.x) * lerpA;
                cam.transform.position.y += (target.transform.position.y + cam.camera.followOffset.y - cam.transform.position.y) * lerpA;
                cam.transform.position.z += (target.transform.position.z + cam.camera.followOffset.z - cam.transform.position.z) * lerpA;
                break;
            }
        }
    }
}

// =============================================================================
// Renderizacao da Viewport 3D (Malhas Texturizadas + Rigs 3D/2D + Cameras & Split-Screen)
// =============================================================================
static XMMATRIX BuildSceneCameraViewProj(const Entity& camEnt, float aspect, XMFLOAT3* outEye = nullptr) {
    XMFLOAT3 eye = camEnt.transform.position;
    if (outEye) *outEye = eye;
    XMFLOAT3 lookAt{ eye.x, std::max(0.5f, eye.y - 1.8f), eye.z - 8.5f };
    if (!camEnt.camera.followTarget.empty()) {
        for (const auto& t : g_scene.entities) {
            if (t.name == camEnt.camera.followTarget) {
                lookAt = { t.transform.position.x, t.transform.position.y + 0.9f, t.transform.position.z };
                break;
            }
        }
    }
    XMMATRIX view = XMMatrixLookAtLH(XMVectorSet(eye.x, eye.y, eye.z, 1.0f),
                                     XMVectorSet(lookAt.x, lookAt.y, lookAt.z, 1.0f),
                                     XMVectorSet(0, 1, 0, 0));
    if (camEnt.camera.isOrthographic) {
        float h = camEnt.camera.orthoSize * 2.0f;
        return view * XMMatrixOrthographicLH(h * aspect, h, 0.1f, 500.0f);
    }
    return view * XMMatrixPerspectiveFovLH(XMConvertToRadians(std::clamp(camEnt.camera.fovDeg, 25.0f, 110.0f)), aspect, 0.1f, 500.0f);
}

static XMMATRIX GetCameraViewProj(XMFLOAT3* outEye = nullptr) {
    if (g_isPlaying) {
        for (const auto& e : g_scene.entities) {
            if (e.active && e.kind == EntityKind::Camera && e.camera.enabled) {
                float aspect = (g_vpH > 0) ? ((float)g_vpW / (float)g_vpH) : 1.0f;
                return BuildSceneCameraViewProj(e, aspect, outEye);
            }
        }
    }
    XMVECTOR target = XMVectorSet(g_camTarget.x, g_camTarget.y, g_camTarget.z, 1.0f);
    XMFLOAT3 eyeF{
        g_camTarget.x + g_camDist * std::cos(g_camPitch) * std::sin(g_camYaw),
        g_camTarget.y + g_camDist * std::sin(g_camPitch),
        g_camTarget.z + g_camDist * std::cos(g_camPitch) * std::cos(g_camYaw)
    };
    if (outEye) *outEye = eyeF;
    XMMATRIX view = XMMatrixLookAtLH(XMVectorSet(eyeF.x, eyeF.y, eyeF.z, 1.0f), target, XMVectorSet(0, 1, 0, 0));
    float aspect  = (g_vpH > 0) ? ((float)g_vpW / (float)g_vpH) : 1.0f;
    return view * XMMatrixPerspectiveFovLH(XM_PIDIV4, aspect, 0.1f, 500.0f);
}

static void DrawMeshWithMatrix(int meshIdx, int texIdx, const XMMATRIX& world, const XMMATRIX& viewProj,
                               const XMFLOAT3& eyePos, const XMFLOAT4& color, XMFLOAT2 uvTiling,
                               float metallic, float roughness, bool wireframe, bool selected) {
    if (meshIdx < 0 || meshIdx >= (int)g_meshes.size()) return;
    const MeshAsset& ma = g_meshes[meshIdx];
    int safeTex = (texIdx >= 0 && texIdx < (int)g_textures.size()) ? texIdx : 0;

    if (g_cachedMeshIdx != meshIdx) {
        UINT stride = sizeof(Vertex), offset = 0;
        g_ctx->IASetVertexBuffers(0, 1, &ma.vb, &stride, &offset);
        g_ctx->IASetIndexBuffer(ma.ib, DXGI_FORMAT_R16_UINT, 0);
        g_cachedMeshIdx = meshIdx;
    }
    if (g_cachedTexIdx != safeTex) {
        g_ctx->PSSetShaderResources(0, 1, &g_textures[safeTex].srv);
        g_cachedTexIdx = safeTex;
    }
    int wantWire = (wireframe || g_showWireOverlay) ? 1 : 0;
    if (g_cachedWireState != wantWire) {
        g_ctx->RSSetState(wantWire ? g_rsWire : g_rsSolid);
        g_cachedWireState = wantWire;
    }

    CBData cb{};
    XMStoreFloat4x4(&cb.wvp,   XMMatrixTranspose(world * viewProj));
    XMStoreFloat4x4(&cb.world, XMMatrixTranspose(world));
    cb.color     = color;
    cb.cameraPos = { eyePos.x, eyePos.y, eyePos.z, roughness };
    cb.lightDir  = { g_lightDir.x, g_lightDir.y, g_lightDir.z, g_ambientIntensity };
    cb.material  = { metallic, selected ? 1.0f : 0.0f, uvTiling.x, uvTiling.y };

    D3D11_MAPPED_SUBRESOURCE ms{};
    g_ctx->Map(g_cb, 0, D3D11_MAP_WRITE_DISCARD, 0, &ms);
    std::memcpy(ms.pData, &cb, sizeof(cb));
    g_ctx->Unmap(g_cb, 0);

    g_ctx->DrawIndexed(ma.indexCount, 0, 0);
    g_lastDrawCalls++;
    g_lastTriangles += ma.indexCount / 3;
}

static XMMATRIX RotDeg(const XMFLOAT3& deg) {
    return XMMatrixRotationRollPitchYaw(XMConvertToRadians(deg.x),
                                        XMConvertToRadians(deg.y),
                                        XMConvertToRadians(deg.z));
}

static void DrawRigHierarchy(const Entity& e, const XMMATRIX& rootWorld, const XMMATRIX& viewProj,
                             const XMFLOAT3& eyePos, bool selected) {
    bool is2D = (e.kind == EntityKind::Rig2D);
    float zDepth = is2D ? 0.12f : 0.35f;
    int cubeIdx   = 0;
    int sphereIdx = (int)g_meshes.size() > 1 ? 1 : 0;

    // Pelvis / Hips (centro a y = 0.85)
    XMMATRIX hips = XMMatrixTranslation(0.0f, 0.85f, 0.0f) * rootWorld;
    DrawMeshWithMatrix(cubeIdx, e.mesh.textureIndex, XMMatrixScaling(0.45f, 0.22f, zDepth) * hips,
                       viewProj, eyePos, e.mesh.color, e.mesh.uvTiling, e.mesh.metallic, e.mesh.roughness, e.mesh.wireframe, selected);

    // Spine
    XMMATRIX spinePivot = RotDeg(e.rigPose.spine) * XMMatrixTranslation(0.0f, 0.12f, 0.0f) * hips;
    DrawMeshWithMatrix(cubeIdx, e.mesh.textureIndex, XMMatrixScaling(0.50f, 0.56f, zDepth * 1.1f) * XMMatrixTranslation(0, 0.30f, 0) * spinePivot,
                       viewProj, eyePos, e.mesh.color, e.mesh.uvTiling, e.mesh.metallic, e.mesh.roughness, e.mesh.wireframe, selected);

    // Head
    XMMATRIX headPivot = RotDeg(e.rigPose.head) * XMMatrixTranslation(0.0f, 0.62f, 0.0f) * spinePivot;
    DrawMeshWithMatrix(sphereIdx, e.mesh.textureIndex, XMMatrixScaling(0.38f, 0.38f, is2D ? 0.18f : 0.38f) * XMMatrixTranslation(0, 0.22f, 0) * headPivot,
                       viewProj, eyePos, {0.95f, 0.85f, 0.75f, 1.0f}, e.mesh.uvTiling, 0.05f, 0.5f, e.mesh.wireframe, selected);

    // Braco Esquerdo e Direito
    XMMATRIX armLPivot = RotDeg(e.rigPose.armL) * XMMatrixTranslation(-0.36f, 0.52f, 0.0f) * spinePivot;
    DrawMeshWithMatrix(cubeIdx, e.mesh.textureIndex, XMMatrixScaling(0.18f, 0.58f, is2D ? 0.12f : 0.18f) * XMMatrixTranslation(0, -0.26f, 0) * armLPivot,
                       viewProj, eyePos, {0.88f, 0.42f, 0.32f, 1.0f}, {1,1}, 0.1f, 0.5f, e.mesh.wireframe, selected);

    XMMATRIX armRPivot = RotDeg(e.rigPose.armR) * XMMatrixTranslation(0.36f, 0.52f, 0.0f) * spinePivot;
    DrawMeshWithMatrix(cubeIdx, e.mesh.textureIndex, XMMatrixScaling(0.18f, 0.58f, is2D ? 0.12f : 0.18f) * XMMatrixTranslation(0, -0.26f, 0) * armRPivot,
                       viewProj, eyePos, {0.88f, 0.42f, 0.32f, 1.0f}, {1,1}, 0.1f, 0.5f, e.mesh.wireframe, selected);

    // Perna Esquerda e Direita
    XMMATRIX legLPivot = RotDeg(e.rigPose.legL) * XMMatrixTranslation(-0.15f, -0.05f, 0.0f) * hips;
    DrawMeshWithMatrix(cubeIdx, e.mesh.textureIndex, XMMatrixScaling(0.20f, 0.76f, is2D ? 0.12f : 0.20f) * XMMatrixTranslation(0, -0.38f, 0) * legLPivot,
                       viewProj, eyePos, {0.22f, 0.30f, 0.45f, 1.0f}, {1,1}, 0.1f, 0.6f, e.mesh.wireframe, selected);

    XMMATRIX legRPivot = RotDeg(e.rigPose.legR) * XMMatrixTranslation(0.15f, -0.05f, 0.0f) * hips;
    DrawMeshWithMatrix(cubeIdx, e.mesh.textureIndex, XMMatrixScaling(0.20f, 0.76f, is2D ? 0.12f : 0.20f) * XMMatrixTranslation(0, -0.38f, 0) * legRPivot,
                       viewProj, eyePos, {0.22f, 0.30f, 0.45f, 1.0f}, {1,1}, 0.1f, 0.6f, e.mesh.wireframe, selected);
}

static void RenderViewport() {
    LARGE_INTEGER freq, t0, t1, t2;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&t0);

    ID3D11ShaderResourceView* nullSRV[1] = { nullptr };
    g_ctx->PSSetShaderResources(0, 1, nullSRV);
    g_ctx->OMSetRenderTargets(1, &g_vpRTV, g_vpDSV);

    D3D11_VIEWPORT vp{ 0, 0, (float)g_vpW, (float)g_vpH, 0.0f, 1.0f };
    g_ctx->RSSetViewports(1, &vp);

    const float clear[4] = { 0.08f, 0.09f, 0.11f, 1.0f };
    g_ctx->ClearRenderTargetView(g_vpRTV, clear);
    g_ctx->ClearDepthStencilView(g_vpDSV, D3D11_CLEAR_DEPTH | D3D11_CLEAR_STENCIL, 1.0f, 0);

    XMFLOAT3 eyePos{};
    XMMATRIX viewProj = GetCameraViewProj(&eyePos);

    g_lastDrawCalls = 0;
    g_lastTriangles = 0;
    g_cachedMeshIdx = -1;
    g_cachedTexIdx = -1;
    g_cachedWireState = -1;

    g_ctx->IASetInputLayout(g_layout);
    g_ctx->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    g_ctx->VSSetShader(g_vs, nullptr, 0);
    g_ctx->PSSetShader(g_ps, nullptr, 0);
    g_ctx->VSSetConstantBuffers(0, 1, &g_cb);
    g_ctx->PSSetConstantBuffers(0, 1, &g_cb);
    g_ctx->PSSetSamplers(0, 1, &g_sampler);
    g_ctx->OMSetDepthStencilState(g_dss, 0);

    for (int i = 0; i < (int)g_scene.entities.size(); ++i) {
        const Entity& e = g_scene.entities[i];
        if (!e.active) continue;

        XMMATRIX world =
            XMMatrixScaling(e.transform.scale.x, e.transform.scale.y, e.transform.scale.z) *
            RotDeg(e.transform.rotation) *
            XMMatrixTranslation(e.transform.position.x, e.transform.position.y, e.transform.position.z);

        bool sel = (i == g_scene.selected);
        if (e.kind == EntityKind::Rig3D || e.kind == EntityKind::Rig2D) {
            DrawRigHierarchy(e, world, viewProj, eyePos, sel);
        } else {
            DrawMeshWithMatrix(e.mesh.meshIndex, e.mesh.textureIndex, world, viewProj, eyePos,
                               e.mesh.color, e.mesh.uvTiling, e.mesh.metallic, e.mesh.roughness, e.mesh.wireframe, sel);
        }
    }

    QueryPerformanceCounter(&t1);

    if (g_showGrid && g_gridVB && g_gridVertCount > 0) {
        UINT lstride = sizeof(LineVertex), loffset = 0;
        g_ctx->IASetVertexBuffers(0, 1, &g_gridVB, &lstride, &loffset);
        g_ctx->IASetInputLayout(g_lineLayout);
        g_ctx->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_LINELIST);
        g_ctx->VSSetShader(g_lineVS, nullptr, 0);
        g_ctx->PSSetShader(g_linePS, nullptr, 0);
        g_ctx->VSSetConstantBuffers(0, 1, &g_lineCB);
        g_ctx->RSSetState(g_rsSolid);

        LineCBData lcb{};
        XMStoreFloat4x4(&lcb.vp, XMMatrixTranspose(viewProj));
        D3D11_MAPPED_SUBRESOURCE ms{};
        g_ctx->Map(g_lineCB, 0, D3D11_MAP_WRITE_DISCARD, 0, &ms);
        std::memcpy(ms.pData, &lcb, sizeof(lcb));
        g_ctx->Unmap(g_lineCB, 0);
        g_ctx->Draw(g_gridVertCount, 0);
        g_lastDrawCalls++;
    }

    QueryPerformanceCounter(&t2);
    if (g_renderGraph.passes.size() >= 4) {
        g_renderGraph.passes[2].lastTimeMs = (float)(t1.QuadPart - t0.QuadPart) * 1000.0f / (float)freq.QuadPart;
        g_renderGraph.passes[3].lastTimeMs = (float)(t2.QuadPart - t1.QuadPart) * 1000.0f / (float)freq.QuadPart;
    }
}

// =============================================================================
// Interface Estilo Unity / Godot (Dear ImGui)
// =============================================================================
static void DrawMenuBar() {
    if (ImGui::BeginMainMenuBar()) {
        if (ImGui::BeginMenu("Arquivo")) {
            if (ImGui::MenuItem("Nova Cena")) { StopPlayMode(); g_scene.entities.clear(); g_scene.selected = -1; }
            if (ImGui::MenuItem("Salvar Cena", "Ctrl+S")) SaveSceneJSON(g_scene.filePath);
            if (ImGui::MenuItem("Salvar Como...")) {
                std::string p = SaveFileDialog("Koda Scene (*.kscene)\0*.kscene\0", "Salvar Cena", "kscene");
                if (!p.empty()) SaveSceneJSON(p);
            }
            ImGui::Separator();
            if (ImGui::MenuItem("Importar Modelo 3D (.FBX/.OBJ/.GLTF/.GLB)...")) {
                std::string p = OpenFileDialog(
                    "Modelos 3D (*.fbx;*.obj;*.gltf;*.glb)\0*.fbx;*.obj;*.gltf;*.glb\0Wavefront OBJ (*.obj)\0*.obj\0glTF / GLB (*.gltf;*.glb)\0*.gltf;*.glb\0FBX (*.fbx)\0*.fbx\0",
                    "Importar Modelo 3D");
                if (!p.empty()) {
                    int m = Load3DModelFile(p);
                    if (m >= 0) {
                        Entity& ent = AddEntity(EntityKind::Rig3D, MeshPrimitive::Cube, fs::path(p).stem().string());
                        ent.mesh.meshIndex = m;
                    }
                }
            }
            if (ImGui::MenuItem("Importar Textura .BMP...")) {
                std::string p = OpenFileDialog("Bitmap (*.bmp)\0*.bmp\0", "Importar Textura");
                if (!p.empty()) {
                    int t = LoadBmpTexture(p);
                    if (t >= 0 && g_scene.selected >= 0) g_scene.entities[g_scene.selected].mesh.textureIndex = t;
                }
            }
            ImGui::Separator();
            if (ImGui::MenuItem("Sair")) g_running = false;
            ImGui::EndMenu();
        }
        if (ImGui::BeginMenu("GameObject")) {
            if (ImGui::MenuItem("Camera (Jogo / Monitor)")) AddEntity(EntityKind::Camera, MeshPrimitive::Cube);
            if (ImGui::MenuItem("Rig 3D Humanoide"))        AddEntity(EntityKind::Rig3D, MeshPrimitive::Cube);
            if (ImGui::MenuItem("Rig 2D Articulado"))       AddEntity(EntityKind::Rig2D, MeshPrimitive::Cube);
            if (ImGui::MenuItem("Sprite 2D (PNG/GIF)"))     AddEntity(EntityKind::Sprite2D, MeshPrimitive::Cube);
            ImGui::Separator();
            if (ImGui::MenuItem("Cubo"))     AddEntity(EntityKind::Mesh3D, MeshPrimitive::Cube);
            if (ImGui::MenuItem("Esfera"))   AddEntity(EntityKind::Mesh3D, MeshPrimitive::Sphere);
            if (ImGui::MenuItem("Plano"))    AddEntity(EntityKind::Mesh3D, MeshPrimitive::Plane);
            if (ImGui::MenuItem("Cilindro")) AddEntity(EntityKind::Mesh3D, MeshPrimitive::Cylinder);
            if (ImGui::MenuItem("Cone"))     AddEntity(EntityKind::Mesh3D, MeshPrimitive::Cone);
            ImGui::EndMenu();
        }
        if (ImGui::BeginMenu("RHI")) {
            for (int b = 0; b <= (int)RHIBackend::OpenGL_Legacy; ++b) {
                if (ImGui::MenuItem(RHIBackendName((RHIBackend)b), nullptr, (int)g_selectedBackend == b))
                    g_selectedBackend = (RHIBackend)b;
            }
            ImGui::Separator();
            ImGui::MenuItem("Grid 3D", nullptr, &g_showGrid);
            ImGui::MenuItem("Wireframe", nullptr, &g_showWireOverlay);
            ImGui::EndMenu();
        }
        ImGui::Separator();
        if (!g_isPlaying) { if (ImGui::Button("Play")) StartPlayMode(); }
        else {
            if (ImGui::Button(g_isPaused ? "Retomar" : "Pausar")) g_isPaused = !g_isPaused;
            ImGui::SameLine();
            if (ImGui::Button("Stop")) StopPlayMode();
        }
        ImGui::SameLine();
        ImGui::TextDisabled("| Win32 DX11 (%uT) | %.1f FPS | Draws: %u | Tris: %u",
                            g_winRuntime.logicalCores,
                            (g_lastFrameMs > 0.01f ? 1000.0f / g_lastFrameMs : 0.0f), g_lastDrawCalls, g_lastTriangles);
        ImGui::EndMainMenuBar();
    }
}

static void DrawHierarchyLeft(ImVec2 pos, ImVec2 size) {
    ImGui::SetNextWindowPos(pos, ImGuiCond_Always);
    ImGui::SetNextWindowSize(size, ImGuiCond_Always);
    ImGui::Begin("Hierarquia (Cena)", nullptr, ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoCollapse);

    if (ImGui::Button("+ Rig3D")) AddEntity(EntityKind::Rig3D, MeshPrimitive::Cube);
    ImGui::SameLine();
    if (ImGui::Button("+ Camera")) AddEntity(EntityKind::Camera, MeshPrimitive::Cube);
    ImGui::SameLine();
    if (ImGui::Button("Excluir") && g_scene.selected >= 0) DeleteSelected();

    ImGui::SetNextItemWidth(-1.0f);
    ImGui::InputTextWithHint("##hfilter", "Buscar objeto...", g_hierarchyFilter, sizeof(g_hierarchyFilter));
    ImGui::Separator();

    for (int i = 0; i < (int)g_scene.entities.size(); ++i) {
        const Entity& e = g_scene.entities[i];
        if (g_hierarchyFilter[0] != '\0' && e.name.find(g_hierarchyFilter) == std::string::npos) continue;
        ImGui::PushID(i);
        const char* tag = (e.kind == EntityKind::Camera)   ? "[Cam] " :
                          (e.kind == EntityKind::Rig3D)    ? "[Rig3D] " :
                          (e.kind == EntityKind::Rig2D)    ? "[Rig2D] " :
                          (e.kind == EntityKind::Sprite2D) ? "[Sprite] " : "[Mesh] ";
        std::string label = std::string(tag) + e.name;
        if (ImGui::Selectable(label.c_str(), g_scene.selected == i)) g_scene.selected = i;
        ImGui::PopID();
    }
    ImGui::End();
}

static void DrawInspectorRight(ImVec2 pos, ImVec2 size) {
    ImGui::SetNextWindowPos(pos, ImGuiCond_Always);
    ImGui::SetNextWindowSize(size, ImGuiCond_Always);
    ImGui::Begin("Inspetor", nullptr, ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoCollapse);

    if (g_scene.selected >= 0 && g_scene.selected < (int)g_scene.entities.size()) {
        Entity& e = g_scene.entities[g_scene.selected];
        char nbuf[128]; std::snprintf(nbuf, sizeof(nbuf), "%s", e.name.c_str());
        if (ImGui::InputText("Nome", nbuf, sizeof(nbuf))) e.name = nbuf;
        ImGui::Checkbox("Ativo", &e.active);
        ImGui::SameLine();
        ImGui::TextDisabled("GUID %s", e.guid.ToString().substr(0, 8).c_str());

        if (ImGui::CollapsingHeader("Transform", ImGuiTreeNodeFlags_DefaultOpen)) {
            ImGui::DragFloat3("Posicao", &e.transform.position.x, 0.05f);
            ImGui::DragFloat3("Rotacao", &e.transform.rotation.x, 0.5f);
            ImGui::DragFloat3("Escala",  &e.transform.scale.x, 0.02f, 0.01f, 50.0f);
        }

        if (ImGui::CollapsingHeader("Mesh & Textura 2D", ImGuiTreeNodeFlags_DefaultOpen)) {
            if (e.kind == EntityKind::Mesh3D && ImGui::BeginCombo("Malha", g_meshes[e.mesh.meshIndex].name.c_str())) {
                for (int m = 0; m < (int)g_meshes.size(); ++m)
                    if (ImGui::Selectable(g_meshes[m].name.c_str(), e.mesh.meshIndex == m)) e.mesh.meshIndex = m;
                ImGui::EndCombo();
            }
            if (ImGui::BeginCombo("Textura Albedo", g_textures[e.mesh.textureIndex].name.c_str())) {
                for (int t = 0; t < (int)g_textures.size(); ++t)
                    if (ImGui::Selectable(g_textures[t].name.c_str(), e.mesh.textureIndex == t)) e.mesh.textureIndex = t;
                ImGui::EndCombo();
            }
            ImGui::DragFloat2("UV Tiling", &e.mesh.uvTiling.x, 0.1f, 0.1f, 32.0f);
            ImGui::ColorEdit4("Albedo Tint", &e.mesh.color.x);
            ImGui::SliderFloat("Metalico", &e.mesh.metallic, 0.0f, 1.0f);
            ImGui::SliderFloat("Rugosidade", &e.mesh.roughness, 0.0f, 1.0f);
            ImGui::Checkbox("Wireframe", &e.mesh.wireframe);
        }

        if ((e.kind == EntityKind::Rig3D || e.kind == EntityKind::Rig2D) &&
            ImGui::CollapsingHeader("Animator & Rigging", ImGuiTreeNodeFlags_DefaultOpen)) {
            ImGui::Checkbox("Animator Ativo", &e.animator.enabled);
            ImGui::Checkbox("Usar Keyframes da Timeline", &e.animator.useKeyframes);
            ImGui::Text("Estado Atual: %s", AnimatorStateName(e.animator.currentState));
            ImGui::SliderFloat("Param: speed", &e.animator.paramSpeed, 0.0f, 6.0f);
            ImGui::Checkbox("Param: isGrounded", &e.animator.paramGrounded);
            if (ImGui::Button("Trigger: Attack")) e.animator.triggerAttack = true;
            ImGui::Separator();
            ImGui::DragFloat3("Bone Spine", &e.rigPose.spine.x, 1.0f, -90, 90);
            ImGui::DragFloat3("Bone Head",  &e.rigPose.head.x,  1.0f, -60, 60);
            ImGui::DragFloat3("Bone ArmL",  &e.rigPose.armL.x,  1.0f, -180, 180);
            ImGui::DragFloat3("Bone ArmR",  &e.rigPose.armR.x,  1.0f, -180, 180);
            ImGui::DragFloat3("Bone LegL",  &e.rigPose.legL.x,  1.0f, -120, 120);
            ImGui::DragFloat3("Bone LegR",  &e.rigPose.legR.x,  1.0f, -120, 120);
        }

        if (e.kind == EntityKind::Camera &&
            ImGui::CollapsingHeader("Camera (Jogo & Monitor)", ImGuiTreeNodeFlags_DefaultOpen)) {
            ImGui::Checkbox("Camera Ligada no Play", &e.camera.enabled);
            ImGui::Checkbox("Mostrar no Monitor", &e.camera.showMonitor);
            ImGui::Checkbox("Projecao Ortografica (2D)", &e.camera.isOrthographic);
            if (e.camera.isOrthographic)
                ImGui::DragFloat("Ortho Size", &e.camera.orthoSize, 0.25f, 1.0f, 30.0f);
            else
                ImGui::SliderFloat("Campo de Visao (FOV)", &e.camera.fovDeg, 25.0f, 110.0f);
            ImGui::SliderInt("Slot Jogador (Split-Screen)", &e.camera.playerSlot, 1, 2);
            char fbuf[128]; std::snprintf(fbuf, sizeof(fbuf), "%s", e.camera.followTarget.c_str());
            if (ImGui::InputText("Seguir Objeto", fbuf, sizeof(fbuf))) e.camera.followTarget = fbuf;
        }

        if (ImGui::CollapsingHeader("Vida & Combate", ImGuiTreeNodeFlags_DefaultOpen)) {
            ImGui::Checkbox("Sistema de Vida Ativo", &e.health.enabled);
            if (e.health.enabled) {
                ImGui::DragFloat("HP Maximo", &e.health.maxHp, 5.0f, 10.0f, 2000.0f);
                ImGui::SliderFloat("HP Atual", &e.health.currentHp, 0.0f, e.health.maxHp);
                ImGui::DragFloat("Dano", &e.health.attackDamage, 1.0f, 1.0f, 500.0f);
                ImGui::DragFloat("Alcance", &e.health.attackRange, 0.1f, 0.5f, 25.0f);
            }
        }

        if (ImGui::CollapsingHeader("Fisica, Script & Mecanica", ImGuiTreeNodeFlags_DefaultOpen)) {
            ImGui::Checkbox("Gravidade", &e.physics.useGravity);
            ImGui::SameLine();
            ImGui::Checkbox("Estatico", &e.physics.isStatic);
            const char* curScriptName = (e.script.scriptIndex >= 0 && e.script.scriptIndex < (int)g_scripts.size())
                ? g_scripts[e.script.scriptIndex].name.c_str() : "Nenhum";
            if (ImGui::BeginCombo("Script Vinculado", curScriptName)) {
                if (ImGui::Selectable("Nenhum", e.script.scriptIndex < 0)) {
                    e.script.scriptIndex = -1;
                    e.script.language = ScriptLanguage::None;
                }
                for (int s = 0; s < (int)g_scripts.size(); ++s) {
                    if (ImGui::Selectable(g_scripts[s].name.c_str(), e.script.scriptIndex == s)) {
                        e.script.scriptIndex = s;
                        e.script.className = g_scripts[s].name;
                        e.script.language = g_scripts[s].language;
                    }
                }
                ImGui::EndCombo();
            }
            ImGui::DragFloat("Velocidade (moveSpeed)", &e.script.moveSpeed, 0.1f, 0.0f, 30.0f);
            ImGui::DragFloat("Rotacao Auto (deg/s)", &e.script.spinSpeedDeg, 1.0f, -360.0f, 360.0f);
        }
    } else {
        ImGui::TextDisabled("Selecione um objeto na Hierarquia.");
    }
    ImGui::End();
}

static void DrawCenterViewport(ImVec2 pos, ImVec2 size) {
    ImGui::SetNextWindowPos(pos, ImGuiCond_Always);
    ImGui::SetNextWindowSize(size, ImGuiCond_Always);
    ImGui::Begin("Scene Viewport", nullptr,
                 ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoCollapse |
                 ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);

    ImVec2 avail = ImGui::GetContentRegionAvail();
    g_wantVpW = std::max(1u, (UINT)avail.x);
    g_wantVpH = std::max(1u, (UINT)avail.y);
    ImGui::Image((ImTextureID)(intptr_t)g_vpSRV, avail);

    if (ImGui::IsWindowHovered()) {
        ImGuiIO& io = ImGui::GetIO();
        if (ImGui::IsMouseDragging(ImGuiMouseButton_Right)) {
            g_camYaw   -= io.MouseDelta.x * 0.01f;
            g_camPitch  = std::clamp(g_camPitch + io.MouseDelta.y * 0.01f, -1.5f, 1.5f);
        }
        if (ImGui::IsMouseDragging(ImGuiMouseButton_Middle)) {
            float s = g_camDist * 0.002f;
            g_camTarget.x -= io.MouseDelta.x * std::cos(g_camYaw) * s;
            g_camTarget.z += io.MouseDelta.x * std::sin(g_camYaw) * s;
            g_camTarget.y += io.MouseDelta.y * s;
        }
        if (io.MouseWheel != 0.0f) g_camDist = std::clamp(g_camDist - io.MouseWheel * 0.8f, 1.5f, 80.0f);
    }
    ImGui::End();
}

static void DrawBottomDock(ImVec2 pos, ImVec2 size) {
    ImGui::SetNextWindowPos(pos, ImGuiCond_Always);
    ImGui::SetNextWindowSize(size, ImGuiCond_Always);
    ImGui::Begin("Project & Animation", nullptr, ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoCollapse);

    if (ImGui::BeginTabBar("unity_bottom_tabs")) {
        if (ImGui::BeginTabItem("Project Assets")) {
            if (ImGui::Button("Importar 3D (FBX/OBJ/GLTF/GLB)")) {
                std::string p = OpenFileDialog(
                    "Modelos 3D (*.fbx;*.obj;*.gltf;*.glb)\0*.fbx;*.obj;*.gltf;*.glb\0Wavefront OBJ (*.obj)\0*.obj\0glTF / GLB (*.gltf;*.glb)\0*.gltf;*.glb\0FBX (*.fbx)\0*.fbx\0",
                    "Importar Modelo 3D");
                if (!p.empty()) {
                    int m = Load3DModelFile(p);
                    if (m >= 0) {
                        Entity& ent = AddEntity(EntityKind::Rig3D, MeshPrimitive::Cube, fs::path(p).stem().string());
                        ent.mesh.meshIndex = m;
                    }
                }
            }
            ImGui::SameLine();
            if (ImGui::Button("Importar Textura .BMP")) {
                std::string p = OpenFileDialog("Bitmap (*.bmp)\0*.bmp\0", "Importar Textura");
                if (!p.empty()) LoadBmpTexture(p);
            }
            ImGui::Separator();
            ImGui::Text("Texturas Carregadas (%d):", (int)g_textures.size());
            for (int t = 0; t < (int)g_textures.size(); ++t) {
                ImGui::SameLine();
                if (ImGui::Button(g_textures[t].name.c_str()) && g_scene.selected >= 0) {
                    g_scene.entities[g_scene.selected].mesh.textureIndex = t;
                }
            }
            ImGui::Text("Malhas (%d): clique duplo para instanciar", (int)g_meshes.size());
            for (int m = 0; m < (int)g_meshes.size(); ++m) {
                if (ImGui::Selectable(g_meshes[m].name.c_str(), false, ImGuiSelectableFlags_AllowDoubleClick)) {
                    if (ImGui::IsMouseDoubleClicked(0))
                        AddEntity(EntityKind::Mesh3D, (MeshPrimitive)std::min(m, 4), g_meshes[m].name).mesh.meshIndex = m;
                }
            }
            ImGui::EndTabItem();
        }

        if (ImGui::BeginTabItem("Animation Timeline (2D/3D)")) {
            if (g_scene.selected >= 0 && g_scene.selected < (int)g_scene.entities.size()) {
                Entity& e = g_scene.entities[g_scene.selected];
                static float scrubTime = 0.0f;
                static int   selBone   = 2;
                static int   selAxis   = 0;
                static float keyVal    = 35.0f;
                static bool  recMode   = false;
                static char  newAnimName[64] = "NovaAnimacao";
                const char* bones[] = { "Spine", "Head", "ArmL", "ArmR", "LegL", "LegR" };
                const char* axes[]  = { "X", "Y", "Z" };

                if (ImGui::Button(recMode ? "REC ON" : "REC")) recMode = !recMode;
                ImGui::SameLine();
                ImGui::Checkbox("Ativar Keyframes", &e.animator.useKeyframes);
                ImGui::SameLine();
                ImGui::SetNextItemWidth(110.0f);
                ImGui::InputTextWithHint("##newanim", "Nome clipe...", newAnimName, sizeof(newAnimName));
                ImGui::SameLine();
                if (ImGui::Button("+ Nova Animacao")) {
                    AnimationClipData c;
                    c.name = (newAnimName[0] != '\0') ? newAnimName : ("Animacao_" + std::to_string(e.animator.clips.size() + 1));
                    c.duration = e.animator.clipDuration;
                    e.animator.clips.push_back(c);
                    e.animator.activeClipIdx = (int)e.animator.clips.size() - 1;
                    e.animator.keyframes.clear();
                    e.animator.useKeyframes = true;
                }
                if (!e.animator.clips.empty()) {
                    ImGui::SameLine();
                    ImGui::SetNextItemWidth(130.0f);
                    int idx = std::clamp(e.animator.activeClipIdx, 0, (int)e.animator.clips.size() - 1);
                    if (ImGui::BeginCombo("##clipsel", e.animator.clips[idx].name.c_str())) {
                        for (int ci = 0; ci < (int)e.animator.clips.size(); ++ci) {
                            if (ImGui::Selectable(e.animator.clips[ci].name.c_str(), ci == idx)) {
                                e.animator.activeClipIdx = ci;
                                e.animator.clipDuration = e.animator.clips[ci].duration;
                                e.animator.keyframes = e.animator.clips[ci].keyframes;
                                e.animator.useKeyframes = true;
                            }
                        }
                        ImGui::EndCombo();
                    }
                }
                ImGui::SameLine();
                ImGui::SetNextItemWidth(110.0f);
                ImGui::SliderFloat("##t", &scrubTime, 0.0f, e.animator.clipDuration, "%.2fs");
                ImGui::SameLine();
                ImGui::SetNextItemWidth(75.0f);
                ImGui::Combo("##bone", &selBone, bones, 6);
                ImGui::SameLine();
                ImGui::SetNextItemWidth(42.0f);
                ImGui::Combo("##ax", &selAxis, axes, 3);
                ImGui::SameLine();
                ImGui::SetNextItemWidth(65.0f);
                ImGui::DragFloat("##deg", &keyVal, 1.0f, -180.0f, 180.0f, "%.0f");
                ImGui::SameLine();
                if (ImGui::Button("+ Keyframe")) {
                    e.animator.useKeyframes = true;
                    e.animator.keyframes.push_back({ scrubTime, selBone, selAxis, keyVal });
                    if (!e.animator.clips.empty()) {
                        int idx = std::clamp(e.animator.activeClipIdx, 0, (int)e.animator.clips.size() - 1);
                        e.animator.clips[idx].keyframes = e.animator.keyframes;
                    }
                }

                // Linha do Tempo tradicional estilo Unity com linha vertical continua
                ImGui::BeginChild("unity_dopesheet", ImVec2(-1, -1), true);
                ImDrawList* dl = ImGui::GetWindowDrawList();
                ImVec2 origin = ImGui::GetCursorScreenPos();
                ImVec2 avail  = ImGui::GetContentRegionAvail();
                const float leftColW = 145.0f;
                const float rulerH   = 22.0f;
                const float rowH     = 22.0f;
                float trackW = std::max(120.0f, avail.x - leftColW);
                float dur = std::max(0.2f, e.animator.clipDuration);

                // Regua clicavel + arrastavel
                ImGui::SetCursorScreenPos(ImVec2(origin.x + leftColW, origin.y));
                ImGui::InvisibleButton("##ruler", ImVec2(trackW, rulerH));
                if (ImGui::IsItemActive()) {
                    float ratio = std::clamp((ImGui::GetIO().MousePos.x - (origin.x + leftColW)) / trackW, 0.0f, 1.0f);
                    scrubTime = ratio * dur;
                    e.animator.stateTime = scrubTime;
                }

                dl->AddRectFilled(origin, ImVec2(origin.x + avail.x, origin.y + rulerH), IM_COL32(22, 26, 35, 255));
                for (int s = 0; s <= 4; ++s) {
                    float tx = origin.x + leftColW + trackW * ((float)s / 4.0f);
                    dl->AddLine(ImVec2(tx, origin.y + 8), ImVec2(tx, origin.y + rulerH), IM_COL32(100, 110, 130, 255));
                    char lbl[16]; std::snprintf(lbl, sizeof(lbl), "%.2fs", dur * ((float)s / 4.0f));
                    dl->AddText(ImVec2(tx + 2, origin.y + 3), IM_COL32(160, 175, 195, 255), lbl);
                }

                // Linhas de ossos + losangos de keyframes
                for (int b = 0; b < 6; ++b) {
                    float ry = origin.y + rulerH + b * rowH;
                    ImU32 rowBg = (b == selBone) ? IM_COL32(37, 99, 235, 55) : IM_COL32(14, 17, 23, 255);
                    dl->AddRectFilled(ImVec2(origin.x, ry), ImVec2(origin.x + avail.x, ry + rowH - 1), rowBg);
                    dl->AddText(ImVec2(origin.x + 8, ry + 3), IM_COL32(220, 230, 245, 255), bones[b]);

                    ImGui::SetCursorScreenPos(ImVec2(origin.x, ry));
                    std::string btnId = std::string("##row_") + bones[b];
                    if (ImGui::InvisibleButton(btnId.c_str(), ImVec2(leftColW, rowH))) selBone = b;

                    for (const auto& kf : e.animator.keyframes) {
                        if (kf.boneIndex != b) continue;
                        float kx = origin.x + leftColW + std::clamp(kf.time / dur, 0.0f, 1.0f) * trackW;
                        float ky = ry + rowH * 0.5f;
                        dl->AddQuadFilled(ImVec2(kx, ky - 5), ImVec2(kx + 5, ky), ImVec2(kx, ky + 5), ImVec2(kx - 5, ky),
                                          IM_COL32(245, 158, 11, 255));
                    }
                }

                // Linha vertical continua atravessando todas as tracks de ossos
                float playX = origin.x + leftColW + std::clamp(scrubTime / dur, 0.0f, 1.0f) * trackW;
                ImU32 lineCol = recMode ? IM_COL32(239, 68, 68, 255) : IM_COL32(96, 165, 250, 255);
                dl->AddLine(ImVec2(playX, origin.y), ImVec2(playX, origin.y + rulerH + 6 * rowH), lineCol, 2.0f);
                dl->AddRectFilled(ImVec2(playX - 5, origin.y), ImVec2(playX + 5, origin.y + 10), lineCol);

                ImGui::EndChild();
            } else {
                ImGui::TextDisabled("Selecione um objeto ou Rig para editar na linha do tempo.");
            }
            ImGui::EndTabItem();
        }

        if (ImGui::BeginTabItem("Animator States")) {
            ImGui::Text("Transicoes da Maquina de Estados:");
            ImGui::Separator();
            for (const auto& tr : g_defaultTransitions) {
                ImGui::Text("%s  -->  %s   [condicao: %s | blend: %.2fs]",
                            AnimatorStateName(tr.from), AnimatorStateName(tr.to), tr.condition.c_str(), tr.blendDuration);
            }
            ImGui::EndTabItem();
        }

        if (ImGui::BeginTabItem("Console")) {
            ImGui::Checkbox("Auto-scroll", &g_logAutoScroll);
            ImGui::SameLine();
            if (ImGui::Button("Limpar")) g_log.clear();
            ImGui::Separator();
            ImGui::BeginChild("cscroll");
            for (const auto& l : g_log) ImGui::Text("%s %s", l.timestamp.c_str(), l.message.c_str());
            if (g_logAutoScroll) ImGui::SetScrollHereY(1.0f);
            ImGui::EndChild();
            ImGui::EndTabItem();
        }

        if (ImGui::BeginTabItem("Codigo / Scripts")) {
            static char newScrName[64] = "NovoScript";
            ImGui::SetNextItemWidth(130.0f);
            ImGui::InputText("##newscr", newScrName, sizeof(newScrName));
            ImGui::SameLine();
            if (ImGui::Button("+ Novo Script")) {
                ScriptAsset sa;
                sa.name = (newScrName[0] != '\0') ? newScrName : ("Script_" + std::to_string(g_scripts.size() + 1));
                sa.language = ScriptLanguage::CSharp_Mono;
                sa.code = "// Script C#\nvoid OnUpdate(float dt) {\n    transform.rotation.y += 45.0f * dt;\n}\n";
                g_scripts.push_back(sa);
                g_activeScriptIdx = (int)g_scripts.size() - 1;
                std::snprintf(g_scriptEditorBuf, sizeof(g_scriptEditorBuf), "%s", sa.code.c_str());
            }
            ImGui::SameLine();
            if (!g_scripts.empty()) {
                int sidx = std::clamp(g_activeScriptIdx, 0, (int)g_scripts.size() - 1);
                ImGui::SetNextItemWidth(150.0f);
                if (ImGui::BeginCombo("##scrsel", g_scripts[sidx].name.c_str())) {
                    for (int si = 0; si < (int)g_scripts.size(); ++si) {
                        if (ImGui::Selectable(g_scripts[si].name.c_str(), si == sidx)) {
                            g_activeScriptIdx = si;
                            std::snprintf(g_scriptEditorBuf, sizeof(g_scriptEditorBuf), "%s", g_scripts[si].code.c_str());
                        }
                    }
                    ImGui::EndCombo();
                }
                ImGui::SameLine();
                if (ImGui::Button("Salvar Script")) {
                    g_scripts[sidx].code = g_scriptEditorBuf;
                    Log("Script salvo: " + g_scripts[sidx].name);
                }
                ImGui::SameLine();
                if (ImGui::Button("Vincular ao Selecionado") && g_scene.selected >= 0) {
                    Entity& sel = g_scene.entities[g_scene.selected];
                    sel.script.scriptIndex = sidx;
                    sel.script.className = g_scripts[sidx].name;
                    sel.script.language = g_scripts[sidx].language;
                    Log("Script '" + g_scripts[sidx].name + "' vinculado em " + sel.name);
                }
            }
            ImGui::InputTextMultiline("##script_ide", g_scriptEditorBuf, sizeof(g_scriptEditorBuf), ImVec2(-1, -1));
            ImGui::EndTabItem();
        }

        if (ImGui::BeginTabItem("Shader HLSL")) {
            if (ImGui::Button("Compilar & Hot-Reload")) HotReloadMainShader();
            ImGui::SameLine();
            ImGui::TextColored(g_shaderHasError ? ImVec4(0.95f,0.35f,0.35f,1) : ImVec4(0.35f,0.85f,0.50f,1),
                               "%s", g_shaderDiagnostic.c_str());
            ImGui::InputTextMultiline("##hlsl", g_shaderEditorBuf, sizeof(g_shaderEditorBuf), ImVec2(-1, -1));
            ImGui::EndTabItem();
        }

        if (ImGui::BeginTabItem("RDG & Profiler")) {
            ImGui::Text("Plataforma: Windows Nativo (%u Threads Win32) | GPU: %s (%u MB)",
                        g_winRuntime.logicalCores, g_winRuntime.gpuName.c_str(), g_winRuntime.vramMB);
            ImGui::TextDisabled("Flip-Model DXGI: %s | XInput Nativo: %s | DX11 State Cache: Ativo",
                                g_winRuntime.flipModelActive ? "Ativo" : "Discard",
                                g_winRuntime.xinputReady ? "Ativo" : "Indisponivel");
            ImGui::PlotLines("Frame (ms)", g_frameTimeHistory.data(), (int)g_frameTimeHistory.size(),
                             g_frameHistoryIdx, nullptr, 0.0f, 33.3f, ImVec2(0, 44));
            for (auto& p : g_renderGraph.passes)
                ImGui::Text("%s: %s -> %s (%.3f ms)", p.name.c_str(), p.reads.c_str(), p.writes.c_str(), p.lastTimeMs);
            ImGui::EndTabItem();
        }

        if (ImGui::BeginTabItem("IA / MCP")) {
            ImGui::InputText("##mcp", g_mcpPromptBuf, sizeof(g_mcpPromptBuf));
            ImGui::SameLine();
            if (ImGui::Button("Executar")) {
                std::istringstream iss(g_mcpPromptBuf);
                std::string act; iss >> act;
                if (act == "create_rig") {
                    std::string nm = "Rig_IA"; float x = 2, y = 0, z = 0; iss >> nm >> x >> y >> z;
                    AddEntity(EntityKind::Rig3D, MeshPrimitive::Cube, nm).transform.position = { x, y, z };
                    g_mcpHistory.push_back("[MCP OK] Rig3D criado: " + nm);
                } else {
                    g_mcpHistory.push_back("[MCP] Use: create_rig <nome> <x> <y> <z>");
                }
            }
            for (const auto& h : g_mcpHistory) ImGui::TextUnformatted(h.c_str());
            ImGui::EndTabItem();
        }

        if (ImGui::BeginTabItem("Build & Export (.EXE / Linux / APK)")) {
            static char s_appName[64]    = "MeuJogoKoda";
            static char s_pkgId[96]      = "com.koda.gamedev.app";
            static char s_studioPath[260] = "C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe";
            static int  s_targetIdx      = 0; // 0=Windows .exe, 1=Linux AppImage, 2=Android Studio APK
            static std::vector<std::string> s_buildOut;

            auto runCmdPipe = [](const std::string& cmd) -> int {
                s_buildOut.push_back("$ " + cmd);
                SECURITY_ATTRIBUTES sa{ sizeof(sa), nullptr, TRUE };
                HANDLE hRead = nullptr, hWrite = nullptr;
                if (!CreatePipe(&hRead, &hWrite, &sa, 0)) return -1;
                SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);

                STARTUPINFOA si{ sizeof(si) };
                si.dwFlags     = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
                si.wShowWindow = SW_HIDE;
                si.hStdOutput  = hWrite;
                si.hStdError   = hWrite;

                PROCESS_INFORMATION pi{};
                std::string fullCmd = "cmd.exe /C \"" + cmd + "\"";
                std::vector<char> cmdBuf(fullCmd.begin(), fullCmd.end());
                cmdBuf.push_back('\0');

                BOOL ok = CreateProcessA(nullptr, cmdBuf.data(), nullptr, nullptr, TRUE,
                                         CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi);
                CloseHandle(hWrite);
                if (!ok) {
                    CloseHandle(hRead);
                    s_buildOut.push_back("[ERRO] Falha ao iniciar processo.");
                    return -1;
                }
                char buf[512]; DWORD readBytes = 0; std::string acc;
                while (ReadFile(hRead, buf, sizeof(buf) - 1, &readBytes, nullptr) && readBytes > 0) {
                    buf[readBytes] = '\0';
                    acc += buf;
                }
                WaitForSingleObject(pi.hProcess, INFINITE);
                DWORD exitCode = 1;
                GetExitCodeProcess(pi.hProcess, &exitCode);
                CloseHandle(pi.hProcess); CloseHandle(pi.hThread); CloseHandle(hRead);

                std::istringstream iss(acc); std::string ln;
                while (std::getline(iss, ln)) if (!ln.empty()) s_buildOut.push_back(ln);
                return (int)exitCode;
            };

            auto exportAndroidGradleProject = [&]() -> std::string {
                std::string dir = "build-android/" + std::string(s_appName);
                fs::create_directories(dir + "/app/src/main/java/com/koda/game");
                fs::create_directories(dir + "/app/src/main/cpp");
                fs::create_directories(dir + "/app/src/main/assets");
                SaveSceneJSON(dir + "/app/src/main/assets/Main.kscene");

                std::ofstream mf(dir + "/app/src/main/AndroidManifest.xml");
                mf << "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n"
                   << "  <application android:label=\"" << s_appName << "\" android:hasCode=\"true\">\n"
                   << "    <activity android:name=\"com.koda.game.MainActivity\" android:exported=\"true\"\n"
                   << "              android:screenOrientation=\"landscape\">\n"
                   << "      <intent-filter>\n"
                   << "        <action android:name=\"android.intent.action.MAIN\"/>\n"
                   << "        <category android:name=\"android.intent.category.LAUNCHER\"/>\n"
                   << "      </intent-filter>\n"
                   << "    </activity>\n"
                   << "  </application>\n"
                   << "</manifest>\n";

                std::ofstream bg(dir + "/app/build.gradle");
                bg << "plugins { id 'com.android.application'; id 'org.jetbrains.kotlin.android' }\n"
                   << "android {\n"
                   << "  namespace '" << s_pkgId << "'\n"
                   << "  compileSdk 34\n"
                   << "  defaultConfig { applicationId '" << s_pkgId << "'; minSdk 24; targetSdk 34 }\n"
                   << "  externalNativeBuild { cmake { path file('src/main/cpp/CMakeLists.txt') } }\n"
                   << "}\n";

                std::ofstream kt(dir + "/app/src/main/java/com/koda/game/MainActivity.kt");
                kt << "package com.koda.game\nimport android.app.NativeActivity\n"
                   << "class MainActivity : NativeActivity() {\n"
                   << "  companion object { init { System.loadLibrary(\"koda_runtime\") } }\n"
                   << "}\n";
                s_buildOut.push_back("[Android] Projeto Gradle + JNI gerado em: " + dir);
                return fs::absolute(dir).string();
            };

            ImGui::RadioButton("1. Windows (.exe) no Programa", &s_targetIdx, 0); ImGui::SameLine();
            ImGui::RadioButton("2. Linux (.AppImage)", &s_targetIdx, 1); ImGui::SameLine();
            ImGui::RadioButton("3. Android Studio (.apk)", &s_targetIdx, 2);

            ImGui::SetNextItemWidth(160.0f); ImGui::InputText("Nome App", s_appName, sizeof(s_appName));
            ImGui::SameLine();
            ImGui::SetNextItemWidth(200.0f); ImGui::InputText("Package ID", s_pkgId, sizeof(s_pkgId));

            if (s_targetIdx == 0) {
                if (ImGui::Button("Compilar .EXE Agora (CMake/MSVC)")) {
                    s_buildOut.clear();
                    SaveSceneJSON("build-win/Assets/Main.kscene");
                    int r1 = runCmdPipe("cmake -B build-win -G \"Visual Studio 17 2022\" -A x64 -DKODA_RHI_BACKEND=DirectX11 -DKODA_FETCH_IMGUI=ON");
                    if (r1 == 0) r1 = runCmdPipe("cmake --build build-win --config Release");
                    s_buildOut.push_back(r1 == 0 ? "[OK] Executavel .EXE gerado em build-win/bin/Release/" : "[Aviso] Verifique Visual Studio/CMake no PATH.");
                }
                ImGui::SameLine();
                if (ImGui::Button("Executar .EXE")) {
                    ShellExecuteA(g_hwnd, "open", "build-win\\bin\\Release\\KodaGameDev.exe", nullptr, nullptr, SW_SHOWNORMAL);
                }
            } else if (s_targetIdx == 1) {
                if (ImGui::Button("Compilar App Linux (.AppImage / WSL)")) {
                    s_buildOut.clear();
                    SaveSceneJSON("build-linux/Assets/Main.kscene");
                    int r = runCmdPipe("wsl bash -c \"cmake -B build-linux -DKODA_RHI_BACKEND=Vulkan && cmake --build build-linux -j && appimagetool AppDir " + std::string(s_appName) + "-x86_64.AppImage\"");
                    s_buildOut.push_back(r == 0 ? "[OK] AppImage Linux gerado!" : "[Aviso] Instale WSL + g++ + appimagetool ou use toolchain-linux.cmake.");
                }
            } else {
                ImGui::SetNextItemWidth(340.0f);
                ImGui::InputText("Android Studio (studio64.exe)", s_studioPath, sizeof(s_studioPath));
                ImGui::SameLine();
                if (ImGui::Button("Chamar Android Studio")) {
                    std::string projDir = exportAndroidGradleProject();
                    const char* fallbackStudio = "C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Android Studio\\bin\\studio64.exe";
                    const char* exe = fs::exists(s_studioPath) ? s_studioPath : fallbackStudio;
                    HINSTANCE res = ShellExecuteA(g_hwnd, "open", exe, projDir.c_str(), nullptr, SW_SHOWNORMAL);
                    if ((INT_PTR)res <= 32) {
                        ShellExecuteA(g_hwnd, "explore", projDir.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
                        s_buildOut.push_back("[Android] Projeto aberto no Explorer (configure o caminho do studio64.exe).");
                    } else {
                        s_buildOut.push_back("[Android] Android Studio iniciado com o projeto pronto para gerar APK!");
                    }
                }
                ImGui::SameLine();
                if (ImGui::Button("Gerar .APK (Gradle)")) {
                    std::string projDir = exportAndroidGradleProject();
                    int r = runCmdPipe("cd /d \"" + projDir + "\" && gradlew.bat assembleRelease");
                    s_buildOut.push_back(r == 0 ? "[OK] APK gerado em app/build/outputs/apk/release/" : "[Aviso] Abra no Android Studio ou execute gradlew assembleRelease.");
                }
            }

            ImGui::BeginChild("build_log_child", ImVec2(-1, -1), true);
            for (const auto& line : s_buildOut) ImGui::TextUnformatted(line.c_str());
            ImGui::EndChild();
            ImGui::EndTabItem();
        }

        ImGui::EndTabBar();
    }
    ImGui::End();
}

static void DrawUI() {
    DrawMenuBar();
    ImGuiIO& io = ImGui::GetIO();
    const float W = io.DisplaySize.x, H = io.DisplaySize.y, top = ImGui::GetFrameHeight();
    const float leftW = 260.0f, rightW = 340.0f, bottomH = 240.0f;

    DrawHierarchyLeft ({ 0.0f,      top },            { leftW,              H - top - bottomH });
    DrawCenterViewport({ leftW,     top },            { W - leftW - rightW, H - top - bottomH });
    DrawInspectorRight({ W - rightW,top },            { rightW,             H - top });
    DrawBottomDock    ({ 0.0f,      H - bottomH },    { W - rightW,         bottomH });
}

// =============================================================================
// Win32 WndProc & wWinMain
// =============================================================================
extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND, UINT, WPARAM, LPARAM);

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    if (ImGui_ImplWin32_WndProcHandler(hwnd, msg, wp, lp)) return true;
    if (msg == WM_SIZE && wp != SIZE_MINIMIZED && g_device) {
        g_width = LOWORD(lp); g_height = HIWORD(lp); g_resizePending = true;
        return 0;
    }
    if (msg == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

static bool CreateMainWindow(HINSTANCE hInst, int nCmdShow) {
    WNDCLASSEXW wc{ sizeof(wc), CS_HREDRAW | CS_VREDRAW, WndProc, 0, 0, hInst, nullptr,
                    LoadCursorW(nullptr, IDC_ARROW), nullptr, nullptr, L"KodaGameDevWindow", nullptr };
    RegisterClassExW(&wc);
    g_hwnd = CreateWindowExW(0, wc.lpszClassName, L"Koda Game Dev v2.5 - C++17 / DirectX 11",
                             WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, (int)g_width, (int)g_height,
                             nullptr, nullptr, hInst, nullptr);
    if (!g_hwnd) return false;
    ShowWindow(g_hwnd, nCmdShow);
    UpdateWindow(g_hwnd);
    return true;
}

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, PWSTR, int nCmdShow) {
    SetProcessDPIAware();
    timeBeginPeriod(1);
    InitWindowsPlatformTechnologies();
    g_threadPool.Init(g_winRuntime.logicalCores);

    if (!CreateMainWindow(hInst, nCmdShow)) { timeEndPeriod(1); return 1; }
    if (!CreateDevice())                    { timeEndPeriod(1); return 2; }
    if (!CreatePipeline())                  { timeEndPeriod(1); return 3; }

    BuildProceduralTextures();
    BuildCubeMesh();
    BuildSphereMesh();
    BuildPlaneMesh();
    BuildCylinderMesh();
    BuildConeMesh();
    BuildGridLines();
    CreateViewport(g_vpW, g_vpH);

    // Cena inicial estilo Unity/Godot
    AddEntity(EntityKind::Mesh3D, MeshPrimitive::Plane, "Chao_Grid");
    Entity& rig = AddEntity(EntityKind::Rig3D, MeshPrimitive::Cube, "Personagem_Rig3D");
    rig.animator.paramSpeed = 1.5f; // inicia em Walk no Play Mode
    Entity& box = AddEntity(EntityKind::Mesh3D, MeshPrimitive::Cube, "Caixa_Texturizada");
    box.transform.position = { 2.4f, 0.5f, 0.0f };
    box.mesh.textureIndex  = 1; // Checkerboard
    g_scene.selected = 1;

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGui::StyleColorsDark();
    ImGuiStyle& style = ImGui::GetStyle();
    style.WindowRounding = 3.0f; style.FrameRounding = 2.0f; style.WindowBorderSize = 1.0f;
    style.Colors[ImGuiCol_WindowBg] = ImVec4(0.11f, 0.12f, 0.14f, 1.0f);
    style.Colors[ImGuiCol_Header]   = ImVec4(0.18f, 0.42f, 0.78f, 0.65f);

    ImGui_ImplWin32_Init(g_hwnd);
    ImGui_ImplDX11_Init(g_device, g_ctx);

    Log("Koda Game Dev v2.5 Nativo Windows: " + g_winRuntime.gpuName +
        " | Win32 ThreadPool (" + std::to_string(g_winRuntime.logicalCores) + " threads)" +
        (g_winRuntime.flipModelActive ? " | Flip-Model DXGI" : ""));

    LARGE_INTEGER qpcFreq{}, qpcLast{};
    QueryPerformanceFrequency(&qpcFreq);
    QueryPerformanceCounter(&qpcLast);

    MSG msg{};
    while (g_running) {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
            if (msg.message == WM_QUIT) g_running = false;
        }
        if (!g_running) break;

        LARGE_INTEGER qpcNow{};
        QueryPerformanceCounter(&qpcNow);
        float rawDt = static_cast<float>(qpcNow.QuadPart - qpcLast.QuadPart) / static_cast<float>(qpcFreq.QuadPart);
        float dt = std::clamp(rawDt, 0.0001f, 0.1f);
        qpcLast = qpcNow;

        g_lastFrameMs = dt * 1000.0f;
        g_frameTimeHistory[g_frameHistoryIdx] = g_lastFrameMs;
        g_frameHistoryIdx = (g_frameHistoryIdx + 1) % (int)g_frameTimeHistory.size();

        StepSimulation(dt);

        if (g_resizePending) {
            g_resizePending = false;
            CleanupBackRTV();
            g_swap->ResizeBuffers(0, g_width, g_height, DXGI_FORMAT_UNKNOWN, 0);
            CreateBackRTV();
        }
        if (g_wantVpW != g_vpW || g_wantVpH != g_vpH) CreateViewport(g_wantVpW, g_wantVpH);

        ImGui_ImplDX11_NewFrame();
        ImGui_ImplWin32_NewFrame();
        ImGui::NewFrame();
        DrawUI();
        ImGui::Render();

        RenderViewport();
        g_ctx->OMSetRenderTargets(1, &g_backRTV, nullptr);
        const float clear[4] = { 0.06f, 0.06f, 0.08f, 1.0f };
        g_ctx->ClearRenderTargetView(g_backRTV, clear);
        ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());
        g_swap->Present(g_vsync ? 1 : 0, 0);
    }

    g_threadPool.Shutdown();
    if (g_xinputDll) { FreeLibrary(g_xinputDll); g_xinputDll = nullptr; }
    timeEndPeriod(1);

    ImGui_ImplDX11_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();

    for (auto& t : g_textures) { SafeRelease(t.srv); SafeRelease(t.tex); }
    for (auto& m : g_meshes)   { SafeRelease(m.vb);  SafeRelease(m.ib); }
    SafeRelease(g_gridVB); SafeRelease(g_lineCB); SafeRelease(g_lineLayout); SafeRelease(g_linePS); SafeRelease(g_lineVS);
    DestroyViewport();
    SafeRelease(g_sampler); SafeRelease(g_dss); SafeRelease(g_rsWire); SafeRelease(g_rsSolid);
    SafeRelease(g_cb); SafeRelease(g_layout); SafeRelease(g_ps); SafeRelease(g_vs);
    CleanupBackRTV(); SafeRelease(g_swap); SafeRelease(g_ctx); SafeRelease(g_device);
    return 0;
}
