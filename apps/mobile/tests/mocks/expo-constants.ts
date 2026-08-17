/*
 * expo-constants 的测试替身。
 *
 * 真身经 expo-modules-core 读设备上的原生全局对象，Node 里那个对象不存在，
 * 于是 import 到它的用例会在模块加载阶段抛
 * 「Cannot read properties of undefined (reading 'EventEmitter')」——
 * 报的位置在 expo 内部，和被测的东西看不出任何关系。
 *
 * 这里只提供 src/api/config.ts 真正读的那一条路径：expoConfig.extra。
 * 默认给空对象，让配置回落到兜底基址——要覆盖的是取值顺序本身，
 * 而不是某台机器上恰好装了什么。
 */

type ExpoConfig = Readonly<{
  extra?: Readonly<Record<string, unknown>>;
}>;

const constants: Readonly<{ expoConfig: ExpoConfig | null }> = {
  expoConfig: { extra: {} },
};

export default constants;
