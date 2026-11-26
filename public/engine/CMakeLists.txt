cmake_minimum_required(VERSION 3.22)

# =============================================================================
#  Koda Game Dev - Configuracao CMake C++17 (Windows DX11 + Browser WebGPU)
#  Deteccao automatica de ambiente:
#    - Windows (.exe): Microsoft DirectX 11 + Win32 + DXGI Flip-Model + AVX2
#    - Navegador (WebAssembly): WebGPU (WGPU/Dawn) + GLFW3 via Emscripten
#
#  1) Compilacao Windows x64 (Visual Studio 2022):
#     cmake -B build-win -G "Visual Studio 17 2022" -A x64 -DKODA_FETCH_IMGUI=ON
#     cmake --build build-win --config Release
#
#  2) Compilacao Navegador WebGPU (Emscripten SDK):
#     emcmake cmake -B build-web -DKODA_RHI_BACKEND=WebGPU -DKODA_FETCH_IMGUI=ON
#     cmake --build build-web -j
# =============================================================================

project(KodaGameDev
    VERSION 2.6.0
    DESCRIPTION "Koda Game Dev - Engine 3D/2D em C++17 com RHI Auto (DirectX 11 / WebGPU), ECS e Skeleton 64-Bones"
    LANGUAGES CXX
)

# Padrao C++17 obrigatorio
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Organizacao em pastas na solucao do Visual Studio
set_property(GLOBAL PROPERTY USE_FOLDERS ON)

# =============================================================================
# Opcoes de Arquitetura, RHI (Auto-Deteccao) e Dependencias Externas
# =============================================================================
set(KODA_RHI_BACKEND "Auto" CACHE STRING "Backend grafico RHI ativo (Auto detecta Win32/DX11 ou Browser/WebGPU)")
set_property(CACHE KODA_RHI_BACKEND PROPERTY STRINGS
    "Auto"
    "DirectX11"
    "WebGPU"
    "DirectX12"
    "Vulkan"
    "DirectX9_Legacy"
    "OpenGL_Legacy"
)

if(KODA_RHI_BACKEND STREQUAL "Auto")
    if(EMSCRIPTEN)
        set(KODA_RESOLVED_RHI "WebGPU")
    elseif(WIN32)
        set(KODA_RESOLVED_RHI "DirectX11")
    else()
        set(KODA_RESOLVED_RHI "Vulkan")
    endif()
else()
    set(KODA_RESOLVED_RHI "${KODA_RHI_BACKEND}")
endif()

option(KODA_ENABLE_EDITOR     "Compilar com o editor Dear ImGui integrado" ON)
option(KODA_ENABLE_HOT_RELOAD "Habilitar compilacao de shaders HLSL/WGSL em tempo real" ON)
option(KODA_FETCH_IMGUI       "Baixar Dear ImGui automaticamente via FetchContent se ausente" OFF)
option(KODA_ENABLE_AVX2       "Habilitar instrucoes vetoriais AVX2 para simulacao/IA" ON)

set(KODA_EXTERNAL_DIR "${CMAKE_CURRENT_SOURCE_DIR}/external"
    CACHE PATH "Diretorio raiz de bibliotecas externas (/external)")
set(KODA_IMGUI_DIR "${KODA_EXTERNAL_DIR}/imgui"
    CACHE PATH "Caminho para os fontes e headers do Dear ImGui")

# =============================================================================
# Target 1: KodaWindowsSDK (Plataforma: Windows DX11 OU Navegador Emscripten WebGPU)
# =============================================================================
add_library(KodaWindowsSDK INTERFACE)
target_compile_features(KodaWindowsSDK INTERFACE cxx_std_17)

