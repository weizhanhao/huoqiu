/*
 * react-native 的 codegenNativeComponent 存根。
 *
 * react-native-svg 的 web 实现仍然会经由几个文件引到它，而它的源码是 Flow，
 * Node 侧的解析器读不了——报出来的是「Flow is not supported」，指着一个和被测
 * 组件毫无关系的 react-native 内部文件。
 *
 * 真机上根本走不到这里（走的是原生实现），所以给一个不会被渲染到的占位就够了。
 */
const codegenNativeComponent = (name: string): string => name;

export default codegenNativeComponent;
