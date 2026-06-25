const content = document.querySelector("#markdownContent");
const filePanel = document.querySelector("#filePanel");
const fileInput = document.querySelector("#fileInput");
const folderInput = document.querySelector("#folderInput");
const fileTree = document.querySelector("#fileTree");
const fileCount = document.querySelector("#fileCount");

const allFiles = new Map();
const markdownFiles = new Map();
const objectUrls = new Map();
let activePath = "";

marked.use({
  gfm: true,
  breaks: false
});

function isMarkdownPath(path) {
  return /\.(md|markdown|mdown)$/i.test(path);
}

function normalizePath(path) {
  const parts = path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  const normalized = [];

  for (const part of parts) {
    if (part === ".") {
      continue;
    }

    if (part === "..") {
      normalized.pop();
      continue;
    }

    normalized.push(part);
  }

  return normalized.join("/");
}

function filePath(file, fallbackPath = "") {
  return normalizePath(file.webkitRelativePath || fallbackPath || file.name);
}

function naturalSort(a, b) {
  return a.localeCompare(b, "zh-Hant", { numeric: true, sensitivity: "base" });
}

function displayName(path) {
  return path.split("/").pop() || path;
}

function directoryName(path) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

function clearObjectUrls() {
  for (const url of objectUrls.values()) {
    URL.revokeObjectURL(url);
  }

  objectUrls.clear();
}

function resetWorkspace() {
  clearObjectUrls();
  allFiles.clear();
  markdownFiles.clear();
  activePath = "";
}

function addFiles(files) {
  for (const { file, path } of files) {
    const safePath = normalizePath(path);

    if (!safePath) {
      continue;
    }

    allFiles.set(safePath, file);

    if (isMarkdownPath(safePath)) {
      markdownFiles.set(safePath, file);
    }
  }
}

async function importFiles(files) {
  const normalizedFiles = files
    .map((item) => ({
      file: item.file || item,
      path: normalizePath(item.path || filePath(item.file || item))
    }))
    .filter((item) => item.file && item.path);

  resetWorkspace();
  addFiles(normalizedFiles);
  renderFileTree();

  const firstPath = [...markdownFiles.keys()].sort(naturalSort)[0];

  if (!firstPath) {
    renderEmpty("沒有找到 Markdown 檔案。");
    return;
  }

  await openMarkdown(firstPath);
}

function renderEmpty(message) {
  content.innerHTML = `<div class="empty-state"><h2>${message}</h2></div>`;
  document.title = `${message} - Local Markdown Viewer`;
}

async function openMarkdown(path) {
  const safePath = normalizePath(path);
  const file = markdownFiles.get(safePath);

  if (!file) {
    renderEmpty("找不到這份 Markdown。");
    return;
  }

  activePath = safePath;

  try {
    const markdown = await file.text();
    const html = marked.parse(markdown);
    content.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    prepareHeadings();
    rewriteLocalReferences();
    renderFileTree();
    document.title = `${displayName(safePath)} - Local Markdown Viewer`;
  } catch (error) {
    renderEmpty("無法讀取這份 Markdown。");
  }
}

function renderFileTree() {
  fileCount.textContent = markdownFiles.size.toString();

  if (!markdownFiles.size) {
    fileTree.innerHTML = '<div class="panel-empty"><strong>拖曳到這裡</strong><span>將資料夾或 Markdown 檔拖進檔案樹區塊</span></div>';
    return;
  }

  const tree = {};

  for (const path of [...markdownFiles.keys()].sort(naturalSort)) {
    const parts = path.split("/");
    const filename = parts.pop();
    let node = tree;

    for (const part of parts) {
      node[part] ||= {};
      node = node[part];
    }

    node[filename] = path;
  }

  fileTree.innerHTML = "";
  fileTree.appendChild(renderTreeNode(tree));
}

function renderTreeNode(node) {
  const list = document.createElement("ul");

  for (const key of Object.keys(node).sort(naturalSort)) {
    const item = document.createElement("li");
    const value = node[key];

    if (typeof value === "string") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "file-button";
      button.textContent = key;
      button.title = value;
      button.dataset.path = value;
      button.setAttribute("aria-current", value === activePath ? "true" : "false");
      item.appendChild(button);
    } else {
      const details = document.createElement("details");
      details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = key;
      details.append(summary, renderTreeNode(value));
      item.appendChild(details);
    }

    list.appendChild(item);
  }

  return list;
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "heading";
}

