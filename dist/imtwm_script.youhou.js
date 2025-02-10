// ==UserScript==
// @name         请求拦截并保存shopList数据
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  监听 shopList 请求并保存返回的数据
// @author       Your Name
// @match        https://h5.waimai.meituan.com/*
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/qiaoqileng/yh_script/refs/heads/master/dist/imtwm_script.youhou.js
// @downloadURL  https://raw.githubusercontent.com/qiaoqileng/yh_script/refs/heads/master/dist/imtwm_script.youhou.js
// ==/UserScript==
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
// 引入油猴元数据文件

(function () {
  'use strict';

  // 你的油猴脚本代码
  console.log('Tampermonkey script running!');

  // 示例：改变页面背景色
  document.body.style.backgroundColor = 'lightblue';
})();
/******/ })()
;