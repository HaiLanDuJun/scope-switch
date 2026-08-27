# ScopeSwitch 全局配置文档

## 目标

ScopeSwitch 解决的是同一台电脑上多个 AI/API 工具对代理的要求不一致的问题：

- Agy 需要走本地代理，例如 `http://127.0.0.1:7890`。
- Claude Code 可能使用本地 API 网关，例如 `http://127.0.0.1:8787`。
- 当全局代理开启时，Claude 访问 `127.0.0.1:8787` 也可能被转发到代理端口，从而出现 502。
- 新电脑上可能完全没有旧的 `.ps1/.cmd/.js` 文件，需要一键生成。

ScopeSwitch 把这些情况拆成三种互不覆盖的策略。

## 策略一：全局代理

适合场景：

- 需要让新开的 PowerShell、CMD、Node、npm、git 或其他 CLI 默认走代理。
- 代理服务运行在本机端口，例如 `127.0.0.1:7890`。

ScopeSwitch 会设置用户级环境变量：

```text
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
http_proxy=http://127.0.0.1:7890
https_proxy=http://127.0.0.1:7890
```

影响范围：

- 只影响当前 Windows 用户。
- 新打开的终端和软件会继承。
- 已经打开的终端通常不会自动变化。

关闭全局代理时，ScopeSwitch 只清除以上四个变量。

## 策略二：只让 Claude 绕过本地地址

适合场景：

- 全局代理已经开启。
- Claude Code 的 `ANTHROPIC_BASE_URL` 是本地地址，例如 `http://127.0.0.1:8787`。
- Claude 报错 `API Error: 502 status code (no body)`，原因可能是本地 8787 请求被全局代理转发。

ScopeSwitch 会在 Claude settings 的 `env` 里写入：

```json
{
  "NO_PROXY": "localhost,127.0.0.1,::1",
  "no_proxy": "localhost,127.0.0.1,::1"
}
```

影响范围：

- 只影响 Claude Code。
- 不修改 Agy 的代理设置。
- 不关闭全局代理。
- 修改后需要重新打开 Claude Code 窗口。

默认 Claude settings 路径：

```text
%USERPROFILE%\.claude\settings.json
```

如果新电脑没有这个文件，ScopeSwitch 会创建一个最小 settings 文件。

## 策略三：只让 Agy 或某个软件走代理

适合场景：

- 不想开启全局代理。
- 只希望 Agy 或某个指定软件走 `127.0.0.1:7890`。

在“其他 API / 软件代理”里配置：

- 名称：例如 `Agy`
- 模式：`单进程代理`
- 命令 / 软件路径：例如 `C:\Path\Agy.exe` 或 `agy`
- 参数：按需填写
- 端口：例如 `7890`

点击“启动”时，ScopeSwitch 只给这个进程注入：

```text
HTTP_PROXY
HTTPS_PROXY
http_proxy
https_proxy
```

也可以点击“生成脚本”，生成的 `.cmd` 位于：

```text
generated\
```

这个脚本可以复制到桌面双击使用。它不会修改 Windows 用户级环境变量。

## Claude TokenRhythm 本地网关文件

在新电脑没有旧脚本时，点击“生成 Claude 代理文件”，ScopeSwitch 会创建：

```text
%USERPROFILE%\.claude\switch-tokenrhythm-proxy.cmd
%USERPROFILE%\.claude\switch-tokenrhythm-proxy.ps1
%USERPROFILE%\.claude\tokenrhythm-proxy.js
```

默认行为：

- 监听 `127.0.0.1:8787`。
- 上游地址为 `https://tokenrhythm.studio`。
- 如果 8787 已经有 Node 代理在监听，再运行脚本会停止它。
- 如果 8787 没有监听，再运行脚本会启动它。

端口和上游地址可在页面中修改。

Claude settings 中的 Base URL 应设置为：

```text
http://127.0.0.1:8787
```

如果你修改了 TokenRhythm 端口，例如改成 `18888`，Claude Base URL 也应同步改成：

```text
http://127.0.0.1:18888
```

## Toggle-Agy-Proxy 文件

为了兼容旧习惯，ScopeSwitch 也可以生成：

```text
Toggle-Agy-Proxy.ps1
Toggle-Agy-Proxy.cmd
```

默认生成目录是：

```text
%USERPROFILE%\Desktop
```

这两个文件用于切换“全局代理”，不是单进程代理。如果你只想让 Agy 自己走代理，应优先使用“其他 API / 软件代理”里的 Agy 配置并生成单进程脚本。

## 新电脑初始化流程

1. 安装 Node.js 18+。
2. 复制 `ScopeSwitch` 目录到任意位置。
3. 双击 `start.cmd`。
4. 在页面设置代理端口，例如 `7890`。
5. 如果需要 Claude 本地网关，点击“生成 Claude 代理文件”。
6. 如果全局代理可能影响 Claude，点击“开启绕过”。
7. 如果只希望 Agy 走代理，在 Agy 配置里填写软件路径并点击“生成脚本”或“启动”。

## 常见问题

### 开启全局代理后 Claude 502

开启“Claude 本地绕过”，然后重新打开 Claude Code。

### Agy 需要代理，但不想影响其他软件

不要开启全局代理。使用 Agy 的“单进程代理”配置启动。

### 改了端口但没生效

保存配置后重新生成相关脚本。已经打开的终端或软件需要重启。

### 如何迁移到另一台电脑

复制整个 `ScopeSwitch` 目录。新电脑的用户路径不同没有关系，默认配置使用 `%USERPROFILE%`，运行时会自动展开。
