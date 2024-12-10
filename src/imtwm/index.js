// 引入油猴元数据文件
import './index.meta.js';

(function() {
  'use strict';

  // 你的油猴脚本代码
  console.log('Tampermonkey script running!');

  // 示例：改变页面背景色
  document.body.style.backgroundColor = 'lightblue';
})();
