const http = require("node:http");
const https = require("node:https");
const tls = require("node:tls");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const APP_DIR = __dirname;
const PUBLIC_DIR = path.join(APP_DIR, "public");
const DATA_DIR = path.join(APP_DIR, "data");
const GENERATED_DIR = path.join(APP_DIR, "generated");
const SCRIPTS_DIR = path.join(APP_DIR, "scripts");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const HOST = "127.0.0.1";
const PORT = Number(process.env.SCOPESWITCH_PORT || process.env.WWSWITCH_PORT || 17787);

const PROXY_ENV_NAMES = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];
const BYPASS_ENV_NAMES = ["NO_PROXY", "no_proxy"];
const ALL_ENV_NAMES = [...PROXY_ENV_NAMES, ...BYPASS_ENV_NAMES];

function defaultConfig() {
  return {
    proxy: {
      scheme: "http",
      host: "127.0.0.1",
      port: 7890,
    },
    bypassHosts: ["localhost", "127.0.0.1", "::1"],
    scriptTargetDir: SCRIPTS_DIR,
    claude: {
      settingsPath: "%USERPROFILE%\\.claude\\settings.json",
      configDir: SCRIPTS_DIR,
      baseUrl: "http://127.0.0.1:8787",
      localProxyPort: 8787,
      upstream: "https://tokenrhythm.studio",
    },
    profiles: [
      {
        id: "agy",
        name: "Agy (Antigravity CLI)",
        kind: "software",
        proxyMode: "process",
        proxyHost: "127.0.0.1",
        proxyPort: 7890,
        command: "agy",
        args: "",
        workingDir: "",
        note: "单进程注入代理 7890，不影响全局系统网络",
      },
      {
        id: "codex",
        name: "Codex / Copilot CLI",
        kind: "software",
        proxyMode: "process",
        proxyHost: "127.0.0.1",
        proxyPort: 7890,
        command: "codex",
        args: "",
        workingDir: "",
        note: "支持指定独立代理或强行走本地直连",
      },
      {
        id: "cursor",
        name: "Cursor IDE",
        kind: "software",
        proxyMode: "force-direct",
        proxyHost: "127.0.0.1",
        proxyPort: 7890,
        command: "cursor",
        args: "",
        workingDir: "",
        note: "强行走本地直连网络，绕过全局代理",
      },
    ],
  };
}

function ensureBaseDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeDefaults(value, defaults) {
  if (Array.isArray(defaults)) return Array.isArray(value) ? value : defaults;
  if (!isPlainObject(defaults)) return value === undefined ? defaults : value;

  const merged = { ...defaults, ...(isPlainObject(value) ? value : {}) };
  for (const key of Object.keys(defaults)) {
    merged[key] = mergeDefaults(isPlainObject(value) ? value[key] : undefined, defaults[key]);
  }
  return merged;
}

function normalizePort(port, fallback) {
  const next = Number(port);
  if (!Number.isInteger(next) || next < 1 || next > 65535) return fallback;
  return next;
}

function normalizeConfig(config) {
  const merged = mergeDefaults(config, defaultConfig());
  merged.proxy.port = normalizePort(merged.proxy.port, 7890);
  merged.claude.localProxyPort = normalizePort(merged.claude.localProxyPort, 8787);
  merged.scriptTargetDir = SCRIPTS_DIR;
  merged.claude.configDir = SCRIPTS_DIR;
  if (!Array.isArray(merged.bypassHosts) || merged.bypassHosts.length === 0) {
    merged.bypassHosts = ["localhost", "127.0.0.1", "::1"];
  }
  if (!Array.isArray(merged.profiles)) merged.profiles = defaultConfig().profiles;
  return merged;
}

function readConfig() {
  ensureBaseDirs();
  if (!fs.existsSync(CONFIG_PATH)) {
    const initial = defaultConfig();
    writeJson(CONFIG_PATH, initial);
    return initial;
  }

  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));
  } catch (_error) {
    const backupPath = `${CONFIG_PATH}.broken-${Date.now()}.json`;
    fs.copyFileSync(CONFIG_PATH, backupPath);
    const initial = defaultConfig();
    writeJson(CONFIG_PATH, initial);
    return initial;
  }
}

