let state = null;
let currentMatrixFilter = "all";

const fileLabels = {
  agyPs1: "Toggle-Agy-Proxy.ps1",
  agyCmd: "Toggle-Agy-Proxy.cmd",
  claudeCmd: "switch-tokenrhythm-proxy.cmd",
  claudePs1: "switch-tokenrhythm-proxy.ps1",
  tokenProxyJs: "tokenrhythm-proxy.js",
};

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(message, isError = false) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", isError);
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3800);
}

async function api(path, body) {
  const options = body === undefined
    ? {}
    : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      };
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function currentConfigFromForm() {
  if (!state || !state.config) return {};
  const config = structuredClone(state.config);
  const scheme = $("#proxyScheme");
  if (scheme) config.proxy.scheme = scheme.value;
  const host = $("#proxyHost");
  if (host) config.proxy.host = host.value.trim() || "127.0.0.1";
  const port = $("#proxyPort");
  if (port) config.proxy.port = Number(port.value || 7890);
  const bypass = $("#bypassHosts");
  if (bypass) {
    config.bypassHosts = bypass.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const scriptDir = $("#scriptTargetDir");
  if (scriptDir) config.scriptTargetDir = scriptDir.value.trim() || "%USERPROFILE%\\Desktop";
  const claudePath = $("#claudeSettingsPath");
  if (claudePath) config.claude.settingsPath = claudePath.value.trim() || "%USERPROFILE%\\.claude\\settings.json";
  const claudeBase = $("#claudeBaseUrl");
  if (claudeBase) config.claude.baseUrl = claudeBase.value.trim() || "http://127.0.0.1:8787";
  const claudePort = $("#claudeLocalPort");
  if (claudePort) config.claude.localProxyPort = Number(claudePort.value || 8787);
  const claudeUp = $("#claudeUpstream");
  if (claudeUp) config.claude.upstream = claudeUp.value.trim() || "https://tokenrhythm.studio";
  config.profiles = collectProfiles();
  return config;
}

function collectProfiles() {
  return Array.from(document.querySelectorAll("[data-profile-card]")).map((card) => ({
    id: card.dataset.profileId,
    name: card.querySelector("[data-field='name']")?.value.trim() || card.dataset.profileId,
    kind: "software",
    proxyMode: card.querySelector("[data-field='proxyMode']")?.value || "process",
    proxyHost: card.querySelector("[data-field='proxyHost']")?.value.trim() || "127.0.0.1",
    proxyPort: Number(card.querySelector("[data-field='proxyPort']")?.value || (state?.config?.proxy?.port || 7890)),
    command: card.querySelector("[data-field='command']")?.value.trim() || "",
    args: card.querySelector("[data-field='args']")?.value.trim() || "",
    workingDir: card.querySelector("[data-field='workingDir']")?.value.trim() || "",
    note: card.querySelector("[data-field='note']")?.value.trim() || "",
  }));
}

async function saveConfig(showToast = true) {
  const payload = await api("/api/config", currentConfigFromForm());
  state = payload.state;
  render();
  if (showToast) toast("配置已保存。");
}

async function refresh() {
  const refreshBtn = $("#refreshBtn");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "刷新中...";
  }
  try {
    const payload = await api("/api/state");
    state = payload.state;
    render();
    if (refreshBtn) refreshBtn.textContent = "刷新状态";
  } catch (error) {
    if (refreshBtn) refreshBtn.textContent = "刷新失败";
    toast("无法获取服务状态: " + error.message, true);
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function render() {
  if (!state) return;
  const config = state.config || {};

  // Form values
  const setVal = (id, val) => {
    const el = $(id);
    if (el && document.activeElement !== el) el.value = val ?? "";
  };

  setVal("#proxyScheme", config.proxy?.scheme || "http");
  setVal("#proxyHost", config.proxy?.host || "127.0.0.1");
  setVal("#proxyPort", config.proxy?.port || 7890);
  setVal("#bypassHosts", (config.bypassHosts || []).join(","));
  setVal("#scriptTargetDir", config.scriptTargetDir || "");
  setVal("#claudeSettingsPath", config.claude?.settingsPath || "");
  setVal("#claudeBaseUrl", state.claude?.baseUrl || config.claude?.baseUrl || "");
  setVal("#claudeLocalPort", config.claude?.localProxyPort || 8787);
  setVal("#claudeUpstream", config.claude?.upstream || "");
  setVal("#claudeModel", state.claude?.model || "");

  const proxyLabel = $("#proxyUrlLabel");
  if (proxyLabel) proxyLabel.textContent = state.proxyUrl || "";

  const globalStateEl = $("#globalState");
  if (globalStateEl) {
    globalStateEl.textContent = state.globalEnabled ? `全局已开启 (${state.proxyUrl})` : "全局未开启 (直连)";
    globalStateEl.className = `status-pill ${state.globalEnabled ? "ok" : "warn"}`;
  }

  const claudeStateEl = $("#claudeState");
  if (claudeStateEl) {
    claudeStateEl.textContent = state.claude?.localBypassEnabled ? "专属已绕过" : "专属未绕过";
    claudeStateEl.className = `status-pill ${state.claude?.localBypassEnabled ? "ok" : "warn"}`;
  }

  // Topbar Master Route Badge
  const masterBadge = $("#masterRouteBadge");
  const masterText = $("#masterRouteText");
  if (masterBadge && masterText) {
    if (state.globalEnabled) {
      masterBadge.className = "route-badge proxy";
      const icon = masterBadge.querySelector(".route-icon");
      if (icon) icon.textContent = "🚀";
      masterText.textContent = `全局代理 (${state.proxyUrl})`;
    } else {
      masterBadge.className = "route-badge direct";
      const icon = masterBadge.querySelector(".route-icon");
      if (icon) icon.textContent = "⚡";
      masterText.textContent = "本地网络 (直连无代理)";
    }
  }

  // Summary Cards
  renderSummaryCards();

  // Live Routing Matrix
  renderRoutingMatrix();

  // Files & Profiles
  renderFiles();
  renderProfiles();
}

function renderSummaryCards() {
  const config = state.config || {};
  const ports = state.ports || {};

  // Global Terminal Card
  const gVal = $("#summaryGlobalVal");
  const gDesc = $("#summaryGlobalDesc");
  const gBadge = $("#summaryGlobalBadge");
  if (gVal && gDesc && gBadge) {
    if (state.globalEnabled) {
      gVal.textContent = `代理已开启 (${state.proxyUrl})`;
      gDesc.textContent = state.globalBypassEnabled
        ? `全局生效中 (NO_PROXY: ${state.bypassValue || "127.0.0.1"})`
        : "用户级 HTTP_PROXY 已配置生效";
      gBadge.textContent = "走代理";
      gBadge.className = "status-badge warn";
    } else {
      gVal.textContent = "本地网络 (直连)";
      gDesc.textContent = "未注入全局代理环境变量";
      gBadge.textContent = "走直连";
      gBadge.className = "status-badge ok";
    }
  }

  // Proxy Port Listener Card
  const pPort = $("#proxyPortNum");
  const pVal = $("#summaryProxyPortVal");
  const pDesc = $("#summaryProxyPortDesc");
  const pBadge = $("#summaryProxyPortBadge");
  if (pPort) pPort.textContent = config.proxy?.port || 7890;
  if (pVal && pDesc && pBadge) {
    if (ports.proxyListening) {
      pVal.textContent = `127.0.0.1:${config.proxy?.port} 监听中`;
      pDesc.textContent = "代理客户端 (Clash/v2ray) 正常工作中";
      pBadge.textContent = "在线";
      pBadge.className = "status-badge ok";
    } else {
      pVal.textContent = `127.0.0.1:${config.proxy?.port} 未检测到监听`;
      pDesc.textContent = "请确认 Clash / v2ray / 代理软件已开启本地端口";
      pBadge.textContent = "未运行";
      pBadge.className = "status-badge warn";
    }
  }

  // Claude TokenRhythm Port Listener Card
  const cPort = $("#claudePortNum");
  const cVal = $("#summaryClaudePortVal");
  const cDesc = $("#summaryClaudePortDesc");
  const cBadge = $("#summaryClaudePortBadge");
  const claudeLocalPort = config.claude?.localProxyPort || 8787;
  if (cPort) cPort.textContent = claudeLocalPort;
  if (cVal && cDesc && cBadge) {
    if (ports.claudeListening) {
      cVal.textContent = `127.0.0.1:${claudeLocalPort} 运行中`;
      cDesc.textContent = `上游: ${escapeHtml(config.claude?.upstream || "")}`;
      cBadge.textContent = "网关在线";
      cBadge.className = "status-badge ok";
    } else {
      cVal.textContent = `127.0.0.1:${claudeLocalPort} 未运行`;
      cDesc.textContent = "可双击 switch-tokenrhythm-proxy.cmd 启动";
      cBadge.textContent = "未启动";
      cBadge.className = "status-badge info";
    }
  }
}

function renderRoutingMatrix() {
  const container = $("#routingMatrixList");
  if (!container || !state) return;

  const items = [];

  // 1. Windows 全局与终端环境
  items.push({
    id: "system-terminal",
    title: "Windows 终端与全局环境",
    icon: "💻",
    category: state.globalEnabled ? "proxy" : "direct",
    routeType: state.globalEnabled ? "proxy" : "direct",
    routeLabel: state.globalEnabled ? `🚀 走代理 (${state.proxyUrl})` : "⚡ 走本地网络 (直连)",
    details: [
      { key: "作用范围", val: "PowerShell、CMD、Git、新建命令行及未配置专属的应用" },
      { key: "代理变量", val: state.globalEnabled ? `HTTP_PROXY=${state.proxyUrl}` : "未设置 (继承系统直连)" },
      { key: "系统全局 NO_PROXY", val: state.globalBypassEnabled ? `⚡ 已开启 (绕过: ${state.bypassValue || "127.0.0.1"})` : "未开启 (访问 127.0.0.1 默认走代理)" },
    ],
    actionsHtml: `
      ${state.globalEnabled
        ? `<button data-action="disable-global" class="button secondary" type="button">关闭全局代理</button>`
        : `<button data-action="enable-global" class="button primary" type="button">开启全局代理</button>`
      }
      ${state.globalBypassEnabled
        ? `<button data-action="disable-global-bypass" class="button ghost" type="button">清除系统全局绕过</button>`
        : `<button data-action="enable-global-bypass" class="button secondary" type="button">开启系统全局绕过</button>`
      }
    `,
  });

  // 2. Claude Code CLI
  const claudeBypass = Boolean(state.claude?.localBypassEnabled);
  items.push({
    id: "claude-code",
    title: "Claude Code (CLI / settings)",
    icon: "🤖",
    category: "gateway",
    routeType: "gateway",
    routeLabel: "🔄 本地网关 ➔ TokenRhythm",
    details: [
      { key: "隔离模式", val: "📁 应用专属配置文件隔离 (settings.json)" },
      { key: "本地 Base URL", val: state.claude?.baseUrl || `http://127.0.0.1:${state.config?.claude?.localProxyPort || 8787}` },
      { key: "应用专属 NO_PROXY", val: claudeBypass ? "⚡ 专属文件已绕过 (零污染隔离)" : "⚠️ 专属未设置 (若全局已绕过也能连通)" },
      { key: "目标上游服务", val: state.config?.claude?.upstream || "https://tokenrhythm.studio" },
      { key: "当前模型配置", val: state.claude?.model || "默认 (未指定)" },
    ],
    actionsHtml: `
      <button data-action="toggle-gateway" class="button ${(state.ports || {}).claudeListening ? "secondary" : "primary"}" type="button">
        ${(state.ports || {}).claudeListening ? "⏹️ 停止本地网关 (8787)" : "▶️ 启动本地网关 (8787)"}
      </button>
      ${claudeBypass
        ? `<button data-action="disable-claude-bypass" class="button ghost" type="button">移除专属绕过</button>`
        : `<button data-action="enable-claude-bypass" class="button primary" type="button">开启专属绕过</button>`
      }
      <button data-action="generate-claude-gateway" class="button secondary" type="button">重新生成网关脚本</button>
    `,
  });

  // 3. 自定义受控软件 / CLI 列表 (Profiles: Agy, Codex, Cursor, etc.)
  for (const profile of (state.config?.profiles || [])) {
    const isDirect = profile.proxyMode === "force-direct" || profile.proxyMode === "bypass-local";
    const isProcess = profile.proxyMode === "process" || profile.proxyMode === "dedicated-proxy";
    const targetHost = profile.proxyHost || "127.0.0.1";
    const targetPort = profile.proxyPort || (state.config?.proxy?.port || 7890);

    let category = "direct";
    let routeType = "direct";
    let routeLabel = "⚡ 强行走本地直连";

    if (isProcess) {
      category = "proxy";
      routeType = "proxy";
      routeLabel = `🚀 独立指定代理 (http://${targetHost}:${targetPort})`;
    } else if (isDirect) {
      category = "direct";
      routeType = "direct";
      routeLabel = "⚡ 强行走本地网络 (绕过全局代理)";
    } else {
      category = state.globalEnabled ? "proxy" : "direct";
      routeType = state.globalEnabled ? "proxy" : "direct";
      routeLabel = state.globalEnabled ? `🌐 跟随全局代理 (${state.proxyUrl})` : "🌐 跟随系统 (本地直连)";
    }

    const icon = profile.id.includes("agy") ? "⚡" : profile.id.includes("codex") ? "🧠" : profile.id.includes("cursor") ? "🖱️" : "📦";

    items.push({
      id: `matrix-profile-${profile.id}`,
      title: profile.name || profile.id,
      icon,
      category,
      routeType,
      routeLabel,
      details: [
        {
          key: "当前路由策略",
          val: isProcess
            ? `🚀 独立注入代理 (http://${targetHost}:${targetPort})`
            : isDirect
            ? "⚡ 强制走本地宽带直连 (注入 NO_PROXY=* 绕过全局)"
            : "🌐 跟随系统环境",
        },
        { key: "执行命令 / 路径", val: profile.command || "(未设置命令)" },
        { key: "启动参数", val: profile.args || "(无)" },
        { key: "备注说明", val: profile.note || "(无)" },
      ],
      actionsHtml: `
        <button data-action="launch-profile" data-profile-id="${escapeHtml(profile.id)}" class="button primary" type="button">启动软件</button>
        <button data-action="generate-profile" data-profile-id="${escapeHtml(profile.id)}" class="button secondary" type="button">生成启动脚本</button>
      `,
    });
  }

  // Apply Filter
  const filtered = items.filter((item) => {
    if (currentMatrixFilter === "all") return true;
    if (currentMatrixFilter === "proxy") return item.category === "proxy";
    if (currentMatrixFilter === "direct") return item.category === "direct";
    if (currentMatrixFilter === "gateway") return item.category === "gateway";
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="summary-card" style="grid-column: 1 / -1; justify-content: center; padding: 32px; text-align: center;">
        <span class="hint">当前筛选分类下无匹配的软件或组件。</span>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((item) => `
    <div class="matrix-item-card" data-card-id="${escapeHtml(item.id)}">
      <div>
        <div class="matrix-header">
          <div class="matrix-title-wrap">
            <span class="matrix-icon">${item.icon}</span>
            <h3 class="matrix-title">${escapeHtml(item.title)}</h3>
          </div>
          <span class="matrix-route-pill route-${item.routeType}">
            ${escapeHtml(item.routeLabel)}
          </span>
        </div>
        <div class="matrix-body" style="margin-top: 12px;">
          ${item.details.map((d) => `
            <div class="matrix-detail-row">
              <span class="matrix-detail-key">${escapeHtml(d.key)}</span>
              <span class="matrix-detail-val" title="${escapeHtml(d.val)}">${escapeHtml(d.val)}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="matrix-actions">
        ${item.actionsHtml}
      </div>
    </div>
  `).join("");
}

function renderFiles() {
  const container = $("#fileList");
  if (!container || !state || !state.files) return;
  const rows = state.files.map((file) => `
    <div class="file-row">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div>
          <strong class="file-name" style="font-size:14px;color:var(--text);">${escapeHtml(file.name || file.key)}</strong>
          <span style="font-size:12px;color:var(--muted);margin-left:8px;">${escapeHtml(file.desc || "")}</span>
        </div>
        <span class="status-pill ${file.exists ? "ok" : "warn"}">${file.exists ? "已就绪" : "未生成"}</span>
      </div>
      <div class="file-path mono" title="${escapeHtml(file.path)}" style="margin: 6px 0;">${escapeHtml(file.path)}</div>
      <div style="display:flex;gap:6px;margin-top:4px;">
        <button class="button ghost" type="button" data-action="preview-file" data-file-key="${escapeHtml(file.key)}" ${file.exists ? "" : "disabled"}>查看脚本代码</button>
        <button class="button ghost" type="button" data-action="delete-file" data-file-key="${escapeHtml(file.key)}" ${file.exists ? "" : "disabled"} style="color:var(--warn);border-color:var(--warn-light);" title="删除此脚本文件（若为软件专属脚本，将同步删除配置卡片）">🗑️ 删除脚本</button>
      </div>
    </div>
  `).join("");
  container.innerHTML = rows;
}

function renderProfiles() {
  const container = $("#profileList");
  if (!container || !state || !state.config?.profiles) return;
  const defaultPort = state.config?.proxy?.port || 7890;

  const rows = state.config.profiles.map((profile) => {
    const isDirect = profile.proxyMode === "force-direct" || profile.proxyMode === "bypass-local";
    const isProcess = profile.proxyMode === "process" || profile.proxyMode === "dedicated-proxy";
    return `
      <div class="profile-card" data-profile-card data-profile-id="${escapeHtml(profile.id)}">
        <label>
          <span>软件 / CLI 名称</span>
          <input data-field="name" value="${escapeHtml(profile.name)}" placeholder="例如 Agy / Codex / Cursor" />
        </label>
        <label>
          <span>代理路由策略</span>
          <select data-field="proxyMode">
            <option value="process" ${isProcess ? "selected" : ""}>🚀 独立指定代理 (单进程生效)</option>
            <option value="force-direct" ${isDirect ? "selected" : ""}>⚡ 强行走本地直连 (绕过系统全局)</option>
            <option value="none" ${profile.proxyMode === "none" ? "selected" : ""}>🌐 跟随系统全局环境</option>
          </select>
        </label>
        <label>
          <span>执行命令 / 可执行文件路径</span>
          <input data-field="command" value="${escapeHtml(profile.command)}" placeholder="例如 agy / codex / cursor / C:\\app.exe" />
        </label>
        <label>
          <span>代理主机与端口 (仅独立代理生效)</span>
          <div style="display:flex;gap:6px;">
            <input data-field="proxyHost" value="${escapeHtml(profile.proxyHost || "127.0.0.1")}" placeholder="127.0.0.1" style="flex:1.2;" />
            <input data-field="proxyPort" type="number" min="1" max="65535" value="${escapeHtml(profile.proxyPort || defaultPort)}" placeholder="7890" style="flex:1;" />
          </div>
        </label>
        <label>
          <span>运行参数</span>
          <input data-field="args" value="${escapeHtml(profile.args)}" placeholder="可选启动参数" />
        </label>
        <label>
          <span>工作目录</span>
          <input data-field="workingDir" value="${escapeHtml(profile.workingDir)}" placeholder="留空则当前目录" />
        </label>
        <label class="note-field">
          <span>备注说明</span>
          <input data-field="note" value="${escapeHtml(profile.note)}" placeholder="如：用于 OpenAI Codex CLI 强制走本地网络" />
        </label>
        <div class="profile-actions">
          <button class="button primary" type="button" data-action="launch-profile" data-profile-id="${escapeHtml(profile.id)}">启动软件</button>
          <button class="button secondary" type="button" data-action="generate-profile" data-profile-id="${escapeHtml(profile.id)}">生成脚本</button>
          <button class="button ghost" type="button" data-action="delete-profile" data-profile-id="${escapeHtml(profile.id)}">删除</button>
        </div>
      </div>
    `;
  }).join("");
  container.innerHTML = rows;
}

async function previewFile(key) {
  const payload = await api(`/api/file?key=${encodeURIComponent(key)}`);
  const title = $("#drawerTitle");
  const content = $("#filePreview");
  const drawer = $("#drawer");
  if (title) title.textContent = payload.path;
  if (content) content.textContent = payload.content;
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
}

function showEnvDrawer() {
  if (!state || !state.env) return;
  const title = $("#drawerTitle");
  const content = $("#filePreview");
  const drawer = $("#drawer");
  if (title) title.textContent = "Windows proxy environment variables";
  const rows = state.env.map((row) => `
    <tr>
      <td class="mono" style="font-weight:bold;">${escapeHtml(row.name)}</td>
      <td class="mono">${escapeHtml(row.user || "(not set)")}</td>
      <td class="mono">${escapeHtml(row.process || "(not set)")}</td>
      <td class="mono">${escapeHtml(row.machine || "(not set)")}</td>
    </tr>
  `).join("");

  const tableHtml = `
    <table class="env-table">
      <thead>
        <tr>
          <th>Variable</th>
          <th>User scope</th>
          <th>Current process</th>
          <th>Machine scope</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p class="hint" style="margin-top: 14px; line-height: 1.6;">
      ScopeSwitch changes <strong>User scope</strong> variables when toggling global proxy.
      New CMD, PowerShell, and IDE terminals inherit the updated values. Reopen terminals
      after changing global proxy state.
    </p>
  `;
  if (content) content.innerHTML = tableHtml;
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
}
function closeDrawer() {
  const drawer = $("#drawer");
  if (drawer) {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
}

function addProfile(preset = null) {
  if (!state || !state.config) return;
  const id = preset ? `${preset.id}-${Date.now()}` : `profile-${Date.now()}`;
  state.config.profiles = state.config.profiles || [];
  state.config.profiles.push({
    id,
    name: preset ? preset.name : "新应用",
    kind: "software",
    proxyMode: preset ? preset.proxyMode : "process",
    proxyHost: preset?.proxyHost || "127.0.0.1",
    proxyPort: preset?.proxyPort || state.config.proxy?.port || 7890,
    command: preset?.command || "",
    args: preset?.args || "",
    workingDir: "",
    note: preset?.note || "",
  });
  renderProfiles();
  renderRoutingMatrix();
  saveConfig(false);
}

function deleteProfile(id) {
  if (!state || !state.config) return;
  state.config.profiles = (state.config.profiles || []).filter((profile) => profile.id !== id);
  renderProfiles();
  renderRoutingMatrix();
  saveConfig(false);
}

async function generateTargets(targets, extra = {}) {
  await saveConfig(false);
  const payload = await api("/api/generate", { targets, ...extra });
  state = payload.state;
  render();
  toast(`已生成 ${payload.written.length} 个启动脚本文件。`);
}

// Unified Action Dispatcher with Auto-disabling & Loading State
document.addEventListener("click", async (event) => {
  // Filter Tabs
  const tab = event.target.closest(".filter-tab");
  if (tab) {
    document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentMatrixFilter = tab.dataset.filter || "all";
    renderRoutingMatrix();
    return;
  }

  const target = event.target.closest("button");
  if (!target) return;

  const action = target.dataset.action || target.id;
  if (!action) return;

  const originalContent = target.innerHTML;
  target.disabled = true;

  try {
    switch (action) {
      case "refresh":
      case "refreshBtn":
        await refresh();
        toast("状态已刷新。");
        break;

      case "viewEnvBtn":
        showEnvDrawer();
        break;

      case "closeDrawer":
        closeDrawer();
        break;

      case "saveConfig":
        await saveConfig(true);
        break;

      case "enable-global":
      case "enableGlobal": {
        const portVal = Number($("#proxyPort")?.value || state?.config?.proxy?.port || 7890);
        const payload = await api("/api/global-proxy", { enabled: true, port: portVal });
        state = payload.state;
        render();
        toast("全局代理已开启！新终端与软件将走代理。");
        break;
      }

      case "disable-global":
      case "disableGlobal": {
        const payload = await api("/api/global-proxy", { enabled: false });
        state = payload.state;
        render();
        toast("全局代理已关闭，已恢复本地网络直连。");
        break;
      }

      case "enable-global-bypass": {
        const payload = await api("/api/global-bypass", { enabled: true });
        state = payload.state;
        render();
        toast("系统全局 NO_PROXY 已写入用户环境变量 (所有新终端生效)。");
        break;
      }

      case "disable-global-bypass": {
        const payload = await api("/api/global-bypass", { enabled: false });
        state = payload.state;
        render();
        toast("系统全局 NO_PROXY 已从用户环境变量清除。");
        break;
      }

      case "enable-claude-bypass":
      case "enableClaudeBypass": {
        const payload = await api("/api/claude-bypass", { enabled: true });
        state = payload.state;
        render();
        toast("Claude 本地回环绕过已开启。重开 Claude 生效。");
        break;
      }

      case "disable-claude-bypass":
      case "disableClaudeBypass": {
        const payload = await api("/api/claude-bypass", { enabled: false });
        state = payload.state;
        render();
        toast("Claude 本地绕过已移除。");
        break;
      }

      case "saveClaudeEnv": {
        const payload = await api("/api/claude-env", {
          baseUrl: $("#claudeBaseUrl")?.value,
          authToken: $("#claudeAuthToken")?.value,
          model: $("#claudeModel")?.value,
        });
        state = payload.state;
        const authInput = $("#claudeAuthToken");
        if (authInput) authInput.value = "";
        render();
        toast("Claude 环境已成功写入 settings.json。");
        break;
      }

      case "generate-all-scripts": {
        await generateTargets(["agy-toggle", "claude-gateway"]);
        for (const profile of (state.config?.profiles || [])) {
          await generateTargets(["profile-script"], { profileId: profile.id });
        }
        toast("全部脚本已重新生成并存入 scripts/ 目录。");
        break;
      }

      case "generate-claude-gateway":
      case "generateClaudeGateway":
        await generateTargets(["claude-gateway"]);
        break;

      case "generate-agy-toggle":
      case "generateAgyToggle":
        await generateTargets(["agy-toggle"]);
        break;

      case "add-profile":
      case "addProfile":
        addProfile();
        break;

      case "add-preset-codex":
        addProfile({
          id: "codex",
          name: "Codex CLI",
          proxyMode: "force-direct",
          proxyHost: "127.0.0.1",
          proxyPort: 7890,
          command: "codex",
          args: "",
          note: "强行走本地直连网络，不受全局代理干扰",
        });
        toast("已添加 Codex CLI 预设配置。");
        break;

      case "add-preset-cursor":
        addProfile({
          id: "cursor",
          name: "Cursor IDE",
          proxyMode: "force-direct",
          proxyHost: "127.0.0.1",
          proxyPort: 7890,
          command: "cursor",
          args: "",
          note: "强行走本地网络 (直连)",
        });
        toast("已添加 Cursor 预设配置。");
        break;

      case "toggle-gateway": {
        const payload = await api("/api/toggle-gateway");
        state = payload.state;
        render();
        toast(payload.output || "本地网关状态已切换。");
        break;
      }

      case "delete-profile": {
        const profileId = target.dataset.profileId;
        if (profileId) {
          const payload = await api("/api/delete-profile", { profileId });
          state = payload.state;
          render();
          toast("已删除该软件配置及对应的专属启动脚本。");
        }
        break;
      }

      case "delete-file": {
        const fileKey = target.dataset.fileKey;
        if (fileKey) {
          const payload = await api("/api/delete-file", { key: fileKey });
          state = payload.state;
          render();
          toast("脚本文件已删除（若为软件专属脚本已同步清除配置卡片）。");
        }
        break;
      }

      case "generate-profile": {
        const profileId = target.dataset.profileId;
        if (profileId) await generateTargets(["profile-script"], { profileId });
        break;
      }

      case "launch-profile": {
        const profileId = target.dataset.profileId;
        if (profileId) {
          await saveConfig(false);
          await api("/api/launch-profile", { profileId });
          toast(`启动命令已执行 (ID: ${profileId})`);
        }
        break;
      }

      case "preview-file": {
        const fileKey = target.dataset.fileKey;
        if (fileKey) await previewFile(fileKey);
        break;
      }
    }
  } catch (error) {
    toast(error.message || String(error), true);
  } finally {
    target.disabled = false;
    target.innerHTML = originalContent;
  }
});

// Auto save profile modifications on change
document.addEventListener("change", (event) => {
  if (event.target.closest("[data-profile-card]")) {
    saveConfig(false).then(() => {
      renderRoutingMatrix();
    });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

window.addEventListener("focus", () => {
  refresh();
});

// Initial load
refresh();
