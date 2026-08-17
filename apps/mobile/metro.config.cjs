const { realpathSync } = require("node:fs");
const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

/*
 * 后缀必须是 .cjs。
 *
 * 这个包的 package.json 有 "type": "module"，叫 metro.config.js 会被 Node
 * 当成 ESM，第一行 require 就抛 ReferenceError——而 metro 吞掉这个异常、
 * 退回默认配置继续跑，于是下面这些设置一条都没生效，报出来的却是
 * 「模块找不到」，完全指不到这里。
 *
 * metro 要能看见依赖真正躺在哪。
 *
 * 这个仓库的 node_modules 是一条软链，指向另一个 worktree
 * （.worktrees/integration-d0/node_modules）。metro 只解析监视目录之内的
 * 模块，而软链的真实路径落在工作区之外，于是连 expo-router/entry 都解析
 * 不了。
 *
 * 这里把真实路径也加进监视目录。用 realpathSync 而不是写死那个 worktree
 * 名字：换一台机器、换一个 worktree，软链指向就变了，写死等于把别人的
 * 目录结构钉进仓库。
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/* 软链可能不存在（干净检出、尚未 install），那就退回原路径。 */
const resolveReal = (target) => {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
};

const workspaceModules = path.join(workspaceRoot, "node_modules");
const realWorkspaceModules = resolveReal(workspaceModules);

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...new Set([workspaceRoot, workspaceModules, realWorkspaceModules]),
];

config.resolver.nodeModulesPaths = [
  ...new Set([
    path.join(projectRoot, "node_modules"),
    workspaceModules,
    realWorkspaceModules,
  ]),
];

module.exports = config;
