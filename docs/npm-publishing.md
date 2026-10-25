# npm 分发与可信发布

GitHub Release 安装入口继续保留。npm 是额外的分发来源，不会自动改变已经安装的包来源。本文件记录发布流程，不代表候选 npm 包已经发布或命名空间已确认。

## 准备预构建包

在公开源码 checkout 中运行：

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
npm run build
node release/prepare-npm.mjs --package-name @your-account/dsh-plugin-finder --output ../finder-npm-release
```

示例中的 `@your-account` 必须换成自己已经取得发布权的 npm scope。输出目录必须在源码目录之外并且为空，已有制品不会被覆盖。`manifest.json`、`SHA256SUMS`与单个 tgz 一同生成；对该 tgz 运行 `release/check-npm-package.mjs --package-name <准确包名> --tarball <实际路径>`可独立检查。

发布使用预构建客户端，用户安装不需要执行构建脚本。原始源码包名保持 `dsh-plugin-finder`；暂存器会按目标包名重新编译客户端注册并改写 Cordis 模块引用，保留业务 domain、API、面板和草稿标识。

## GitHub Actions

工作流是 `.github/workflows/npm-release.yml`，只接受明确的手动触发：

- `package_name`：准确 npm 包名。默认值只是待确认的候选。
- `publish=false`：构建、测试、校验和上传同一次运行的制品，不发布。
- `publish=true`：还要求来源为本仓库 `main`，且 repository variable `NPM_PACKAGE_NAME`与输入完全一致。

发布前，在 npm 账号中确认包名/发布权，建立首包，并在该包的 Trusted Publisher 设置中绑定 GitHub owner `oxmumu3`、repository `dsh-plugin-finder`、workflow filename `npm-release.yml`。明确允许 `npm publish`；只有 stage 权限仍需要每版人工审批。配置 repository variable `NPM_PACKAGE_NAME`，然后触发并核验第一次可信发布。npm 保存设置不等于发布已经成功。

首次发布顺序必须区分版本：先由账号所有者完成首次认证，把经校验的 `0.9.0-preview.10` 制品发布到 `next`，核对注册表和 DSH 安装结果。该版本一经发布不能重新发布。后续验证 OIDC 时，先准备新的 `0.9.0-preview.11`：同步源码 `package.json`、lockfile、发布检查器的版本断言和相应测试，经复审和完整准备流程后，再绑定 Trusted Publisher 并触发发布。不能用已经手动发布的同一个版本重复跑自动发布验收。

本轮可以先验证远端 `publish=false` 构建；它不依赖 npm 账号。首次人工发布和后续 OIDC 首发是两项独立验收，不能提前标记完成。

工作流采用 GitHub 托管 runner、Node 24和符合要求的 npm CLI；只有发布 job 获得 `id-token: write`。不需要把 npm 长效写入 token 放进仓库。预览包发布到 `next`，不自动提升为稳定版。

当前 npm 要求新可信发布配置在两天内成功发布一次进行验证；账号、包名与制品准备好后再绑定并及时验收。账号登录、邮箱/passkey/双重验证等本人确认由账号所有者完成。

规则以 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)及实际账号设置为准。

## 发布后验收

核对注册表包名、版本、repository、完整性与标签，再在独立 DSH profile 通过实际 npm 来源安装、启用和加载。构建通过、上传制品、网页配置成功、本地 tgz 安装、npm 来源安装分别记录。

已有 GitHub 来源用户可以继续使用原入口。scoped 包与旧 unscoped 包是两个安装身份，不应把两者同时启用；需要明确停用/替换旧来源后再验证。不要删除用户历史或重启其他正在运行的工作来完成验收。