function writeConfig(config) {
  const normalized = normalizeConfig(config);
  writeJson(CONFIG_PATH, normalized);
  return normalized;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return "";
  const backupDir = path.join(GENERATED_DIR, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${stamp}.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function expandPath(input) {
  if (!input) return "";
  let output = String(input).replace(/%([^%]+)%/g, (_, name) => process.env[name] || "");
  if (output === "~" || output.startsWith(`~${path.sep}`) || output.startsWith("~/")) {
    output = path.join(os.homedir(), output.slice(2));
  }
  return path.resolve(output);
}

function resolveCommand(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  const expanded = value.replace(/%([^%]+)%/g, (_, name) => process.env[name] || "");
  if (path.isAbsolute(expanded) || expanded.includes("\\") || expanded.includes("/")) {
    return expandPath(expanded);
  }
  return expanded;
}

function proxyUrl(config, portOverride) {
  const port = normalizePort(portOverride || config.proxy.port, config.proxy.port);
  return `${config.proxy.scheme || "http"}://${config.proxy.host || "127.0.0.1"}:${port}`;
}

function bypassValue(config) {
  return config.bypassHosts.map((item) => String(item).trim()).filter(Boolean).join(",");
}

function psString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded,
    ], { windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
    });
  });
}

function readWindowsRegistryEnv() {
  const userMap = {};
  const machineMap = {};

  try {
    const userOutput = require("node:child_process").execSync("reg query HKCU\\Environment", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    for (const line of userOutput.split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z0-9_]+)\s+REG_[A-Z_]+\s*(.*)$/);
      if (match) {
        userMap[match[1]] = match[2] || "";
      }
    }
  } catch (_e) {}

  try {
    const machineOutput = require("node:child_process").execSync(
      'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"',
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }
    );
    for (const line of machineOutput.split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z0-9_]+)\s+REG_[A-Z_]+\s*(.*)$/);
      if (match) {
        machineMap[match[1]] = match[2] || "";
      }
    }
  } catch (_e) {}

  return { userMap, machineMap };
}

async function getEnvironmentState() {
  if (process.platform !== "win32") {
    return ALL_ENV_NAMES.map((name) => ({
      name,
      user: "",
      process: process.env[name] || "",
      machine: "",
    }));
  }

  const { userMap, machineMap } = readWindowsRegistryEnv();

  return ALL_ENV_NAMES.map((name) => {
    // Check case-insensitive match from registry maps
    const uKey = Object.keys(userMap).find((k) => k.toLowerCase() === name.toLowerCase());
    const mKey = Object.keys(machineMap).find((k) => k.toLowerCase() === name.toLowerCase());
    return {
      name,
      user: uKey ? userMap[uKey] : "",
      process: process.env[name] || "",
      machine: mKey ? machineMap[mKey] : "",
    };
  });
}

async function setGlobalProxy(config, enabled, portOverride) {
  if (process.platform !== "win32") throw new Error("Global proxy editing is only implemented for Windows.");
  const url = proxyUrl(config, portOverride);

  for (const name of PROXY_ENV_NAMES) {
    if (enabled) {
      try {
        require("node:child_process").execSync(
          `reg add HKCU\\Environment /v ${name} /t REG_SZ /d "${url}" /f`,
          { stdio: ["ignore", "ignore", "ignore"], windowsHide: true }
        );
      } catch (_e) {}
      process.env[name] = url;
    } else {
      try {
        require("node:child_process").execSync(
          `reg delete HKCU\\Environment /v ${name} /f`,
          { stdio: ["ignore", "ignore", "ignore"], windowsHide: true }
        );
      } catch (_e) {}
      delete process.env[name];
    }
  }

  // Broadcast WM_SETTINGCHANGE asynchronously without blocking response
  runPowerShell(`
    $HWND_BROADCAST = [IntPtr]0xffff
    $WM_SETTINGCHANGE = 0x1a
    Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition '[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
    $res = [UIntPtr]::Zero
    [Win32.NativeMethods]::SendMessageTimeout($HWND_BROADCAST, $WM_SETTINGCHANGE, [UIntPtr]::Zero, 'Environment', 2, 1000, [ref]$res) | Out-Null
  `).catch(() => {});

  return { enabled, proxyUrl: url };
}

