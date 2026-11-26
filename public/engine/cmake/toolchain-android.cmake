# Toolchain Android (.apk) - Vinculacao de .so pre-compilado + Gradle
set(CMAKE_SYSTEM_NAME Android)
set(CMAKE_ANDROID_ARCH_ABI arm64-v8a)
set(CMAKE_ANDROID_API 26)
set(CMAKE_ANDROID_STL_TYPE c++_shared)

set(KODA_RHI_BACKEND "Vulkan" CACHE STRING "Backend Vulkan Android")
set(KODA_SCRIPT_RUNTIME "Kotlin_JNI" CACHE STRING "Runtime Kotlin via JNI em lote")
