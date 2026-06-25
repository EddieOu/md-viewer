# Local Markdown Viewer

可部署到 GitHub Pages 的本地 Markdown 閱讀器。它不需要後端，使用者把 `.md` 檔或資料夾拖進網頁後，瀏覽器會在本機端讀取與渲染內容。

## 功能

- 拖曳單一或多個 Markdown 檔
- 拖曳資料夾並保留相對路徑
- 左側顯示 Markdown 檔案樹
- 依目前文件標題產生目錄
- 支援 Markdown 內的本地相對 `.md` 連結
- 支援同一批匯入檔案中的相對圖片路徑

## 本機預覽

```bash
python3 -m http.server 8765
```

開啟：

```text
http://localhost:8765
```

## 部署到 GitHub Pages

1. 將此資料夾推到 GitHub repo。
2. 到 repo 的 `Settings` → `Pages`。
3. Source 選 `Deploy from a branch`。
4. Branch 選 `main`，資料夾選 `/root`。
5. 儲存後等待 GitHub 產生 Pages 網址。

## 瀏覽器限制

GitHub Pages 是靜態網站，不能主動掃描使用者硬碟。讀取本地檔案必須由使用者主動選擇或拖曳檔案/資料夾到頁面中。
