# dsh-sync-plugin

DeepSeek Harness 一键同步插件:页面左下角「⟳ 同步」按钮,点一下把你**全部的 DSH 数据**(会话、设置、API 密钥、插件、技能)同步到自己的 GitHub 私有仓库,多台电脑之间互相同步。支持**会话删除**(回收站式安全删除)。

## 安装/更新命令

```powershell
dsh plugin --profile web add dsh-sync-plugin
```

装完**重启 dsh**,页面左下角出现「⟳ 同步」按钮。

> 前置:本机装好 [git](https://git-scm.com);推送/拉取 GitHub 需要 [gh CLI](https://cli.github.com) 登录(`gh auth login`)或 Git Credential Manager 授权,首次推送时会自动引导。

## 首次配置(2 分钟)

1. 在 GitHub 建一个**私有**仓库(如 `dsh-sync`);
2. 编辑 `~/.dsh/dsh-sync.json`,填入远端地址:

```json
{ "remote": "https://github.com/你的用户名/dsh-sync.git" }
```

3. 点一下「⟳ 同步」——首次会初始化本地 git 仓库并全量推送。完成。

## 同步什么

| ✅ 同步 | ❌ 不同步 |
| --- | --- |
| 全部会话记录与附件 | `**/node_modules/`(依赖,`pnpm install` 复原) |
| `settings.yaml`、**`.credentials.yaml`(API 密钥)** | 会话投影缓存(可再生) |
| profile 插件配置与源码、技能、工作区状态 | 引擎自身临时状态 |

> ⚠️ 仓库里包含 API 密钥,**务必使用私有仓库**。默认排除列表在 `~/.dsh/.gitignore`,可自行追加。

## 多台电脑

- **换电脑 / 新电脑**:装好 git + dsh 后(**先别启动 dsh**):

  ```powershell
  git clone https://github.com/你的用户名/dsh-sync.git "$env:USERPROFILE\.dsh"
  cd "$env:USERPROFILE\.dsh\profiles\web"; pnpm install
  ```

  启动 dsh——插件、配置、密钥、会话全部就位,按钮直接可用。

- **日常**:哪台电脑用完点一下「⟳ 同步」,另一台开工前点一下,数据就接上了。
- **两台都改过**:不同文件自动合并(两边都保留);同一文件冲突时保留当前电脑版本,对方版本自动备份到远端 `backup/<时间戳>` 分支。

## 配置(`~/.dsh/dsh-sync.json`)

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `mode` | `manual` | `manual` 纯手动(点按钮才同步);`auto` 自动(启动拉取 + 周期 + 对话结束后去抖) |
| `enabled` | `false` | 仅在 `mode=auto` 时作为总开关 |
| `remote` | `''` | GitHub 私有仓库地址;留空则只做本地快照(免费版本历史) |
| `branch` | `main` | 同步分支 |
| `commitMessage` | `dsh-sync: snapshot` | 快照提交信息 |
| `intervalSeconds` | `300` | (auto)周期兜底 |
| `eventDebounceSeconds` | `15` | (auto)对话结束后的去抖延迟 |
| `minCommitIntervalSeconds` | `120` | (auto)提交节流;手动按钮不受限 |

## 命令行(不打开 dsh 也能同步)

```powershell
node "%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-sync-plugin\lib\cli.mjs"
```

(可选:把桌面快捷方式指向它。)

## License

[MIT](./LICENSE) © 2026