function prepareHeadings() {
  const seen = new Map();

  content.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
    const base = slugify(heading.textContent || "");
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    heading.id = count ? `${base}-${count + 1}` : base;
  });
}

function splitReference(value) {
  const hashIndex = value.indexOf("#");
  const queryIndex = value.indexOf("?");
  const splitAt = [hashIndex, queryIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];

  if (splitAt === undefined) {
    return { path: value, suffix: "" };
  }

  return {
    path: value.slice(0, splitAt),
    suffix: value.slice(splitAt)
  };
}

function isExternalReference(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
}

function resolveLocalPath(reference) {
  if (!reference || isExternalReference(reference)) {
    return null;
  }

  const { path, suffix } = splitReference(reference);

  try {
    const decodedPath = decodeURIComponent(path);
    const baseDir = directoryName(activePath);
    const resolved = normalizePath(`${baseDir}/${decodedPath}`);

    return { path: resolved, suffix };
  } catch (error) {
    return null;
  }
}

function objectUrlFor(path) {
  if (objectUrls.has(path)) {
    return objectUrls.get(path);
  }

  const file = allFiles.get(path);

  if (!file) {
    return "";
  }

  const url = URL.createObjectURL(file);
  objectUrls.set(path, url);
  return url;
}

function findHeadingById(id) {
  return content.querySelector(`#${CSS.escape(id)}`);
}

function rewriteLocalReferences() {
  content.querySelectorAll("img[src]").forEach((image) => {
    const resolved = resolveLocalPath(image.getAttribute("src"));

    if (!resolved || !allFiles.has(resolved.path)) {
      return;
    }

    image.src = objectUrlFor(resolved.path);
  });

  content.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");

    if (!href || href.startsWith("#")) {
      return;
    }

    const resolved = resolveLocalPath(href);

    if (!resolved) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return;
    }

    if (markdownFiles.has(resolved.path)) {
      link.dataset.localMarkdown = resolved.path;
      link.dataset.localHash = resolved.suffix.startsWith("#") ? resolved.suffix.slice(1) : "";
      link.href = "#";
      return;
    }

    if (allFiles.has(resolved.path)) {
      link.href = objectUrlFor(resolved.path);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

function setDragging(isDragging) {
  document.body.classList.toggle("is-dragging", isDragging);
  filePanel.classList.toggle("is-dragging", isDragging);
}

async function readDirectoryEntry(entry, path = "") {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file(
        (file) => resolve([{ file, path: normalizePath(`${path}/${file.name}`) }]),
        reject
      );
    });
  }

  if (!entry.isDirectory) {
    return [];
  }

  const reader = entry.createReader();
  const entries = [];

  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));

    if (!batch.length) {
      break;
    }

    entries.push(...batch);
  }

  const files = await Promise.all(entries.map((child) => readDirectoryEntry(child, `${path}/${entry.name}`)));
  return files.flat();
}

async function filesFromDataTransfer(dataTransfer) {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);

  if (entries.length) {
    const files = await Promise.all(entries.map((entry) => readDirectoryEntry(entry)));
    return files.flat();
  }

  return [...dataTransfer.files].map((file) => ({ file, path: filePath(file) }));
}

fileTree.addEventListener("click", (event) => {
  const button = event.target.closest("[data-path]");

  if (!button) {
    return;
  }

  openMarkdown(button.dataset.path);
});

content.addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-local-markdown]");

  if (!link) {
    return;
  }

  event.preventDefault();
  await openMarkdown(link.dataset.localMarkdown);

  if (link.dataset.localHash) {
    findHeadingById(decodeURIComponent(link.dataset.localHash))?.scrollIntoView({ block: "start" });
  }
});

fileInput.addEventListener("change", () => {
  importFiles([...fileInput.files]);
  fileInput.value = "";
});

folderInput.addEventListener("change", () => {
  importFiles([...folderInput.files]);
  folderInput.value = "";
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
});

["dragenter", "dragover"].forEach((eventName) => {
  filePanel.addEventListener(eventName, (event) => {
    event.preventDefault();
    setDragging(true);
  });
});

["dragleave", "drop"].forEach((eventName) => {
  filePanel.addEventListener(eventName, (event) => {
    event.preventDefault();

    if (eventName === "drop") {
      return;
    }

    if (!event.relatedTarget || !filePanel.contains(event.relatedTarget)) {
      setDragging(false);
    }
  });
});

filePanel.addEventListener("drop", async (event) => {
  event.preventDefault();
  setDragging(false);

  const files = await filesFromDataTransfer(event.dataTransfer);
  importFiles(files);
});