async function setGlobalBypass(config, enabled) {
  if (process.platform !== "win32") throw new Error("Global proxy editing is only implemented for Windows.");
  const value = bypassValue(config);

  for (const name of BYPASS_ENV_NAMES) {
    if (enabled) {
      try {
        require("node:child_process").execSync(
          `reg add HKCU\\Environment /v ${name} /t REG_SZ /d "${value}" /f`,
          { stdio: ["ignore", "ignore", "ignore"], windowsHide: true }
        );
      } catch (_e) {}
      process.env[name] = value;
    } else {
      try {
        require("node:child_process").execSync(
          `reg delete HKCU\\Environment /v ${name} /f`,
          { stdio: ["ignore", "ignore", "ignore"], windowsHide: true }
        );
      } catch (_e) {}
      delete process.env[name];
    }
  }

  // Broadcast WM_SETTINGCHANGE asynchronously
  runPowerShell(`
    $HWND_BROADCAST = [IntPtr]0xffff
    $WM_SETTINGCHANGE = 0x1a
    Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition '[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
    $res = [UIntPtr]::Zero
    [Win32.NativeMethods]::SendMessageTimeout($HWND_BROADCAST, $WM_SETTINGCHANGE, [UIntPtr]::Zero, 'Environment', 2, 1000, [ref]$res) | Out-Null
  `).catch(() => {});

  return { enabled, bypassValue: value };
}

function loadClaudeSettings(config) {
  const settingsPath = expandPath(config.claude.settingsPath);
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = readJson(settingsPath) || {};
  }
  if (!isPlainObject(settings)) settings = {};
  if (!isPlainObject(settings.env)) settings.env = {};
  return { settingsPath, settings };
}

function writeClaudeSettings(settingsPath, settings) {
  backupFile(settingsPath);
  writeJson(settingsPath, settings);
}

function applyClaudeBypass(config, enabled) {
  const { settingsPath, settings } = loadClaudeSettings(config);
  const value = bypassValue(config);
  if (enabled) {
    settings.env.NO_PROXY = value;
    settings.env.no_proxy = value;
  } else {
    delete settings.env.NO_PROXY;
    delete settings.env.no_proxy;
  }
  writeClaudeSettings(settingsPath, settings);
  return summarizeClaude(config);
}

function applyClaudeEnv(config, fields) {
  const { settingsPath, settings } = loadClaudeSettings(config);
  if (typeof fields.baseUrl === "string" && fields.baseUrl.trim()) {
    settings.env.ANTHROPIC_BASE_URL = fields.baseUrl.trim();
  }
  if (typeof fields.authToken === "string" && fields.authToken.trim()) {
    settings.env.ANTHROPIC_AUTH_TOKEN = fields.authToken.trim();
    delete settings.env.ANTHROPIC_API_KEY;
  }
  if (fields.clearAuthToken === true) {
    delete settings.env.ANTHROPIC_AUTH_TOKEN;
  }
  if (typeof fields.model === "string" && fields.model.trim()) {
    settings.env.ANTHROPIC_MODEL = fields.model.trim();
  }
  writeClaudeSettings(settingsPath, settings);
  return summarizeClaude(config);
}

function summarizeClaude(config) {
  const settingsPath = expandPath(config.claude.settingsPath);
  const exists = fs.existsSync(settingsPath);
  const settings = exists ? readJson(settingsPath) || {} : {};
  const env = isPlainObject(settings.env) ? settings.env : {};
  const noProxy = env.NO_PROXY || env.no_proxy || "";
  const hosts = String(noProxy).split(",").map((item) => item.trim());
  const localBypassEnabled = ["localhost", "127.0.0.1", "::1"].every((host) => hosts.includes(host));
  return {
    settingsPath,
    exists,
    baseUrl: env.ANTHROPIC_BASE_URL || "",
    model: env.ANTHROPIC_MODEL || settings.model || "",
    tokenPresent: Boolean(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY),
    authType: env.ANTHROPIC_AUTH_TOKEN ? "token" : env.ANTHROPIC_API_KEY ? "api-key" : "",
    noProxy,
    localBypassEnabled,
  };
}

