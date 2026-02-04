// 工具函数

// 格式化时间戳为 HH:MM 格式
function formatTime(ts) {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 从消息对象中提取文本内容
function extractText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    const toolCalls = [];

    // 遍历所有内容块
    for (const item of content) {
      // 提取文本内容
      if (item?.type === "text" && typeof item.text === "string") {
        parts.push(item.text);
      }
      // 提取工具调用信息
      if (item?.type === "tool_use" || item?.type === "toolCall") {
        toolCalls.push({
          name: item.name || item.id || 'tool',
          input: item.input || item.arguments || {},
        });
      }
      // 提取工具结果
      if (item?.type === "tool_result" || item?.type === "toolResult") {
        const toolName = item.name || item.tool_use_id || 'tool';
        let resultText = '';

        if (typeof item.content === "string") {
          resultText = item.content;
        } else if (Array.isArray(item.content)) {
          resultText = item.content
            .map(c => c?.type === 'text' ? c.text : '')
            .filter(Boolean)
            .join('\n');
        } else if (item.content) {
          resultText = JSON.stringify(item.content, null, 2);
        }

        parts.push(`**工具:** \`${toolName}\`\n${resultText}`);
      }
    }

    let result = parts.join("\n");

    // 如果有工具调用，添加到结果前
    if (toolCalls.length > 0) {
      const toolInfo = toolCalls.map(tc => {
        const args = JSON.stringify(tc.input, null, 2);
        return `**调用工具:** \`${tc.name}\`\n\`\`\`json\n${args}\n\`\`\``;
      }).join('\n\n');
      result = toolInfo + '\n\n' + result;
    }

    return result || parts.join("\n");
  }
  if (typeof message?.text === "string") return message.text;
  return "";
}

// 导出到全局
window.formatTime = formatTime;
window.extractText = extractText;
