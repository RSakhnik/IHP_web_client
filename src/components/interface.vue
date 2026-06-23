<template>
  <div class = "ai_chat_bim">
    <div class="header">
      <h1> Чат с помощником </h1>
    </div>
    <div class = "bim-main" v-if="!this.debugMode">
      <div class="bim-chat-history">
        <div v-for="(msg, index) in messages" :key="index" 
          :class="['bim-message', msg.type]">
          <div class="bim-message-bubble">
            <p>{{ msg.text }}</p>
            <div class="message-actions">
              <button 
                class="copy-bttn" 
                @click="copyMessage(msg.text)">
                📋
              </button>
              <button 
                v-if="msg.type === 'assistant' && !msg.isLoading && !msg.isCancel && msg.isReport"
                class="action-bttn" 
                @click="makeAction(msg.text)">
                ▶
              </button>
              <button v-if="msg.isLoading" class="cancel-bttn" @click="cancelRequest">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="debug-window" v-else>
      <div class="debug-history">
        <div v-for="(log, index) in logs" :key="index" 
          :class="['bim-logs', log.type]">
          <div class="bim-log-bubble">
            <p>{{ log.text }}</p>
          </div>
        </div>
      </div>
    </div>
    <div class = "bim-send_messages">
      <input type = "text" class="bim-input" placeholder = "Введите запрос" v-model="question" @keyup.enter="sendMessage">
      <div class = "bim-send">
        <button class = "button" @click="sendMessage"> ↑ </button>
      </div>
    </div>
    <div class = "bim-settings">
      <div class="debug-mode">
          <label class="debug-toggle">
            <span class="debug-label">Режим отладки</span>
              <input type="checkbox" v-model="debugMode">
            <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="clear_button">
        <button class = "button" @click="ClearModel"> Очистить </button>
      </div>
    </div>
  </div>
</template>

<script>