function tokenRhythmProxyJs() {
  return `const http = require("http");
const https = require("https");

const upstream = new URL(process.env.TOKENRHYTHM_UPSTREAM || "https://tokenrhythm.studio");
const port = Number(process.env.TOKENRHYTHM_PROXY_PORT || 8787);

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function copyHeaders(headers) {
  const next = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (hopByHopHeaders.has(lower)) continue;
    if (lower === "anthropic-beta") continue;
    next[name] = value;
  }
  next.host = upstream.host;
  return next;
}

function isInvalidThinkingBlock(value) {
  if (!value || typeof value !== "object") return false;
  if (value.type !== "thinking" && value.type !== "redacted_thinking") return false;
  return typeof value.signature !== "string" || value.signature.length < 16;
}

function sanitizeInvalidThinkingBlocks(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !isInvalidThinkingBlock(item))
      .map((item) => sanitizeInvalidThinkingBlocks(item));
  }
  if (!value || typeof value !== "object") return value;

  const next = {};
  for (const [key, item] of Object.entries(value)) {
    next[key] = sanitizeInvalidThinkingBlocks(item);
  }
  if (Array.isArray(next.content) && next.content.length === 0) {
    next.content = [{ type: "text", text: "" }];
  }
  return next;
}

function sanitizeRequestBody(req, body) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.includes("application/json") || body.length === 0) return body;

  try {
    const parsed = JSON.parse(body.toString("utf8"));
    return Buffer.from(JSON.stringify(sanitizeInvalidThinkingBlocks(parsed)));
  } catch (_error) {
    return body;
  }
}

const server = http.createServer((req, res) => {
  const target = new URL(req.url, upstream);
  target.searchParams.delete("beta");

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = sanitizeRequestBody(req, Buffer.concat(chunks));
    const headers = copyHeaders(req.headers);
    if (body.length > 0) headers["content-length"] = String(body.length);

    const client = upstream.protocol === "http:" ? http : https;
    const proxyReq = client.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === "http:" ? 80 : 443),
        method: req.method,
        path: \`\${target.pathname}\${target.search}\`,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", (error) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "tokenrhythm_proxy_error", message: error.message }));
    });

    proxyReq.end(body);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(\`TokenRhythm Claude Code proxy listening on http://127.0.0.1:\${port}\`);
});
`;
}

function generateClaudeGatewayFiles(config) {
  ensureBaseDirs();
  const dir = SCRIPTS_DIR;
  const ps1Path = path.join(dir, "switch-tokenrhythm-proxy.ps1");
  const cmdPath = path.join(dir, "switch-tokenrhythm-proxy.cmd");
  const jsPath = path.join(dir, "tokenrhythm-proxy.js");
  const port = normalizePort(config.claude.localProxyPort, 8787);
  const upstream = config.claude.upstream || "https://tokenrhythm.studio";

  const ps1 = `$ErrorActionPreference = "Stop"

$env:TOKENRHYTHM_PROXY_PORT = "${port}"
$env:TOKENRHYTHM_UPSTREAM = "${upstream}"

$proxyScript = Join-Path $PSScriptRoot "tokenrhythm-proxy.js"
$port = [int]$env:TOKENRHYTHM_PROXY_PORT

if (-not (Test-Path -LiteralPath $proxyScript)) {
    Write-Host "Proxy script not found: $proxyScript" -ForegroundColor Red
    exit 1
}

$listeners = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue

if ($listeners) {
    $processIds = $listeners |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -gt 0 }

    foreach ($processId in $processIds) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq "node") {
            Stop-Process -Id $processId -Force
            Write-Host "TokenRhythm proxy stopped. PID=$processId" -ForegroundColor Yellow
        }
        elseif ($process) {
            Write-Host "Port $port is used by $($process.ProcessName) PID=$processId. Not stopping it." -ForegroundColor Red
        }
    }

    exit 0
}

$started = Start-Process -FilePath "node" -ArgumentList @($proxyScript) -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 800

$startedListener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($startedListener) {
    Write-Host "TokenRhythm proxy started. PID=$($started.Id), URL=http://127.0.0.1:$port" -ForegroundColor Green
    exit 0
}

Write-Host "TokenRhythm proxy failed to start. Check node and tokenrhythm-proxy.js." -ForegroundColor Red
exit 1
`;

  const cmd = `@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch-tokenrhythm-proxy.ps1"
pause
`;

  backupFile(ps1Path);
  backupFile(cmdPath);
  backupFile(jsPath);
  fs.writeFileSync(ps1Path, ps1, "utf8");
  fs.writeFileSync(cmdPath, cmd, "utf8");
  fs.writeFileSync(jsPath, tokenRhythmProxyJs(), "utf8");

  return [ps1Path, cmdPath, jsPath];
}

