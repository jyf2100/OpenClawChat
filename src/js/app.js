const DEFAULTS = {
  gatewayUrl: "ws://47.252.93.109:18789",
  token: "5742f447a7cc1f38499bf38628d02d27",
  sessionKey: "agent:main:main",
};

const SETTINGS_KEY = "openclaw.chat.settings.v1";

function generateUUID() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(ts) {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function extractText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((item) => (item?.type === "text" && typeof item.text === "string" ? item.text : null))
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  if (typeof message?.text === "string") return message.text;
  return "";
}

function guessMime(path) {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

function extractImages(message) {
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  const images = [];
  for (const item of content) {
    if (item?.type !== "image") continue;
    const source = item?.source;
    if (!source) continue;
    if (typeof source.url === "string") {
      images.push(source.url);
      continue;
    }
    if (source.type === "base64" && typeof source.data === "string") {
      const mediaType = source.media_type || source.mediaType || "image/png";
      images.push(`data:${mediaType};base64,${source.data}`);
    }
  }
  return images;
}

function normalizeRole(message) {
  const role = typeof message?.role === "string" ? message.role : "assistant";
  const lower = role.toLowerCase();
  if (lower === "toolresult" || lower === "tool_result" || lower === "tool") return "tool";
  return lower === "user" ? "user" : "assistant";
}

function avatarLabel(role) {
  if (role === "user") return "你";
  if (role === "tool") return "工具";
  return "助手";
}

// Tauri storage compatibility layer
const wxCompat = {
  setStorageSync(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },
  getStorageSync(key) {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  },
  connectSocket(options) {
    return {
      onOpen: (callback) => { },
      onMessage: (callback) => { ws.addEventListener('message', callback); },
      onClose: (callback) => { ws.addEventListener('close', callback); },
      onError: (callback) => { ws.addEventListener('error', callback); },
      send: (data) => { ws.send(data.data); },
      close: () => { ws.close(); }
    };
  },
  chooseImage(options, callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = options.count > 1;
    input.onchange = (e) => {
      const files = Array.from(e.target.files);
      const tempFilePaths = files.map(f => URL.createObjectURL(f));
      callback.success({ tempFilePaths });
    };
    input.click();
  },
  getFileSystemManager() {
    return {
      readFileSync: (path, encoding) => {
        // 异步转同步的简化处理
        return new Promise((resolve, reject) => {
          fetch(path)
            .then(res => res.blob())
            .then(blob => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result.split(',')[1];
                resolve(result);
              };
              reader.readAsDataURL(blob);
            })
            .catch(reject);
        });
      }
    };
  }
};

// 替换全局 wx 对象
window.wx = wxCompat;

// 配置 marked.js 选项
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,        // 支持 GitHub 风格的换行
    gfm: true,           // 启用 GitHub 风格 Markdown
    headerIds: true,     // 为标题添加 ID
    mangle: false,       // 不混淆 email 地址
    highlight: function(code, lang) {
      // 代码高亮由 highlight.js 处理
      return code;
    }
  });
}

// 应用状态
let state = {
  gatewayUrl: DEFAULTS.gatewayUrl,
  token: DEFAULTS.token,
  sessionKey: DEFAULTS.sessionKey,
  connected: false,
  statusText: "未连接",
  hint: "",
  messages: [],
  streamText: null,
  streamStartedAt: null,
  runId: null,
  sending: false,
  queue: [],
  attachments: [],
};

// WebSocket 相关
let ws = null;
let pending = new Map();

