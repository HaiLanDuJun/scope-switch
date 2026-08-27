let state = null;
let currentMatrixFilter = "all";
let filePage = 1;
const filePageSize = 5;

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
  config.profiles = state.config.profiles || [];
  return config;
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

  // Files
  renderFiles();
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
      <button data-action="open-claude-settings" class="button secondary" type="button">⚙️ API 设置</button>
      ${claudeBypass
        ? `<button data-action="disable-claude-bypass" class="button ghost" type="button">移除专属绕过</button>`
        : `<button data-action="enable-claude-bypass" class="button ghost" type="button">开启专属绕过</button>`
      }
      <button data-action="generate-claude-gateway" class="button ghost" type="button">重新生成网关脚本</button>
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
        <button data-action="edit-profile" data-profile-id="${escapeHtml(profile.id)}" class="button secondary" type="button">✏️ 编辑配置</button>
        <button data-action="generate-profile" data-profile-id="${escapeHtml(profile.id)}" class="button ghost" type="button">生成脚本</button>
        <button data-action="delete-profile" data-profile-id="${escapeHtml(profile.id)}" class="button ghost" type="button" style="color:var(--warn);border-color:var(--warn-light);">🗑️ 删除</button>
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
  const allFiles = state.files || [];
  const total = allFiles.length;
  const totalPages = Math.max(1, Math.ceil(total / filePageSize));
  if (filePage > totalPages) filePage = totalPages;
  if (filePage < 1) filePage = 1;

  const startIdx = (filePage - 1) * filePageSize;
  const pagedFiles = allFiles.slice(startIdx, startIdx + filePageSize);

  const rows = pagedFiles.map((file) => `
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

  const paginationHtml = totalPages > 1 ? `
    <div class="file-pagination">
      <span class="hint">共 ${total} 个脚本，当前第 ${filePage} / ${totalPages} 页</span>
      <div class="pagination-controls">
        <button class="button ghost" type="button" data-action="file-page-prev" ${filePage <= 1 ? "disabled" : ""}>◀ 上一页</button>
        <button class="button ghost" type="button" data-action="file-page-next" ${filePage >= totalPages ? "disabled" : ""}>下一页 ▶</button>
      </div>
    </div>
  ` : "";

  container.innerHTML = rows + paginationHtml;
}

function openProfileModal(profile = null, defaultMode = "process") {
  const isEditing = Boolean(profile && profile.id);
  const defaultPort = state?.config?.proxy?.port || 7890;
  const currentProfile = profile || {
    id: `profile-${Date.now()}`,
    name: defaultMode === "force-direct" ? "新直连应用" : "新代理应用",
    kind: "software",
    proxyMode: defaultMode,
    proxyHost: "127.0.0.1",
    proxyPort: defaultPort,
    command: "",
    args: "",
    workingDir: "",
    note: defaultMode === "force-direct" ? "强行走本地网络直连" : "独立指定代理 (单进程生效)",
  };

  const title = $("#drawerTitle");
  const eyebrow = $("#drawerEyebrow");
  const drawerBody = $("#drawerBody");
  const drawer = $("#drawer");

  if (eyebrow) eyebrow.textContent = isEditing ? "Edit Profile" : "New Profile";
  if (title) title.textContent = isEditing ? `编辑软件配置 - ${currentProfile.name || currentProfile.id}` : "新增自定义软件 / CLI 独立配置";

  const isDirect = currentProfile.proxyMode === "force-direct" || currentProfile.proxyMode === "bypass-local";
  const isProcess = currentProfile.proxyMode === "process" || currentProfile.proxyMode === "dedicated-proxy";

  const formHtml = `
    <form id="profileModalForm" class="modal-form" data-modal-profile-id="${escapeHtml(currentProfile.id)}" data-is-editing="${isEditing}">
      <label>
        <span>软件 / CLI 名称</span>
        <input name="name" value="${escapeHtml(currentProfile.name)}" placeholder="例如 Agy / Codex / Cursor / 我的工具" required />
      </label>
      <label>
        <span>代理路由策略</span>
        <select name="proxyMode">
          <option value="process" ${isProcess ? "selected" : ""}>🚀 独立指定代理 (单进程注入代理)</option>
          <option value="force-direct" ${isDirect ? "selected" : ""}>⚡ 强行走本地直连 (绕过系统全局代理)</option>
          <option value="none" ${currentProfile.proxyMode === "none" ? "selected" : ""}>🌐 跟随系统全局环境</option>
        </select>
      </label>
      <label>
        <span>执行命令 / 可执行文件路径</span>
        <input name="command" value="${escapeHtml(currentProfile.command)}" placeholder="例如 agy / codex / cursor / D:\\app\\tool.exe" />
      </label>
      <div class="form-grid two" style="gap:12px;">
        <label>
          <span>代理主机</span>
          <input name="proxyHost" value="${escapeHtml(currentProfile.proxyHost || "127.0.0.1")}" placeholder="127.0.0.1" />
        </label>
        <label>
          <span>代理端口</span>
          <input name="proxyPort" type="number" min="1" max="65535" value="${escapeHtml(currentProfile.proxyPort || defaultPort)}" placeholder="7890" />
        </label>
      </div>
      <label>
        <span>运行参数 (可留空)</span>
        <input name="args" value="${escapeHtml(currentProfile.args)}" placeholder="例如 --model deepseek-chat" />
      </label>
      <label>
        <span>工作目录 (留空则使用当前目录)</span>
        <input name="workingDir" value="${escapeHtml(currentProfile.workingDir)}" placeholder="例如 D:\\Code\\Project" />
      </label>
      <label>
        <span>备注说明</span>
        <input name="note" value="${escapeHtml(currentProfile.note)}" placeholder="如：用于 OpenAI Codex CLI 强制走本地网络" />
      </label>
      <div class="modal-actions">
        <button type="button" class="button ghost" id="modalCancelBtn">取消</button>
        <button type="submit" class="button primary">💾 保存配置并更新脚本</button>
      </div>
    </form>
  `;

  if (drawerBody) drawerBody.innerHTML = formHtml;
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  const modalForm = $("#profileModalForm");
  if (modalForm) {
    $("#modalCancelBtn")?.addEventListener("click", closeDrawer);
    modalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(modalForm);
      const profileId = modalForm.dataset.modalProfileId;
      const isEdit = modalForm.dataset.isEditing === "true";

      const updated = {
        id: profileId,
        name: formData.get("name")?.trim() || profileId,
        kind: "software",
        proxyMode: formData.get("proxyMode") || "process",
        proxyHost: formData.get("proxyHost")?.trim() || "127.0.0.1",
        proxyPort: Number(formData.get("proxyPort") || defaultPort),
        command: formData.get("command")?.trim() || "",
        args: formData.get("args")?.trim() || "",
        workingDir: formData.get("workingDir")?.trim() || "",
        note: formData.get("note")?.trim() || "",
      };

      if (!state.config) state.config = {};
      state.config.profiles = state.config.profiles || [];

      if (isEdit) {
        const idx = state.config.profiles.findIndex((p) => p.id === profileId);
        if (idx !== -1) {
          state.config.profiles[idx] = updated;
        } else {
          state.config.profiles.push(updated);
        }
      } else {
        state.config.profiles.push(updated);
      }

      await saveConfig(false);
      closeDrawer();

      if (updated.command) {
        try {
          await generateTargets(["profile-script"], { profileId });
          toast(`配置已保存，已生成专属脚本并已就绪: ${updated.name}`);
        } catch (err) {
          toast(`配置已保存，但脚本生成失败: ${err.message}`, true);
        }
      } else {
        toast(`配置已保存: ${updated.name}`);
      }
    });
  }
}

function openProxySettingsModal() {
  const config = state?.config || {};
  const title = $("#drawerTitle");
  const eyebrow = $("#drawerEyebrow");
  const drawerBody = $("#drawerBody");
  const drawer = $("#drawer");

  if (eyebrow) eyebrow.textContent = "Global Proxy Settings";
  if (title) title.textContent = "代理端口与全局基础设置";

  const formHtml = `
    <form id="proxyModalForm" class="modal-form">
      <div class="form-grid two" style="gap:12px;">
        <label>
          <span>代理协议</span>
          <select name="proxyScheme">
            <option value="http" ${config.proxy?.scheme === "http" ? "selected" : ""}>http</option>
            <option value="https" ${config.proxy?.scheme === "https" ? "selected" : ""}>https</option>
          </select>
        </label>
        <label>
          <span>代理主机地址</span>
          <input name="proxyHost" value="${escapeHtml(config.proxy?.host || "127.0.0.1")}" placeholder="127.0.0.1" required />
        </label>
      </div>
      <div class="form-grid two" style="gap:12px;">
        <label>
          <span>代理端口 (例如 Clash/v2ray 端口)</span>
          <input name="proxyPort" type="number" min="1" max="65535" value="${escapeHtml(config.proxy?.port || 7890)}" required />
        </label>
        <label>
          <span>全局绕过地址列表 (逗号分隔)</span>
          <input name="bypassHosts" value="${escapeHtml((config.bypassHosts || []).join(","))}" placeholder="localhost,127.0.0.1,::1" />
        </label>
      </div>
      <p class="hint" style="line-height:1.6;color:#a8b0a2;">
        💡 此处设置的是本机的默认代理客户端端口与全局直连白名单（NO_PROXY）。
      </p>
      <div class="modal-actions">
        <button type="button" class="button ghost" id="proxyModalCancelBtn">取消</button>
        <button type="submit" class="button primary">💾 保存代理设置</button>
      </div>
    </form>
  `;

  if (drawerBody) drawerBody.innerHTML = formHtml;
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  const modalForm = $("#proxyModalForm");
  if (modalForm) {
    $("#proxyModalCancelBtn")?.addEventListener("click", closeDrawer);
    modalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(modalForm);
      if (!state.config) state.config = {};
      state.config.proxy = state.config.proxy || {};
      state.config.proxy.scheme = formData.get("proxyScheme") || "http";
      state.config.proxy.host = formData.get("proxyHost")?.trim() || "127.0.0.1";
      state.config.proxy.port = Number(formData.get("proxyPort") || 7890);
      state.config.bypassHosts = (formData.get("bypassHosts") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await saveConfig(false);
      closeDrawer();
      toast("代理端口与基础配置已保存！");
    });
  }
}

function openClaudeSettingsModal() {
  const config = state?.config || {};
  const title = $("#drawerTitle");
  const eyebrow = $("#drawerEyebrow");
  const drawerBody = $("#drawerBody");
  const drawer = $("#drawer");

  if (eyebrow) eyebrow.textContent = "Claude Integration Settings";
  if (title) title.textContent = "Claude 本地 API 网关设置";

  const formHtml = `
    <form id="claudeModalForm" class="modal-form">
      <label>
        <span>Claude settings.json 路径 (可选)</span>
        <input name="claudeSettingsPath" value="${escapeHtml(config.claude?.settingsPath || "%USERPROFILE%\\.claude\\settings.json")}" placeholder="%USERPROFILE%\\.claude\\settings.json (可选)" />
      </label>
      <div class="form-grid two" style="gap:12px;">
        <label>
          <span>本地 Base URL (可选)</span>
          <input name="claudeBaseUrl" value="${escapeHtml(state.claude?.baseUrl || config.claude?.baseUrl || "")}" placeholder="http://127.0.0.1:8787 (可选)" />
        </label>
        <label>
          <span>本地网关监听端口 (可选)</span>
          <input name="claudeLocalPort" type="number" min="1" max="65535" value="${escapeHtml(config.claude?.localProxyPort || 8787)}" placeholder="8787" />
        </label>
      </div>
      <div class="form-grid two" style="gap:12px;">
        <label>
          <span>TokenRhythm 上游服务地址 (可选)</span>
          <input name="claudeUpstream" value="${escapeHtml(config.claude?.upstream || "")}" placeholder="https://tokenrhythm.studio (可选)" />
        </label>
        <label>
          <span>默认模型 (可选)</span>
          <input name="claudeModel" value="${escapeHtml(state.claude?.model || "")}" placeholder="留空则不修改 (例如 glm-5.2)" />
        </label>
      </div>
      <label>
        <span>Auth Token (可选)</span>
        <input name="claudeAuthToken" type="password" placeholder="留空则不写入或不改动" />
      </label>
      <div class="modal-actions">
        <button type="button" class="button ghost" id="claudeModalCancelBtn">取消</button>
        <button type="button" class="button secondary" id="claudeWriteEnvBtn">写入 Claude 环境 (settings.json)</button>
        <button type="submit" class="button primary">💾 保存网关配置</button>
      </div>
    </form>
  `;

  if (drawerBody) drawerBody.innerHTML = formHtml;
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  const modalForm = $("#claudeModalForm");
  if (modalForm) {
    $("#claudeModalCancelBtn")?.addEventListener("click", closeDrawer);
    $("#claudeWriteEnvBtn")?.addEventListener("click", async () => {
      const formData = new FormData(modalForm);
      const payload = await api("/api/claude-env", {
        settingsPath: formData.get("claudeSettingsPath"),
        baseUrl: formData.get("claudeBaseUrl"),
        model: formData.get("claudeModel"),
        authToken: formData.get("claudeAuthToken"),
      });
      state = payload.state;
      render();
      toast("已成功将网关配置写入 Claude settings.json！");
    });

    modalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(modalForm);
      if (!state.config) state.config = {};
      state.config.claude = state.config.claude || {};
      state.config.claude.settingsPath = formData.get("claudeSettingsPath")?.trim() || "%USERPROFILE%\\.claude\\settings.json";
      state.config.claude.baseUrl = formData.get("claudeBaseUrl")?.trim() || "http://127.0.0.1:8787";
      state.config.claude.localProxyPort = Number(formData.get("claudeLocalPort") || 8787);
      state.config.claude.upstream = formData.get("claudeUpstream")?.trim() || "https://tokenrhythm.studio";

      await saveConfig(false);
      await generateTargets(["claude-gateway"]);
      closeDrawer();
      toast("Claude 网关配置已保存，代理文件与脚本已重新生成！");
    });
  }
}

function deleteProfile(id) {
  if (!state || !state.config) return;
  state.config.profiles = (state.config.profiles || []).filter((profile) => profile.id !== id);
  renderRoutingMatrix();
  saveConfig(false);
}

async function previewFile(key) {
  const payload = await api(`/api/file?key=${encodeURIComponent(key)}`);
  const title = $("#drawerTitle");
  const eyebrow = $("#drawerEyebrow");
  const drawerBody = $("#drawerBody");
  const drawer = $("#drawer");
  if (eyebrow) eyebrow.textContent = "File Preview";
  if (title) title.textContent = payload.path;
  if (drawerBody) {
    drawerBody.innerHTML = `<pre id="filePreview">${escapeHtml(payload.content)}</pre>`;
  }
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
}

async function showEnvDrawer() {
  const title = $("#drawerTitle");
  const eyebrow = $("#drawerEyebrow");
  const drawerBody = $("#drawerBody");
  const drawer = $("#drawer");
  if (eyebrow) eyebrow.textContent = "Environment Variables";
  if (title) title.textContent = "Windows 代理环境变量监控 (User / Process / Machine)";

  if (drawerBody) drawerBody.innerHTML = `<div style="padding:24px;text-align:center;color:#a8b0a2;">正在读取系统最新环境变量...</div>`;
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  try {
    const payload = await api("/api/state");
    state = payload.state;
    render();
  } catch (_e) {}

  if (!state || !state.env) return;

  const rows = state.env.map((row) => `
    <tr>
      <td class="mono var-name">${escapeHtml(row.name)}</td>
      <td class="mono ${row.user ? "" : "empty-val"}">${escapeHtml(row.user || "(未设置)")}</td>
      <td class="mono ${row.process ? "" : "empty-val"}">${escapeHtml(row.process || "(未设置)")}</td>
      <td class="mono ${row.machine ? "" : "empty-val"}">${escapeHtml(row.machine || "(未设置)")}</td>
    </tr>
  `).join("");

  const tableHtml = `
    <table class="env-table">
      <thead>
        <tr>
          <th>环境变量名称</th>
          <th>用户作用域 (User)</th>
          <th>当前后台进程 (Process)</th>
          <th>系统机器作用域 (Machine)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p class="hint" style="margin-top: 14px; line-height: 1.6; color: #a8b0a2;">
      💡 ScopeSwitch 开关全局代理时，修改的是 <strong>用户作用域 (User scope)</strong> 环境变量。<br/>
      修改后新打开的 CMD、PowerShell、Git 与 IDE 终端会自动继承最新代理设置。
    </p>
  `;
  if (drawerBody) drawerBody.innerHTML = tableHtml;
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

      case "open-proxy-settings":
        openProxySettingsModal();
        break;

      case "open-claude-settings":
        openClaudeSettingsModal();
        break;

      case "add-profile":
      case "addProfile":
      case "add-profile-proxy":
        openProfileModal(null, "process");
        break;

      case "add-profile-direct":
        openProfileModal(null, "force-direct");
        break;

      case "edit-profile": {
        const profileId = target.dataset.profileId;
        const profile = (state?.config?.profiles || []).find((p) => p.id === profileId);
        if (profile) {
          openProfileModal(profile);
        } else {
          toast("未找到该软件配置", true);
        }
        break;
      }

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

      case "file-page-prev": {
        if (filePage > 1) {
          filePage--;
          renderFiles();
        }
        break;
      }

      case "file-page-next": {
        const total = (state?.files || []).length;
        const totalPages = Math.ceil(total / filePageSize);
        if (filePage < totalPages) {
          filePage++;
          renderFiles();
        }
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

window.addEventListener("focus", () => {
  refresh();
});

// Periodic background refresh (keeps live matrix & ports in sync without manual reload)
setInterval(() => {
  if (document.visibilityState === "visible") {
    api("/api/state")
      .then((payload) => {
        state = payload.state;
        render();
      })
      .catch(() => {});
  }
}, 3000);

// Initial load
refresh();
