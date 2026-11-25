# 上架到 DSH 插件市场（awesome-dsh-plugin）

市场里看到的插件列表来自精选目录 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
`dshmarket` 本身只是渲染器。**上架 = 给那个仓库提一个 PR，加一个 YAML 文件**，站点和市场通常一天内自动收录。

本目录已经是发布就绪的副本（包名 `dsh-retro-arcade`），下面 4 步照着做即可。

## 0. 占位符

把 `package.json` 里的 `REPLACE_WITH_GITHUB_OWNER` 换成你的 GitHub 用户名（共 3 处）。

## 1. 本地自检

```powershell
node tools/smoke.mjs          # 四个游戏模块 880 帧冒烟
npm pack --dry-run            # 看实际打包文件清单，别漏 public/
```

确认 `package.json` 里：`dsh.bundle.patch` 存在（只有 `dsh.client` 会被 CI 拒绝）、
没有把 `@deepseek-ai/*` 写进 `dependencies`（必须是 `peerDependencies` 且标 optional）。

## 2. 建仓库并打 topic

```powershell
cd arcade-publish
git init -b main
git add -A
git commit -m "feat: retro arcade plugin"
git remote add origin https://github.com/<owner>/dsh-retro-arcade.git
git push -u origin main
```

然后在 GitHub 仓库设置里加 topic **`dsh-plugin`**——没有它 CI 直接拒。

## 3. 发布 npm 包（推荐，市场靠它显示版本和下载量）

```powershell
npm login                      # 需要 npm 账号；开了 2FA 按提示输入
npm publish --access public
```

包名 `dsh-retro-arcade` 目前没被占用。

## 4. 给 awesome-dsh-plugin 提 PR

在新文件 `data/plugins/<owner>__dsh-retro-arcade.yml` 写入（文件名用两个下划线，
`<owner>` 与仓库地址必须**完全一致**）：

```yaml
url: https://github.com/<owner>/dsh-retro-arcade
name: <owner>/dsh-retro-arcade
category: ui
description:
  en: Opens a CRT-styled arcade cabinet with four playable FC classics — Super Mario, Contra, Bomberman and Lode Runner — from a 街机厅 button at the bottom right.
  zh: 在 DSH 里开一台 CRT 街机：超级马里奥、魂斗罗、炸弹人、淘金者四款 FC 经典共用一个画布，点右下角「街机厅」按钮进入。
```

要点：

- 一个 PR 最多 3 条，**不要手改 README**（各语言 README 由脚本生成）
- `category` 取目录里的有效分类，本插件用 `ui`
- `description.en` 必填，单行、句号结尾、不写营销词；`zh` 可选
- PR 正文按 `.github/pull_request_template.md` 的清单写：一个文件 / 有 `dsh.bundle` / 仓库满 1 天 / 分类正确 / 描述属实 / 有 `dsh-plugin` topic

## 5. 生效与验证

- 合并后通常一天内出现在市场；也可以直接在 `Plugins → Discover → Index sources`
  加 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` 提前搜到
- 验证：在市场的 Discover 里搜 “arcade”，确认标题/描述/图标/截图正常，点安装后能开出街机厅

## 附：不想公开上架的做法

| 场景 | 做法 |
|---|---|
| 只给自己/团队用 | 保持 `@local/` 私有包，用 **Plugins → Add plugin** 装本目录 |
| 内部多台机器 | 自建 index.json，在 **Plugins → Discover → Index sources** 里加 URL |
| 离线机器 | 用市场的 offline bundle 功能打包目录 |
