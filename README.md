# ScopeSwitch

[![GitHub Release](https://img.shields.io/github/v/release/HaiLanDuJun/scope-switch?color=2ea44f&label=Release&logo=github)](https://github.com/HaiLanDuJun/scope-switch/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows)](https://github.com/HaiLanDuJun/scope-switch/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

ScopeSwitch 是一个专为 Windows 平台设计的便携式 AI 开发工具代理与流量分流管理面板。

---

## 🚀 下载即用（免安装 / 零依赖）

对于普通使用者或新电脑，**无需安装任何运行环境（免安装 Node.js）**：

1. 前往 **[GitHub Releases 页面](https://github.com/HaiLanDuJun/scope-switch/releases)**。
2. 下载最新版的 **`ScopeSwitch-Portable-Win-x64.zip`**。
3. 解压到任意目录，双击 **`start.cmd`** 即可瞬间启动独立桌面客户端！

---

## 解决的痛点

大多数 AI 编程工具与 CLI 均依赖环境变量读取代理配置：

```text
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
NO_PROXY=localhost,127.0.0.1,::1
```

然而当不同工具需求冲突时就会出现问题：

- **Agy / CLI 工具** 需要走本地代理（如 `127.0.0.1:7890`）访问国外 API。
- **Claude Code** 通常连接本地转换网关（如 `http://127.0.0.1:8787`）。
- 开启系统全局代理后，Claude 访问 `127.0.0.1:8787` 本地网关的请求可能被错误转发给代理端口，导致 `502 Bad Gateway`。
- 新配置一台 Windows 电脑时，缺少配套的各种 `.cmd`、`.ps1` 启动脚本。

ScopeSwitch 将这些场景收拢到统一的可视化面板与显式策略中，无需手动折腾系统环境变量或零散脚本。

---

## 功能特性

- **全局代理一键切换**：快速设置或清除用户级 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 等变量。
- **自定义代理配置**：支持自定义协议（HTTP/HTTPS）、主机与端口号。
- **Claude Code 专属绕过**：一键将 `NO_PROXY/no_proxy` 写入 `%USERPROFILE%\.claude\settings.json`，防止本地网关被代理拦截。
- **Claude / TokenRhythm 本地网关脚本生成**：一键生成/启停本地转发网关服务。
- **单进程独立代理启动器**：为指定软件/命令注入独立环境变量，不修改系统全局变量。
- **强制直连启动器**：为需要直连的软件生成自动清理代理变量的独立启动脚本。
- **可视化实时流向监控**：实时探测代理端口与本地网关监听状态，清晰展示各组件的网络走向。
- **自动备份安全机制**：所有被覆盖的配置与脚本均会自动备份至 `generated/backups`。
- **绿色便携**：运行时配置存放在 `data/config.json`（已加入 `.gitignore`），不随代码仓库外泄。

---

## 快速上手

### 环境要求

- Windows 操作系统
- Node.js 18 或更高版本（或使用内置便携版 Node）

### 启动运行

```powershell
cd scope-switch
.\start.cmd
```

启动后会自动在浏览器中打开管理面板：

```text
http://127.0.0.1:17787
```

也可以通过 npm 命令启动：

```powershell
npm start
```

---

## 便携化运行（无需安装 Node.js）

如需制作完全绿色的即拷即用安装包，可将便携版 Node.js 可执行文件放置于：

```text
runtime\node.exe
```

`start.cmd` 在启动时会优先检测并使用 `runtime\node.exe`，不存在时则回退使用系统已安装的 `node`。

---

## 配置文件说明

本地运行时配置存储于：

```text
data/config.json
```

该文件已默认被 Git 忽略，以避免提交包含个人路径或机器专属的配置信息。

仓库中提供了可分享的初始模板：

```text
data/config.example.json
```

---

## 常见使用场景与策略

| 场景 | 推荐操作 | 说明 |
| :--- | :--- | :--- |
| **需要所有新开终端走代理** | 开启「全局代理」 | 写入 Windows 用户级环境变量 |
| **全局代理开启后 Claude 报 502** | 开启「Claude 专属文件绕过」 | 写入 Claude 的 `settings.json`，不影响其他软件 |
| **只要 Agy 走代理，不想影响全局** | 使用「Agy 单进程代理」启动或生成脚本 | 仅在启动子进程时注入代理变量 |
| **Cursor 需要强制直连** | 使用「Cursor 强制直连」脚本启动 | 启动前自动清空代理变量 |

详细指南可参阅 [docs/GLOBAL_PROXY_GUIDE.md](docs/GLOBAL_PROXY_GUIDE.md)。

---

## 开源协议

本项目采用 [MIT License](LICENSE) 开源。
