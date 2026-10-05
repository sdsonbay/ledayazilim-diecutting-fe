// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

/**
 * three r18x'in CommonJS girişi (`build/three.cjs`) açılışta `process.emitWarning(...)` çağırır.
 * React Native'de bu fonksiyon yok: @react-three/fiber/native `require('three')` yaptığında
 * uygulama "TypeError: undefined is not a function" ile çöker. Her yerde ES modül derlemesi kullanılır
 * (tek three örneği; web zaten bunu kullanıyordu).
 */
const THREE_ESM = path.join(path.dirname(require.resolve('three')), 'three.module.js')

const upstream = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: THREE_ESM }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
