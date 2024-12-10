class InjectMetaPlugin {
    constructor(metaFilePath) {
      this.metaFilePath = metaFilePath;
    }
  
    apply(compiler) {
      compiler.hooks.emit.tapAsync('InjectMetaPlugin', (compilation, callback) => {
        const metaData = require('fs').readFileSync(this.metaFilePath, 'utf-8');
  
        // 将元数据插入到每个输出文件的开头
        Object.keys(compilation.assets).forEach((assetName) => {
          if (assetName.endsWith('.youhou.js')) {
            const assetSource = compilation.assets[assetName].source();
            compilation.assets[assetName] = {
              source: () => metaData + '\n' + assetSource,
              size: () => metaData.length + assetSource.length,
            };
          }
        });
  
        callback();
      });
    }
  }

module.exports = InjectMetaPlugin;
  