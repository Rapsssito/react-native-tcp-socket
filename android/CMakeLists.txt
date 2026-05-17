# VENHO fork — Phase 1 zero-copy data-plane native build.
# Modeled on react-native-quick-base64/android/CMakeLists.txt (proven
# RN-0.83 New-Arch cxxTurboModule wiring in this same app).
cmake_minimum_required(VERSION 3.13.0)
project(TcpDataBridge)

set(PACKAGE_NAME "react-native-tcp-socket")
set(CMAKE_VERBOSE_MAKEFILE ON)

add_library(
    ${PACKAGE_NAME}    STATIC
    ../cpp/TcpDataBridge.cpp
    ../cpp/TcpInboundRegistry.cpp
    TcpBridgeJni.cpp
)

set_target_properties(
    ${PACKAGE_NAME} PROPERTIES
    CXX_STANDARD 20
    CXX_STANDARD_REQUIRED ON
    CXX_EXTENSIONS OFF
)

target_include_directories(
    ${PACKAGE_NAME}    PUBLIC
    ../cpp
)

target_link_libraries(
    ${PACKAGE_NAME}    jsi
    fbjni
    reactnative
    react_codegen_RNTcpSocketsSpec
)