if(EMSCRIPTEN)
    message(STATUS "[Koda CMake] Ambiente detectado: Browser (Emscripten Wasm + ${KODA_RESOLVED_RHI})")
    target_compile_definitions(KodaWindowsSDK INTERFACE
        KODA_PLATFORM_WEB=1
        KODA_ENGINE_VERSION="${PROJECT_VERSION}"
        KODA_RHI_BACKEND_${KODA_RESOLVED_RHI}=1
        $<$<BOOL:${KODA_ENABLE_EDITOR}>:KODA_ENABLE_EDITOR=1>
        $<$<BOOL:${KODA_ENABLE_HOT_RELOAD}>:KODA_ENABLE_HOT_RELOAD=1>
        $<$<CONFIG:Debug>:KODA_DEBUG=1>
        $<$<CONFIG:Release>:KODA_RELEASE=1;NDEBUG>
    )
    target_compile_options(KodaWindowsSDK INTERFACE
        -sUSE_WEBGPU=1
        -sUSE_GLFW=3
        $<$<CONFIG:Release>:-O3>
    )
    target_link_options(KodaWindowsSDK INTERFACE
        -sUSE_WEBGPU=1
        -sUSE_GLFW=3
        -sALLOW_MEMORY_GROWTH=1
        -sMAX_WEBGL_VERSION=2
        -sWASM=1
        $<$<CONFIG:Release>:-O3>
    )
elseif(WIN32)
    message(STATUS "[Koda CMake] Ambiente detectado: Windows Nativo (${KODA_RESOLVED_RHI} + Win32)")
    target_compile_definitions(KodaWindowsSDK INTERFACE
        WIN32_LEAN_AND_MEAN
        NOMINMAX
        _CRT_SECURE_NO_WARNINGS
        UNICODE
        _UNICODE
        KODA_PLATFORM_WINDOWS=1
        KODA_ENGINE_VERSION="${PROJECT_VERSION}"
        KODA_RHI_BACKEND_${KODA_RESOLVED_RHI}=1
        $<$<BOOL:${KODA_ENABLE_EDITOR}>:KODA_ENABLE_EDITOR=1>
        $<$<BOOL:${KODA_ENABLE_HOT_RELOAD}>:KODA_ENABLE_HOT_RELOAD=1>
        $<$<CONFIG:Debug>:KODA_DEBUG=1>
        $<$<CONFIG:Release>:KODA_RELEASE=1;NDEBUG>
    )

    target_link_libraries(KodaWindowsSDK INTERFACE
        d3d11
        d3dcompiler
        dxgi
        dxguid
        comdlg32
        shell32
        user32
        gdi32
        ole32
        winmm
    )

    if(KODA_RESOLVED_RHI STREQUAL "DirectX12")
        target_link_libraries(KodaWindowsSDK INTERFACE d3d12)
    elseif(KODA_RESOLVED_RHI STREQUAL "DirectX9_Legacy")
        target_link_libraries(KodaWindowsSDK INTERFACE d3d9)
    endif()

    if(MSVC)
        target_compile_options(KodaWindowsSDK INTERFACE
            /EHsc
            /MP
            /permissive-
            /utf-8
            /W3
            $<$<CONFIG:Release>:/O2;/Oi;/Ot;/GL;/fp:fast>
            $<$<AND:$<CONFIG:Release>,$<BOOL:${KODA_ENABLE_AVX2}>>:/arch:AVX2>
        )
        target_link_options(KodaWindowsSDK INTERFACE
            $<$<CONFIG:Release>:/LTCG;/OPT:REF;/OPT:ICF>
        )
    endif()
endif()

