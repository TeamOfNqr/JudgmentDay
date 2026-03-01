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
  var uploadInProgress = false;

  var FILE_EXT_CATEGORY = {
    image: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "heic", "avif", "tiff", "tif", "raw", "cr2", "nef", "arw"],
    video: ["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv", "m4v", "mpeg", "mpg", "3gp", "ogv"],
    audio: ["mp3", "wav", "ogg", "m4a", "flac", "aac", "wma", "opus", "aiff", "aif", "ape"],
    document: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp", "pages", "numbers", "keynote"],
    code: ["js", "ts", "jsx", "tsx", "py", "html", "htm", "css", "scss", "less", "json", "xml", "md", "yaml", "yml", "sh", "bash", "bat", "cmd", "ps1", "rb", "go", "rs", "java", "kt", "c", "cpp", "h", "hpp", "cs", "php", "vue", "svelte"],
    archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "z", "tgz", "tbz", "zipx", "iso"]
  };

  function getFileIconCategory(filename) {
    var name = (filename || "").toLowerCase();
    var dot = name.lastIndexOf(".");
    var ext = dot >= 0 ? name.slice(dot + 1) : "";
    if (!ext) return "default";
    var k;
    for (k in FILE_EXT_CATEGORY) {
      if (FILE_EXT_CATEGORY[k].indexOf(ext) !== -1) return k;
    }
    return "default";
  }

  function getFileIconSvg(category) {
    var paths = {
      image: "M4 4h7V2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7h-2v7H4V4zm7-2v2h5l-5 5V2zm4 3l2 2-6 6-2-2 6-6z",
      video: "M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm4.5 2.5v5l4-2.5-4-2.5z",
      audio: "M4 4v8h2V6h4V4H4zm8 0v2h2v6h-2v2h4V4h-4zm-6 6h2v4H6v-4z",
      document: "M4 4a2 2 0 0 1 2-2h4l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm6 0V2l4 4h-4z",
      code: "M2 4h6v2H4v12h12v-4h2v6H2V4zm18-4h-8l4 4-5 5 2 2 5-5 4 4V0z",
      archive: "M2 4h6v2H4v12h12v-4h2v6H2V4zm4 6h2v2H6v-2zm12-8h-8l2 2 2-2h4v8h2V4z",
      default: "M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 0v12h8V4H6zm2 2h4v2H8V6zm0 4h4v2H8v-2zm0 4h4v2H8v-2z"
    };
    var d = paths[category] || paths.default;
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"" + d + "\"/></svg>";
  }

  function renderUploadList(showProgress, progressPercent) {
    if (!uploadList) return;
    if (showProgress === true && progressPercent != null) {
      uploadList.textContent = "";
      uploadList.classList.remove("upload-list-empty");
      var wrap = document.createElement("div");
      wrap.className = "upload-progress-wrap";
      var bar = document.createElement("div");
      bar.className = "upload-progress-bar";
      var fill = document.createElement("div");
      fill.className = "upload-progress-fill";
      fill.style.width = (progressPercent >= 0 ? progressPercent : 0) + "%";
      var text = document.createElement("span");
      text.className = "upload-progress-text";
      text.textContent = (progressPercent >= 0 ? Math.round(progressPercent) : 0) + "%";
      bar.appendChild(fill);
      wrap.appendChild(bar);
      wrap.appendChild(text);
      uploadList.appendChild(wrap);
      uploadList.setAttribute("data-progress-wrap", "1");
      return;
    }
    uploadList.removeAttribute("data-progress-wrap");
    uploadList.textContent = "";
    if (droppedFiles.length === 0) {
      uploadList.classList.add("upload-list-empty");
      return;
    }
    uploadList.classList.remove("upload-list-empty");
    for (var i = 0; i < droppedFiles.length; i++) {
      (function (idx) {
        var file = droppedFiles[idx];
        var name = file.name || "未命名";
        var category = getFileIconCategory(name);
        var item = document.createElement("span");
        item.className = "upload-item";
        var icon = document.createElement("span");
        icon.className = "upload-item-icon";
        icon.innerHTML = getFileIconSvg(category);
        var nameEl = document.createElement("span");
        nameEl.className = "upload-item-name";
        nameEl.textContent = name;
        nameEl.title = name;
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "upload-item-remove";
        removeBtn.title = "移除";
        removeBtn.setAttribute("aria-label", "移除");
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", function () {
          droppedFiles.splice(idx, 1);
          renderUploadList();
        });
        item.appendChild(icon);
        item.appendChild(nameEl);
        item.appendChild(removeBtn);
        uploadList.appendChild(item);
      })(i);
    }
  }

  function updateUploadProgress(percent) {
    if (!uploadList || uploadList.getAttribute("data-progress-wrap") !== "1") return;
    var fill = uploadList.querySelector(".upload-progress-fill");
    var text = uploadList.querySelector(".upload-progress-text");
    if (fill) fill.style.width = (percent >= 0 ? percent : 0) + "%";
    if (text) text.textContent = (percent >= 0 ? Math.round(percent) : 0) + "%";
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
    renderUploadList();
  });

  function syncSendButtonDisabled() {
    if (sendStopBtn) sendStopBtn.disabled = uploadInProgress;
  }

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

  /** 将 Markdown 字符串转为安全 HTML（marked + DOMPurify） */
  function renderMarkdownToHtml(md) {
    if (md == null || md === "") return "";
    // #region agent log
    try {
      fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "491d35" }, body: JSON.stringify({ sessionId: "491d35", hypothesisId: "H1", location: "chat.js:renderMarkdownToHtml", message: "md_render", data: { hasMarked: typeof marked !== "undefined", hasDOMPurify: typeof DOMPurify !== "undefined", mdLen: (md && md.length) || 0 }, timestamp: Date.now() }) }).catch(function () {});
    } catch (_e) {}
    // #endregion
    try {
      if (typeof marked !== "undefined" && marked.parse) {
        var rawHtml = marked.parse(md, { gfm: true, breaks: true });
        if (typeof DOMPurify !== "undefined" && DOMPurify.sanitize) {
          rawHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
        }
        return rawHtml;
      }
    } catch (e) {
      console.warn("Markdown render failed", e);
    }
    return md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** 将内容中的 "[执行 Shell] 命令" 行渲染为两个并排气泡；"[Shell 输出]" 后内容用 pre 渲染；正文用 .content-body 包裹，按 Markdown 渲染 */
  function renderContentWithShellBubbles(container, content) {
    if (!container || content == null) return;
    var prefix = "[执行 Shell] ";
    var shellOutputPrefix = "[Shell 输出]";
    var shellOutputEndMarker = "[Shell 输出结束]";
    container.textContent = "";
    var lines = (content === "" ? [] : content.split("\n"));
    var currentBodyLines = [];
    function flushBody() {
      if (currentBodyLines.length === 0) return;
      var bodyDiv = document.createElement("div");
      bodyDiv.className = "content-body content-body-markdown";
      var text = currentBodyLines.join("\n");
      bodyDiv.innerHTML = renderMarkdownToHtml(text);
      container.appendChild(bodyDiv);
      currentBodyLines = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf(prefix) === 0) {
        flushBody();
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
      } else if (line === shellOutputPrefix || line.indexOf(shellOutputPrefix) === 0) {
        flushBody();
        var outputLines = [];
        if (line.length > shellOutputPrefix.length) {
          outputLines.push(line.slice(shellOutputPrefix.length));
        }
        i++;
        while (i < lines.length) {
          var nextLine = lines[i];
          if (nextLine === shellOutputEndMarker || nextLine.indexOf(shellOutputEndMarker) === 0) {
            break;
          }
          if (nextLine.indexOf(prefix) === 0 || nextLine === shellOutputPrefix || nextLine.indexOf(shellOutputPrefix) === 0) {
            i--;
            break;
          }
          outputLines.push(nextLine);
          i++;
        }
        var pre = document.createElement("pre");
        pre.className = "content-body content-body-shell-output";
        pre.textContent = outputLines.join("\n");
        container.appendChild(pre);
      } else {
        currentBodyLines.push(line);
      }
    }
    flushBody();
  }

  function appendMessage(role, content, files) {
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
      if (files && files.length > 0) {
        var attWrap = document.createElement("div");
        attWrap.className = "message-attachments";
        for (var fi = 0; fi < files.length; fi++) {
          var path = files[fi];
          var name = path.split("/").pop() || path;
          var category = getFileIconCategory(name);
          var item = document.createElement("span");
          item.className = "message-attachment-item";
          item.title = path;
          var icon = document.createElement("span");
          icon.className = "message-attachment-icon";
          icon.innerHTML = getFileIconSvg(category);
          var nameEl = document.createElement("span");
          nameEl.className = "message-attachment-name";
          nameEl.textContent = name;
          item.appendChild(icon);
          item.appendChild(nameEl);
          attWrap.appendChild(item);
        }
        bubble.appendChild(attWrap);
      }
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

  function uploadDroppedFiles() {
    return new Promise(function (resolve, reject) {
      if (!droppedFiles.length) {
        resolve([]);
        return;
      }
      var fd = new FormData();
      for (var i = 0; i < droppedFiles.length; i++) fd.append("files", droppedFiles[i]);
      renderUploadList(true, 0);
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/chat/upload");
      xhr.upload.onprogress = function (e) {
        var pct = e.lengthComputable ? (e.loaded / e.total) * 100 : 0;
        updateUploadProgress(pct);
      };
      xhr.onload = function () {
        droppedFiles = [];
        renderUploadList();
        var data;
        try {
          data = JSON.parse(xhr.responseText || "{}");
        } catch (err) {
          reject(err);
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data.files || []);
        } else {
          reject(new Error(data.detail || "上传失败"));
        }
      };
      xhr.onerror = function () {
        renderUploadList();
        reject(new Error("网络错误"));
      };
      xhr.ontimeout = function () {
        renderUploadList();
        reject(new Error("请求超时"));
      };
      xhr.send(fd);
    });
  }

  if (chatForm) {
    chatForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (uploadInProgress) return;
      var content = (chatInput && chatInput.value) ? chatInput.value.trim() : "";
      if (!content) return;

      // #region agent log
      try {
        fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "756560" }, body: JSON.stringify({ sessionId: "756560", hypothesisId: "H1", location: "chat.js:submit_entry", message: "submit_entry", data: { contentLen: content.length, droppedFilesCount: droppedFiles.length }, timestamp: Date.now() }) }).catch(function () {});
      } catch (_x) {}
      // #endregion

      var filePaths = [];
      uploadInProgress = true;
      syncSendButtonDisabled();
      try {
        // #region agent log
        try {
          fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "756560" }, body: JSON.stringify({ sessionId: "756560", hypothesisId: "H4", location: "chat.js:before_upload", message: "before_uploadDroppedFiles", data: { droppedFilesCount: droppedFiles.length }, timestamp: Date.now() }) }).catch(function () {});
        } catch (_x) {}
        // #endregion
        filePaths = await uploadDroppedFiles();
        // #region agent log
        try {
          fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "756560" }, body: JSON.stringify({ sessionId: "756560", hypothesisId: "H2", location: "chat.js:after_upload", message: "after_uploadDroppedFiles", data: { filePathsCount: filePaths.length, uploadListText: (uploadList && uploadList.textContent) || "" }, timestamp: Date.now() }) }).catch(function () {});
        } catch (_x) {}
        // #endregion
      } catch (err) {
        console.error("上传失败", err);
      } finally {
        uploadInProgress = false;
        syncSendButtonDisabled();
        renderUploadList();
      }

      appendMessage("user", content, filePaths);
      if (chatInput) chatInput.value = "";
      renderUploadList();

      var requestId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : ("r" + Date.now());
      var assistantNode = appendMessage("assistant", "");
      var streamedContent = "";
      setButtonStop(requestId);

      var fd = new FormData(chatForm);
      fd.set("content", content);
      fd.set("request_id", requestId);
      if (filePaths.length) fd.set("files", filePaths.join(","));

      // #region agent log
      try {
        fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "756560" }, body: JSON.stringify({ sessionId: "756560", hypothesisId: "H5", location: "chat.js:before_stream", message: "before_stream_fetch", data: { filePathsCount: filePaths.length, uploadListText: (uploadList && uploadList.textContent) || "" }, timestamp: Date.now() }) }).catch(function () {});
      } catch (_x) {}
      // #endregion

      var newConversationId = null;
      try {
        var resp = await fetch("/api/chat/stream", { method: "POST", body: fd });
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        var readCount = 0;
        while (true) {
          var result = await reader.read();
          if (result.done) break;
          readCount += 1;
          // #region agent log
          try {
            fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0f4b4c" }, body: JSON.stringify({ sessionId: "0f4b4c", hypothesisId: "H5", location: "chat.js:reader_read", message: "read_chunk", data: { readCount: readCount, valueLen: result.value ? result.value.length : 0, ts: Date.now() / 1000 }, timestamp: Date.now() }) }).catch(function () {});
          } catch (_e) {}
          // #endregion
          buffer += decoder.decode(result.value, { stream: true });
          var parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          var eventIndex = 0;
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
              eventIndex += 1;
              fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0f4b4c" }, body: JSON.stringify({ sessionId: "0f4b4c", hypothesisId: "H3", location: "chat.js:sse_event", message: "frontend_process_event", data: { eventIndex: eventIndex, textLen: text.length, ts: Date.now() / 1000 }, timestamp: Date.now() }) }).catch(function () {});
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
        renderUploadList();
        // #region agent log
        try {
          fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "756560" }, body: JSON.stringify({ sessionId: "756560", hypothesisId: "H5", location: "chat.js:finally", message: "submit_finally", data: { uploadListText: (uploadList && uploadList.textContent) || "" }, timestamp: Date.now() }) }).catch(function () {});
        } catch (_x) {}
        // #endregion
        setButtonSend();
      }
    });
  }

  // Ctrl+Enter 发送（Mac 下 Cmd+Enter）
  if (chatInput && chatForm && sendStopBtn) {
    chatInput.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        var canSend = !uploadInProgress && sendStopBtn.type === "submit" && chatInput.value.trim();
        if (canSend) {
          // 延迟到下一帧触发表单提交，避免在 keydown 内同步 submit 被部分浏览器忽略
          setTimeout(function () {
            if (!uploadInProgress && sendStopBtn.type === "submit" && chatInput.value.trim()) {
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
  var enableUtcpCheckbox = document.getElementById("enable-utcp");
  var enableWebSearchCheckbox = document.getElementById("enable-web-search");

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
        if (enableUtcpCheckbox) enableUtcpCheckbox.checked = data.enable_utcp !== false;
        if (enableWebSearchCheckbox) enableWebSearchCheckbox.checked = data.enable_web_search !== false;
      })
      .catch(function (err) { console.error("加载设置失败", err); });
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!apiKeyInput) return;
      var payload = { api_key: apiKeyInput.value };
      if (enableUtcpCheckbox) payload.enable_utcp = enableUtcpCheckbox.checked;
      if (enableWebSearchCheckbox) payload.enable_web_search = enableWebSearchCheckbox.checked;
      var body = JSON.stringify(payload);
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

  // #region agent log — 输入行垂直居中调试：记录行/输入框/按钮及下方 upload-list 的布局
  (function logChatInputLayout() {
    var row = document.querySelector(".chat-input-row");
    var input = document.getElementById("chat-input");
    var btn = document.querySelector(".chat-actions .send-btn");
    var uploadList = document.getElementById("upload-list");
    if (!row || !input || !btn) return;
    var rRect = row.getBoundingClientRect();
    var iRect = input.getBoundingClientRect();
    var bRect = btn.getBoundingClientRect();
    var rStyle = window.getComputedStyle(row);
    var iStyle = window.getComputedStyle(input);
    var bStyle = window.getComputedStyle(btn);
    var rowCenter = rRect.top + rRect.height / 2;
    var inputCenter = iRect.top + iRect.height / 2;
    var btnCenter = bRect.top + bRect.height / 2;
    var ulRect = uploadList ? uploadList.getBoundingClientRect() : null;
    var ulStyle = uploadList ? window.getComputedStyle(uploadList) : null;
    var payload = {
      hypothesisId: "layout",
      rowHeight: rRect.height,
      rowPaddingTop: rStyle.paddingTop,
      rowPaddingBottom: rStyle.paddingBottom,
      rowAlignItems: rStyle.alignItems,
      inputHeight: iRect.height,
      inputMinHeight: iStyle.minHeight,
      inputPaddingTop: iStyle.paddingTop,
      inputPaddingBottom: iStyle.paddingBottom,
      inputLineHeight: iStyle.lineHeight,
      inputBoxSizing: iStyle.boxSizing,
      btnHeight: bRect.height,
      btnPaddingTop: bStyle.paddingTop,
      btnPaddingBottom: bStyle.paddingBottom,
      rowCenter: rowCenter,
      inputCenter: inputCenter,
      btnCenter: btnCenter,
      inputOffsetFromRowCenter: inputCenter - rowCenter,
      btnOffsetFromRowCenter: btnCenter - rowCenter,
      uploadListHeight: ulRect ? ulRect.height : null,
      uploadListEmpty: uploadList ? uploadList.childNodes.length === 0 : null,
      uploadListPaddingTop: ulStyle ? ulStyle.paddingTop : null,
      uploadListPaddingBottom: ulStyle ? ulStyle.paddingBottom : null,
    };
    fetch("http://localhost:5887/ingest/0272949f-4355-40af-b768-4c130c6fda37", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3c62f9" },
      body: JSON.stringify({
        sessionId: "3c62f9",
        location: "chat.js:logChatInputLayout",
        message: "chat input row layout",
        data: payload,
        timestamp: Date.now(),
      }),
    }).catch(function () {});
  })();
  // #endregion
})();