function generateAgyToggleFiles(config) {
  ensureBaseDirs();
  const dir = SCRIPTS_DIR;
  const url = proxyUrl(config);
  const ps1Path = path.join(dir, "Toggle-Global-Proxy.ps1");
  const cmdPath = path.join(dir, "Toggle-Global-Proxy.cmd");

  const ps1 = `$ErrorActionPreference = 'Stop'

$proxy = '${url}'
$names = @('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy')

function Get-UserEnvValue([string]$name) {
    [Environment]::GetEnvironmentVariable($name, 'User')
}

function Set-UserProxy {
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name, $proxy, 'User')
        Set-Item -Path "Env:$name" -Value $proxy
    }
}

function Clear-UserProxy {
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name, $null, 'User')
        if (Test-Path "Env:$name") {
            Remove-Item -Path "Env:$name"
        }
    }
}

$current = @{}
foreach ($name in $names) {
    $current[$name] = Get-UserEnvValue $name
}

$enabled = $true
foreach ($name in $names) {
    if ($current[$name] -ne $proxy) {
        $enabled = $false
        break
    }
}

if ($enabled) {
    Clear-UserProxy
    Write-Host 'Global proxy is now OFF. User environment proxy variables were cleared.' -ForegroundColor Yellow
    Write-Host 'New terminals will use the default network configuration.'
} else {
    Set-UserProxy
    Write-Host 'Global proxy is now ON:' -ForegroundColor Green
    foreach ($name in $names) {
        Write-Host "  $name=$proxy"
    }
}

Write-Host ''
Write-Host 'Close and reopen PowerShell/CMD/IDE terminals for the change to take effect.' -ForegroundColor Cyan
Write-Host 'This window already has the updated setting.'
Write-Host ''
Read-Host 'Press Enter to close'
`;

  const cmd = `@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Toggle-Global-Proxy.ps1"
`;

  backupFile(ps1Path);
  backupFile(cmdPath);
  fs.writeFileSync(ps1Path, ps1, "utf8");
  fs.writeFileSync(cmdPath, cmd, "utf8");
  return [ps1Path, cmdPath];
}

function safeFilePart(value) {
  return String(value || "profile").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "profile";
}

function getProfileScriptPath(profile) {
  return path.join(SCRIPTS_DIR, `${safeFilePart(profile.id || profile.name)}-starter.cmd`);
}