export default {
  props: {
    viewer: Object,
    objectsRepository: Object,
    bimFeatures: Object,
    extension: Object,
    excelData: Object,
  },
  data() {
    return {
      question: '',
      ask: '',
      messages: [],
      current_msgs: [],
      logs: [],
      dataStore: {},
      dataStoreByFeatures: {},
      geometry: {},
      availableAttrs: [],
      availableGroups: [], 
      availablePropertiesByGroup: {},
      isLoading: false,
      loadingDots: '',
      loadingInterval: null,
      abortController: null,
      isLoadingModel: false,
      isCancelLoading: false,
      lastSearchForReport: null,
      contextId: null,
      eventSource: null,
      handledEventIds: null,
      previousSearch: { ids: [], element_ids: [], count: 0 },
      currentSelection: [],
      streamReader: null,
      propertiesCache: {},
      lastReportData: null,
      debugMode: false,
    }
  },
  mounted() {
    //this.loadModel();
  },
  methods: {

    async sendToACS(prompt) {
      
      try {
        const response = await fetch('https://360pilot.ru:5546/acs/api/v1/query', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer @r6|zzN1B?270{O0xn?JkCtWjTpi~Z',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: prompt,
            context_id: this.contextId
          })
        });

        if (!response.ok) {
          let errorText = '';
          try {
            errorText = await response.text();
          } catch(e) {
            errorText = 'Не удалось прочитать тело ошибки';
          }
          
          if (response.status === 401) {
            throw new Error('Ошибка авторизации. Проверьте токен.');
          }
          
          if (response.status === 400) {
            this.contextId = null;
            this.sendToACS();
          }
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        this.contextId = data.context_id;

        return {
          success: true,
          context_id: data.context_id,
          status: data.status,
          data: data
        };

      } catch (error) {
        console.error('Ошибка при отправке запроса:', error);
        
        this.messages.push({
          text: `Ошибка подключения к ACS: ${error.message}`,
          type: 'error'
        });
        
        return {
          success: false,
          error: error.message
        };
      }
    },

    async listenToACS(contextId) {
      if (this.eventSource) {
        return
      }

      try {
        const response = await fetch(`https://360pilot.ru:5546/acs/api/v1/stream/${contextId}`, {
          headers: {
            'Authorization': 'Bearer @r6|zzN1B?270{O0xn?JkCtWjTpi~Z',
            'Accept': 'text/event-stream'
          },
          signal: this.abortController?.signal 
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        this.streamReader = reader;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Stream завершён');
             this.streamReader = null;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                const data = JSON.parse(jsonStr);
                console.log('Получено SSE:', data);
                
                await this.handleSSEEvent(data);
                
                if (data.status === 'error') {
                  reader.cancel();
                  this.streamReader = null;
                  return data;
                }
              } catch (e) {
                console.error('Ошибка парсинга:', e);
              }
            }
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Запрос отменён');
          return;
        }
        console.error('Ошибка SSE:', error);
        throw error;
      }
    },

    async handleSSEEvent(event) {
      const { status, data, event_id } = event;
      
      if (this.handledEventIds && this.handledEventIds.has(event_id)) {
        return;
      }

      if (!this.handledEventIds) {
        this.handledEventIds = new Set();
      }
      this.handledEventIds.add(event_id);

      switch (status) {
        case 'processing':
          break;

        case 'tool_call':
          const result = await this.executeToolCall(data);
          if (result && result.message) {
            this.current_msgs.push(result);
            console.log(this.current_msgs)
          }
          break;

        case 'success':
          this.stopLoadingAnimation();
          let message = 'Выполнено:\n';
          let isReport = false;
          for (const msg of this.current_msgs) {
            message += `${msg.message}\n`;
            if (msg.isReport) {
              isReport = true;
            }
          }
          this.messages.push({
            text: message,
            type: 'assistant',
            isReport: isReport,
          })
          this.current_msgs = [];
          break;

        case 'error':
          this.stopLoadingAnimation();
          this.messages.push({
            text: `Ошибка: ${data?.error || 'Неизвестная ошибка'}`,
            type: 'error'
          });
          this.logs.push({
            text: `Ошибка: ${data?.error || 'Неизвестная ошибка'}`,
            type: 'error'
          });
          if (this.streamReader) {
            this.streamReader.cancel();
            this.streamReader = null;
          }
          this.contextId = null;
          this.handledEventIds = null;
          this.current_msgs = [];
          break;

        case 'warning':
          console.warn('Предупреждение:', data);
          break;

        default:
          console.warn('Неизвестный статус:', status);
      }
    },

    async executeToolCall(toolData) {
      const { tool, arguments: args, sequence, total } = toolData;

      //this.updateLoadingMessage(`Шаг ${sequence}/${total}: ${this.getToolLabel(tool)}`);
      let result = null;

      switch (tool) {
        case 'bim.search':
          result = await this.executeBimSearch(args);
          break;
            
        case 'bim.search_and_visualize':
          result = await this.executeBimSearchAndVisualize(args);
          break;
            
        case 'bim.visualize':
          result = await this.executeBimVisualize(args);
          break;
            
        case 'bim.get_properties':
          result = await this.executeBimGetProperties(args);
          break;
            
        case 'report.create_preview':
          result = await this.executeReportCreatePreview(args);
          break;
            
        default:
          console.log(`Неизвестная команда: ${tool}`)
          return {
            text: `Неизвестная команда: ${tool}`,
            type: 'assistant'
          }
      }

      return result
    },

    getToolLabel(tool) {
      const labels = {
        'bim.search': 'поиск элементов',
        'bim.search_and_visualize': 'поиск и визуализация',
        'bim.visualize': 'визуализация',
        'bim.get_properties': 'получение свойств',
        'report.create_preview': 'создание отчёта'
      };
      return labels[tool] || tool;
    },

    async executeBimSearch(args) {
      const { search } = args;
      const { dsl, selection_behavior, visible_only, limit } = search;

      const result = await this.searchElements(dsl);

      this.previousSearch = {
        ids: result.ids,
        element_ids: result.element_ids,
        count: result.count,
      };

      this.logs.push({text:`Произведен поиск по критерию: ${dsl}. Найдено ${result.count} элементов.`, type: 'assistant'});

      return {
        message: result.message,
        count: result.count,
        ids: result.ids,
      };
    },

    async executeBimSearchAndVisualize(args) {
      const { search, action } = args;
      
      const searchResult = await this.executeBimSearch(args);
      
      if (searchResult.count === 0) {
        //this.logs.push({text:`Произведен поиск по критерию: ${search.dsl}. Ничего не найдено по запросу.`, type: 'assistant'});
        return {
          message: `Ничего не найдено по запросу`,
          count: 0,
          ids: []
        };
      }

      if (action) {
        await this.applyActionToElements(searchResult.ids, action);
      }

      let message = `Найдено ${searchResult.count} элементов`;
      
      if (action) {
        const actionText = this.getActionDescription(action);
        message += ` и применено действие: ${actionText}`;
      }

      this.logs.push({text:`Произведен поиск по критерию: ${search.dsl}. Найдено ${searchResult.count} элементов.` + message, type: 'assistant'});

      return {
        message: message,
        count: searchResult.count,
        ids: searchResult.ids
      };
    },

    async executeBimVisualize(args) {
      const { element_ids_source, action } = args;
      
      let ids = [];
      
      if (element_ids_source === 'current_selection') {
        ids = this.currentSelection || [];
      } else if (element_ids_source === 'previous_search') {
        ids = this.previousSearch?.ids || [];
      } else {
        throw new Error(`Неизвестный источник: ${element_ids_source}`);
      }
      
      if (ids.length === 0) {
        console.log('Нет элементов для визуализации');
      }
      
      await this.applyActionToElements(ids, action);
      
      let message = `Визуализация применена к ${ids.length} элементам`;
      if (action) {
        const actionText = this.getActionDescription(action);
        message += `: ${actionText}`;
      }

      this.logs.push({text:`Произведена визуализация для: ${element_ids_source}. ` + message, type: 'assistant'});
      
      return {
        message: message,
        count: ids.length,
        ids: ids
      };
    },

    async executeBimGetProperties(args) {
      const { element_ids_source, attributes } = args;
      
      let ids = [];
      
      if (element_ids_source === 'current_selection') {
        ids = this.currentSelection || [];
      } else if (element_ids_source === 'previous_search') {
        ids = this.previousSearch?.element_ids || [];
      } else {
        throw new Error(`Неизвестный источник: ${element_ids_source}`);
      }
      
      const properties = {};
      for (const id of ids) {
        const attrs = this.dataStore[id];
        if (attrs) {
          properties[id] = {};
          for (const attr of attributes) {
            properties[id][attr] = attrs[attr] || '-';
          }
        }
      }
      
      this.propertiesCache = properties;
      
      this.logs.push({text:`Произведена поиск атрибутов: ${attributes.toString()} для ${element_ids_source}. Получены свойства для ${Object.keys(properties).length} элементов`, type: 'assistant'});

      return {
        message: `Получены свойства для ${Object.keys(properties).length} элементов`,
        count: Object.keys(properties).length
      };
    },

    async executeReportCreatePreview(args) {
      const { report_plan } = args;
      const { requested_attributes } = report_plan.intent || {};
      
      const ids = this.previousSearch?.element_ids || [];
      
      const headers = report_plan.attributes || ['ElementId', 'Name', 'Type'];
      
      const rows = [];
      for (const id of ids) {
        const attrs = this.dataStore[id];
        if (attrs) {
          const row = {};
          for (const header of headers) {
            row[header] = attrs[header] || '-';
          }
          rows.push(row);
        }
      }

      const columns = headers.map(header => ({
        field: header,
        label: header
      }));
          
      this._lastReportParams = {
        rows: rows,
        columns: columns,
        calculatedColumns: [],
        includeTotals: true,
        totalCount: ids.length,
        foundIds: ids
      };

      this.logs.push({text:`Произведено построение отчета с атрибутами: ${report_plan.attributes.toString()}.`, type: 'assistant'});
      
      return {
        message: `Отчёт готов (${rows.length} элементов). Нажмите ▶ для предпросмотра.`,
        count: rows.length,
        hasReport: true,
        isReport: true
      };
    },

    async applyActionToElements(ids, action) {
      if (!this.viewer || !this.viewer.model) {
        console.warn('Viewer не инициализирован');
        return;
      }

      try {
        const model = this.viewer.model;
        
        model.clearColors();
        model.clearSelection();
        model.showAll();

        if (action.select && ids.length > 0) {
          this.currentSelection = ids;
          try {
            const modelParts = model.getAllModelParts ? model.getAllModelParts() : [];
            if (modelParts.length > 0) {
              const partId = modelParts[0]?.id || modelParts[0];
              if (partId) {
                model.select(ids, partId, 0); 
              }
            }
          } catch(e) {
            console.warn('Не удалось выделить элементы:', e);
          }
        }

        if (action.color && action.color.rgb && ids.length > 0) {
          const [r, g, b] = action.color.rgb;
          let colored = 0;
          for (const id of ids) {
            const geomIds = this.geometry[id] || [id];
            for (const geomId of geomIds) {
              try {
                model.setColor(geomId, r, g, b, 1); 
                colored++;
              } catch(e) {}
            }
          }
        }

        if (action.isolate && ids.length > 0) {
          try {
            const modelParts = model.getAllModelParts ? model.getAllModelParts() : [];
            if (modelParts.length > 0) {
              const partId = modelParts[0]?.id || modelParts[0];
              if (partId) {
                model.isolate(ids, partId, true);
              }
            }
          } catch(e) {
            console.warn('Не удалось изолировать элементы:', e);
          }
        }

        if (action.hide_others && ids.length > 0) {
          try {
            const allIds = this.getAllElementIds();
            const toHide = allIds.geometry.filter(id => !ids.includes(id));
            if (toHide.length > 0) {
              model.hide(toHide);
            }
          } catch(e) {
            console.warn('Не удалось скрыть элементы:', e);
          }
        }

      } catch (e) {
        console.warn('Ошибка визуализации:', e);
        throw new Error(`Ошибка при применении визуализации: ${e.message}`);
      }
    },

    getAllElementIds() {
      const results = { elements: [], geometry: [] };
      for (const [elementId, attributes] of Object.entries(this.dataStore)) {
        results.elements.push(elementId);
        const geomIds = this.geometry[elementId];
        if (geomIds && geomIds.length > 0) {
          for (const geomId of geomIds) {
            if (!results.geometry.includes(geomId)) {
              results.geometry.push(geomId);
            }
          }
        } else {
          if (!results.geometry.includes(elementId)) {
            results.geometry.push(elementId);
          }
        }
      }
      return results;
    },

    getActionDescription(action) {
      const parts = [];
      
      if (action.select) parts.push('выделение');
      if (action.color) parts.push(`покраска в ${action.color.name || 'цвет'}`);
      if (action.isolate) parts.push('изоляция');
      if (action.hide_others) parts.push('скрытие остальных');
      
      return parts.length > 0 ? parts.join(', ') : 'визуализация';
    },

    async searchElements(dsl) {
  
      let ast = this.parseDSL(dsl);
      if (!ast) {
        return { ids: [], count: 0, message: 'Не удалось разобрать запрос' };
      }
      
      const result = this.executeSearch(ast);
      
      this._lastSearchResult = { element_ids: result.elements_ids, geometry: result.geometry_ids, count: result.geometry_ids.length };
      this.lastSearchForReport = this._lastSearchResult;
      
      return {
        ids: result.geometry_ids,
        element_ids: result.elements_ids,
        count: result.geometry_ids.length,
        message: `Найдено ${result.geometry_ids.length} элементов. Условие: (${dsl})`
      };
    },

    parseDSL(dsl) {
      if (!dsl || typeof dsl !== 'string') return null;
      dsl = dsl.trim();
      if (!dsl) return null;
      while (dsl.startsWith('(') && dsl.endsWith(')')) {
        const inner = dsl.slice(1, -1).trim();
        if (this.hasOperatorAtTopLevel(inner)) {
          dsl = inner;
        } else {
          break;
        }
      }
      const notMatch = dsl.match(/^NOT\s+(.+)$/i);
      if (notMatch) {
        const child = this.parseDSL(notMatch[1]);
        if (child) {
          return { type: 'not', child };
        }
        return null;
      }
      const parts = this.findOperator(dsl);
      if (parts) {
        const left = this.parseDSL(parts.left);
        const right = this.parseDSL(parts.right);
        if (left && right) {
          return {
            type: 'logical',
            operator: parts.operator,
            left,
            right
          };
        }
        return null;
      }
      const condition = this.parseCondition(dsl);
      if (condition) {
        return { type: 'condition', ...condition };
      }
      return null;
    },

    hasOperatorAtTopLevel(str) {
      let depth = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') depth++;
        if (str[i] === ')') depth--;
        if (depth === 0) {
          const remaining = str.substring(i);
          if (/^AND\s+/i.test(remaining) || /^OR\s+/i.test(remaining)) {
            return true;
          }
        }
      }
      return false;
    },

    findOperator(str) {
      let depth = 0;
      let lastIndex = -1;
      let lastOperator = '';
      for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') depth++;
        if (str[i] === ')') depth--;
        if (depth === 0) {
          const remaining = str.substring(i);
          const andMatch = remaining.match(/^AND\s+/i);
          if (andMatch) {
            lastIndex = i;
            lastOperator = 'AND';
          }
          const orMatch = remaining.match(/^OR\s+/i);
          if (orMatch) {
            lastIndex = i;
            lastOperator = 'OR';
          }
        }
      }
      if (lastIndex !== -1) {
        const opLen = lastOperator === 'AND' ? 3 : 2;
        return {
          left: str.substring(0, lastIndex).trim(),
          right: str.substring(lastIndex + opLen).trim(),
          operator: lastOperator
        };
      }
      return null;
    },

    parseCondition(expr) {
      expr = expr.trim();
      
      while (expr.startsWith('(') && expr.endsWith(')')) {
        const inner = expr.slice(1, -1).trim();
        if (!this.hasOperatorAtTopLevel(inner)) {
          expr = inner;
        } else {
          break;
        }
      }

      let match = expr.match(/^\["(.+?)"\](.+?)\.(Contains|Exists)\(["']?(.*?)["']?\)$/);
      if (match) {
        return {
          attribute: `["${match[1]}"]${match[2]}`,
          operator: match[3].toLowerCase(),
          value: match[4] || null
        };
      }

      match = expr.match(/^(.+?)\.(Contains|Exists)\(["']?(.*?)["']?\)$/);
      if (match) {
        return {
          attribute: this.cleanAttr(match[1]),
          operator: match[2].toLowerCase(),
          value: match[3] || null
        };
      }
      
      match = expr.match(/^\["(.+?)"\](.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
      if (match) {
        const attribute = `["${match[1]}"]${match[2]}`;
        const operator = match[3];
        let value = match[4].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
          return { attribute, operator, value: numValue };
        }
        return { attribute, operator, value };
      }
      
      match = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
      if (match) {
        const attribute = this.cleanAttr(match[1]);
        const operator = match[2];
        let value = match[3].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
          return { attribute, operator, value: numValue };
        }
        return { attribute, operator, value };
      }
      
      return null;
    },

    cleanAttr(attr) {
      attr = attr.trim();
      if ((attr.startsWith('"') && attr.endsWith('"')) ||
          (attr.startsWith("'") && attr.endsWith("'"))) {
        attr = attr.slice(1, -1);
      }
      return attr;
    },

    executeSearch(ast) {
      if (!ast) return [];
      const geometryEl = [];
      const elements = [];
      for (const [elementId, attributes] of Object.entries(this.dataStore)) {
        if (this.evaluate(ast, elementId, attributes)) {
          elements.push(elementId);
          const geomIds = this.geometry[elementId];
          if (geomIds && geomIds.length > 0) {
            for (const geomId of geomIds) {
              if (!geometryEl.includes(geomId)) geometryEl.push(geomId);
            }
          } else {
            if (!geometryEl.includes(elementId)) geometryEl.push(elementId);
          }
        }
      }
      return {elements_ids: elements, geometry_ids: geometryEl};
    },

    evaluate(node, elementId, attributes) {
      if (!node) return false;
      switch (node.type) {
        case 'condition':
          const attrValue = this.getAttributeValue(elementId, attributes, node.attribute);
          return this.checkCondition(attrValue, node.operator, node.value);
        case 'logical':
          const left = this.evaluate(node.left, elementId, attributes);
          const right = this.evaluate(node.right, elementId, attributes);
          return node.operator === 'AND' ? (left && right) : (left || right);
        case 'not':
          return !this.evaluate(node.child, elementId, attributes);
        default:
          return false;
      }
    },

    checkCondition(attrValue, operator, searchValue) {
      if (attrValue === undefined || attrValue === null) {
        if (operator === 'exists') return false;
        if (operator === '!=') return true;
        return false;
      }
      if (operator === 'exists') {
        return true;
      }
      const strValue = String(attrValue);
      const strSearch = String(searchValue !== null ? searchValue : '');
      const numAttr = parseFloat(strValue.replace(/[^0-9.-]/g, ''));
      const numSearch = parseFloat(String(searchValue).replace(/[^0-9.-]/g, ''));
      const isNumeric = !isNaN(numAttr) && !isNaN(numSearch) && isFinite(numAttr) && isFinite(numSearch);
      switch (operator) {
        case 'contains':
          return strValue.toLowerCase().includes(strSearch.toLowerCase());
        case '==':
          if (isNumeric) return Math.abs(numAttr - numSearch) < 0.001;
          return strValue.toLowerCase() === strSearch.toLowerCase();
        case '!=':
          if (isNumeric) return Math.abs(numAttr - numSearch) >= 0.001;
          return strValue.toLowerCase() !== strSearch.toLowerCase();
        case '>':
          return isNumeric && numAttr > numSearch;
        case '>=':
          return isNumeric && numAttr >= numSearch;
        case '<':
          return isNumeric && numAttr < numSearch;
        case '<=':
          return isNumeric && numAttr <= numSearch;
        default:
          return false;
      }
    },

    copyMessage(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Ошибка:', err);
      }
      
      document.body.removeChild(textarea);
    },

    async sendMessage() {
      const userMessage = this.question;

      if (!userMessage.trim()) return;

      if (this.abortController) {
        this.abortController.abort();
      }

      this.abortController = new AbortController();

      this.question = '';
      this.messages.push({ text: userMessage, type: 'user' }); 
      this.logs.push({text: userMessage, type: 'user'});

      this.startLoadingAnimation();

      await this.loadModel();

      try {
        const result = await this.sendToACS(userMessage);
        
        if (!result.success) {
          this.stopLoadingAnimation();
          this.messages.push({
            text: `Ошибка: ${result.error}`,
            type: 'error'
          });
          this.logs.push({
            text: `Ошибка: ${result.error}`,
            type: 'error'
          });
          return;
        }

        if (!this.streamReader) {
          this.listenToACS(result.context_id).catch(err => {
            console.error('Ошибка в стриме:', err);
          });
        } else {
          console.log('Стрим уже активен, ждём новые события');
        }
        
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        console.error('Ошибка в sendMessage:', error);
        this.stopLoadingAnimation();
        this.messages.push({
          text: `Ошибка: ${error.message}`,
          type: 'error'
        });
        this.logs.push({
            text: `Ошибка: ${error.message}`,
            type: 'error'
        });
      } finally {
        this.abortController = null;
      }
    },

    async loadModel() {
      if (Object.keys(this.dataStore).length && !this.isCancelLoading && this.loadingProgress == 100) {
        return
      }
      this.dataStore = {}
      this.loadingProgress = 0;
      this.isCancelLoading = false;
      const model = this.viewer.model;
      const visible = model.getVisibleElements();
      let allElements = 0;
      let currentEl = 0;
      for (const part of visible) {
        for (const elId of part.elementIds){
          allElements += 1;
        }
      }
      for (const visibleElement of visible) {
        if (this.isCancelLoading) {
          return
        }
        const modelPart = model.getModelPart(visibleElement.modelPartId);
        if (!modelPart)
          continue;
        const tree = modelPart.elementTree;
        for (const elementId of visibleElement.elementIds) {
          currentEl += 1;
          this.loadingProgress = (currentEl) / allElements * 100;
          this.messages[this.messages.length-1].text = `Идёт загрузка данных модели. Загружено: ${Math.round((currentEl)/allElements*100)} %`;
          const element = tree.getElement(elementId);
          const propertySets = await model.getElementProperties(elementId);
          let attributes = {};
          for (const set of propertySets) {
            for (const prop of set.properties) {
              const value = prop.value?.value ?? prop.value;
              attributes[prop.name] = value;
            }
          }
          if (attributes && Object.keys(attributes).length > 0) {
            this.dataStore[elementId] = {
            ...attributes,
            };
            this.dataStoreByFeatures[elementId] = propertySets
            this.geometry[elementId] = []
            if (!element)
              continue;
            if (element.hasGeometry) {
              const geom = element.viewObject?.edges?.geometry;
              this.geometry[elementId].push(element.id);
            }
            for (const child of element.children) {
              if (child.hasGeometry) {
                const geom = child.viewObject?.edges?.geometry;
                this.geometry[elementId].push(child.id);
              }
            }
          }
        }
        this.$emit('loading-progress', this.loadingProgress);
      }
      this.availableAttrs = this.getAvailableAttributes();
      this.collectAvailableGroups();
      this.availableAttrsProperties = this.getAvailableAttributesWithProperties();
      this.logs.push({text: `Вы находитесь в режиме отладчика. Доступные для данной модели атрибуты:\n ${this.availableAttrs.toString()}, ${this.availableAttrsProperties.toString()}`, type: 'assistant'})
      console.log('dataStore', this.dataStore, this.dataStoreByFeatures)
    },

    getAttributeValue(elementId, attributes, attributeName) {
      let cleanName = attributeName;
      const groupMatch = cleanName.match(/^\["?(.+?)"?\](.+)$/);
      if (groupMatch) {
        const groupName = groupMatch[1];
        const propertyName = groupMatch[2];
        const features = this.dataStoreByFeatures[elementId];
        if (features) {
          const propertySet = features.find(ps => ps.name === groupName);
          if (propertySet && propertySet.properties) {
            const prop = propertySet.properties.find(p => p.name === propertyName);
            if (prop) {
              let value = prop.value?.value ?? prop.value;
              if (value && typeof value === 'object' && 'value' in value) {
                value = value.value;
              }
              return value;
            }
          }
        }
        return null;
      } else {
        return attributes[attributeName];
      }
    },

    async makeAction(messageText) {

      if (this._lastReportParams) {
        const params = this._lastReportParams;
        const { columns, calculatedColumns, includeTotals, foundIds, totalCount } = params;
        
        const rows = [];
        const totals = {};
        
        for (const id of foundIds.slice(0)) {
          const attrs = this.dataStore[id];
          const row = {};
          
          for (const col of columns) {
            let value = attrs[col.field];
            if (col.field === 'Dry Weight') {
              value = this.parseNumberValue(value);
            } else if (col.field === 'Length' || col.field === 'Pass Length') {
              value = this.parseNumberValue(value) / 1000;
            }
            row[col.label] = value || '-';
            
            if (includeTotals && typeof value === 'number' && !isNaN(value)) {
              totals[col.label] = (totals[col.label] || 0) + value;
            }
          }
          
          for (const calc of calculatedColumns) {
            let value = null;
            if (calc.formula === 'volume') {
              const diameterMm = this.parseNumberValue(attrs.Diam);
              const diameter = diameterMm / 1000;
              const length = this.parseNumberValue(attrs.Length || attrs['Pass Length']) / 1000;
              if (diameter > 0 && length > 0) {
                const radius = diameter / 2;
                value = Math.PI * radius * radius * length;
              }
            }
            row[calc.name] = value !== null ? value.toFixed(5) : '-';
            if (includeTotals && value !== null && !isNaN(value)) {
              totals[calc.name] = (totals[calc.name] || 0) + value;
            }
          }
          
          rows.push(row);
        }
        
        const allColumns = [...columns.map(c => c.label), ...calculatedColumns.map(c => c.name)];
        
        let html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Отчёт ПНР</title>
            <style>
              body {
                font-family: 'Times New Roman', Arial, sans-serif;
                margin: 20px;
                font-size: 12px;
                color: #000000;
              }
              h1 {
                text-align: center;
                font-size: 18px;
                font-weight: bold;
                margin: 0 0 5px 0;
                color: #000000;
              }
              h2 {
                text-align: center;
                font-size: 14px;
                font-weight: normal;
                margin: 0 0 20px 0;
                color: #333333;
              }
              table {
                border-collapse: collapse;
                width: 100%;
                margin-top: 10px;
              }
              th, td {
                border: 1px solid #000000;
                padding: 8px;
                text-align: center;
              }
              th {
                background-color: #e0e0e0;
                color: #000000;
                font-weight: bold;
              }
              td {
                background-color: #ffffff;
                font-weight: normal;
                color: #000000;
              }
              .footer {
                margin-top: 30px;
                font-size: 10px;
                color: #666666;
                text-align: center;
              }
            </style>
          </head>
          <body>
            <h1>Отчёт ПНР</h1>
            <h2>Найдено элементов: ${totalCount}</h2>
            <table>
              <thead>
                <tr>
        `;
        
        for (const col of allColumns) {
          html += `<th>${col}</th>`;
        }
        
        html += `</tr></thead><tbody>`;
        
        for (const row of rows) {
          html += `<tr>`;
          for (const col of allColumns) {
            html += `<td>${row[col]}</td>`;
          }
          html += `</tr>`;
        }
        
        html += `</tbody>`;
        
        if (includeTotals && Object.keys(totals).length > 0) {
          html += `<tfoot><tr style="background: #f0f0f0; font-weight: bold;">`;
          for (const col of allColumns) {
            const total = totals[col];
            html += `<td>${total !== undefined ? total.toFixed(2) : ''}</td>`;
          }
          html += `</tr></tfoot>`;
        }
        
        html += `
            </table>
            <div class="footer">
              Отчёт сгенерирован: ${new Date().toLocaleString()}
            </div>
          </body>
          </html>
        `;
        
        const win = window.open();
        win.document.write(html);
        win.document.close();
        win.print();
        
        this._lastReportParams = null;
      }
    },

    parseNumberValue(value) {
      if (!value) return 0;
      if (typeof value === 'number') return value;
      const cleaned = String(value).replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    },


    getAvailableAttributes() {
      if (Object.keys(this.dataStore).length === 0) {
        return [];
      }

      const allAttributes = new Set();
      
      for (const [id, attributes] of Object.entries(this.dataStore)) {
        Object.keys(attributes).forEach(attr => allAttributes.add(attr));
      }

      return Array.from(allAttributes).sort();
    },

    collectAvailableGroups() {
      const groups = new Set();
      const propsByGroup = {};
      
      for (const features of Object.values(this.dataStoreByFeatures)) {
        for (const propertySet of features) {
          const groupName = propertySet.name;
          groups.add(groupName);
          
          if (!propsByGroup[groupName]) {
            propsByGroup[groupName] = new Set();
          }
          
          if (propertySet.properties) {
            for (const prop of propertySet.properties) {
              propsByGroup[groupName].add(prop.name);
            }
          }
        }
      }
      
      this.availableGroups = Array.from(groups);
      this.availablePropertiesByGroup = propsByGroup;
    },

    getAvailableAttributesWithProperties() {
      const allAttributes = [];
      
      for (const group of this.availableGroups) {
        const props = this.availablePropertiesByGroup[group];
        if (props) {
          for (const prop of props) {
            allAttributes.push(`[${group}]${prop}`);
          }
        }
      }
      
      return allAttributes.sort();
    },

    startLoadingAnimation() {
      this.isLoading = true;

      this.messages.push({
        text: 'ИИ-помощник думает',
        type: 'assistant',
        isLoading: true,
        loadingId: Date.now()
      });

      let dotCount = 0;
      this.loadingInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        const dots = '.'.repeat(dotCount);
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg && lastMsg.isLoading) {
          lastMsg.text = `ИИ-помощник думает${dots}`;
        } else {
        }
      }, 500);
    },

    stopLoadingAnimation() {
      this.isLoading = false;
      if (this.loadingInterval) {
        clearInterval(this.loadingInterval);
        this.loadingInterval = null;
      }
      this.messages = this.messages.filter(msg => !msg.isLoading);
    },

    ClearModel() {
      if (!this.viewer || !this.viewer.model) {
        console.warn('Viewer не инициализирован');
        return;
      }

      const model = this.viewer.model;
        
      model.clearColors();
      model.clearSelection();
      model.showAll();
    },

    cancelRequest() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      if (this.streamReader) {
        try {
          this.streamReader.cancel();
        } catch(e) {}
        this.streamReader = null;
      }
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      this.isCancelLoading = true;
      this.stopLoadingAnimation();
      this.messages.push({
        text: 'Запрос отменён пользователем',
        type: 'assistant',
        isCancel: true,
      });
      this.contextId = null;
      this.handledEventIds = null;
      this.current_msgs = [];
    }
  }
}
</script>

<style>
@font-face {
  font-family: 'GPN_DIN Condensed Bold';
  src: url('@/assets/fonts/gpn_din-condensed-bold.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.ai_chat_bim {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  width: 100%;
  background-color: #f2f2f2;
  color: white;
  border: 1px solid rgba(70, 36, 103, 0.81);
}

.header {
  display: flex;
  justify-content: center;
  flex-direction: row;
  width: 100%;
  height: 30px;
  background: rgba(70, 36, 103, 0.81);
  color: #f2f2f2;
}

.indicators {
  height: calc(10% - 10px);
  width: 100%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
}

.bim-main {
  height: calc(80% - 15px);
  width: 100%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
  overflow: auto;
}

.bim-send_messages {
  height: calc(10% - 15px);
  width: 100%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
  border-top: none;
}

.bim-input {
  height: 100%;
  width: 85%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
}

.bim-send {
  height: 100%;
  width: 15%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
}

.bim-settings {
  height: 10%;
  width: 100%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
  border-top: none;
}

.bim-settings h2 {
  font-family: 'GPN_DIN Condensed Bold', Arial, sans-serif;
  font-size: 14px;
  color: #333;
  margin: 5px 0;
  padding-left: 5px;
}

.configuration {
  height: 100%;
  width: 50%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
}

.mode {
  height: 100%;
  width: 100%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
}

.button {
  margin: 5px;
  width: 90%;
  height: 90%;
  background-color: #76528a;
  border-radius: 5px;
  border: 0px;
  font-size: 1.1vw;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  appearance: none;
  color: #ffffff;
}

.button span {
  flex: 1;
  text-align: center;
}

.button:active{
  background: linear-gradient(to bottom, #edebee, #a89eb5);
}

.button:hover{
  box-shadow: 5px 5px 7px #770c67
}

.bim-chat-history {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.bim-message {
  display: flex;
  width: 100%;
}

.bim-message.user {
  justify-content: flex-end;
}

.bim-message.assistant {
  justify-content: flex-start;
}

.bim-message.error {
  justify-content: flex-start;
}

.bim-message-bubble {
  display: flex;
  flex-direction: column;
  white-space: pre-line;
  word-break: break-word;
  user-select: text;
  max-width: 70%;
  padding: 12px 18px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.bim-message-bubble p {
  margin: 0 0 8px 0;
  width: 100%;
}

.message-actions {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  width: 100%;
  gap: 8px;
}

.copy-bttn, .action-bttn {
  background: transparent;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.5;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.copy-bttn:hover, .action-bttn:hover {
  opacity: 1;
  background-color: rgba(0,0,0,0.1);
}

.action-bttn {
  color: #4caf50;
}

.cancel-bttn {
  background: transparent;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.7;
  border-radius: 4px;
  transition: all 0.2s ease;
  color: #dc3545;
}

.cancel-bttn:hover {
  opacity: 1;
  background-color: rgba(220, 53, 69, 0.1);
}

.debug-window {
  height: calc(80% - 15px);
  width: 100%;
  padding: 5px;
  display: flex;
  flex-direction: column;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
  overflow: hidden;
}

.debug-history {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.bim-logs {
  display: flex;
  width: 100%;
}

.bim-logs.user {
  justify-content: flex-end;
}

.bim-logs.assistant {
  justify-content: flex-start;
}

.bim-logs.error {
  justify-content: flex-start;
}

.bim-log-bubble {
  display: flex;
  flex-direction: column;
  white-space: pre-line;
  word-break: break-word;
  user-select: text;
  max-width: 70%;
  padding: 12px 18px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.bim-log-bubble p {
  margin: 0;
  width: 100%;
}

.bim-logs.user .bim-log-bubble {
  background: #76528a;
  color: white;
  border-bottom-right-radius: 4px;
}

.bim-logs.assistant .bim-log-bubble {
  background: white;
  color: #333;
  border-bottom-left-radius: 4px;
}

.bim-logs.error .bim-log-bubble {
  background: #f8d7da;
  color: #721c24;
  border-radius: 8px;
  text-align: center;
}

.bim-log-bubble {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px dashed rgba(0,0,0,0.08);
}

.clear_button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40%;
  border: 1px solid rgba(70, 36, 103, 0.3);
}

.debug-mode {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60%;
  padding: 5px 15px;
  border: 1px solid rgba(70, 36, 103, 0.3);
}

.debug-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-family: 'GPN_DIN Condensed Bold', Arial, sans-serif;
  font-size: 13px;
  color: #333;
  user-select: none;
}

.debug-label {
  white-space: nowrap;
}

.debug-toggle input[type="checkbox"] {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 40px;
  height: 22px;
  background-color: #ccc;
  border-radius: 22px;
  transition: background-color 0.3s ease;
  flex-shrink: 0;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.debug-toggle input[type="checkbox"]:checked + .toggle-slider {
  background-color: #76528a;
}

.debug-toggle input[type="checkbox"]:checked + .toggle-slider::after {
  transform: translateX(18px);
}

.debug-toggle:hover .toggle-slider {
  box-shadow: 0 0 5px rgba(118, 82, 138, 0.4);
}

.bim-message.user .bim-message-bubble {
  background: #76528a;
  color: white;
  border-bottom-right-radius: 4px;
}

.bim-message.assistant .bim-message-bubble {
  background: white;
  color: #333;
  border-bottom-left-radius: 4px;
}

.bim-message.error .bim-message-bubble {
  background: #f8d7da;
  color: #721c24;
  border-radius: 8px;
  text-align: center;
}

h1 {
  font-family: 'GPN_DIN Condensed Bold', Arial, sans-serif;
  font-style: normal;
  font-weight: 700;
  font-size: 24px;
  line-height: 120%;
  display: flex;
  align-items: center;
  text-align: center;
  color: #FFFFFF;
}

.selector {
  height: 10%;
  width: 100%;
  padding: 5px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  background-color: #f2f2f2;
  border: 1px solid rgba(70, 36, 103, 0.81);
}

.styled-select {
  width: 50%;
  height: 90%;
  margin: 5px;
}

.styled-select select {
  width: 100%;
  height: 100%;
  background-color: #76528a;
  font-size: 1.0vw;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  appearance: none;
  padding-right: 15px;
  color: #ffffff;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fff'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 15px center;
  background-size: 16px;
  text-overflow: ellipsis;
}

.styled-select select:focus {
  outline: none;
  border-color: rgba(70, 36, 103, 0.81);
}

.styled-select select:hover {
  border-color: rgba(70, 36, 103, 0.81);
}
</style>