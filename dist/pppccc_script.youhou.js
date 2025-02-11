// ==UserScript==
// @name         Smart List Crawler
// @namespace    http://tampermonkey.net/
// @version      0.3.7
// @description  智能列表爬虫，支持手动/自动模式采集数据，支持持久化配置、导入导出配置及类似开发者工具的元素选取和数据过滤功能，同时 siteConfig 中的字段可动态增加和删除
// @author       qql
// @match        *://*.taobao.com/*
// @match        *://*.zhihu.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/qiaoqileng/yh_script/refs/heads/master/dist/pppccc_script.youhou.js
// @downloadURL  https://raw.githubusercontent.com/qiaoqileng/yh_script/refs/heads/master/dist/pppccc_script.youhou.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';
    /***************** 默认配置及持久化存储 *****************/
    const defaultSiteConfig = {
        "taobao.com": {
            "itemSelector": "div#content_items_wrapper > div",
            "nextPageSelector": ".next-pagination-pages>button:nth-of-type(2)",
            "crawlInterval": 3000, // 每页间隔时间，单位毫秒
            "fields": {
                "title": "div#content_items_wrapper > div > a > div > div > div:nth-of-type(2) > div > span",
                "price": "div#content_items_wrapper > div > a > div > div > div:nth-of-type(4)  > div:nth-of-type(1)  > span:nth-of-type(1)",
                "image": "div#content_items_wrapper > div > a > div > div > div:nth-of-type(1)  > img:nth-of-type(1)",
                "店铺名称": "div#content_items_wrapper > div > a > div > div:last-child > div > a > div > span:last-child"
            }
        },
        "zhihu.com": {
            "itemSelector": ".QuestionItem",
            "nextPageSelector": "",
            "crawlInterval": 3000, // 每页间隔时间，单位毫秒
            "fields": {
                "title": ".QuestionItem-title",
                "content": ".QuestionItem-content",
                "answerCount": ".QuestionItem-action"
            }
        }
    };
    // 加载持久化配置
    let siteConfig = GM_getValue('siteConfig', defaultSiteConfig);

    let currentConfig = null;
    let currentDomain = '';
    let collectedData = [];
    let manualMode = true;
    // 用于过滤条件配置，结构示例：
    // {
    //   globalOp: "AND",
    //   fields: {
    //     title: { op: "AND", conditions: [ { operator: "contains", value: "小米" }, { operator: "not_contains", value: "联想" } ] },
    //     price: { op: "OR", conditions: [ { operator: "lt", value: "1000" }, { operator: "gt", value: "5000" } ] }
    //   }
    // }
    let filterConfig = {};

    // 根据当前域名获取对应配置
    function initConfig() {
        const host = location.hostname;
        for (const domain in siteConfig) {
            if (host.includes(domain)) {
                currentDomain = domain;
                currentConfig = siteConfig[domain];
                break;
            }
        }
    }

    /***************** 控制面板 *****************/
    function addControlPanel() {
        const panel = document.createElement('div');
        panel.style = `position: fixed; top: 20px; right: 20px; z-index: 9999;
                      background: white; padding: 10px; border: 1px solid #ccc;`;
        // 此处全选和反选按钮始终显示，点击时如果非手动模式则提示切换
        panel.innerHTML = `
            <div>
                <button id="toggleMode">当前模式：${manualMode ? '手动' : '自动'}</button>
                <button id="exportData">导出数据 (${collectedData.length})</button>
                <button id="selectAll">全选</button>
                <button id="invertSelect">反选</button>
                <button id="configSite">配置 siteConfig</button>
                <button id="exportConfig">导出配置</button>
                <button id="importConfig">导入配置</button>
            </div>
        `;
        document.body.appendChild(panel);
        document.getElementById('toggleMode').addEventListener('click', toggleMode);
        document.getElementById('exportData').addEventListener('click', showPreview);
        document.getElementById('configSite').addEventListener('click', openConfigPanel);
        document.getElementById('exportConfig').addEventListener('click', openExportConfigModal);
        document.getElementById('importConfig').addEventListener('click', openImportConfigModal);
        document.getElementById('selectAll').addEventListener('click', selectAllItems);
        document.getElementById('invertSelect').addEventListener('click', invertSelectItems);
    }

    // 切换模式：手动/自动，切换到自动模式时清空缓存
    function toggleMode() {
        manualMode = !manualMode;
        this.textContent = `当前模式：${manualMode ? '手动' : '自动'}`;
        if (manualMode) {
            initManualMode();
        } else {
            collectedData = []; // 清空缓存列表
            startAutoCrawl().then(() => {
                openFilterModal();
            });
        }
    }

    /***************** 数据采集 *****************/
    // 手动模式：为每个列表项添加复选框
    function initManualMode() {
        addCheckboxes();
        observeDOMChanges();
    }

    // 为每个列表项添加复选框（防重复添加）
    function addCheckboxes() {
        document.querySelectorAll(currentConfig.itemSelector).forEach(item => {
            if (!item.querySelector('.crawler-checkbox')) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'crawler-checkbox';
                checkbox.style.position = 'absolute';
                checkbox.style.right = '5px';
                checkbox.style.top = '5px';
                checkbox.style.zIndex = 99999;
                checkbox.addEventListener('change', e => {
                    const data = extractItemData(item);
                    if (e.target.checked) {
                        collectedData.push(data);
                    } else {
                        collectedData = collectedData.filter(d => d.id !== data.id);
                    }
                    document.getElementById('exportData').textContent =
                        `导出数据 (${collectedData.length})`;
                });
                item.style.position = 'relative';
                item.prepend(checkbox);
            }
        });
    }

    // 根据 currentConfig.fields 提取列表项数据，固定 id 存在 data-crawler-id 属性中
    function extractItemData(item) {
        let id = item.getAttribute('data-crawler-id');
        if (!id) {
            id = Math.random().toString(36).substr(2, 9);
            item.setAttribute('data-crawler-id', id);
        }
        const data = { id: id };
        for (const [field, selector] of Object.entries(currentConfig.fields)) {
            const el = item.querySelector(selector);
            if (el) {
                if (selector.includes('img') && el.src) {
                    data[field] = el.src;
                } else {
                    data[field] = el.textContent.trim();
                }
            } else {
                data[field] = '';
            }
        }
        return data;
    }

    // 自动采集：遍历当前页，采集数据，再依次点击下一页（若存在且未禁用）
    async function startAutoCrawl() {
        collectedData = [];
        while (true) {
            document.querySelectorAll(currentConfig.itemSelector).forEach(item => {
                const data = extractItemData(item);
                if (!collectedData.some(d => d.id === data.id)) {
                    collectedData.push(data);
                }
            });
            const nextPage = document.querySelector(currentConfig.nextPageSelector);
            // 先滚动到页面底部，确保懒加载内容加载
            if (nextPage) {
                nextPage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            await waitForPageLoad();
            if (nextPage) {
                const isDisabled = nextPage.disabled ||
                    nextPage.classList.contains('disabled') ||
                    nextPage.getAttribute('aria-disabled') === 'true';
                if (!isDisabled) {
                    nextPage.click();
                    nextPage.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await waitForPageLoad();
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    // 等待函数，间隔时间使用当前配置中的 crawlInterval（默认为2000毫秒）
    function waitForPageLoad() {
        const interval = currentConfig.crawlInterval || 2000;
        return new Promise(resolve => setTimeout(resolve, interval));
    }

    /***************** 全选和反选（手动模式） *****************/
    function selectAllItems() {
        if (!manualMode) {
            alert("请切换到手动模式后再操作！");
            return;
        }
        document.querySelectorAll(currentConfig.itemSelector).forEach(item => {
            const checkbox = item.querySelector('.crawler-checkbox');
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                // 手动触发 change 事件
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    function invertSelectItems() {
        if (!manualMode) {
            alert("请切换到手动模式后再操作！");
            return;
        }
        document.querySelectorAll(currentConfig.itemSelector).forEach(item => {
            const checkbox = item.querySelector('.crawler-checkbox');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    /***************** 数据预览与导出 *****************/
    // 预览数据（使用过滤后的数据，若过滤未设置则为全部数据）
    function showPreview(filteredData = null) {
        const dataToShow = manualMode ? collectedData : filteredData;
        if (dataToShow) {
            const modal = document.createElement('div');
            modal.className = 'config-modal';
            modal.style.zIndex = 9999999999;
            modal.innerHTML = `
            <div>
                <h3>预览数据（共 ${dataToShow.length} 条）</h3>
                <div style="max-height:300px; overflow:auto;">
                    <table border="1" style="border-collapse: collapse; width:100%;">
                        <thead>
                            <tr>${Object.keys(dataToShow[0] || {}).map(h => `<th style="padding:5px;">${h}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${dataToShow.map(item => `<tr>${Object.keys(item).map(key => `<td style="padding:5px;">${item[key]}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                <br>
                <button id="confirmExport">确认导出Excel</button>
                <button id="closePreview">关闭</button>
            </div>
        `;
            document.body.appendChild(modal);
            document.getElementById('confirmExport').addEventListener('click', () => {
                exportToExcel(dataToShow);
                modal.remove();
            });
            document.getElementById('closePreview').addEventListener('click', () => {
                modal.remove();
            });
        }
    }

    // 利用 SheetJS 导出 Excel 文件
    function exportToExcel(dataToExport) {
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        XLSX.writeFile(wb, `crawler_data_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    /***************** 观察 DOM 变化 *****************/
    // 自动为新增列表项添加复选框
    function observeDOMChanges() {
        const observer = new MutationObserver(() => addCheckboxes());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /***************** 配置面板及导入导出 *****************/
    // 打开 siteConfig 配置面板（编辑当前站点配置），支持字段的新增与删除
    function openConfigPanel() {
        const modal = document.createElement('div');
        modal.className = 'config-modal';
        modal.style.width = '600px';
        modal.style.zIndex = 9999999999;
        modal.innerHTML = `
        <h3>配置当前站点 (${currentDomain})</h3>
        <div>
            <label>列表项选择器: </label>
            <input type="text" id="config_itemSelector" value="${currentConfig.itemSelector}" style="width:80%;"/>
            <button id="select_itemSelector">选择元素</button>
        </div>
        <div>
            <label>下一页选择器: </label>
            <input type="text" id="config_nextPageSelector" value="${currentConfig.nextPageSelector}" style="width:80%;"/>
            <button id="select_nextPageSelector">选择元素</button>
        </div>
        <div>
            <label>每页爬取间隔（毫秒）: </label>
            <input type="number" id="config_crawlInterval" value="${currentConfig.crawlInterval || 2000}" style="width:80%;"/>
        </div>
        <div id="fieldsContainer">
            <h4>字段配置</h4>
            <div id="fieldsList">
                ${Object.entries(currentConfig.fields).map(([key, selector]) => `
                    <div class="field-row">
                        <input type="text" class="config_field_key" value="${key}" style="width:20%;" />
                        <input type="text" class="config_field_value" value="${selector}" style="width:50%;" />
                        <button class="select_field">选择元素</button>
                        <button class="delete_field">删除</button>
                    </div>
                `).join('')}
            </div>
            <button id="addField">添加字段</button>
        </div>
        <button id="saveConfig">保存配置</button>
        <button id="closeConfig">取消</button>
    `;
        document.body.appendChild(modal);

        document.getElementById('select_itemSelector').addEventListener('click', () => {
            enableElementSelection(document.getElementById('config_itemSelector'));
        });
        document.getElementById('select_nextPageSelector').addEventListener('click', () => {
            enableElementSelection(document.getElementById('config_nextPageSelector'));
        });

        modal.querySelectorAll('.select_field').forEach(button => {
            button.addEventListener('click', (e) => {
                const row = e.target.closest('.field-row');
                const input = row.querySelector('.config_field_value');
                enableElementSelection(input);
            });
        });

        modal.querySelectorAll('.delete_field').forEach(button => {
            button.addEventListener('click', (e) => {
                const row = e.target.closest('.field-row');
                row.remove();
            });
        });

        document.getElementById('addField').addEventListener('click', () => {
            const fieldsList = document.getElementById('fieldsList');
            const newRow = document.createElement('div');
            newRow.className = 'field-row';
            newRow.innerHTML = `
                <input type="text" class="config_field_key" value="" placeholder="字段名称" style="width:20%;" />
                <input type="text" class="config_field_value" value="" placeholder="选择器" style="width:50%;" />
                <button class="select_field">选择元素</button>
                <button class="delete_field">删除</button>
            `;
            fieldsList.appendChild(newRow);
            newRow.querySelector('.select_field').addEventListener('click', (e) => {
                const row = e.target.closest('.field-row');
                const input = row.querySelector('.config_field_value');
                enableElementSelection(input);
            });
            newRow.querySelector('.delete_field').addEventListener('click', (e) => {
                e.target.closest('.field-row').remove();
            });
        });
        document.getElementById('saveConfig').addEventListener('click', () => {
            currentConfig.itemSelector = document.getElementById('config_itemSelector').value.trim();
            currentConfig.nextPageSelector = document.getElementById('config_nextPageSelector').value.trim();
            currentConfig.crawlInterval = parseInt(document.getElementById('config_crawlInterval').value.trim(), 10) || 2000;
            const newFields = {};
            document.querySelectorAll('#fieldsList .field-row').forEach(row => {
                const key = row.querySelector('.config_field_key').value.trim();
                const value = row.querySelector('.config_field_value').value.trim();
                if (key) {
                    newFields[key] = value;
                }
            });
            currentConfig.fields = newFields;
            siteConfig[currentDomain] = currentConfig;
            GM_setValue('siteConfig', siteConfig);
            alert('配置已保存！');
            modal.remove();
        });
        document.getElementById('closeConfig').addEventListener('click', () => {
            modal.remove();
        });
    }

    // 导出配置：弹出对话框显示 JSON 字符串，便于复制保存
    function openExportConfigModal() {
        const modal = document.createElement('div');
        modal.className = 'config-modal';
        modal.style.width = '500px';
        modal.style.zIndex = 9999999999;
        modal.innerHTML = `
            <h3>导出配置</h3>
            <textarea id="exportConfigText" style="width:100%;height:200px;">${JSON.stringify(siteConfig, null, 2)}</textarea>
            <br>
            <button id="closeExportConfig">关闭</button>
        `;
        document.body.appendChild(modal);
        document.getElementById('closeExportConfig').addEventListener('click', () => {
            modal.remove();
        });
    }

    // 导入配置：弹出对话框输入 JSON，成功后更新配置
    function openImportConfigModal() {
        const modal = document.createElement('div');
        modal.className = 'config-modal';
        modal.style.width = '500px';
        modal.style.zIndex = 9999999999;
        modal.innerHTML = `
            <h3>导入配置</h3>
            <textarea id="importConfigText" placeholder="粘贴配置JSON" style="width:100%;height:200px;"></textarea>
            <br>
            <button id="doImportConfig">导入</button>
            <button id="closeImportConfig">关闭</button>
        `;
        document.body.appendChild(modal);
        document.getElementById('doImportConfig').addEventListener('click', () => {
            try {
                const newConfig = JSON.parse(document.getElementById('importConfigText').value);
                siteConfig = newConfig;
                GM_setValue('siteConfig', siteConfig);
                alert('配置已导入！');
                modal.remove();
            } catch (e) {
                alert('导入失败，请检查JSON格式。');
            }
        });
        document.getElementById('closeImportConfig').addEventListener('click', () => {
            modal.remove();
        });
    }

    // 启用元素选取模式：点击页面元素后自动生成其 CSS 选择器填入对应输入框
    function enableElementSelection(inputElement) {
        function onClick(event) {
            event.preventDefault();
            event.stopPropagation();
            const el = event.target;
            const selector = getCssPath(el);
            inputElement.value = selector;
            document.removeEventListener('click', onClick, true);
            if (tempStyle) tempStyle.remove();
        }
        const tempStyle = document.createElement('style');
        tempStyle.innerHTML = `*:hover { outline: 2px solid red !important; }`;
        document.head.appendChild(tempStyle);
        document.addEventListener('click', onClick, true);
    }

    // 简单实现 CSS 路径生成
    function getCssPath(el) {
        if (!(el instanceof Element))
            return '';
        const path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector += '#' + el.id;
                path.unshift(selector);
                break;
            } else {
                let sib = el, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() === selector)
                        nth++;
                }
                if (nth !== 1)
                    selector += `:nth-of-type(${nth})`;
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
    }

    /***************** 过滤条件配置（自动模式） *****************/
    // 弹出过滤条件对话框，允许对各字段设置条件（支持添加、删除条件和设置组合方式）
    function openFilterModal() {
        filterConfig = { globalOp: "AND", fields: {} };
        Object.keys(currentConfig.fields).forEach(field => {
            filterConfig.fields[field] = { op: "AND", conditions: [] };
        });
        const modal = document.createElement('div');
        modal.className = 'config-modal';
        modal.style.width = '600px';
        modal.style.zIndex = 9999999999;
        modal.innerHTML = `
            <h3>设置过滤条件</h3>
            <div>
                <label>全局条件组合: </label>
                <select id="global-combine">
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                </select>
            </div>
            <div id="filterFieldsContainer">
                ${Object.keys(currentConfig.fields).map(field => `
                    <div style="border:1px solid #ccc; margin:10px 0; padding:5px;">
                        <h4>字段：${field}</h4>
                        <div>
                            <label>条件组合: </label>
                            <select class="field-combine" data-field="${field}">
                                <option value="AND">AND</option>
                                <option value="OR">OR</option>
                            </select>
                        </div>
                        <div class="conditions-container" data-field="${field}">
                        </div>
                        <button class="add-condition" data-field="${field}">添加条件</button>
                    </div>
                `).join('')}
            </div>
            <br>
            <button id="confirmFilter">确认过滤</button>
            <button id="cancelFilter">取消</button>
        `;
        document.body.appendChild(modal);

        modal.querySelectorAll('.add-condition').forEach(btn => {
            btn.addEventListener('click', e => {
                const field = e.target.getAttribute('data-field');
                const container = modal.querySelector(`.conditions-container[data-field="${field}"]`);
                const conditionRow = document.createElement('div');
                conditionRow.className = 'condition-row';
                conditionRow.innerHTML = `
                    <select class="condition-operator">
                        <option value="contains">包含</option>
                        <option value="not_contains">不包含</option>
                        <option value="lt">小于</option>
                        <option value="gt">大于</option>
                        <option value="eq">等于</option>
                    </select>
                    <input type="text" class="condition-value" placeholder="条件值">
                    <button class="remove-condition">删除</button>
                `;
                container.appendChild(conditionRow);
                conditionRow.querySelector('.remove-condition').addEventListener('click', () => {
                    conditionRow.remove();
                });
            });
        });

        document.getElementById('confirmFilter').addEventListener('click', () => {
            filterConfig.globalOp = document.getElementById('global-combine').value;
            modal.querySelectorAll('.field-combine').forEach(select => {
                const field = select.getAttribute('data-field');
                filterConfig.fields[field].op = select.value;
            });
            modal.querySelectorAll('.conditions-container').forEach(container => {
                const field = container.getAttribute('data-field');
                const conditions = [];
                container.querySelectorAll('.condition-row').forEach(row => {
                    const operator = row.querySelector('.condition-operator').value;
                    const value = row.querySelector('.condition-value').value.trim();
                    if (value) {
                        conditions.push({ operator, value });
                    }
                });
                filterConfig.fields[field].conditions = conditions;
            });
            const filteredData = applyFilters(collectedData, filterConfig);
            modal.remove();
            showPreview(filteredData);
        });

        document.getElementById('cancelFilter').addEventListener('click', () => {
            modal.remove();
            showPreview();
        });
    }

    // 根据 filterConfig 过滤数据，返回过滤后的数据数组
    function applyFilters(data, config) {
        return data.filter(item => {
            const fieldResults = Object.keys(config.fields).map(field => {
                const { op, conditions } = config.fields[field];
                if (!conditions.length) return true;
                const fieldValue = item[field] || '';
                const results = conditions.map(cond => {
                    const { operator, value } = cond;
                    switch(operator) {
                        case "contains":
                            return fieldValue.includes(value);
                        case "not_contains":
                            return !fieldValue.includes(value);
                        case "lt":
                            return parseFloat(fieldValue) < parseFloat(value);
                        case "gt":
                            return parseFloat(fieldValue) > parseFloat(value);
                        case "eq":
                            return fieldValue === value;
                        default:
                            return false;
                    }
                });
                if (op === "AND") {
                    return results.every(r => r === true);
                } else {
                    return results.some(r => r === true);
                }
            });
            if (config.globalOp === "AND") {
                return fieldResults.every(r => r === true);
            } else {
                return fieldResults.some(r => r === true);
            }
        });
    }

    /***************** 初始化 *****************/
    function init() {
        GM_addStyle(`
            .crawler-checkbox { transform: scale(1.2); cursor: pointer; }
            table td, table th { max-width: 300px; overflow: hidden; }
            .config-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: white; padding: 20px; z-index: 10000; box-shadow: 0 0 10px rgba(0,0,0,0.3); }
            .config-modal input, .config-modal textarea, .config-modal select { margin: 5px 0; }
            .field-row { margin-bottom: 5px; }
        `);
        initConfig();
        if (currentConfig) {
            addControlPanel();
            if (manualMode) {
                initManualMode();
            }
        } else {
            console.error("当前站点没有配置，请在配置面板中添加配置！");
        }
    }

    setTimeout(init, 2000);
})();
