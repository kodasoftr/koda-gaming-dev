# Koda Game Dev — Guia de Estrutura de Diretórios (ECS + RHI + Multiplataforma)

Esta estrutura organiza o projeto para escalar de um protótipo single-file (`koda_game_dev.cpp`) para uma engine modular em C++17 compilável via CMake no Visual Studio (Windows), GCC/Clang (Linux `.AppImage`) e Android NDK (`.apk`).

```text
KodaGameDev/
├── CMakeLists.txt                     # Raiz C++17, SDK Windows, DirectX 11/12, Vulkan e alvos
├── cmake/
│   ├── toolchain-windows.cmake        # MSVC x64 + Windows SDK
│   ├── toolchain-linux.cmake          # GCC/Clang + Vulkan + AppImage
│   └── toolchain-android.cmake        # Android NDK arm64-v8a / armeabi-v7a + JNI
│
├── include/                           # Interfaces públicas e cabeçalhos estáveis
│   └── koda/
│       ├── core/
│       │   ├── Guid.hpp               # Identificadores 128-bit para assets e entidades
│       │   ├── Log.hpp                # Logger com níveis (Info, Warning, Error)
│       │   ├── Memory.hpp             # Alocadores lineares/pool por frame
│       │   └── PluginABI.h            # Interface C ABI estável para plugins externos
│       ├── ecs/
│       │   ├── Entity.hpp             # IDs de entidade e handles geracionais
│       │   ├── Registry.hpp           # Armazenamento orientado a dados (SoA / SparseSet)
│       │   └── Components.hpp         # Transform, MeshRenderer, SkeletonRig, Animator, Physics, Script
│       ├── rhi/
│       │   ├── IRHIDevice.hpp         # Interface única (CreateBuffer, CreateTexture, BindPipeline)
│       │   ├── RHIResources.hpp       # Handles opacos de Texture2D, Buffer, Shader, Sampler
│       │   ├── RenderGraph.hpp        # RDG: passes, barreiras, alias de memória e profiling
│       │   └── ShaderCompiler.hpp     # Hot-reload HLSL/SPIR-V e tradução de erros
│       ├── animation/
│       │   ├── Skeleton.hpp           # Hierarquia de ossos 3D e matrizes de skinning
│       │   ├── Rig2D.hpp              # Esqueleto 2D por ossos e sprites
│       │   ├── AnimationClip.hpp      # Faixas de keyframes e curvas de interpolação
│       │   └── AnimatorGraph.hpp      # Máquina de estados (Idle, Walk, Run, Jump, Attack)
│       ├── assets/
│       │   ├── AssetRegistry.hpp      # Indexação por GUID e cache binário
│       │   ├── ObjLoader.hpp          # Importador de malhas .obj / .gltf
│       │   ├── TextureLoader.hpp      # Loader Texture2D (.png, .jpg, .bmp, .tga)
│       │   └── SceneSerializer.hpp    # Serialização .kscene em JSON
│       ├── scripting/
│       │   ├── MonoHost.hpp           # Runtime C# embutido + Internal Calls
│       │   └── JNIBridge.hpp          # Chamadas em lote Kotlin/Android via JNI
│       └── ai/
│           └── MCPServer.hpp          # Servidor local Model Context Protocol
│
├── src/                               # Implementações privadas (.cpp)
│   ├── main.cpp                       # Ponto de entrada WinMain / main
│   ├── core/                          # Implementações de GUID, Log, PluginLoader
│   ├── ecs/                           # Sistemas: PhysicsSystem, AnimatorSystem, ScriptSystem
│   ├── rhi/
│   │   ├── dx11/                      # Backend Windows padrão (D3D11Device, TextureDX11, SwapChain)
│   │   ├── dx12/                      # Backend Windows 10/11 moderno (CommandLists, Descriptors)
│   │   ├── vulkan/                    # Backend multiplataforma (VkDevice + VMA)
│   │   └── legacy/                    # Backend Windows XP/7 (D3D9 / OpenGL 3.3, build separado)
│   ├── animation/                     # Avaliação de keyframes e máquina de estados
│   ├── assets/                        # Leitura de disco, importação e geração de mipmaps
│   ├── physics/                       # Integração Jolt Physics / PhysX
│   ├── network/                       # Transporte ENet / GameNetworkingSockets + replicação
│   └── editor/                        # UI estilo Unity/Godot (Dear ImGui)
│       ├── EditorApp.cpp
│       ├── HierarchyPanel.cpp         # Árvore de cena e filtros
│       ├── InspectorPanel.cpp         # Propriedades, texturas, rig e scripts
│       ├── ViewportPanel.cpp          # Cena 3D/2D, Gizmos e Raycast picking
│       ├── AnimatorPanel.cpp          # Grafo de estados + Timeline de keyframes
│       ├── AssetBrowserPanel.cpp      # Pastas do projeto e drag-and-drop
│       └── ShaderEditorPanel.cpp      # Código HLSL + hot-reload ao vivo
│
├── external/                          # Bibliotecas de terceiros (submódulos / FetchContent)
│   ├── imgui/                         # Dear ImGui + backends Win32/DX11/Vulkan
│   ├── vma/                           # Vulkan Memory Allocator
│   ├── jolt/                          # Jolt Physics
│   ├── stb/                           # stb_image para PNG/JPG/TGA
│   └── tracy/                         # Profiler CPU/GPU
│
├── assets/                            # Recursos do projeto de jogo
│   ├── Scenes/                        # Cenas serializadas (.kscene)
│   ├── Models/                        # Modelos 3D (.obj, .gltf)
│   ├── Textures/                      # Texturas Albedo/Normal/Roughness (.png, .bmp)
│   ├── Animations/                    # Clipes e grafos (.kanim)
│   ├── Shaders/                       # Shaders HLSL/GLSL
│   └── Scripts/                       # Scripts C# (.cs), Kotlin (.kt) e C++
│
├── runtime/                           # Templates pré-compilados para exportação 1-clique
│   ├── linux/                         # AppDir template + appimagetool
│   └── android/                       # Projeto Gradle + libs .so (arm64-v8a)
│
└── build/                             # Artefatos gerados pelo CMake/Visual Studio (ignorar no Git)
```

## Fluxo de Dependências (Regra de Ouro)

1. `core` não depende de nenhum outro módulo.
2. `ecs` depende apenas de `core` (componentes armazenam `Guid` de malhas/texturas, nunca ponteiros de GPU diretos).
3. `rhi` depende de `core` e das APIs gráficas (`d3d11`, `d3d12`, `vulkan`), expondo apenas interfaces abstratas para `editor` e `assets`.
4. `editor` consome `ecs`, `rhi`, `animation` e `assets` sem acoplamento com o runtime final do jogo exportado.