function generateProfileScript(config, profileId) {
  ensureBaseDirs();
  const profile = config.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  const host = profile.proxyHost || config.proxy.host || "127.0.0.1";
  const port = normalizePort(profile.proxyPort, config.proxy.port);
  const scheme = profile.proxyScheme || config.proxy.scheme || "http";
  const url = `${scheme}://${host}:${port}`;
  const filePath = path.join(SCRIPTS_DIR, `${safeFilePart(profile.id || profile.name)}-starter.cmd`);
  const lines = ["@echo off"];

  if (profile.proxyMode === "process" || profile.proxyMode === "dedicated-proxy") {
    for (const name of PROXY_ENV_NAMES) lines.push(`set "${name}=${url}"`);
    lines.push(`set "NO_PROXY=${bypassValue(config)}"`);
    lines.push(`set "no_proxy=${bypassValue(config)}"`);
  } else if (profile.proxyMode === "force-direct" || profile.proxyMode === "bypass-local") {
    for (const name of PROXY_ENV_NAMES) lines.push(`set "${name}="`);
    lines.push(`set "NO_PROXY=*"`);
    lines.push(`set "no_proxy=*"`);
  }

  if (profile.workingDir) lines.push(`cd /d "${expandPath(profile.workingDir)}"`);
  if (!profile.command) {
    lines.push("echo [ScopeSwitch] This profile has no command set. Edit it in ScopeSwitch first.");
    lines.push("pause");
    lines.push("exit /b 1");
  } else {
    lines.push(`start "" "${resolveCommand(profile.command)}" ${profile.args || ""}`.trimEnd());
  }
  lines.push("");

  backupFile(filePath);
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
  return filePath;
}

function ensureBaseScripts(config) {
  try {
    ensureBaseDirs();
    generateClaudeGatewayFiles(config);
    generateAgyToggleFiles(config);
    for (const profile of config.profiles || []) {
      try {
        generateProfileScript(config, profile.id);
      } catch (_e) {}
    }
  } catch (err) {
    console.error("Failed to initialize base scripts:", err);
  }
}

function splitArgs(input) {
  const args = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(input || ""))) {
    args.push(match[1] ?? match[2] ?? match[3]);
  }
  return args;
}

