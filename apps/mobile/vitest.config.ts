import baseVitestConfig from "@huoqiu/config/vitest/base";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

const safeAreaContextMock = fileURLToPath(
  new URL("./tests/mocks/react-native-safe-area-context.tsx", import.meta.url),
);

/* Keychain 是设备能力，Node 里没有对应的原生模块。 */
const secureStoreMock = fileURLToPath(
  new URL("./tests/mocks/expo-secure-store.ts", import.meta.url),
);

/* 同理：expo-constants 要读设备上的原生全局对象。 */
const constantsMock = fileURLToPath(
  new URL("./tests/mocks/expo-constants.ts", import.meta.url),
);

const codegenMock = fileURLToPath(
  new URL("./tests/mocks/codegen-native-component.ts", import.meta.url),
);

/*
 * 图表用 react-native-svg 画。它的默认入口是原生实现，在 Node 里跑会在解析
 * 阶段就炸（Unexpected token 'typeof'）。这个包自带一份 web 实现，渲染出来
 * 就是标准的 <svg>/<path>/<rect>，正好能被用例断言——所以指过去，而不是自己
 * 写一份 mock：mock 迟早和真实实现走偏，而走偏的地方用例看不见。
 */

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    /*
     * __DEV__ 是 React Native 打包器注入的构建期常量，Node 里没有。
     * expo-secure-store 会读它，于是任何 import 到会话层的用例都会在模块
     * 加载阶段抛 ReferenceError——报出来的是「__DEV__ is not defined」，
     * 和被测的东西毫无关系，很容易被当成用例本身写错。
     */
    define: { __DEV__: "true" },
    resolve: {
      alias: [
        {
          find: /^react-native-safe-area-context$/u,
          replacement: safeAreaContextMock,
        },
        {
          find: /^react-native$/u,
          replacement: "react-native-web",
        },
        {
          find: /^expo-secure-store$/u,
          replacement: secureStoreMock,
        },
        {
          find: /^expo-constants$/u,
          replacement: constantsMock,
        },
        {
          find: /^react-native-svg$/u,
          replacement: "react-native-svg/lib/module/ReactNativeSVG.web.js",
        },
        /*
         * react-native-svg 的 web 实现仍会引到这个 Flow 写的内部文件，而上面
         * 那条 react-native 别名只匹配裸的包名，管不到深路径。
         */
        {
          find: "react-native/Libraries/Utilities/codegenNativeComponent",
          replacement: codegenMock,
        },
        {
          find: "react-native/Libraries/ReactNative/UIManager",
          replacement: codegenMock,
        },
      ],
    },
    /*
     * react-native-svg 要被打进来一起转译。
     *
     * node_modules 里的包默认是「外部依赖」，由 Node 直接解析——上面那些别名
     * 对它们一概无效，于是 svg 内部那句 `import ... from "react-native/..."`
     * 会去问 Node 要一个并不存在的包，报「Cannot find package」。inline 之后
     * 才轮得到别名。
     *
     * 这一段必须挂在 test 下面：写在配置根上 vitest 不看，而且不会报错。
     */
    test: { server: { deps: { inline: [/react-native-svg/u] } } },
  }),
);
