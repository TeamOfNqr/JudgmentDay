(function () {
  "use strict";

  // ---------- 视图切换（对话 / 设置）：顶部按钮在「设置」与「返回对话」间切换 ----------
  var navToggleBtn = document.getElementById("nav-toggle-btn");
  var chatViewPage = document.getElementById("chat-view-page");
  var settingsViewPage = document.getElementById("settings-view-page");

  function showChatView() {
    if (chatViewPage) chatViewPage.classList.add("active");
    if (settingsViewPage) settingsViewPage.classList.remove("active");
    if (navToggleBtn) navToggleBtn.textContent = "设置";
  }

  function showSettingsView() {
    if (settingsViewPage) settingsViewPage.classList.add("active");
    if (chatViewPage) chatViewPage.classList.remove("active");
    if (navToggleBtn) navToggleBtn.textContent = "返回对话";
    loadSettings();
  }

  if (navToggleBtn) {
    navToggleBtn.addEventListener("click", function () {
      if (settingsViewPage && settingsViewPage.classList.contains("active")) {
        showChatView();
      } else {
        showSettingsView();
      }
    });
  }

  // ---------- 左侧栏收缩（整列收起，右侧大对话栏变宽） ----------
  var leftColumn = document.getElementById("left-column");
  var toggleBtn = document.getElementById("sidebar-toggle");
  var expandBtn = document.getElementById("expand-sidebar-btn");
  function syncCollapsedBodyClass() {
    document.body.classList.toggle("left-column-collapsed", leftColumn && leftColumn.classList.contains("collapsed"));
  }
  if (leftColumn && toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      leftColumn.classList.toggle("collapsed");
      syncCollapsedBodyClass();
    });
  }
  if (leftColumn && expandBtn) {
    expandBtn.addEventListener("click", function () {
      leftColumn.classList.remove("collapsed");
      syncCollapsedBodyClass();
    });
  }
  syncCollapsedBodyClass();

  // ---------- 新对话：进入空白页，不创建会话；发送首条消息时由后端创建并返回 CONV_ID，再跳转 ----------
  var newChatBtn = document.getElementById("new-chat-btn");
  if (newChatBtn) {
    newChatBtn.addEventListener("click", function () {
      window.location.href = "/chat?new=1";
    });
  }

  // ---------- 对话列表：点击标题跳转；点击删除按钮删除该会话 ----------
  var currentConversationId = document.querySelector("input[name=conversation_id]");
  currentConversationId = currentConversationId ? currentConversationId.value : null;

  document.querySelectorAll(".conversation-item-wrap").forEach(function (wrap) {
    var id = wrap.getAttribute("data-conversation-id");
    var titleBtn = wrap.querySelector(".conversation-item");
    var delBtn = wrap.querySelector(".conversation-delete-btn");
    if (titleBtn && id) {
      titleBtn.addEventListener("click", function () {
        window.location.href = "/chat?conversation_id=" + encodeURIComponent(id);
      });
    }
    if (delBtn && id) {
      delBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        fetch("/api/chat/conversations/" + encodeURIComponent(id), { method: "DELETE" })
          .then(function (r) {
            if (!r.ok) return Promise.reject(new Error("删除失败"));
            if (currentConversationId === id) {
              window.location.href = "/chat";
            } else {
              wrap.remove();
            }
          })
          .catch(function (err) {
            console.error(err);
            alert("删除失败，请重试。");
          });
      });
    }
  });

  // ---------- 对话输入与流式输出 ----------
  var chatForm = document.getElementById("chat-form");
  var chatInput = document.getElementById("chat-input");
  var chatMessages = document.getElementById("chat-messages");
  var uploadList = document.getElementById("upload-list");
  var sendStopBtn = document.getElementById("send-stop-btn");
  var welcomeBlock = document.getElementById("welcome-block");

  var droppedFiles = [];

  function updateDroppedHint() {
    if (uploadList) uploadList.textContent = droppedFiles.length ? "已添加 " + droppedFiles.length + " 个文件（发送时上传）" : "";
  }

  document.addEventListener("dragover", function (e) {
    e.preventDefault();
    if (e.dataTransfer.types.indexOf("Files") !== -1) document.body.classList.add("drag-over");
  });
  document.addEventListener("dragleave", function (e) {
    if (!e.relatedTarget || !document.body.contains(e.relatedTarget)) document.body.classList.remove("drag-over");
  });
  document.addEventListener("drop", function (e) {
    e.preventDefault();
    document.body.classList.remove("drag-over");
    var files = e.dataTransfer.files;
    if (!files || !files.length) return;
    for (var i = 0; i < files.length; i++) droppedFiles.push(files[i]);
    updateDroppedHint();
  });

  function setButtonSend() {
    if (!sendStopBtn) return;
    sendStopBtn.type = "submit";
    sendStopBtn.textContent = "发送";
    sendStopBtn.classList.remove("stop-mode");
    sendStopBtn.removeAttribute("data-request-id");
  }

  function setButtonStop(requestId) {
    if (!sendStopBtn) return;
    sendStopBtn.type = "button";
    sendStopBtn.textContent = "停止";
    sendStopBtn.classList.add("stop-mode");
    sendStopBtn.setAttribute("data-request-id", requestId);
  }

  function formatMessageTime(d) {
    var y = d.getFullYear(), m = (d.getMonth() + 1), day = d.getDate();
    var h = d.getHours(), min = d.getMinutes();
    m = m < 10 ? "0" + m : m;
    day = day < 10 ? "0" + day : day;
    h = h < 10 ? "0" + h : h;
    min = min < 10 ? "0" + min : min;
    return y + "-" + m + "-" + day + " " + h + ":" + min;
  }

  /** 将内容中的 "[执行 Shell] 命令" 行渲染为两个并排气泡（标签气泡 + 命令气泡，过长用 ...）；正文用 .content-body 包裹并加底框，自动化指令不算正文 */
  function renderContentWithShellBubbles(container, content) {
    if (!container || content == null) return;
    var prefix = "[执行 Shell] ";
    container.textContent = "";
    var lines = (content === "" ? [] : content.split("\n"));
    var currentBody = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf(prefix) === 0) {
        if (currentBody) {
          container.appendChild(currentBody);
          currentBody = null;
        }
        var cmd = line.slice(prefix.length);
        var row = document.createElement("span");
        row.className = "shell-bubble-row";
        var tagBubble = document.createElement("span");
        tagBubble.className = "shell-tag-bubble";
        tagBubble.textContent = "[执行 Shell]";
        var cmdBubble = document.createElement("span");
        cmdBubble.className = "shell-cmd-bubble";
        cmdBubble.textContent = cmd;
        cmdBubble.title = cmd;
        row.appendChild(tagBubble);
        row.appendChild(cmdBubble);
        container.appendChild(row);
      } else {
        if (!currentBody) {
          currentBody = document.createElement("div");
          currentBody.className = "content-body";
        }
        currentBody.appendChild(document.createTextNode(line));
        if (i < lines.length - 1) currentBody.appendChild(document.createTextNode("\n"));
      }
    }
    if (currentBody) container.appendChild(currentBody);
  }

  function appendMessage(role, content) {
    if (welcomeBlock) welcomeBlock.style.display = "none";
    var row = document.createElement("div");
    row.className = "message-row " + role;
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    if (role === "assistant") {
      var header = document.createElement("div");
      header.className = "message-header";
      var title = document.createElement("span");
      title.className = "message-model-title";
      title.textContent = "JudgmentDay";
      var timeSpan = document.createElement("span");
      timeSpan.className = "message-time";
      timeSpan.textContent = formatMessageTime(new Date());
      header.appendChild(title);
      header.appendChild(timeSpan);
      bubble.appendChild(header);
    }
    if (role === "user") {
      var header = document.createElement("div");
      header.className = "message-header";
      var title = document.createElement("span");
      title.className = "message-model-title";
      var usernameEl = document.getElementById("current-username");
      title.textContent = (usernameEl && usernameEl.value) ? usernameEl.value : "";
      var timeSpan = document.createElement("span");
      timeSpan.className = "message-time";
      timeSpan.textContent = formatMessageTime(new Date());
      header.appendChild(title);
      header.appendChild(timeSpan);
      bubble.appendChild(header);
    }
    var text = document.createElement("div");
    text.className = "content";
    text.style.whiteSpace = "pre-wrap";
    text.style.wordBreak = "break-word";
    text.style.overflowWrap = "break-word";
    if (role === "assistant") {
      renderContentWithShellBubbles(text, content);
    } else {
      var bodyWrap = document.createElement("div");
      bodyWrap.className = "content-body";
      bodyWrap.textContent = content;
      text.appendChild(bodyWrap);
    }
    bubble.appendChild(text);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return text;
  }

  async function uploadDroppedFiles() {
    if (!droppedFiles.length) return [];
    var fd = new FormData();
    for (var i = 0; i < droppedFiles.length; i++) fd.append("files", droppedFiles[i]);
    var resp = await fetch("/api/chat/upload", { method: "POST", body: fd });
    var data = await resp.json();
    droppedFiles = [];
    updateDroppedHint();
    return data.files || [];
  }

  if (chatForm) {
    chatForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var content = (chatInput && chatInput.value) ? chatInput.value.trim() : "";
      if (!content) return;

      appendMessage("user", content);
      if (chatInput) chatInput.value = "";

      var filePaths = [];
      try {
        filePaths = await uploadDroppedFiles();
      } catch (err) {
        console.error("上传失败", err);
      }
      if (uploadList) uploadList.textContent = filePaths.length ? "已上传 " + filePaths.length + " 个文件" : "";

      var requestId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : ("r" + Date.now());
      var assistantNode = appendMessage("assistant", "");
      var streamedContent = "";
      setButtonStop(requestId);

      var fd = new FormData(chatForm);
      fd.set("content", content);
      fd.set("request_id", requestId);
      if (filePaths.length) fd.set("files", filePaths.join(","));

      var newConversationId = null;
      try {
        var resp = await fetch("/api/chat/stream", { method: "POST", body: fd });
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        while (true) {
          var result = await reader.read();
          if (result.done) break;
          buffer += decoder.decode(result.value, { stream: true });
          var parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          // #region agent log
          try {
            fetch("http://localhost:1863/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "259787" }, body: JSON.stringify({ sessionId: "259787", hypothesisId: "E", location: "chat.js:stream_read", message: "buffer_after_split", data: { partsCount: parts.length, bufferRemainLen: buffer.length }, timestamp: Date.now() }) }).catch(function () {});
          } catch (_e) {}
          // #endregion
          for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part.indexOf("data:") !== 0) continue;
            var raw = part.slice(5).trim();
            var text = "";
            var parseOk = false;
            try {
              text = JSON.parse(raw);
              parseOk = true;
            } catch (e) {
              text = raw;
            }
            if (typeof text !== "string") text = String(text);
            // #region agent log
            try {
              var _preview = (raw.substring && raw.substring(0, 120)) || String(raw).slice(0, 120);
              var _textPreview = (text.substring && text.substring(0, 100)) || String(text).slice(0, 100);
              fetch("http://localhost:1863/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "259787" }, body: JSON.stringify({ sessionId: "259787", hypothesisId: "B", location: "chat.js:sse_parse", message: "sse_event", data: { rawLen: raw.length, rawPreview: _preview, parseOk: parseOk, usedRaw: !parseOk, textPreview: _textPreview, textLen: text.length }, timestamp: Date.now() }) }).catch(function () {});
            } catch (_e) {}
            // #endregion
            if (text === "[DONE]") break;
            if (text.indexOf("[CONV_ID]") === 0) {
              newConversationId = text.slice(9);
              var convInput = document.getElementById("conversation-id-input");
              if (convInput) convInput.value = newConversationId;
              continue;
            }
            text = text.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
            streamedContent += text;
            renderContentWithShellBubbles(assistantNode, streamedContent);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        }
        if (newConversationId) {
          window.location.replace("/chat?conversation_id=" + encodeURIComponent(newConversationId));
          return;
        }
      } catch (err) {
        console.error("流式请求失败", err);
      } finally {
        setButtonSend();
      }
    });
  }

  // Ctrl+Enter 发送（Mac 下 Cmd+Enter）
  if (chatInput && chatForm && sendStopBtn) {
    chatInput.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        var canSend = sendStopBtn.type === "submit" && chatInput.value.trim();
        if (canSend) {
          // 延迟到下一帧触发表单提交，避免在 keydown 内同步 submit 被部分浏览器忽略
          setTimeout(function () {
            if (sendStopBtn.type === "submit" && chatInput.value.trim()) {
              sendStopBtn.click();
            }
          }, 0);
        }
      }
    });
  }

  if (sendStopBtn) {
    sendStopBtn.addEventListener("click", function () {
      if (this.type !== "button" || !this.classList.contains("stop-mode")) return;
      var requestId = this.getAttribute("data-request-id");
      if (!requestId) return;
      var fd = new FormData();
      fd.append("request_id", requestId);
      setButtonSend();
      fetch("/api/chat/interrupt", { method: "POST", body: fd }).catch(function (err) {
        console.error("中断失败", err);
      });
    });
  }

  // ---------- 设置页：阿里云百炼 API-KEY ----------
  var apiKeyInput = document.getElementById("api-key");
  var toggleApiKeyBtn = document.getElementById("toggle-api-key");
  var settingsForm = document.getElementById("settings-form");
  var settingsStatus = document.getElementById("settings-status");

  if (toggleApiKeyBtn && apiKeyInput) {
    toggleApiKeyBtn.addEventListener("click", function () {
      var isPassword = apiKeyInput.type === "password";
      apiKeyInput.type = isPassword ? "text" : "password";
      toggleApiKeyBtn.textContent = isPassword ? "隐藏" : "显示";
    });
  }

  function loadSettings() {
    fetch("/api/settings/me")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (apiKeyInput) {
          if (data.api_key_set) apiKeyInput.placeholder = "已设置（留空不修改）";
          else apiKeyInput.placeholder = "请输入阿里云百炼平台 API-KEY";
        }
      })
      .catch(function (err) { console.error("加载设置失败", err); });
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!apiKeyInput) return;
      var body = JSON.stringify({ api_key: apiKeyInput.value });
      try {
        var resp = await fetch("/api/settings/me", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
        });
        if (settingsStatus) {
          settingsStatus.textContent = resp.ok ? "已保存。" : "保存失败，请查看控制台。";
        }
      } catch (err) {
        console.error("保存设置失败", err);
        if (settingsStatus) settingsStatus.textContent = "保存失败。";
      }
    });
  }

  if (chatViewPage && chatViewPage.classList.contains("active")) loadSettings();

  // 页面加载时，将已有 assistant 消息中的 [执行 Shell] 行渲染为双气泡
  document.querySelectorAll(".message-row.assistant .content").forEach(function (el) {
    var raw = el.textContent || "";
    if (raw) renderContentWithShellBubbles(el, raw);
  });
})();