function launchProfile(config, profileId) {
  const profile = config.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error(`Profile not found: ${profileId}`);
  if (!profile.command) throw new Error("This profile has no command configured yet. Please fill in the executable or CLI command.");

  const host = profile.proxyHost || config.proxy.host || "127.0.0.1";
  const port = normalizePort(profile.proxyPort, config.proxy.port);
  const scheme = profile.proxyScheme || config.proxy.scheme || "http";
  const url = `${scheme}://${host}:${port}`;
  const env = { ...process.env };

  if (profile.proxyMode === "process" || profile.proxyMode === "dedicated-proxy") {
    for (const name of PROXY_ENV_NAMES) env[name] = url;
    env.NO_PROXY = bypassValue(config);
    env.no_proxy = bypassValue(config);
  } else if (profile.proxyMode === "force-direct" || profile.proxyMode === "bypass-local") {
    for (const name of PROXY_ENV_NAMES) delete env[name];
    env.NO_PROXY = "*";
    env.no_proxy = "*";
  }

  const child = spawn(resolveCommand(profile.command), splitArgs(profile.args), {
    cwd: profile.workingDir ? expandPath(profile.workingDir) : undefined,
    env,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return { pid: child.pid };
}

function knownFiles(config) {
  ensureBaseDirs();
  const files = [
    { key: "globalCmd", name: "Toggle-Global-Proxy.cmd", path: path.join(SCRIPTS_DIR, "Toggle-Global-Proxy.cmd"), desc: "Windows 全局代理切换快捷脚本" },
    { key: "globalPs1", name: "Toggle-Global-Proxy.ps1", path: path.join(SCRIPTS_DIR, "Toggle-Global-Proxy.ps1"), desc: "PowerShell 全局切换脚本" },
    { key: "claudeCmd", name: "switch-tokenrhythm-proxy.cmd", path: path.join(SCRIPTS_DIR, "switch-tokenrhythm-proxy.cmd"), desc: "TokenRhythm 本地网关启动/停止命令" },
    { key: "claudePs1", name: "switch-tokenrhythm-proxy.ps1", path: path.join(SCRIPTS_DIR, "switch-tokenrhythm-proxy.ps1"), desc: "TokenRhythm 网关控制脚本" },
    { key: "tokenProxyJs", name: "tokenrhythm-proxy.js", path: path.join(SCRIPTS_DIR, "tokenrhythm-proxy.js"), desc: "TokenRhythm 转换代理核心服务" },
  ];

  for (const profile of config.profiles || []) {
    const filename = `${safeFilePart(profile.id || profile.name)}-starter.cmd`;
    files.push({
      key: `profile_${profile.id}`,
      name: filename,
      path: path.join(SCRIPTS_DIR, filename),
      desc: `${profile.name} 专属启动脚本`,
    });
  }

  return files.map((file) => {
    let stat = null;
    try {
      stat = fs.statSync(file.path);
    } catch (_error) {
      return { ...file, exists: false };
    }
    return {
      ...file,
      exists: true,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  });
}

function checkPortListening(port, host = "127.0.0.1", timeoutMs = 350) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function publicState(config, envState, portStatus = null) {
  const globalUrl = proxyUrl(config);
  const proxyRows = envState.filter((item) => PROXY_ENV_NAMES.includes(item.name));
  const activeUserProxy = proxyRows.find((item) => Boolean(item.user && item.user.trim()))?.user || "";
  const globalEnabled = Boolean(activeUserProxy);

  const bypassRows = envState.filter((item) => BYPASS_ENV_NAMES.includes(item.name));
  const activeUserBypass = bypassRows.find((item) => Boolean(item.user && item.user.trim()))?.user || "";
  const globalBypassEnabled = Boolean(activeUserBypass);
  const expectedBypass = activeUserBypass || bypassValue(config);

  return {
    app: {
      dir: APP_DIR,
      configPath: CONFIG_PATH,
      generatedDir: GENERATED_DIR,
      node: process.version,
      platform: process.platform,
      url: `http://${HOST}:${PORT}`,
    },
    config,
    proxyUrl: activeUserProxy || globalUrl,
    activeUserProxy,
    activeUserBypass,
    env: envState,
    globalEnabled,
    globalBypassEnabled,
    bypassValue: expectedBypass,
    claude: summarizeClaude(config),
    files: knownFiles(config),
    ports: portStatus || {
      proxyPort: config.proxy.port,
      proxyListening: false,
      claudePort: config.claude.localProxyPort,
      claudeListening: false,
    },
  };
}

async function getState() {
  const config = readConfig();
  const envState = await getEnvironmentState();
  const [proxyListening, claudeListening] = await Promise.all([
    checkPortListening(config.proxy.port, config.proxy.host || "127.0.0.1"),
    checkPortListening(config.claude.localProxyPort || 8787, "127.0.0.1"),
  ]);
  const portStatus = {
    proxyPort: config.proxy.port,
    proxyListening,
    claudePort: config.claude.localProxyPort || 8787,
    claudeListening,
  };
  return publicState(config, envState, portStatus);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendError(res, error) {
  sendJson(res, 500, { ok: false, error: error.message || String(error) });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (_error) {
        reject(new Error("Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  }[ext] || "application/octet-stream";
}

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": "no-cache, no-store, must-revalidate",
    "pragma": "no-cache",
    "expires": "0",
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, { ok: true, state: await getState() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/file") {
      const config = readConfig();
      const key = url.searchParams.get("key");
      const file = knownFiles(config).find((item) => item.key === key);
      if (!file) {
        sendJson(res, 404, { ok: false, error: "Unknown file key." });
        return;
      }
      if (!file.exists) {
        sendJson(res, 404, { ok: false, error: "File does not exist.", path: file.path });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        path: file.path,
        content: fs.readFileSync(file.path, "utf8"),
      });
      return;
    }

    const body = await readBody(req);

    if (req.method === "POST" && url.pathname === "/api/config") {
      const current = readConfig();
      const next = writeConfig(mergeDefaults(body, current));
      sendJson(res, 200, { ok: true, state: publicState(next, await getEnvironmentState()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/global-proxy") {
      const current = readConfig();
      if (body.port) {
        current.proxy.port = normalizePort(body.port, current.proxy.port);
        writeConfig(current);
      }
      const result = await setGlobalProxy(current, body.enabled === true, body.port);
      sendJson(res, 200, { ok: true, result, state: await getState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/global-bypass") {
      const current = readConfig();
      if (Array.isArray(body.bypassHosts) && body.bypassHosts.length > 0) {
        current.bypassHosts = body.bypassHosts;
        writeConfig(current);
      }
      const result = await setGlobalBypass(current, body.enabled === true);
      sendJson(res, 200, { ok: true, result, state: await getState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/claude-bypass") {
      const config = readConfig();
      const claude = applyClaudeBypass(config, body.enabled === true);
      sendJson(res, 200, { ok: true, claude, state: await getState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/claude-env") {
      const config = readConfig();
      const claude = applyClaudeEnv(config, body);
      sendJson(res, 200, { ok: true, claude, state: await getState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const config = readConfig();
      const targets = Array.isArray(body.targets) ? body.targets : [];
      const written = [];
      if (targets.includes("agy-toggle")) written.push(...generateAgyToggleFiles(config));
      if (targets.includes("claude-gateway")) {
        config.claude.baseUrl = `http://127.0.0.1:${normalizePort(config.claude.localProxyPort, 8787)}`;
        writeConfig(config);
        written.push(...generateClaudeGatewayFiles(config));
      }
      if (targets.includes("profile-script") && body.profileId) written.push(generateProfileScript(config, body.profileId));
      sendJson(res, 200, { ok: true, written, state: await getState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/launch-profile") {
      const result = launchProfile(readConfig(), body.profileId);
      sendJson(res, 200, { ok: true, result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/delete-file") {
      const config = readConfig();
      const key = body.key;
      const file = knownFiles(config).find((item) => item.key === key);
      if (!file) {
        sendJson(res, 404, { ok: false, error: "未找到该文件键名。" });
        return;
      }
      if (fs.existsSync(file.path)) {
        backupFile(file.path);
        fs.unlinkSync(file.path);
      }
      // 如果删除的是某个 profile 的专属脚本，自动同步删除对应的 profile 卡片配置
      if (key.startsWith("profile_")) {
        const profileId = key.replace("profile_", "");
        config.profiles = (config.profiles || []).filter((p) => p.id !== profileId);
        writeConfig(config);
      }
      sendJson(res, 200, { ok: true, state: await getState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/delete-profile") {
      const config = readConfig();
      const profileId = body.profileId;
      const targetProfile = (config.profiles || []).find((p) => p.id === profileId);
      if (targetProfile) {
        const scriptPath = getProfileScriptPath(targetProfile);
        if (fs.existsSync(scriptPath)) {
          backupFile(scriptPath);
          fs.unlinkSync(scriptPath);
        }
      }
      config.profiles = (config.profiles || []).filter((p) => p.id !== profileId);
      writeConfig(config);
      sendJson(res, 200, { ok: true, state: await getState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/toggle-gateway") {
      const scriptPath = path.join(SCRIPTS_DIR, "switch-tokenrhythm-proxy.ps1");
      if (!fs.existsSync(scriptPath)) {
        generateClaudeGatewayFiles(readConfig());
      }
      const output = await runPowerShell(`& ${psString(scriptPath)}`);
      sendJson(res, 200, { ok: true, output, state: await getState() });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Unknown API route." });
  } catch (error) {
    sendError(res, error);
  }
}

function openBrowser(url) {
  if (process.env.SCOPESWITCH_NO_OPEN === "1" || process.env.WWSWITCH_NO_OPEN === "1") return;
  if (process.platform === "win32") {
    // Try launching as a standalone native-like window using msedge --app or chrome --app
    const edgePaths = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ];
    let appLauncher = edgePaths.find((p) => fs.existsSync(p));

    if (appLauncher) {
      const child = spawn(appLauncher, [`--app=${url}`, "--window-size=1180,820"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return;
    }

    const child = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  }
}

ensureBaseDirs();
const initialConfig = readConfig();
ensureBaseScripts(initialConfig);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`[OK] ScopeSwitch 已就绪: ${url}`);
  console.log(`[OK] 配置文件路径: ${CONFIG_PATH}`);
  console.log(`[TIP] 如需在外部浏览器中访问，请打开: ${url}`);
  openBrowser(url);
});
