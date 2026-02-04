// @提及输入补全功能
class MentionAutocomplete {
  constructor() {
    this.suggestionsMenu = document.getElementById('mentionSuggestions');
    this.currentQuery = '';
    this.selectedIndex = 0;
    this.filteredConnections = [];
    this.isActive = false;
    this.mentionStartPos = -1;

    this.init();
  }

  init() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    // 监听输入事件
    messageInput.addEventListener('input', (e) => this.handleInput(e));
    messageInput.addEventListener('keydown', (e) => this.handleKeydown(e));

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
      if (this.suggestionsMenu && !this.suggestionsMenu.contains(e.target)) {
        this.hideSuggestions();
      }
    });
  }

  handleInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;

    // 查找光标前的 @ 符号
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') {
        // 检查 @ 前面是否是空格或行首
        if (i === 0 || /\s/.test(value[i - 1])) {
          atPos = i;
          break;
        }
      } else if (/\s/.test(value[i])) {
        // 遇到空格，停止查找
        break;
      }
    }

    if (atPos === -1) {
      this.hideSuggestions();
      return;
    }

    // 获取 @ 后面的查询文本
    const query = value.substring(atPos + 1, cursorPos);
    this.currentQuery = query.toLowerCase();
    this.mentionStartPos = atPos;

    // 过滤连接
    this.filterConnections();

    // 显示建议
    if (this.filteredConnections.length > 0) {
      this.showSuggestions(input);
    } else {
      this.hideSuggestions();
    }
  }

  filterConnections() {
    if (!window.connectionManager) {
      this.filteredConnections = [];
      return;
    }

    const allConnections = window.connectionManager.getAllConnections();

    this.filteredConnections = allConnections.filter(conn => {
      const name = conn.name.toLowerCase();
      return name.includes(this.currentQuery);
    });
  }

  showSuggestions(input) {
    if (!this.suggestionsMenu) return;

    // 计算菜单位置
    const rect = input.getBoundingClientRect();
    const lineHeight = 24; // 估计的行高
    const charWidth = 9; // 估计的字符宽度

    // 简单估算光标位置
    const textBeforeCursor = input.value.substring(0, input.selectionStart);
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    const topOffset = rect.top + (lines.length - 1) * lineHeight + 40;
    const leftOffset = rect.left + Math.min(currentLine.length * charWidth, rect.width - 200);

    this.suggestionsMenu.style.top = topOffset + 'px';
    this.suggestionsMenu.style.left = leftOffset + 'px';
    this.suggestionsMenu.style.display = 'block';

    // 渲染建议项
    this.selectedIndex = 0;
    this.renderSuggestions();

    this.isActive = true;
  }

  renderSuggestions() {
    if (!this.suggestionsMenu) return;

    this.suggestionsMenu.innerHTML = this.filteredConnections.map((conn, index) => {
      const state = window.connectionManager.connectionStates.get(conn.id);
      const status = state?.status || 'disconnected';

      return `
        <div class="mention-suggestion-item ${index === this.selectedIndex ? 'selected' : ''}" data-index="${index}">
          <span class="status ${status}"></span>
          <span class="conn-name">${this._escapeHtml(conn.name)}</span>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    this.suggestionsMenu.querySelectorAll('.mention-suggestion-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(item.dataset.index);
        this.selectConnection(index);
      });
    });
  }

  handleKeydown(e) {
    if (!this.isActive) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredConnections.length - 1);
        this.renderSuggestions();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.renderSuggestions();
        break;

      case 'Enter':
      case 'Tab':
        e.preventDefault();
        this.selectConnection(this.selectedIndex);
        break;

      case 'Escape':
        e.preventDefault();
        this.hideSuggestions();
        break;
    }
  }

  selectConnection(index) {
    const conn = this.filteredConnections[index];
    if (!conn) return;

    const input = document.getElementById('messageInput');
    if (!input) return;

    // 替换 @xxx 为 @name
    const beforeMention = input.value.substring(0, this.mentionStartPos);
    const afterCursor = input.value.substring(input.selectionStart);
    const newValue = beforeMention + '@' + conn.name + ' ' + afterCursor;

    input.value = newValue;

    // 设置光标位置
    const newCursorPos = this.mentionStartPos + conn.name.length + 2;
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.focus();

    this.hideSuggestions();
  }

  hideSuggestions() {
    if (this.suggestionsMenu) {
      this.suggestionsMenu.style.display = 'none';
    }
    this.isActive = false;
    this.selectedIndex = 0;
    this.filteredConnections = [];
    this.mentionStartPos = -1;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 导出到全局
window.MentionAutocomplete = MentionAutocomplete;
