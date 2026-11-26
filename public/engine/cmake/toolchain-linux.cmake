# Toolchain Linux x64 (.AppImage) - Compilacao Nativa + Empacotamento
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

set(CMAKE_C_COMPILER gcc)
set(CMAKE_CXX_COMPILER g++)

set(KODA_RHI_BACKEND "Vulkan" CACHE STRING "Backend moderno Vulkan para Linux")
set(KODA_SCRIPT_RUNTIME "Mono" CACHE STRING "Runtime C# Mono embutido")
