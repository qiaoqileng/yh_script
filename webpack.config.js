const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const InjectMetaPlugin = require('./InjectMetaPlugin');

module.exports = {
  entry: {// 脚本的入口文件
    'imtwm_script': './src/imtwm/index.js',
    'pppccc_script': './src/pppccc/index.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].youhou.js',  // 输出的脚本文件名，将根据入口文件名称动态命名
  },
  mode: 'production',               // 开发模式
  // devtool: 'inline-source-map',      // 调试用的 source map
  module: {
    rules: [
      {
        test: /\.js$/,               // 处理 JS 文件
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.css$/,              // 处理 CSS 文件
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin(),        // 每次构建时清理 dist 文件夹
    new HtmlWebpackPlugin({
      template: './src/index.html',  // 如果需要，可以创建一个 HTML 文件来测试脚本
    }),
    new InjectMetaPlugin(path.resolve(__dirname, 'src/imtwm/index.meta.js')),
    new InjectMetaPlugin(path.resolve(__dirname, 'src/pppccc/index.meta.js')),
  ],
  devServer: {
    contentBase: path.join(__dirname, 'dist'),
    compress: true,
    port: 9000,
  },
};