// DOM 元素
const elements = {
  status: document.getElementById('status'),
  statusText: document.getElementById('statusText'),
  settingsBar: document.getElementById('settingsBar'),
  settingsStatus: document.getElementById('settingsStatus'),
  settingsArrow: document.getElementById('settingsArrow'),
  settingsPanel: document.getElementById('settingsPanel'),
  gatewayUrl: document.getElementById('gatewayUrl'),
  token: document.getElementById('token'),
  sessionKey: document.getElementById('sessionKey'),
  connectBtn: document.getElementById('connectBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  hint: document.getElementById('hint'),
  chatThread: document.getElementById('chatThread'),
  queue: document.getElementById('queue'),
  queueCount: document.getElementById('queueCount'),
  queueList: document.getElementById('queueList'),
  attachments: document.getElementById('attachments'),
  messageInput: document.getElementById('messageInput'),
  chooseImageBtn: document.getElementById('chooseImageBtn'),
  secondaryBtn: document.getElementById('secondaryBtn'),
  sendBtn: document.getElementById('sendBtn'),
};

// 保存设置
function saveSettings() {
  wxCompat.setStorageSync(SETTINGS_KEY, {
    gatewayUrl: state.gatewayUrl,
    token: state.token,
    sessionKey: state.sessionKey,
  });
}

// 设置提示
function setHint(text) {
  state.hint = text || "";
  elements.hint.textContent = text || "";
  elements.hint.style.display = text ? "block" : "none";
}

// 设置状态
function setStatus(connected, text) {
  state.connected = connected;
  state.statusText = text;
  elements.statusText.textContent = text;
  elements.connectBtn.textContent = connected ? "断开" : "连接";

  if (connected) {
    elements.status.classList.add('connected');
    elements.settingsStatus.style.display = "inline";
    elements.refreshBtn.disabled = false;
    elements.sendBtn.classList.remove('disabled');
  } else {
    elements.status.classList.remove('connected');
    elements.settingsStatus.style.display = "none";
    elements.refreshBtn.disabled = true;
    elements.sendBtn.classList.add('disabled');
  }
}

// 更新次要按钮标签
function updateSecondaryLabel() {
  elements.secondaryBtn.textContent = state.runId ? "停止" : "新会话";
}

// 构建渲染消息
function buildRenderedMessages() {
  elements.chatThread.innerHTML = '';

  for (const msg of state.messages) {
    const role = normalizeRole(msg);
    const text = extractText(msg);
    const images = extractImages(msg);
    renderMessage({
      id: msg.id || generateUUID(),
      domId: msg.domId || `msg-${generateUUID()}`,
      role,
      avatar: avatarLabel(role),
      text: text || "",
      images,
      time: formatTime(msg.timestamp || Date.now()),
      streaming: false,
      loading: false,
    });
  }

  // 渲染流式消息
  if (state.streamText !== null) {
    const text = state.streamText || "";
    const loading = text.trim() === "";
    renderMessage({
      id: `stream-${state.streamStartedAt || Date.now()}`,
      domId: `stream-${state.streamStartedAt || Date.now()}`,
      role: "assistant",
      avatar: "AI",
      text,
      images: [],
      time: formatTime(state.streamStartedAt || Date.now()),
      streaming: true,
      loading,
    });
  }

  // 滚动到底部
  elements.chatThread.scrollTop = elements.chatThread.scrollHeight;
}

// 渲染单条消息
function renderMessage(msg) {
  const line = document.createElement('div');
  line.id = msg.domId;
  line.className = `chat-line ${msg.role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = msg.avatar;

  const content = document.createElement('div');
  content.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = `bubble ${msg.streaming ? 'streaming' : ''}`;

  // 对 assistant 和 tool 角色的消息进行 Markdown 渲染
  if (msg.role === 'assistant' || msg.role === 'tool') {
    const textDiv = document.createElement('div');
    textDiv.className = 'text markdown-content';

    if (msg.text) {
      // 使用 marked.js 解析 Markdown
      const html = marked.parse(msg.text);
      textDiv.innerHTML = html;

      // 对代码块进行语法高亮
      textDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
    bubble.appendChild(textDiv);
  } else {
    // 用户消息保持纯文本
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = msg.text;
    bubble.appendChild(text);
  }

  if (msg.loading) {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.innerHTML = '<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    bubble.appendChild(loading);
  }

  if (msg.images.length > 0) {
    const imagesDiv = document.createElement('div');
    imagesDiv.className = 'images';
    msg.images.forEach(imgUrl => {
      const img = document.createElement('img');
      img.src = imgUrl;
      imagesDiv.appendChild(img);
    });
    bubble.appendChild(imagesDiv);
  }

  content.appendChild(bubble);

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = msg.time;
  content.appendChild(meta);

  line.appendChild(avatar);
  line.appendChild(content);
  elements.chatThread.appendChild(line);
}

// 渲染队列
function renderQueue() {
  elements.queueCount.textContent = state.queue.length;
  elements.queue.style.display = state.queue.length > 0 ? "block" : "none";

  elements.queueList.innerHTML = '';
  state.queue.forEach(item => {
    const queueItem = document.createElement('div');
    queueItem.className = 'queue-item';

    const queueText = document.createElement('span');
    queueText.className = 'queue-text';
    queueText.textContent = item.text;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-mini';
    removeBtn.textContent = '移除';
    removeBtn.onclick = () => removeQueued(item.id);

    queueItem.appendChild(queueText);
    queueItem.appendChild(removeBtn);
    elements.queueList.appendChild(queueItem);
  });
}

// 渲染附件
function renderAttachments() {
  elements.attachments.innerHTML = '';
  state.attachments.forEach(att => {
    const attachment = document.createElement('div');
    attachment.className = 'attachment';

    const img = document.createElement('img');
    img.src = att.preview;
    attachment.appendChild(img);

    const remove = document.createElement('div');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.onclick = () => removeAttachment(att.id);
    attachment.appendChild(remove);

    elements.attachments.appendChild(attachment);
  });
}

// 连接 WebSocket
function connectSocket() {
  saveSettings();
  setHint("");
  setStatus(false, "连接中…");

  disconnectSocket();

  state.pending = new Map();
  ws = new WebSocket(state.gatewayUrl);

  ws.onopen = () => {
    // 等待 connect.challenge
  };

  ws.onmessage = (event) => {
    let parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }

    if (parsed.type === "event") {
      if (parsed.event === "connect.challenge") {
        state.connectNonce = parsed?.payload?.nonce || null;
        send连接();
        return;
      }
      if (parsed.event === "chat") {
        handleChatEvent(parsed.payload);
      }
      return;
    }

    if (parsed.type === "res") {
      const pendingReq = pending.get(parsed.id);
      if (!pendingReq) return;
      pending.delete(parsed.id);
      if (parsed.ok) pendingReq.resolve(parsed.payload);
      else pendingReq.reject(new Error(parsed.error?.message || "请求失败"));
    }
  };

  ws.onclose = () => {
    setStatus(false, "未连接");
    updateSecondaryLabel();
  };

  ws.onerror = (err) => {
    setHint(`Socket 错误: ${JSON.stringify(err)}`);
  };
}

// 断开连接
function disconnectSocket() {
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  ws = null;
  pending = new Map();
  setStatus(false, "未连接");
  updateSecondaryLabel();
}

// 发送请求
function request(method, params) {
  return new Promise((resolve, reject) => {
    if (!ws) {
      reject(new Error("网关未连接"));
      return;
    }
    const id = generateUUID();
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

// 发送连接请求
async function send连接() {
  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "webchat",
      version: "desktop-1",
      platform: "desktop",
      mode: "webchat",
    },
    role: "operator",
    scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
    auth: state.token ? { token: state.token } : undefined,
    userAgent: "desktop",
    locale: "zh-CN",
  };

  try {
    await request("connect", params);
    setStatus(true, "已连接");
    state.runId = null;
    state.streamText = null;
    state.streamStartedAt = null;
    await loadChatHistory();
    updateSecondaryLabel();
  } catch (err) {
    setHint(String(err));
    disconnectSocket();
  }
}

// 加载聊天历史
async function loadChatHistory() {
  if (!state.connected) return;
  try {
    const res = await request("chat.history", {
      sessionKey: state.sessionKey,
      limit: 200,
    });
    state.messages = Array.isArray(res?.messages) ? res.messages : [];
    buildRenderedMessages();
  } catch (err) {
    setHint(String(err));
  }
}

// 处理发送
async function handleSend(overrideMessage, restoreDraft) {
  if (!state.connected) return;
  const draft = elements.messageInput.value || "";
  const message = (overrideMessage ?? draft).trim();
  const attachmentsToSend = overrideMessage == null ? state.attachments : [];
  const hasAttachments = attachmentsToSend.length > 0;
  if (!message && !hasAttachments) return;

  if (isBusy()) {
    enqueueMessage(message, attachmentsToSend);
    return;
  }

  if (overrideMessage == null) {
    elements.messageInput.value = "";
    state.attachments = [];
    renderAttachments();
  }

  const ok = await sendChatMessage(message, attachmentsToSend);
  if (!ok && overrideMessage == null) {
    elements.messageInput.value = draft;
  }
  if (ok && restoreDraft && draft.trim()) {
    elements.messageInput.value = draft;
  }
  if (ok && !state.runId) {
    flushQueue();
  }
}

// 入队
function enqueueMessage(text, attachments) {
  const trimmed = text.trim();
  if (!trimmed && (!attachments || attachments.length === 0)) return;
  const displayText = trimmed || (attachments && attachments.length ? `Image (${attachments.length})` : "");
  state.queue.push({
    id: generateUUID(),
    text: displayText,
    attachments,
  });
  renderQueue();
}

// 出队
async function flushQueue() {
  if (!state.connected || isBusy()) return;
  const [next, ...rest] = state.queue;
  if (!next) return;
  state.queue = rest;
  renderQueue();
  const ok = await sendChatMessage(next.text, next.attachments);
  if (!ok) {
    state.queue = [next, ...state.queue];
    renderQueue();
  }
}

// 检查是否忙碌
function isBusy() {
  return state.sending || Boolean(state.runId);
}

// 发送聊天消息
async function sendChatMessage(message, attachments) {
  const now = Date.now();
  const contentBlocks = [];
  if (message) contentBlocks.push({ type: "text", text: message });
  if (attachments && attachments.length) {
    for (const att of attachments) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.base64 },
      });
    }
  }

  const localMessage = {
    id: generateUUID(),
    role: "user",
    content: contentBlocks,
    timestamp: now,
  };

  state.messages = state.messages.concat(localMessage);
  state.sending = true;
  state.runId = generateUUID();
  state.streamText = "";
  state.streamStartedAt = now;
  buildRenderedMessages();
  updateSecondaryLabel();

  const apiAttachments = attachments && attachments.length
    ? attachments.map((att) => ({
        type: "image",
        mimeType: att.mimeType,
        content: att.base64,
      }))
    : undefined;

  try {
    await request("chat.send", {
      sessionKey: state.sessionKey,
      message,
      deliver: false,
      idempotencyKey: state.runId,
      attachments: apiAttachments,
    });
    state.sending = false;
    return true;
  } catch (err) {
    const errorMessage = String(err);
    const errorMsg = {
      id: generateUUID(),
      role: "assistant",
      content: [{ type: "text", text: `错误： ${errorMessage}` }],
      timestamp: Date.now(),
    };
    state.sending = false;
    state.runId = null;
    state.streamText = null;
    state.streamStartedAt = null;
    state.messages = state.messages.concat(errorMsg);
    buildRenderedMessages();
    return false;
  } finally {
    updateSecondaryLabel();
  }
}

// 中止聊天
async function abortChat() {
  if (!state.connected) return;
  try {
    await request("chat.abort", state.runId
      ? { sessionKey: state.sessionKey, runId: state.runId }
      : { sessionKey: state.sessionKey }
    );
  } catch (err) {
    setHint(String(err));
  }
}

// 处理聊天事件
function handleChatEvent(payload) {
  if (!payload || payload.sessionKey !== state.sessionKey) return;

  if (payload.state === "delta") {
    const next = extractText(payload.message);
    const current = state.streamText || "";
    const updated = next.length >= current.length ? next : current;
    state.streamText = updated;
    buildRenderedMessages();
    return;
  }

  if (payload.state === "final") {
    state.streamText = null;
    state.runId = null;
    state.streamStartedAt = null;
    buildRenderedMessages();
    loadChatHistory();
    flushQueue();
    updateSecondaryLabel();
    return;
  }

  if (payload.state === "aborted" || payload.state === "error") {
    state.streamText = null;
    state.runId = null;
    state.streamStartedAt = null;
    buildRenderedMessages();
    flushQueue();
    updateSecondaryLabel();
  }
}

// 移除队列项
function removeQueued(id) {
  state.queue = state.queue.filter((item) => item.id !== id);
  renderQueue();
}

// 移除附件
function removeAttachment(id) {
  state.attachments = state.attachments.filter((item) => item.id !== id);
  renderAttachments();
}

// 选择图片
function chooseImage() {
  wxCompat.chooseImage({
    count: 4,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const paths = res.tempFilePaths || [];
      for (const path of paths) {
        try {
          const base64 = await wxCompat.getFileSystemManager().readFileSync(path, "base64");
          state.attachments.push({
            id: generateUUID(),
            preview: path,
            mimeType: guessMime(path),
            base64,
          });
        } catch (err) {
          setHint(`读取图片失败: ${String(err)}`);
        }
      }
      renderAttachments();
    },
  });
}

// 初始化
function init() {
  // 加载设置
  const settings = wxCompat.getStorageSync(SETTINGS_KEY);
  if (settings) {
    state.gatewayUrl = settings.gatewayUrl || DEFAULTS.gatewayUrl;
    state.token = settings.token || DEFAULTS.token;
    state.sessionKey = settings.sessionKey || DEFAULTS.sessionKey;
  }

  // 设置输入框值
  elements.gatewayUrl.value = state.gatewayUrl;
  elements.token.value = state.token;
  elements.sessionKey.value = state.sessionKey;

  // 绑定事件
  elements.settingsBar.addEventListener('click', () => {
    const expanded = elements.settingsPanel.style.display !== "none";
    elements.settingsPanel.style.display = expanded ? "none" : "block";
    elements.settingsArrow.classList.toggle('expanded', !expanded);
  });

  elements.gatewayUrl.addEventListener('input', (e) => {
    state.gatewayUrl = e.target.value;
  });

  elements.token.addEventListener('input', (e) => {
    state.token = e.target.value;
  });

  elements.sessionKey.addEventListener('input', (e) => {
    state.sessionKey = e.target.value;
  });

  elements.connectBtn.addEventListener('click', () => {
    if (state.connected) {
      disconnectSocket();
    } else {
      connectSocket();
    }
  });

  elements.refreshBtn.addEventListener('click', () => {
    if (!state.connected) return;
    loadChatHistory();
  });

  elements.secondaryBtn.addEventListener('click', () => {
    if (state.runId) {
      abortChat();
    } else {
      handleSend("/new", true);
    }
  });

  elements.sendBtn.addEventListener('click', () => {
    handleSend();
  });

  elements.chooseImageBtn.addEventListener('click', () => {
    chooseImage();
  });

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // 保存初始设置
  saveSettings();
}

// 启动应用
init();
