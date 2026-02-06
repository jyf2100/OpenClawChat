const DEFAULTS = {
  gatewayUrl: "",
  token: "",
  sessionKey: "",
};

const SETTINGS_KEY = "openclaw.chat.settings.v1";

function generateUUID() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

// 导出到全局供 ConnectionManager 访问
window.state = state;
window.buildRenderedMessages = buildRenderedMessages;
window.setStatus = setStatus;

// WebSocket 相关
let ws = null;
let pending = new Map();

// DOM 元素
const elements = {
  status: document.getElementById('status'),
  statusText: document.getElementById('statusText'),
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

  if (connected) {
    elements.status.classList.add('connected');
    elements.sendBtn.classList.remove('disabled');
  } else {
    elements.status.classList.remove('connected');
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

// 连接 WebSocket（使用 ConnectionManager）
async function connectSocket() {
  if (!window.connectionManager.activeConnectionId) {
    setHint("没有活跃连接");
    return;
  }

  saveSettings();
  setHint("");
  setStatus(false, "连接中…");

  try {
    await window.connectionManager.connect(window.connectionManager.activeConnectionId);
    setStatus(true, "已连接");
    state.runId = null;
    state.streamText = null;
    state.streamStartedAt = null;

    // 从 ConnectionManager 加载消息
    const messages = window.connectionManager.getMessages(window.connectionManager.activeConnectionId);
    state.messages = messages;
    buildRenderedMessages();
    updateSecondaryLabel();

    // 更新连接列表状态
    UIManager.renderConnectionList();
  } catch (err) {
    setHint(String(err));
    setStatus(false, "连接失败");
    UIManager.renderConnectionList();
  }
}

// 断开连接（使用 ConnectionManager）
function disconnectSocket() {
  if (window.connectionManager.activeConnectionId) {
    window.connectionManager.disconnect(window.connectionManager.activeConnectionId);
  }
  setStatus(false, "未连接");
  updateSecondaryLabel();
  UIManager.renderConnectionList();
}

// 发送请求（通过 ConnectionManager）
function request(method, params) {
  return new Promise((resolve, reject) => {
    const activeId = window.connectionManager?.activeConnectionId;
    if (!activeId) {
      reject(new Error("没有活跃连接"));
      return;
    }

    const state = window.connectionManager.connectionStates.get(activeId);
    if (!state || !state.ws) {
      reject(new Error("网关未连接"));
      return;
    }

    const id = generateUUID();
    state.pending.set(id, { resolve, reject });
    state.ws.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

// 加载聊天历史（通过 ConnectionManager）
async function loadChatHistory() {
  const activeId = window.connectionManager?.activeConnectionId;
  if (!activeId) return;

  try {
    const conn = window.connectionManager.getConnection(activeId);
    const res = await request("chat.history", {
      sessionKey: conn.sessionKey,
      limit: 200,
    });
    state.messages = Array.isArray(res?.messages) ? res.messages : [];

    // 更新 ConnectionManager 的消息缓存
    window.connectionManager.messageCache.set(activeId, state.messages);
    Storage.saveMessages(activeId, state.messages);

    buildRenderedMessages();
  } catch (err) {
    setHint(String(err));
  }
}

// 处理发送
async function handleSend(overrideMessage, restoreDraft) {
  const draft = elements.messageInput.value || "";
  const message = (overrideMessage ?? draft).trim();
  const attachmentsToSend = overrideMessage == null ? state.attachments : [];
  const hasAttachments = attachmentsToSend.length > 0;
  if (!message && !hasAttachments) return;

  // 检查是否在房间模式
  const roomStatusBar = document.getElementById('roomStatusBar');
  const isInRoomMode = roomStatusBar && roomStatusBar.style.display === 'flex';

  console.log('[handleSend] roomStatusBar.display:', roomStatusBar?.style.display, 'isInRoomMode:', isInRoomMode);

  if (isInRoomMode) {
    // 房间模式：使用 handleRoomSend
    console.log('[handleSend] 房间模式 -> 调用 handleRoomSend');
    await handleRoomSend(message, attachmentsToSend);
    if (overrideMessage == null) {
      elements.messageInput.value = "";
      state.attachments = [];
      renderAttachments();
    }
    return;
  }

  // 普通模式：原有逻辑
  console.log('[handleSend] 普通模式 -> state.connected:', state.connected, 'isBusy():', isBusy());
  if (!state.connected) return;

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

// 处理房间消息发送
async function handleRoomSend(message, attachments) {
  const { cleanText, mentionedIds } = window.messageRouter.parseMentions(message);
  const messageToSend = cleanText || message;

  // 添加用户消息到房间
  const userMsg = window.roomManager.addMessage({
    senderId: 'user',
    senderName: '你',
    senderType: 'user',
    content: messageToSend,
    mentions: mentionedIds
  });

  // 渲染消息
  if (window.UIManager._renderRoomMessage) {
    window.UIManager._renderRoomMessage(userMsg);

    // 滚动到底部
    const chatThread = document.getElementById('chatThread');
    if (chatThread) {
      chatThread.scrollTop = chatThread.scrollHeight;
    }
  }

  // ========== 将 @ 提及的 AI 添加到参与者列表 ==========
  if (mentionedIds.length > 0 && window.roomManager) {
    mentionedIds.forEach(connId => {
      window.roomManager.addParticipant(connId);
    });
    console.log('[handleRoomSend] 已将 @ 提及的 AI 添加到参与者列表:', mentionedIds);

    // 更新 UI 显示
    if (window.UIManager._updateParticipantsDisplay) {
      window.UIManager._updateParticipantsDisplay();
    }
  }

  // 路由消息
  try {
    const aiEnabled = window.roomManager.aiInteractionEnabled;
    console.log('[handleRoomSend] AI 交互模式状态:', aiEnabled);

    const results = await window.messageRouter.routeMessage(messageToSend, {
      mentions: mentionedIds,
      forceReconnect: true,
      includeContext: aiEnabled
    });

    // 显示结果
    for (const result of results) {
      if (!result.success) {
        setHint(`"${result.connName}" 发送失败: ${result.error}`);
      }
    }

    // ========== 对话循环启动逻辑 ==========
    console.log('[handleRoomSend] 检查对话循环状态...');
    console.log('[handleRoomSend] - enabled:', window.roomManager.conversationLoop.enabled);
    console.log('[handleRoomSend] - isActive:', window.roomManager.conversationLoop.isActive);

    if (window.roomManager.conversationLoop.enabled &&
        !window.roomManager.conversationLoop.isActive) {
      // 确定参与者
      const participants = mentionedIds.length > 0
        ? mentionedIds
        : window.connectionManager.getParticipants().map(c => c.id);

      console.log('[handleRoomSend] 尝试启动对话循环，参与者:', participants);

      if (participants.length >= 2) {
        const started = window.roomManager.startConversationLoop(messageToSend, participants);
        if (started) {
          console.log('[handleRoomSend] 对话循环已启动');
          setHint('对话循环已启动，将在 AI 回复后自动继续');
          setTimeout(() => setHint(''), 3000);

          // 更新 UI 状态
          if (window.UIManager._updateLoopStatusUI) {
            window.UIManager._updateLoopStatusUI();
          }
        } else {
          console.log('[handleRoomSend] 对话循环启动失败');
          setHint('对话循环启动失败');
          setTimeout(() => setHint(''), 3000);
        }
      } else {
        console.log('[handleRoomSend] 参与者不足，需要至少 2 个 AI');
        setHint('对话循环需要至少 2 个 AI');
        setTimeout(() => setHint(''), 3000);
      }
    } else {
      console.log('[handleRoomSend] 跳过对话循环启动');
    }
  } catch (error) {
    setHint(`发送失败: ${error.message}`);
  }

  elements.messageInput.value = '';
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

// 发送聊天消息（通过 ConnectionManager）
async function sendChatMessage(message, attachments) {
  const activeId = window.connectionManager?.activeConnectionId;
  if (!activeId) {
    setHint("没有活跃连接");
    return false;
  }

  const conn = window.connectionManager.getConnection(activeId);
  if (!conn) {
    setHint("连接不存在");
    return false;
  }

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
      sessionKey: conn.sessionKey,
      message,
      deliver: false,
      idempotencyKey: state.runId,
      attachments: apiAttachments,
    });

    // 更新 ConnectionManager 的消息缓存
    window.connectionManager._addLocalMessage(activeId, localMessage);

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

    // 更新 ConnectionManager 的消息缓存
    window.connectionManager._addLocalMessage(activeId, errorMsg);

    buildRenderedMessages();
    return false;
  } finally {
    updateSecondaryLabel();
  }
}

// 中止聊天（通过 ConnectionManager）
async function abortChat() {
  const activeId = window.connectionManager?.activeConnectionId;
  if (!activeId || !state.connected) return;

  try {
    const conn = window.connectionManager.getConnection(activeId);
    await request("chat.abort", state.runId
      ? { sessionKey: conn.sessionKey, runId: state.runId }
      : { sessionKey: conn.sessionKey }
    );
  } catch (err) {
    setHint(String(err));
  }
}

// 处理聊天事件（通过 ConnectionManager）
function handleChatEvent(payload) {
  const activeId = window.connectionManager?.activeConnectionId;
  console.log('[handleChatEvent] 收到事件, activeId:', activeId, 'payload.state:', payload?.state);

  if (!activeId || !payload) return;

  const conn = window.connectionManager.getConnection(activeId);
  if (!conn) {
    console.log('[handleChatEvent] 连接不存在');
    return;
  }

  // sessionKey 验证：检查原始或动态 sessionKey
  let sessionKeyMatch = payload.sessionKey === conn.sessionKey;

  // 在房间模式下，也检查动态 sessionKey
  if (!sessionKeyMatch && window.roomManager) {
    const dynamicKey = window.roomManager.getDynamicSessionKey(activeId);
    if (dynamicKey && payload.sessionKey === dynamicKey) {
      sessionKeyMatch = true;
    }
  }

  if (!sessionKeyMatch) {
    console.log('[handleChatEvent] sessionKey 不匹配');
    return;
  }

  if (payload.state === "delta") {
    console.log('[handleChatEvent] delta 状态, 更新流式文本');
    const next = extractText(payload.message);
    const current = state.streamText || "";
    const updated = next.length >= current.length ? next : current;
    state.streamText = updated;
    buildRenderedMessages();
    return;
  }

  if (payload.state === "final") {
    console.log('[handleChatEvent] final 状态, 完成消息');
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
    console.log('[handleChatEvent] aborted/error 状态, 重置');
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
  console.log('[App] Initializing...');

  // 1. 检查并执行数据迁移
  if (window.DataMigration && window.DataMigration.needsMigration()) {
    console.log('[App] Running data migration...');
    window.DataMigration.migrate();
  }

  // 2. 初始化 SessionManager
  console.log('[App] Initializing SessionManager...');
  window.sessionManager = new SessionManager();
  window.sessionManager.init();

  // 3. 初始化连接管理器
  console.log('[App] Initializing ConnectionManager...');
  window.connectionManager = new ConnectionManager();
  window.connectionManager.init();

  // 将 ConnectionManager 实例注入到 SessionManager
  if (window.sessionManager && window.sessionManager.setConnectionManager) {
    window.sessionManager.setConnectionManager(window.connectionManager);
  }

  // 4. 初始化房间管理器（保留用于向后兼容）
  console.log('[App] Initializing RoomSession...');
  window.roomManager = new RoomSession({
    id: 'room-public',
    name: '公共聊天',
    roomId: 'room:public',
    normalizedRoomName: 'public',
    messages: [],
    settings: {}
  });
  window.roomManager.init();

  // 5. 初始化消息路由器
  console.log('[App] Initializing MessageRouter...');
  window.messageRouter = new MessageRouter(window.connectionManager);

  // 6. 初始化 @提及补全
  console.log('[App] Initializing MentionAutocomplete...');
  window.mentionAutocomplete = new MentionAutocomplete();

  // 设置聊天事件回调
  window.connectionManager.onChatEvent = (payload) => {
    handleChatEvent(payload);
  };

  // 7. 渲染会话列表（使用新的 SessionManager）
  console.log('[App] Rendering session list...');
  UIManager.renderSessionList();

  // 8. 初始化房间切换
  UIManager.initRoomSwitching();

  // ========== 绑定侧边栏按钮事件 ==========
  const addBtn = document.getElementById('addConnBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      UIManager.showAddConnectionModal();
    });
  }

  const addRoomBtn = document.getElementById('addRoomBtn');
  if (addRoomBtn) {
    addRoomBtn.addEventListener('click', () => {
      UIManager.showCreateRoomModal();
    });
  }

  // ========== 加载当前活跃连接的配置 ==========
  const activeConn = window.connectionManager.getConnection(window.connectionManager.activeConnectionId);
  if (activeConn) {
    state.gatewayUrl = activeConn.gatewayUrl;
    state.token = activeConn.token;
    state.sessionKey = activeConn.sessionKey;
    document.getElementById('currentConnTitle').textContent = activeConn.name;
  }

  // ========== 绑定事件 ==========
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
}

// 启动应用
init();

// 导出函数供 ConnectionManager 使用
window.state = state;
window.buildRenderedMessages = buildRenderedMessages;
window.setStatus = setStatus;
window.handleChatEvent = handleChatEvent;
