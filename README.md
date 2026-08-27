# ScopeSwitch

ScopeSwitch 是一个专为 Windows 平台设计的便携式 AI 开发工具代理与流量分流管理面板。

它在一个轻量本地控制面板中统一管理三种常见的代理策略：

- **Windows 用户级全局代理**：为所有新打开的终端与 CLI 工具快速开启/关闭代理环境变量。
- **Claude Code 本地回环绕过**：自动配置 `localhost`、`127.0.0.1` 和 `::1` 绕过规则，避免本地网关出现 502 错误。
- **单应用/CLI 独立代理启动器**：为 Agy (Antigravity)、Codex、Cursor 或任意自定义软件/命令生成专属启动脚本，仅在该进程注入代理或强制直连，完全不污染系统全局环境。

ScopeSwitch 本身并非全功能的 AI API 代理网关，而是专注于解决 Windows 本地 AI 开发中最容易遇到的痛点：**理清哪个进程应该走哪个代理、哪个该直连，并能一键为新设备生成所有便携启动脚本**。

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

详细指南可参阅 [docs/GLOBAL_PROXY_GUIDE.md](file:///D:/Code/wwSwitch/docs/GLOBAL_PROXY_GUIDE.md)。

---

## 开源协议

本项目采用 [MIT License](file:///D:/Code/wwSwitch/LICENSE) 开源。
