const DEFAULTS = {
  gatewayUrl: "ws://127.0.0.1:18789",
  token: "XXXXXXXXX",
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

Page({
  data: {
    gatewayUrl: DEFAULTS.gatewayUrl,
    token: DEFAULTS.token,
    sessionKey: DEFAULTS.sessionKey,
    connected: false,
    statusText: "未连接",
    hint: "",
    connectLabel: "连接",
    secondaryLabel: "新会话",
    messageDraft: "",
    messages: [],
    renderedMessages: [],
    streamText: null,
    streamStartedAt: null,
    runId: null,
    sending: false,
    queue: [],
    attachments: [],
    scrollIntoView: "",
    settingsExpanded: false,
  },

  onLoad() {
    this.setData({
      gatewayUrl: DEFAULTS.gatewayUrl,
      token: DEFAULTS.token,
      sessionKey: DEFAULTS.sessionKey,
    });
    this.saveSettings();
  },

  onUnload() {
    this.disconnectSocket();
  },

  saveSettings() {
    wx.setStorageSync(SETTINGS_KEY, {
      gatewayUrl: this.data.gatewayUrl,
      token: this.data.token,
      sessionKey: this.data.sessionKey,
    });
  },

  setHint(text) {
    this.setData({ hint: text || "" });
  },

  setStatus(connected, text) {
    this.setData({
      connected,
      statusText: text,
      connectLabel: connected ? "断开" : "连接",
    });
  },

  updateSecondaryLabel() {
    this.setData({ secondaryLabel: this.data.runId ? "停止" : "新会话" });
  },

  buildRenderedMessages() {
    const items = [];
    for (const msg of this.data.messages) {
      const role = normalizeRole(msg);
      const text = extractText(msg);
      const images = extractImages(msg);
      items.push({
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

    if (this.data.streamText !== null) {
      const text = this.data.streamText || "";
      const loading = text.trim() === "";
      items.push({
        id: `stream-${this.data.streamStartedAt || Date.now()}`,
        domId: `stream-${this.data.streamStartedAt || Date.now()}`,
        role: "assistant",
        avatar: "AI",
        text,
        images: [],
        time: formatTime(this.data.streamStartedAt || Date.now()),
        streaming: true,
        loading,
      });
    }

    const last = items[items.length - 1];
    this.setData({
      renderedMessages: items,
      scrollIntoView: last ? last.domId : "",
    });
  },

  onGatewayInput(e) {
    this.setData({ gatewayUrl: e.detail.value });
  },

  onTokenInput(e) {
    this.setData({ token: e.detail.value });
  },

  onSessionInput(e) {
    this.setData({ sessionKey: e.detail.value });
  },

  onMessageInput(e) {
    this.setData({ messageDraft: e.detail.value });
  },

  toggleSettings() {
    this.setData({ settingsExpanded: !this.data.settingsExpanded });
  },

  on连接() {
    if (this.data.connected) {
      this.disconnectSocket();
      return;
    }
    this.connectSocket();
  },

  onRefresh() {
    if (!this.data.connected) return;
    this.loadChatHistory();
  },

  onSecondary() {
    if (this.data.runId) {
      this.abortChat();
      return;
    }
    this.handleSend("/new", true);
  },

  onSend() {
    this.handleSend();
  },

  onRemoveQueued(e) {
    const id = e.currentTarget.dataset.id;
    const next = this.data.queue.filter((item) => item.id !== id);
    this.setData({ queue: next });
  },

  onChooseImage() {
    wx.chooseImage({
      count: 4,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const paths = res.tempFilePaths || [];
        const manager = wx.getFileSystemManager();
        const attachments = [...this.data.attachments];
        for (const path of paths) {
          try {
            const base64 = manager.readFileSync(path, "base64");
            attachments.push({
              id: generateUUID(),
              preview: path,
              mimeType: guessMime(path),
              base64,
            });
          } catch (err) {
            this.setHint(`读取图片失败: ${String(err)}`);
          }
        }
        this.setData({ attachments });
      },
    });
  },

  onRemoveAttachment(e) {
    const id = e.currentTarget.dataset.id;
    const next = this.data.attachments.filter((item) => item.id !== id);
    this.setData({ attachments: next });
  },

  connectSocket() {
    this.saveSettings();
    this.setHint("");
    this.setStatus(false, "连接中…");

    this.disconnectSocket();

    this.pending = new Map();
    this.socketTask = wx.connectSocket({
      url: this.data.gatewayUrl,
    });

    this.socketTask.onOpen(() => {
      // wait for connect.challenge
    });

    this.socketTask.onMessage((res) => {
      let parsed;
      try {
        parsed = JSON.parse(res.data);
      } catch {
        return;
      }
      if (parsed.type === "event") {
        if (parsed.event === "connect.challenge") {
          this.connectNonce = parsed?.payload?.nonce || null;
          this.send连接();
          return;
        }
        if (parsed.event === "chat") {
          this.handleChatEvent(parsed.payload);
        }
        return;
      }
      if (parsed.type === "res") {
        const pending = this.pending.get(parsed.id);
        if (!pending) return;
        this.pending.delete(parsed.id);
        if (parsed.ok) pending.resolve(parsed.payload);
        else pending.reject(new Error(parsed.error?.message || "请求失败"));
      }
    });

    this.socketTask.onClose(() => {
      this.setStatus(false, "未连接");
      this.updateSecondaryLabel();
    });

    this.socketTask.onError((err) => {
      this.setHint(`Socket 错误: ${JSON.stringify(err)}`);
    });
  },

  disconnectSocket() {
    if (this.socketTask) {
      try {
        this.socketTask.close();
      } catch {
        // ignore
      }
    }
    this.socketTask = null;
    this.pending = new Map();
    this.setStatus(false, "未连接");
    this.updateSecondaryLabel();
  },

  request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.socketTask) {
        reject(new Error("网关未连接"));
        return;
      }
      const id = generateUUID();
      this.pending.set(id, { resolve, reject });
      this.socketTask.send({ data: JSON.stringify({ type: "req", id, method, params }) });
    });
  },

  async send连接() {
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "webchat",
        version: "mini-1",
        platform: "miniprogram",
        mode: "webchat",
      },
      role: "operator",
      scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
      auth: this.data.token ? { token: this.data.token } : undefined,
      userAgent: "miniprogram",
      locale: "zh-CN",
    };

    try {
      await this.request("connect", params);
      this.setStatus(true, "已连接");
      this.setData({ runId: null, streamText: null, streamStartedAt: null });
      this.loadChatHistory();
      this.updateSecondaryLabel();
    } catch (err) {
      this.setHint(String(err));
      this.disconnectSocket();
    }
  },

  async loadChatHistory() {
    if (!this.data.connected) return;
    try {
      const res = await this.request("chat.history", {
        sessionKey: this.data.sessionKey,
        limit: 200,
      });
      const messages = Array.isArray(res?.messages) ? res.messages : [];
      this.setData({ messages }, () => this.buildRenderedMessages());
    } catch (err) {
      this.setHint(String(err));
    }
  },

  async handleSend(overrideMessage, restoreDraft) {
    if (!this.data.connected) return;
    const draft = this.data.messageDraft || "";
    const message = (overrideMessage ?? draft).trim();
    const attachmentsToSend = overrideMessage == null ? this.data.attachments : [];
    const hasAttachments = attachmentsToSend.length > 0;
    if (!message && !hasAttachments) return;

    if (this.isBusy()) {
      this.enqueueMessage(message, attachmentsToSend);
      return;
    }

    if (overrideMessage == null) {
      this.setData({ messageDraft: "", attachments: [] });
    }

    const ok = await this.sendChatMessage(message, attachmentsToSend);
    if (!ok && overrideMessage == null) {
      this.setData({ messageDraft: draft });
    }
    if (ok && restoreDraft && draft.trim()) {
      this.setData({ messageDraft: draft });
    }
    if (ok && !this.data.runId) {
      this.flushQueue();
    }
  },

  enqueueMessage(text, attachments) {
    const trimmed = text.trim();
    if (!trimmed && (!attachments || attachments.length === 0)) return;
    const displayText = trimmed || (attachments && attachments.length ? `Image (${attachments.length})` : "");
    const next = this.data.queue.concat({
      id: generateUUID(),
      text: displayText,
      attachments,
    });
    this.setData({ queue: next });
  },

  async flushQueue() {
    if (!this.data.connected || this.isBusy()) return;
    const [next, ...rest] = this.data.queue;
    if (!next) return;
    this.setData({ queue: rest });
    const ok = await this.sendChatMessage(next.text, next.attachments);
    if (!ok) {
      this.setData({ queue: [next, ...this.data.queue] });
    }
  },

  isBusy() {
    return this.data.sending || Boolean(this.data.runId);
  },

  async sendChatMessage(message, attachments) {
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

    const messages = this.data.messages.concat(localMessage);
    this.setData({
      messages,
      sending: true,
      runId: generateUUID(),
      streamText: "",
      streamStartedAt: now,
    }, () => this.buildRenderedMessages());
    this.updateSecondaryLabel();

    const apiAttachments = attachments && attachments.length
      ? attachments.map((att) => ({
          type: "image",
          mimeType: att.mimeType,
          content: att.base64,
        }))
      : undefined;

    try {
      await this.request("chat.send", {
        sessionKey: this.data.sessionKey,
        message,
        deliver: false,
        idempotencyKey: this.data.runId,
        attachments: apiAttachments,
      });
      this.setData({ sending: false });
      return true;
    } catch (err) {
      const errorMessage = String(err);
      const errorMsg = {
        id: generateUUID(),
        role: "assistant",
        content: [{ type: "text", text: `错误： ${errorMessage}` }],
        timestamp: Date.now(),
      };
      this.setData({
        sending: false,
        runId: null,
        streamText: null,
        streamStartedAt: null,
        messages: this.data.messages.concat(errorMsg),
      }, () => this.buildRenderedMessages());
      return false;
    } finally {
      this.updateSecondaryLabel();
    }
  },

  async abortChat() {
    if (!this.data.connected) return;
    try {
      await this.request("chat.abort", this.data.runId
        ? { sessionKey: this.data.sessionKey, runId: this.data.runId }
        : { sessionKey: this.data.sessionKey }
      );
    } catch (err) {
      this.setHint(String(err));
    }
  },

  handleChatEvent(payload) {
    if (!payload || payload.sessionKey !== this.data.sessionKey) return;

    if (payload.state === "delta") {
      const next = extractText(payload.message);
      const current = this.data.streamText || "";
      const updated = next.length >= current.length ? next : current;
      this.setData({ streamText: updated }, () => this.buildRenderedMessages());
      return;
    }

    if (payload.state === "final") {
      this.setData({ streamText: null, runId: null, streamStartedAt: null }, () => {
        this.buildRenderedMessages();
        this.loadChatHistory();
      });
      this.flushQueue();
      this.updateSecondaryLabel();
      return;
    }

    if (payload.state === "aborted" || payload.state === "error") {
      this.setData({ streamText: null, runId: null, streamStartedAt: null }, () => {
        this.buildRenderedMessages();
      });
      this.flushQueue();
      this.updateSecondaryLabel();
    }
  },
});