# =============================================================================
# Target 2: KodaImGui (Dear ImGui + Win32/DX11 no Windows OU GLFW/WGPU no Browser)
# =============================================================================
if(NOT EXISTS "${KODA_IMGUI_DIR}/imgui.cpp")
    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/third_party/imgui/imgui.cpp")
        set(KODA_IMGUI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/imgui")
    elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/imgui/imgui.cpp")
        set(KODA_IMGUI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/imgui")
    elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/imgui.cpp")
        set(KODA_IMGUI_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
    elseif(KODA_FETCH_IMGUI)
        include(FetchContent)
        FetchContent_Declare(
            imgui
            GIT_REPOSITORY https://github.com/ocornut/imgui.git
            GIT_TAG        v1.91.5
            GIT_SHALLOW    TRUE
        )
        FetchContent_MakeAvailable(imgui)
        set(KODA_IMGUI_DIR "${imgui_SOURCE_DIR}")
    else()
        message(WARNING
            "Dear ImGui nao encontrado em '${KODA_IMGUI_DIR}'. "
            "Coloque o ImGui em /external/imgui ou passe -DKODA_FETCH_IMGUI=ON."
        )
    endif()
endif()

set(KODA_IMGUI_SOURCES
    "${KODA_IMGUI_DIR}/imgui.cpp"
    "${KODA_IMGUI_DIR}/imgui_draw.cpp"
    "${KODA_IMGUI_DIR}/imgui_tables.cpp"
    "${KODA_IMGUI_DIR}/imgui_widgets.cpp"
)

if(EMSCRIPTEN)
    list(APPEND KODA_IMGUI_SOURCES
        "${KODA_IMGUI_DIR}/backends/imgui_impl_glfw.cpp"
        "${KODA_IMGUI_DIR}/backends/imgui_impl_wgpu.cpp"
    )
elseif(WIN32)
    list(APPEND KODA_IMGUI_SOURCES
        "${KODA_IMGUI_DIR}/backends/imgui_impl_win32.cpp"
        "${KODA_IMGUI_DIR}/backends/imgui_impl_dx11.cpp"
    )
endif()

add_library(KodaImGui STATIC ${KODA_IMGUI_SOURCES})

target_include_directories(KodaImGui PUBLIC
    "${KODA_IMGUI_DIR}"
    "${KODA_IMGUI_DIR}/backends"
)
target_link_libraries(KodaImGui PUBLIC KodaWindowsSDK)
set_target_properties(KodaImGui PROPERTIES FOLDER "External")

# =============================================================================
# Target 3: KodaEngineCore (Interfaces /include + Modulos /src ECS/RHI)
# =============================================================================
file(GLOB_RECURSE KODA_MODULAR_SOURCES CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/src/core/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/ecs/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/rhi/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/animation/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/assets/*.cpp"
)

add_library(KodaEngineIncludes INTERFACE)
target_include_directories(KodaEngineIncludes INTERFACE
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
    "${KODA_EXTERNAL_DIR}"
    "${CMAKE_CURRENT_SOURCE_DIR}"
)
target_link_libraries(KodaEngineIncludes INTERFACE KodaWindowsSDK)

# =============================================================================
# Localizacao do Ponto de Entrada Principal da Engine
# =============================================================================
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/koda_game_dev.cpp")
    set(KODA_ENTRY_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/koda_game_dev.cpp")
elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/src/main.cpp")
    set(KODA_ENTRY_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/src/main.cpp")
elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/public/engine/koda_game_dev.cpp")
    set(KODA_ENTRY_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/public/engine/koda_game_dev.cpp")
else()
    message(FATAL_ERROR "Ponto de entrada nao encontrado (koda_game_dev.cpp, src/main.cpp ou public/engine/koda_game_dev.cpp).")
endif()

# =============================================================================
# Target 4: KodaGameDev (Win32 DirectX 11 OU Browser WebGPU Wasm)
# =============================================================================
if(EMSCRIPTEN)
    add_executable(KodaGameDev
        "${KODA_ENTRY_SOURCE}"
        ${KODA_MODULAR_SOURCES}
    )
    set_target_properties(KodaGameDev PROPERTIES
        SUFFIX ".html"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/web"
    )
else()
    add_executable(KodaGameDev WIN32
        "${KODA_ENTRY_SOURCE}"
        ${KODA_MODULAR_SOURCES}
    )
    set_target_properties(KodaGameDev PROPERTIES
        WIN32_EXECUTABLE              TRUE
        RUNTIME_OUTPUT_DIRECTORY      "${CMAKE_BINARY_DIR}/bin"
        VS_DEBUGGER_WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    )
endif()

target_compile_features(KodaGameDev PRIVATE cxx_std_17)

target_link_libraries(KodaGameDev PRIVATE
    KodaEngineIncludes
    KodaImGui
    KodaWindowsSDK
)

set_target_properties(KodaGameDev PROPERTIES
    FOLDER                "Engine"
    CXX_STANDARD          17
    CXX_STANDARD_REQUIRED ON
    CXX_EXTENSIONS        OFF
)

if(WIN32 AND MSVC)
    target_link_options(KodaGameDev PRIVATE /SUBSYSTEM:WINDOWS)
endif()

set_property(DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}" PROPERTY VS_STARTUP_PROJECT KodaGameDev)

# =============================================================================
# Instalacao
# =============================================================================
install(TARGETS KodaGameDev
    RUNTIME DESTINATION bin
)
