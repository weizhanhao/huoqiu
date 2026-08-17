/*
 * 打包入口。
 *
 * package.json 的 main 原先直接写 "expo-router/entry"。那是个裸标识符，
 * metro 要先把它解析成磁盘上的真实路径，再算出相对工程根的路径——而这个
 * 仓库的 node_modules 是一条指向另一个 worktree 的软链，算出来的相对路径
 * 会少一层，指到一个不存在的目录，报「Unable to resolve module」。
 *
 * 入口放在工程内，这一步解析就不发生了。这也是 Expo 文档里的标准写法。
 */
import "expo-router/entry";
