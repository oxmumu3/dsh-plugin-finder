# npm 分发与可信发布

GitHub Release 安装入口继续保留。npm 是额外的分发来源，不会自动改变已经安装的包来源。`@oxmumu3/dsh-plugin-finder@0.10.0-preview.4` 已完成首次 npm 发布与 registry 字节回读；当前 `0.10.0-preview.5` 是下一次可信发布的发行候选，不代表该候选已发布或 OIDC 已验收。

## 准备预构建包

在公开源码 checkout 中运行：

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
npm run build
node release/prepare-npm.mjs --package-name @your-account/dsh-plugin-finder --output ../finder-npm-release
```

示例中的 `@your-account` 必须换成自己已经取得发布权的 npm scope；本仓库使用 `@oxmumu3/dsh-plugin-finder`。输出目录必须在源码目录之外并且为空，已有制品不会被覆盖。`manifest.json`、`SHA256SUMS`与单个 tgz 一同生成；对该 tgz 运行 `release/check-npm-package.mjs --package-name <准确包名> --tarball <实际路径>`可独立检查。

发布使用预构建客户端，用户安装不需要执行构建脚本。公开源码的 `package.json`、lockfile 根包及 Cordis 模块名统一使用上述候选名；默认构建从源码 manifest 读取包名。暂存器仍可按显式目标名重新编译客户端注册并改写 Cordis 模块引用。业务 domain、API、面板和草稿标识保持原值，历史 GitHub Release 资产保留。

社区 Discover 采集器从已收录 GitHub 路径的默认分支 `package.json.name` 查询 npm，并只读取 `dist-tags.latest` 的版本与发布时间。因此公开源码名和实际 npm 名必须一致，不能只在制品中改名。此候选默认发布到 `latest`，版本仍明确为 preview；标签不代表稳定版或已完成用户验收。只有 `next` 而没有 `latest` 的首包不会进入该索引。发布、社区采集与实际 profile 中 Discover 可见分别验收。

## GitHub Actions

工作流是 `.github/workflows/npm-release.yml`，只接受明确的手动触发：

- `package_name`：本仓库的准确 npm 包名 `@oxmumu3/dsh-plugin-finder`，其他名字被拒绝。
- `publish=false`：构建、测试、校验和上传同一次运行的制品，不发布。
- `publish=true`：还要求来源为本仓库 `main`，且 repository variable `NPM_PACKAGE_NAME`与输入完全一致。

发布前，在 npm 账号中确认包名/发布权，建立首包，并在该包的 Trusted Publisher 设置中绑定 GitHub owner `oxmumu3`、repository `dsh-plugin-finder`、workflow filename `npm-release.yml`。明确允许 `npm publish`；只有 stage 权限仍需要每版人工审批。配置 repository variable `NPM_PACKAGE_NAME`，然后触发并核验第一次可信发布。npm 保存设置不等于发布已经成功。

首次人工发布的 `0.10.0-preview.4` 已存在，不能用相同 name/version 重跑 OIDC。当前 `0.10.0-preview.5` 仅更新发行元数据，产品实现沿用 preview.4；源码 `package.json`、lockfile 与发布检查器保持同一候选版本。先验证 `publish=false` 的远端构建，再配置包级 Trusted Publisher 和 `NPM_PACKAGE_NAME`，运行真正的 OIDC 发布并回读。两次发布使用独立制品，不覆盖首发 tgz 或历史 GitHub 资产。

本轮可以先验证远端 `publish=false` 构建；它不依赖 npm 账号。首次人工发布和后续 OIDC 首发是两项独立验收，不能提前标记完成。

工作流采用 GitHub 托管 runner、Node 24和符合要求的 npm CLI。准备 job 负责 checkout、依赖、完整测试、构建与冻结白名单/客户端检查，没有 OIDC 写权限，并上传同次运行的 tgz、manifest 与 SHA256SUMS。只有发布 job 获得 `id-token: write`；它不 checkout、不安装依赖、不执行产品 checker 或 factory，只用 Node 内置库与系统 tar 读取包元数据，核对精确包名、版本、文件名和哈希后，对该 tgz 执行 `npm publish --ignore-scripts`。不需要把 npm 长效写入 token 放进仓库。显式发布标签与候选 `publishConfig` 均为 `latest`，不会改变 preview 版本的含义。

当前 npm 要求新可信发布配置在两天内成功发布一次进行验证；账号、包名与制品准备好后再绑定并及时验收。账号登录、邮箱/passkey/双重验证等本人确认由账号所有者完成。

规则以 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)及实际账号设置为准。

## 发布后验收

核对注册表包名、版本、repository、完整性与标签，再在独立 DSH profile 通过实际 npm 来源安装、启用和加载。构建通过、上传制品、网页配置成功、本地 tgz 安装、npm 来源安装分别记录。

已有 GitHub 来源用户可以继续使用原入口。scoped 包与旧 unscoped 包是两个安装身份，不应把两者同时启用；需要明确停用/替换旧来源后再验证。不要删除用户历史或重启其他正在运行的工作来完成验收。
