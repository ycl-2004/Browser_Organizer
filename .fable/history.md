# Completed task: Browser Organizer README and release packaging

## Goal

统一 Browser Organizer 与 Orbit、Typeless、YC Todo 的 README 品牌表达，并让这个 Chrome 扩展具备可重复生成下载/商店上传 ZIP 的 release-ready 交付路径。

## Acceptance criteria

- README 使用与品牌项目一致的产品定位、截图、Quick start、Features、Privacy、Build/Release、Project layout、License 结构。
- README 明确说明 Browser Organizer 是 Chrome 扩展，不是可双击运行的 macOS `.app`。
- README 提供本地安装路径，并说明 Chrome Web Store 是 Windows/macOS 的直接安装路径。
- 新增打包脚本只把 `extension/` 内容放在 ZIP 根目录，读取 `manifest.json` 版本，并排除 `.DS_Store` 等杂项。
- 本地生成 ZIP，并验证 manifest JSON、ZIP 内容和 README 中引用的路径。

## Requirements list (append-only)

1. 检查当前项目 README、`image/Output.png` 和三个品牌 README。
2. 让 Browser Organizer README 与品牌表达一致，但适配更小、更简单的 Chrome 扩展项目。
3. 评估并尽可能实现别人可下载后使用的 release 版本。
4. 保留项目真实能力和隐私边界，不把扩展误写成独立 App。

## Decision log

- 采用 YC Todo 的信息层次作为主参考，借用 Orbit 的简洁产品定位和截图呈现方式。
- 将 `image/Output.png` 作为 README 唯一主截图，避免为小项目维护复杂截图画廊。
- 采用 ZIP release，而不是把 CRX 当作 macOS/Windows 的直接安装包；Chrome 官方规则要求普通用户在 Windows/macOS 通过 Chrome Web Store 直接安装，下载 ZIP 仍需一次“加载已解压的扩展程序”。
- 普通 ZIP 只包含 `extension/`；`native-host/` 是可选的同机跨 profile 辅助能力，不属于基础安装包。

## Evidence

- `extension/manifest.json`：Manifest V3，版本 `1.0.0`，new tab override 指向 `index.html`。
- `image/Output.png`：已检查，3022×1714，展示三栏 dashboard。
- Chrome 官方分发文档：<https://developer.chrome.com/docs/extensions/how-to/distribute>
- Chrome 官方打包准备文档：<https://developer.chrome.com/docs/webstore/prepare>

## Final verification

- `./scripts/package-extension.sh` generated `dist/Browser-Organizer-v1.0.0.zip`.
- `unzip -t dist/Browser-Organizer-v1.0.0.zip` passed.
- ZIP contains `manifest.json` at its root, with no `extension/` wrapper.
- ZIP excludes `config.local.js`, `.DS_Store`, logs, and Python cache files.
- `python3 -m json.tool extension/manifest.json` passed.
- `git diff --check` passed.
