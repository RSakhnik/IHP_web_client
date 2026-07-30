<template>
  <div class = "ai_chat_bim">
    <div class="header">
      <h1> Чат с помощником </h1>
    </div>
    <div class = "bim-main" v-if="!this.debugMode">
      <div class="bim-chat-history" ref="chatHistory">
        <div v-for="(msg, index) in messages" :key="index" 
          :class="['bim-message', msg.type]">
          <div class="bim-message-bubble">
            <div 
              v-if="msg.type === 'assistant' && !msg.isLoading && !msg.isCancel && msg.hasDiagnosticAction"
              class="message-trace-actions">
              <button 
                class="trace-toggle-bttn"
                :class="{ active: msg.isTraceExpanded }"
                @click="toggleMessageTrace(msg)">
                {{ getTraceToggleText(msg) }}
              </button>
              <button 
                class="copy-bttn tooltip-bttn" 
                @click="copyMessageTrace(msg)"
                data-tooltip="Копировать ход выполнения">
                📋
              </button>
            </div>
            <div 
              v-if="msg.type === 'assistant' && msg.hasDiagnosticAction && msg.isTraceExpanded"
              class="message-trace-details">
              <pre>{{ msg.diagnosticText }}</pre>
            </div>
            <p>{{ msg.text }}</p>
            <div v-if="msg.connectionIssues && msg.connectionIssues.length > 0" class="connection-issues-list">
              <div
                v-for="(issue, i) in msg.connectionIssues"
                :key="i"
                class="connection-issue-item"
              >
                <span class="connection-issue-icon">{{ issue.type === 'gap' ? '⛓️' : '↔' }}</span>
                <span class="connection-issue-name">{{ issue.label }}</span>
                <button class="connection-issue-zoom" @click="zoomToConnectionIssue(issue)" title="Приблизить">🔍</button>
              </div>
            </div>
            <div v-if="msg.isLoading && requestElapsedSeconds > 0" class="request-timer">
              {{ requestElapsedSeconds }} с
            </div>
            <div class="message-actions">
              <button 
                class="copy-bttn tooltip-bttn" 
                @click="copyMessage(msg.text)"
                :data-tooltip="msg.type === 'user' ? 'Копировать текст запроса' : 'Копировать текст ответа'">
                📋
              </button>
              <button 
                v-if="msg.type === 'assistant' && !msg.isLoading && !msg.isCancel && msg.hasSearchAction"
                class="action-bttn tooltip-bttn" 
                @click="runSearchAction(msg)"
                data-tooltip="Повторить поиск">
                ▶ Поиск
              </button>
              <button 
                v-if="msg.type === 'assistant' && !msg.isLoading && !msg.isCancel && msg.hasReportAction"
                class="action-bttn tooltip-bttn" 
                @click="runReportAction(msg)"
                data-tooltip="Открыть отчёт">
                ▶ Отчёт
              </button>
              <button v-if="msg.isLoading" class="cancel-bttn" @click="cancelRequest">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="debug-window" v-else>
      <div class="debug-toolbar" v-if="executionTrace.length || debugMode">
        <button class="copy-bttn" v-if="executionTrace.length" @click="copyExecutionTrace">Скопировать ход выполнения</button>
        <button class="copy-bttn" v-if="debugMode" @click="showSettings = !showSettings">Настройки ACS/DFS</button>
      </div>
      <div v-if="showSettings" class="settings-panel">
        <div class="settings-panel-title">Настройки подключения ACS</div>
        <div class="settings-presets">
          <button class="settings-preset-btn" :class="{ active: isProductionPreset, pending: pendingPreset === 'production' && !isProductionPreset }" @click="applyPreset('production')">Продакшн</button>
          <button class="settings-preset-btn" :class="{ active: isLocalPreset, pending: pendingPreset === 'local' && !isLocalPreset }" @click="applyPreset('local')">Локальный стенд</button>
        </div>
        <div class="settings-field">
          <label class="settings-label">Base URL</label>
          <input class="settings-input" v-model="settingsUrl" placeholder="https://360pilot.ru/acs" spellcheck="false" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Bearer Token <span class="settings-label-hint">(пусто - без авторизации)</span></label>
          <input class="settings-input" v-model="settingsToken" placeholder="токен (необязательно)" spellcheck="false" />
        </div>
        <div class="settings-active-url">
          Активный URL: <span class="settings-active-url-val">{{ acsBaseUrl }}</span>
        </div>
        <div class="settings-actions">
          <button class="settings-save-btn" @click="saveSettings">Сохранить</button>
          <span v-if="settingsSaved" class="settings-saved-hint">✓ Сохранено</span>
          <button class="settings-close-btn" @click="showSettings = false">Закрыть</button>
        </div>
      </div>
      <div class="debug-history" ref="debugHistory">
        <div v-for="(log, index) in logs" :key="`log-${index}`" 
          :class="['bim-logs', log.type]">
          <div class="bim-log-bubble">
            <p>{{ log.text }}</p>
          </div>
        </div>
        <div v-for="(trace, traceIndex) in executionTrace" :key="`trace-${traceIndex}`" class="execution-trace">
          <div class="execution-trace-title">Ход выполнения</div>
          <div class="execution-trace-row">Запрос в ACS/DFS:</div>
          <pre>{{ formatJson(trace.request) }}</pre>
          <div v-if="trace.finalMessage" class="execution-trace-row">ACS final message:</div>
          <pre v-if="trace.finalMessage">{{ trace.finalMessage }}</pre>
          <div v-for="(call, callIndex) in trace.toolCalls" :key="`tool-${traceIndex}-${callIndex}`" class="tool-call-block">
            <div class="tool-call-title">Tool call {{ callIndex + 1 }}: {{ call.tool }}</div>
            <div class="execution-trace-row">Message:</div>
            <pre>{{ call.message }}</pre>
            <details>
              <summary>Raw tool_call JSON</summary>
              <pre>{{ formatJson(call.raw) }}</pre>
            </details>
            <details v-if="call.script">
              <summary>Generated script</summary>
              <pre>{{ call.script }}</pre>
            </details>
            <details v-if="call.result">
              <summary>Performer result</summary>
              <pre>{{ call.result }}</pre>
            </details>
            <div v-if="call.warnings && call.warnings.length" class="tool-call-warnings">
              <div>Warnings:</div>
              <div v-for="(warning, warningIndex) in call.warnings" :key="`warning-${traceIndex}-${callIndex}-${warningIndex}`">- {{ warning }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="diagnosticMessage" class="diagnostic-popup">
      <div class="diagnostic-popup-title">{{ diagnosticMessage.title }}</div>
      <pre>{{ diagnosticMessage.text }}</pre>
      <button class="copy-bttn" @click="copyMessage(diagnosticMessage.text)">Скопировать</button>
      <button class="copy-bttn" @click="diagnosticMessage = null">Закрыть</button>
    </div>
    <div class = "bim-send_messages">
      <div class="bim-input-wrap">
        <input type = "text" ref="questionInput" class="bim-input" placeholder = "Введите запрос" v-model="question" @keyup.enter="sendMessage" @keydown.space.stop @input="onQuestionInput" @keydown="onQuestionKeydown" @blur="hideDevSuggestions" autocomplete="off" />
        <div v-if="devSuggestions.length > 0" class="dev-suggestions">
          <div
            v-for="(s, i) in devSuggestions"
            :key="s.tool"
            class="dev-suggestion-item"
            :class="{ active: i === devSuggestionIndex }"
            @mousedown.prevent="applyDevSuggestion(s)"
          >
            <span class="dev-suggestion-tool">{{ s.tool }}</span>
            <span class="dev-suggestion-desc">{{ s.desc }}</span>
          </div>
        </div>
      </div>
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
    rightPanelContext: Object,
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
      visibleElementOrder: [],
      visibleElementPartMap: {},
      propertyCallDiagnostics: {},
      availableAttrs: [],
      availableGroups: [], 
      availablePropertiesByGroup: {},
      availableAttrsProperties: [],
      isLoading: false,
      loadingDots: '',
      loadingInterval: null,
      abortController: null,
      isLoadingModel: false,
      isCancelLoading: false,
      loadingProgress: 0,
      lastSearchForReport: null,
      contextId: null,
      eventSource: null,
      handledEventIds: null,
      previousSearch: { ids: [], element_ids: [], targets: [], count: 0 },
      currentSelection: [],
      streamReader: null,
      propertiesCache: {},
      lastReportData: null,
      debugMode: false,
      advancedDebugMode: false,
      isReportRunning: false,
      isReportOpening: false,
      reportTimeoutMs: 60000,
      reportPreviewCache: {},
      reportPreviewCacheSeq: 0,
      paintedModelPartIds: [],
      paintedTargetsByPart: {},
      feedbackWaitTimerId: null,
      feedbackWaitStartedAt: null,
      feedbackWaitBaseText: '',
      feedbackWaitTimedOut: false,
      activeStatusMessage: null,
      requestTimerId: null,
      requestTimerStartedAt: null,
      requestElapsedSeconds: 0,
      modelIndexSyncPromise: null,
      executionTrace: [],
      activeTrace: null,
      diagnosticMessage: null,
      suppressAutoScroll: false,
      devSuggestions: [],
      devSuggestionIndex: -1,
      _highlightedIssue: null,
      showSettings: false,
      settingsSaved: false,
      settingsUrl: '',
      settingsToken: '',
      pendingPreset: null,
      acsBaseUrl: 'https://360pilot.ru/acs',
      acsToken: '@r6|zzN1B?270{O0xn?JkCtWjTpi~Z',
      PRESETS: {
        production: { url: 'https://360pilot.ru/acs', token: '@r6|zzN1B?270{O0xn?JkCtWjTpi~Z' },
        local:      { url: 'http://localhost:8080', token: '' }
      },
    }
  },
  mounted() {
    this.scrollToBottom();
    window.addEventListener('focus', this.onWindowFocus);
    this.loadSettings();
  },

  beforeUnmount() {
    window.removeEventListener('focus', this.onWindowFocus);
  },

  computed: {
    isProductionPreset() {
      return this.acsBaseUrl === this.PRESETS.production.url;
    },
    isLocalPreset() {
      return this.acsBaseUrl === this.PRESETS.local.url;
    },
  },
  methods: {

    scrollToBottom() {
      if (this.suppressAutoScroll) {
        return;
      }
      this.$nextTick(() => {
        const chatHistory = this.$refs.chatHistory;
        if (chatHistory) {
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
        const debugHistory = this.$refs.debugHistory;
        if (debugHistory) {
          debugHistory.scrollTop = debugHistory.scrollHeight;
        }
      });
    },

    async sendToACS(prompt) {
      
      try {
        const response = await fetch(`${this.acsBaseUrl}/api/v1/query`, {
          method: 'POST',
          headers: {
            ...(this.acsToken ? { 'Authorization': `Bearer ${this.acsToken}` } : {}),
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

    async sendFeedbackToACS(contextId, feedbackText) {
      if (!contextId || !feedbackText) {
        return { success: false, error: 'Пустой context_id или текст диагностического сообщения.' };
      }
      try {
        const response = await fetch(`${this.acsBaseUrl}/api/v1/feedback`, {
          method: 'POST',
          headers: {
            ...(this.acsToken ? { 'Authorization': `Bearer ${this.acsToken}` } : {}),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            context_id: contextId,
            feedback: feedbackText
          })
        });
        if (!response.ok) {
          let errorText = '';
          try {
            errorText = await response.text();
          } catch (e) {
            errorText = '';
          }
          throw new Error(`HTTP ${response.status}${errorText ? ': ' + errorText : ''}`);
        }
        return { success: true };
      } catch (error) {
        console.error('Ошибка при отправке диагностического сообщения:', error);
        return { success: false, error: error.message || String(error) };
      }
    },

    async listenToACS(contextId) {
      if (this.eventSource) {
        return
      }

      try {
        const response = await fetch(`${this.acsBaseUrl}/api/v1/stream/${contextId}`, {
          headers: {
            ...(this.acsToken ? { 'Authorization': `Bearer ${this.acsToken}` } : {}),
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
          if (this.isFeedbackRepairEvent(event)) {
            const repairStatus = this.buildFeedbackEventStatus(event);
            this.startFeedbackWaitTimeout(repairStatus);
          }
          break;

        case 'tool_call': {
          if (data?.request_id) {
            if (!this.handledToolRequestIds) {
              this.handledToolRequestIds = new Set();
            }
            if (this.handledToolRequestIds.has(data.request_id)) {
              return;
            }
            this.handledToolRequestIds.add(data.request_id);
          }
          const traceCall = this.addToolCallTrace(data);
          const isReplayFlag = data && data.isReplay === true;
          this.stopFeedbackWaitTimeout();
          this.updateActiveStatus(`Выполняю команду ${data?.tool || ''} (${data?.sequence || 0}/${data?.total || 0})`);
          let result;
          try {
            result = await this.executeToolCall(data);
          } catch (e) {
            const errMsg = e?.message || String(e);
            result = {
              message: `Ошибка при выполнении ${data?.tool || 'команды'}: ${errMsg}`,
              tool: data?.tool || '',
              sequence: data?.sequence !== undefined ? data.sequence : 0,
              errors: [errMsg],
              diagnostics: this.createEmptyDiagnostics({
                scriptExecuted: false,
                executionErrors: [errMsg]
              })
            };
          }
          this.completeToolCallTrace(traceCall, data, result);
          if (result && result.message) {
            this.current_msgs.push(result);
          }
          this.updateActiveStatus(`Инструмент ${data?.tool || ''} выполнен. Готовлю диагностическое сообщение.`);
          if (!isReplayFlag && this.contextId && result) {
            const capturedContextId = this.contextId;
            const feedbackText = this.buildToolFeedbackText(capturedContextId, result);
            if (feedbackText) {
              const sendResult = await this.sendFeedbackToACS(capturedContextId, feedbackText);
              if (sendResult.success) {
                if (this.activeTrace) {
                  this.activeTrace.toolCalls.push({
                    tool: '(feedback)',
                    raw: { tool: data?.tool || '', sequence: data?.sequence || 0 },
                    script: '',
                    message: `Диагностическое сообщение отправлено (${data?.tool || ''}, seq=${data?.sequence || 0}).`,
                    result: '',
                    warnings: []
                  });
                }
                const waitBase = `Диагностическое сообщение по ${data?.tool || 'команда инструмента'} отправлено. Ожидаю реакцию ACS`;
                this.startFeedbackWaitTimeout(waitBase);
              } else {
                const errText = `Не удалось отправить диагностическое сообщение: ${sendResult.error || 'неизвестная ошибка'}`;
                if (this.activeTrace) {
                  this.activeTrace.toolCalls.push({
                    tool: '(feedback)',
                    raw: { tool: data?.tool || '', sequence: data?.sequence || 0 },
                    script: '',
                    message: errText,
                    result: '',
                    warnings: [errText]
                  });
                }
                this.updateActiveStatus('Диагностическое сообщение не отправлено. Ожидаю ACS.');
              }
            }
          }
          break;
        }

        case 'success': {
          if (!this.isTerminalAcsEvent(event)) {
            if (this.isFeedbackRepairEvent(event)) {
              const repairStatus = this.buildFeedbackEventStatus(event);
              this.startFeedbackWaitTimeout(repairStatus);
              if (this.activeTrace) {
                this.activeTrace.toolCalls.push({
                  tool: `(${event.agent}/${event.action})`,
                  raw: event,
                  script: '',
                  message: repairStatus,
                  result: '',
                  warnings: []
                });
              }
            }
            break;
          }
          this.completeActiveTrace(data?.message || data?.final_message || 'Обработка ACS завершена.');
          this.stopFeedbackWaitTimeout();
          this.stopLoadingAnimation();
          let isReport = false;
          let searchToolCall = null;
          let reportToolCall = null;
          let reportCacheId = null;
          let reportRowCount = 0;
          const messageTrace = this.activeTrace;
          const seenMessages = new Set();
          const uniqueLines = [];
          for (const msg of this.deduplicateToolMessages(this.current_msgs)) {
            const text = (msg.message || '').trim();
            if (text && !seenMessages.has(text)) {
              seenMessages.add(text);
              uniqueLines.push(text);
            }
            if (msg.isSearch && msg.searchToolCall && !this.isTechnicalSearchToolCall(msg.searchToolCall)) {
              searchToolCall = msg.searchToolCall;
            }
            if (msg.isReport) {
              isReport = true;
              if (typeof msg.count === 'number') {
                reportRowCount = msg.count;
              }
            }
            if (msg.reportToolCall) {
              reportToolCall = msg.reportToolCall;
            }
            if (msg.reportCacheId) {
              reportCacheId = msg.reportCacheId;
            }
          }
          let message = uniqueLines.length > 0 ? `Выполнено:\n${uniqueLines.join('\n')}` : '';
          const userFeedbackText = this.extractFeedbackUserMessages(data || {});
          if (userFeedbackText) {
            message = message ? `${message}\n\n${userFeedbackText}` : userFeedbackText;
          } else if (this.isFeedbackRepairEvent(event)) {
            const finalFeedback = this.buildFeedbackEventStatus(event);
            if (finalFeedback) {
              message = message ? `${message}\n\n${finalFeedback}` : finalFeedback;
            }
          }
          if (!message) {
            const acsFinalMessage = data?.message || data?.final_message || '';
            message = acsFinalMessage || 'Обработка ACS завершена.';
          }
          const finalMessage = {
            text: message.replace(/\s+$/, ''),
            type: 'assistant',
            isReport: isReport,
            hasSearchAction: Boolean(searchToolCall),
            hasReportAction: Boolean(reportToolCall),
            reportRowCount: reportRowCount,
            searchToolCall: searchToolCall,
            reportToolCall: reportToolCall,
            reportCacheId: reportCacheId,
            diagnosticText: messageTrace ? this.formatExecutionTrace(messageTrace, this.executionTrace.indexOf(messageTrace)) : '',
            hasDiagnosticAction: Boolean(messageTrace && messageTrace.toolCalls && messageTrace.toolCalls.length),
            isTraceExpanded: false,
          };
          this.messages.push(finalMessage);
          this.scrollToBottom();
          this.current_msgs = [];
          if (finalMessage.isReport && finalMessage.reportCacheId) {
            this.autoOpenReportPreview(finalMessage).catch(() => {});
          }
          if (this.streamReader) {
            try { this.streamReader.cancel(); } catch (e) {}
            this.streamReader = null;
          }
          this.contextId = null;
          this.handledEventIds = null;
          this.handledToolRequestIds = null;
          break;
        }

        case 'error': {
          const isTerminalFeedbackError = this.isTerminalAcsEvent(event) && this.isFeedbackRepairEvent(event);
          this.completeActiveTrace(isTerminalFeedbackError
            ? 'ACS: обратная связь завершена с предупреждением'
            : `Ошибка: ${data?.error || 'Неизвестная ошибка'}`);
          this.stopFeedbackWaitTimeout();
          this.stopLoadingAnimation();
          if (isTerminalFeedbackError) {
            let isReport = false;
            let searchToolCall = null;
            let reportToolCall = null;
            let reportCacheId = null;
            let reportRowCount2 = 0;
            const messageTrace = this.activeTrace;
            const seenMessages2 = new Set();
            const uniqueLines2 = [];
            for (const msg of this.deduplicateToolMessages(this.current_msgs)) {
              const text = (msg.message || '').trim();
              if (text && !seenMessages2.has(text)) {
                seenMessages2.add(text);
                uniqueLines2.push(text);
              }
              if (msg.isSearch && msg.searchToolCall && !this.isTechnicalSearchToolCall(msg.searchToolCall)) {
                searchToolCall = msg.searchToolCall;
              }
              if (msg.isReport) {
                isReport = true;
                if (typeof msg.count === 'number') {
                  reportRowCount2 = msg.count;
                }
              }
              if (msg.reportToolCall) {
                reportToolCall = msg.reportToolCall;
              }
              if (msg.reportCacheId) {
                reportCacheId = msg.reportCacheId;
              }
            }
            let message2 = uniqueLines2.length > 0 ? `Выполнено:\n${uniqueLines2.join('\n')}` : '';
            const userFeedbackText2 = this.extractFeedbackUserMessages(data || {});
            if (userFeedbackText2) {
              message2 = message2 ? `${message2}\n\n${userFeedbackText2}` : userFeedbackText2;
            } else {
              const feedbackStatus = this.buildFeedbackEventStatus(event);
              if (feedbackStatus) {
                message2 = message2 ? `${message2}\n\n${feedbackStatus}` : feedbackStatus;
              }
            }
            if (!message2) {
              message2 = 'ACS: обратная связь завершена с предупреждением.';
            }
            this.messages.push({
              text: message2.replace(/\s+$/, ''),
              type: 'assistant',
              isReport: isReport,
              hasSearchAction: Boolean(searchToolCall),
              hasReportAction: Boolean(reportToolCall),
              reportRowCount: reportRowCount2,
              searchToolCall: searchToolCall,
              reportToolCall: reportToolCall,
              reportCacheId: reportCacheId,
              diagnosticText: messageTrace ? this.formatExecutionTrace(messageTrace, this.executionTrace.indexOf(messageTrace)) : '',
              hasDiagnosticAction: Boolean(messageTrace && messageTrace.toolCalls && messageTrace.toolCalls.length),
              isTraceExpanded: false,
            });
            if (isReport && reportCacheId) {
              this.autoOpenReportPreview({ reportCacheId }).catch(() => {});
            }
            this.logs.push({ text: message2, type: 'assistant' });
          } else {
            this.messages.push({
              text: `Ошибка: ${data?.error || 'Неизвестная ошибка'}`,
              type: 'error'
            });
            this.logs.push({
              text: `Ошибка: ${data?.error || 'Неизвестная ошибка'}`,
              type: 'error'
            });
          }
          this.scrollToBottom();
          if (this.streamReader) {
            try { this.streamReader.cancel(); } catch (e) {}
            this.streamReader = null;
          }
          this.contextId = null;
          this.handledEventIds = null;
          this.handledToolRequestIds = null;
          this.current_msgs = [];
          break;
        }

        case 'warning':
          console.warn('Предупреждение:', data);
          if (this.isFeedbackRepairEvent(event)) {
            const repairStatus = this.buildFeedbackEventStatus(event);
            this.startFeedbackWaitTimeout(repairStatus);
            if (this.activeTrace) {
              this.activeTrace.toolCalls.push({
                tool: `(${event.agent}/${event.action})`,
                raw: event,
                script: '',
                message: repairStatus,
                result: '',
                warnings: []
              });
            }
          }
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

        case 'bim.check_connections':
          result = await this.executeBimCheckConnections(args);
          break;
            
        default:
          console.log(`Неизвестная команда: ${tool}`)
          return {
            text: `Неизвестная команда: ${tool}`,
            type: 'assistant',
            tool: tool,
            sequence: sequence,
            diagnostics: this.createEmptyDiagnostics({
              scriptExecuted: false,
              executionErrors: [`Неизвестная команда: ${tool}`]
            })
          }
      }

      if (result && typeof result === 'object') {
        result.tool = result.tool || tool;
        result.sequence = result.sequence !== undefined ? result.sequence : sequence;
        if (toolData && toolData.isReplay === true) {
          result.isReplay = true;
        }
        if (!result.diagnostics) {
          result.diagnostics = this.createEmptyDiagnostics({ scriptExecuted: true });
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
        'report.create_preview': 'создание отчёта',
        'bim.check_connections': 'проверка коннектов трубопроводов'
      };
      return labels[tool] || tool;
    },

    createEmptyDiagnostics(overrides) {
      const base = {
        scriptExecuted: false,
        paintExecuted: false,
        paintColorRgb: '',
        isolateExecuted: false,
        foundElementsCount: null,
        reportRowsCount: null,
        executionErrors: [],
        reportColumnStats: [],
        reportSampleRows: [],
        unavailableAttributes: []
      };
      if (overrides && typeof overrides === 'object') {
        for (const key of Object.keys(overrides)) {
          base[key] = overrides[key];
        }
      }
      return base;
    },

    formatColorForFeedback(rgb) {
      if (!Array.isArray(rgb) || rgb.length < 3) {
        return '';
      }
      const r = Number(rgb[0]);
      const g = Number(rgb[1]);
      const b = Number(rgb[2]);
      if ([r, g, b].some(v => Number.isNaN(v))) {
        return '';
      }
      return `RGB=[${r},${g},${b}]`;
    },

    buildActionDiagnostics(actionResult, action, foundCount) {
      const diag = this.createEmptyDiagnostics({
        scriptExecuted: true,
        foundElementsCount: typeof foundCount === 'number' ? foundCount : null
      });
      if (actionResult && typeof actionResult === 'object') {
        diag.paintExecuted = Boolean(actionResult.paintExecuted);
        diag.isolateExecuted = Boolean(actionResult.isolateExecuted);
        if (Array.isArray(actionResult.warnings) && actionResult.warnings.length) {
          diag.executionErrors = actionResult.warnings.slice();
        }
      }
      if (diag.paintExecuted && action && action.color && Array.isArray(action.color.rgb)) {
        diag.paintColorRgb = this.formatColorForFeedback(action.color.rgb);
      }
      return diag;
    },

    computeReportColumnStats(rows, headers) {
      const stats = [];
      const rowCount = Array.isArray(rows) ? rows.length : 0;
      if (rowCount === 0) {
        return stats;
      }
      for (const header of headers) {
        let empty = 0;
        let zero = 0;
        for (const row of rows) {
          const raw = row ? row[header] : undefined;
          if (this.isEmptyReportValue(raw)) {
            empty++;
            continue;
          }
          const asString = String(raw).trim().replace(',', '.');
          const asNumber = parseFloat(asString);
          if (!Number.isNaN(asNumber) && asNumber === 0 && /^-?0(?:\.0+)?$/.test(asString)) {
            zero++;
          }
        }
        stats.push({ column: header, empty: empty, zero: zero });
      }
      return stats;
    },

    buildReportSampleRows(rows, limit) {
      const result = [];
      const rowCount = Array.isArray(rows) ? rows.length : 0;
      const max = Math.min(rowCount, typeof limit === 'number' ? limit : 3);
      for (let i = 0; i < max; i++) {
        try {
          result.push(JSON.stringify(rows[i]));
        } catch (e) {
          result.push('{}');
        }
      }
      return result;
    },

    isReportToolResult(result) {
      if (!result) {
        return false;
      }
      if (result.isReport || result.hasReport) {
        return true;
      }
      if (String(result.tool || '').toLowerCase() === 'report.create_preview') {
        return true;
      }
      return false;
    },

    formatFeedbackYesNo(value) {
      return value ? 'Да' : 'Нет';
    },

    formatFeedbackTextOrNone(value) {
      if (Array.isArray(value)) {
        const clean = value.filter(v => typeof v === 'string' && v.trim().length > 0).map(v => v.trim());
        if (clean.length === 0) {
          return 'нет';
        }
        return clean.join('; ');
      }
      if (value === undefined || value === null) {
        return 'нет';
      }
      const text = String(value).trim();
      return text.length === 0 ? 'нет' : text;
    },

    formatFeedbackNullableInt(value) {
      if (value === undefined || value === null) {
        return 'не определено';
      }
      return String(value);
    },

    collectFeedbackExecutionErrors(result) {
      const values = [];
      if (result?.diagnostics?.executionErrors && Array.isArray(result.diagnostics.executionErrors)) {
        for (const item of result.diagnostics.executionErrors) {
          if (typeof item === 'string' && item.trim().length > 0) {
            values.push(item.trim());
          }
        }
      }
      if (Array.isArray(result?.errors)) {
        for (const item of result.errors) {
          if (typeof item === 'string' && item.trim().length > 0) {
            values.push(item.trim());
          }
        }
      }
      return Array.from(new Set(values)).join('; ');
    },

    buildFeedbackCommonHeader(contextId, result) {
      const lines = [];
      lines.push(`ContextId: ${contextId}`);
      lines.push(`Tool: ${result?.tool || 'команда инструмента'}`);
      lines.push(`Sequence: ${result?.sequence !== undefined ? result.sequence : 0}`);
      return lines;
    },

    buildVisualFeedbackText(contextId, result) {
      const diag = result?.diagnostics || this.createEmptyDiagnostics();
      const foundCount = diag.foundElementsCount !== null && diag.foundElementsCount !== undefined
        ? String(diag.foundElementsCount)
        : (Array.isArray(result?.errors) && result.errors.length > 0 ? '0' : 'не определено');
      const lines = [];
      lines.push('Тип диагностики: Поиск/окрашивание/изоляция');
      lines.push(...this.buildFeedbackCommonHeader(contextId, result));
      lines.push('');
      lines.push(`Скрипт исполнен: ${this.formatFeedbackYesNo(diag.scriptExecuted)}`);
      lines.push(`Ошибка исполнения: ${this.formatFeedbackTextOrNone(this.collectFeedbackExecutionErrors(result))}`);
      lines.push(`Окрашивание произведено: ${this.formatFeedbackYesNo(diag.paintExecuted)}`);
      const colorText = diag.paintExecuted && diag.paintColorRgb ? diag.paintColorRgb : 'не применялся';
      lines.push(`Цвет: ${colorText}`);
      lines.push(`Изоляция элементов произведена: ${this.formatFeedbackYesNo(diag.isolateExecuted)}`);
      lines.push(`Найдено элементов: ${foundCount}`);
      lines.push('');
      lines.push(`Предупреждения: ${this.formatFeedbackTextOrNone(result?.warnings)}`);
      return lines.join('\n').replace(/\s+$/, '');
    },

    buildReportFeedbackText(contextId, result) {
      const diag = result?.diagnostics || this.createEmptyDiagnostics();
      const lines = [];
      lines.push('Тип диагностики: Отчет');
      lines.push(...this.buildFeedbackCommonHeader(contextId, result));
      lines.push('');
      lines.push(`Скрипт исполнен: ${this.formatFeedbackYesNo(diag.scriptExecuted)}`);
      lines.push(`Ошибка исполнения: ${this.formatFeedbackTextOrNone(this.collectFeedbackExecutionErrors(result))}`);
      lines.push(`Количество строк в отчете: ${this.formatFeedbackNullableInt(diag.reportRowsCount)}`);
      if (Array.isArray(diag.unavailableAttributes) && diag.unavailableAttributes.length > 0) {
        lines.push(`Недоступные атрибуты: ${diag.unavailableAttributes.join(', ')}`);
      } else {
        lines.push('Недоступные атрибуты: нет');
      }
      lines.push('');
      lines.push('Характеристика отчета по колонкам:');
      if (!Array.isArray(diag.reportColumnStats) || diag.reportColumnStats.length === 0) {
        lines.push('- нет данных');
      } else {
        for (const stat of diag.reportColumnStats) {
          lines.push(`- ${stat.column}: пустых=${stat.empty}, нулевых=${stat.zero}`);
        }
      }
      lines.push('');
      lines.push('Примеры строк из отчета:');
      if (!Array.isArray(diag.reportSampleRows) || diag.reportSampleRows.length === 0) {
        lines.push('нет данных');
      } else {
        for (const row of diag.reportSampleRows.slice(0, 3)) {
          lines.push(row);
        }
      }
      lines.push('');
      lines.push(`Предупреждения: ${this.formatFeedbackTextOrNone(result?.warnings)}`);
      return lines.join('\n').replace(/\s+$/, '');
    },

    buildToolFeedbackText(contextId, result) {
      if (!result) {
        return '';
      }
      return this.isReportToolResult(result)
        ? this.buildReportFeedbackText(contextId, result)
        : this.buildVisualFeedbackText(contextId, result);
    },

    isTerminalAcsEvent(acsEvent) {
      if (!acsEvent) {
        return false;
      }
      const agent = String(acsEvent.agent || '').toLowerCase();
      const action = String(acsEvent.action || '').toLowerCase();
      if (agent === 'acsworker' && (action === 'finish' || action === 'error' || action === 'invalid_task')) {
        return true;
      }
      if (agent === 'feedbackprocessor' && action === 'finish') {
        return true;
      }
      if (!agent && !action && String(acsEvent.status || '').toLowerCase() === 'success') {
        return true;
      }
      return false;
    },

    isFeedbackRepairEvent(acsEvent) {
      if (!acsEvent) {
        return false;
      }
      const agent = String(acsEvent.agent || '').toLowerCase();
      return agent === 'feedbackanalyzer'
        || agent === 'feedbackrepairrunner'
        || agent === 'feedbackprocessor'
        || agent === 'feedback';
    },

    extractFeedbackIssues(data) {
      if (!data || typeof data !== 'object') {
        return '';
      }
      const collectMessages = (issues) => {
        if (!Array.isArray(issues)) {
          return [];
        }
        const values = [];
        for (const issue of issues) {
          if (!issue || typeof issue !== 'object') {
            continue;
          }
          const message = typeof issue.message === 'string' && issue.message.trim().length > 0
            ? issue.message.trim()
            : (typeof issue.issue_type === 'string' ? issue.issue_type.trim() : '');
          if (message) {
            values.push(message);
          }
        }
        return values;
      };
      if (data.analysis && typeof data.analysis === 'object') {
        const fromAnalysis = collectMessages(data.analysis.issues);
        if (fromAnalysis.length > 0) {
          return fromAnalysis.slice(0, 3).join('; ');
        }
      }
      if (Array.isArray(data.issue_types)) {
        const values = data.issue_types
          .filter(v => typeof v === 'string' && v.trim().length > 0)
          .map(v => v.trim());
        return values.slice(0, 3).join('; ');
      }
      return '';
    },

    extractFeedbackUserMessages(data) {
      if (!data || !Array.isArray(data.messages)) {
        return '';
      }
      const values = data.messages
        .filter(v => typeof v === 'string' && v.trim().length > 0)
        .map(v => v.trim());
      return values.join(' ');
    },

    buildFeedbackEventStatus(acsEvent) {
      if (!acsEvent) {
        return 'Ожидаю реакцию ACS на диагностическое сообщение';
      }
      const agent = String(acsEvent.agent || '');
      const action = String(acsEvent.action || '');
      const data = acsEvent.data && typeof acsEvent.data === 'object' ? acsEvent.data : {};

      if (agent.toLowerCase() === 'feedbackanalyzer') {
        if (data.analysis && data.analysis.satisfies_request === true) {
          return 'ACS разобрал диагностическое сообщение: выполнение подтверждено';
        }
        const issues = this.extractFeedbackIssues(data);
        return issues
          ? `ACS разобрал диагностическое сообщение: ${issues}`
          : 'ACS разобрал диагностическое сообщение: требуется проверка результата';
      }

      if (agent.toLowerCase() === 'feedbackrepairrunner') {
        if (action.toLowerCase() === 'problem_detected') {
          const issues = this.extractFeedbackIssues(data);
          return issues
            ? `ACS нашёл проблему по диагностическому сообщению: ${issues}`
            : 'ACS нашёл проблему по диагностическому сообщению и запускает исправление плана';
        }
        if (action.toLowerCase() === 'start') {
          return 'ACS формирует исправленный план по диагностическому сообщению';
        }
        if (action.toLowerCase() === 'repaired_plan_ready') {
          return 'ACS подготовил исправленный план, ожидаю новую команду';
        }
        if (action.toLowerCase() === 'error') {
          const error = typeof data.error === 'string' ? data.error.trim() : '';
          return error
            ? `ACS не смог подготовить исправление плана: ${error}`
            : 'ACS не смог подготовить исправление плана';
        }
      }

      if (agent.toLowerCase() === 'feedbackprocessor' && action.toLowerCase() === 'finish') {
        if (data.ok === true) {
          return 'Цикл проверки завершён: ACS подтвердил выполнение';
        }
        if (data.ok === false) {
          return 'Цикл проверки завершён: ACS не смог подтвердить выполнение';
        }
        return 'Цикл проверки завершён ACS';
      }

      if (agent.toLowerCase() === 'feedback' && action.toLowerCase() === 'user_feedback') {
        const messages = this.extractFeedbackUserMessages(data);
        if (messages) {
          return `ACS сформировал итог по диагностическому сообщению: ${messages}`;
        }
        if (data.ok === true) {
          return 'ACS сформировал итог по диагностическому сообщению: выполнение подтверждено';
        }
        if (data.ok === false) {
          return 'ACS сформировал итог по диагностическому сообщению: есть предупреждения';
        }
      }

      return 'ACS обрабатывает диагностическое сообщение';
    },

    updateActiveStatus(text) {
      if (!text) {
        return;
      }
      const target = this.activeStatusMessage;
      if (target && target.isLoading) {
        target.text = text;
      }
    },

    startFeedbackWaitTimeout(baseText) {
      if (!this.activeStatusMessage) {
        return;
      }
      this.stopFeedbackWaitTimeout();
      this.feedbackWaitStartedAt = Date.now();
      this.feedbackWaitBaseText = baseText && String(baseText).trim().length > 0
        ? String(baseText).trim()
        : 'Ожидаю реакцию ACS на диагностическое сообщение';
      this.feedbackWaitTimedOut = false;
      this.updateFeedbackWaitStatus();
      this.feedbackWaitTimerId = setInterval(() => this.onFeedbackWaitTick(), 1000);
    },

    stopFeedbackWaitTimeout() {
      if (this.feedbackWaitTimerId) {
        clearInterval(this.feedbackWaitTimerId);
        this.feedbackWaitTimerId = null;
      }
      this.feedbackWaitStartedAt = null;
      this.feedbackWaitBaseText = '';
    },

    onFeedbackWaitTick() {
      if (!this.activeStatusMessage || !this.feedbackWaitStartedAt) {
        return;
      }
      const elapsed = Math.max(0, Math.floor((Date.now() - this.feedbackWaitStartedAt) / 1000));
      const FEEDBACK_WAIT_TIMEOUT_SECONDS = 120;
      if (elapsed >= FEEDBACK_WAIT_TIMEOUT_SECONDS) {
        this.onFeedbackWaitTimeout();
        return;
      }
      this.updateFeedbackWaitStatus();
    },

    updateFeedbackWaitStatus() {
      if (!this.activeStatusMessage || !this.feedbackWaitStartedAt) {
        return;
      }
      const FEEDBACK_WAIT_TIMEOUT_SECONDS = 120;
      const elapsed = Math.max(0, Math.floor((Date.now() - this.feedbackWaitStartedAt) / 1000));
      const remaining = Math.max(0, FEEDBACK_WAIT_TIMEOUT_SECONDS - elapsed);
      const base = this.feedbackWaitBaseText || 'Ожидаю реакцию ACS на диагностическое сообщение';
      const text = `${base}. Прошло ${elapsed} с, тайм-аут через ${remaining} с.`;
      if (this.activeStatusMessage.isLoading) {
        this.activeStatusMessage.text = text;
      }
    },

    onFeedbackWaitTimeout() {
      this.stopFeedbackWaitTimeout();
      this.feedbackWaitTimedOut = true;
      const text = 'ACS не вернул следующий статус после диагностического сообщения за 120 секунд.';
      this.logs.push({ text: text, type: 'assistant' });
      if (this.activeTrace) {
        this.activeTrace.finalMessage = text;
      }
      this.stopLoadingAnimation();
      let isReport = false;
      let searchToolCall = null;
      let reportToolCall = null;
      let reportCacheId = null;
      let reportRowCount3 = 0;
      const messageTrace = this.activeTrace;
      const seenMessages3 = new Set();
      const uniqueLines3 = [];
      for (const msg of this.deduplicateToolMessages(this.current_msgs)) {
        const msgText = (msg.message || '').trim();
        if (msgText && !seenMessages3.has(msgText)) {
          seenMessages3.add(msgText);
          uniqueLines3.push(msgText);
        }
        if (msg.isSearch && msg.searchToolCall && !this.isTechnicalSearchToolCall(msg.searchToolCall)) {
          searchToolCall = msg.searchToolCall;
        }
        if (msg.isReport) {
          isReport = true;
          if (typeof msg.count === 'number') {
            reportRowCount3 = msg.count;
          }
        }
        if (msg.reportToolCall) {
          reportToolCall = msg.reportToolCall;
        }
        if (msg.reportCacheId) {
          reportCacheId = msg.reportCacheId;
        }
      }
      const timeoutMessage = uniqueLines3.length > 0
        ? `Выполнено:\n${uniqueLines3.join('\n')}\n\n${text}`
        : text;
      this.messages.push({
        text: timeoutMessage.replace(/\s+$/, ''),
        type: 'assistant',
        isReport: isReport,
        hasSearchAction: Boolean(searchToolCall),
        hasReportAction: Boolean(reportToolCall),
        reportRowCount: reportRowCount3,
        searchToolCall: searchToolCall,
        reportToolCall: reportToolCall,
        reportCacheId: reportCacheId,
        diagnosticText: messageTrace ? this.formatExecutionTrace(messageTrace, this.executionTrace.indexOf(messageTrace)) : '',
        hasDiagnosticAction: Boolean(messageTrace && messageTrace.toolCalls && messageTrace.toolCalls.length),
        isTraceExpanded: false,
      });
      if (isReport && reportCacheId) {
        this.autoOpenReportPreview({ reportCacheId }).catch(() => {});
      }
      this.scrollToBottom();
      this.current_msgs = [];
      if (this.streamReader) {
        try { this.streamReader.cancel(); } catch (e) {}
        this.streamReader = null;
      }
    },

    startExecutionTrace(prompt) {
      const trace = {
        request: {
          prompt: prompt,
          context_id: this.contextId
        },
        finalMessage: '',
        toolCalls: []
      };
      this.executionTrace.push(trace);
      this.activeTrace = trace;
      this.scrollToBottom();
      return trace;
    },

    completeActiveTrace(message) {
      if (this.activeTrace) {
        this.activeTrace.finalMessage = message;
        this.scrollToBottom();
      }
    },

    addToolCallTrace(toolData) {
      if (!this.activeTrace) {
        this.startExecutionTrace(this.ask || this.question || '');
      }
      const call = {
        tool: toolData?.tool || '',
        raw: toolData || {},
        script: this.createGeneratedScript(toolData),
        message: 'Ожидание выполнения.',
        result: '',
        warnings: []
      };
      this.activeTrace.toolCalls.push(call);
      this.scrollToBottom();
      return call;
    },

    completeToolCallTrace(call, toolData, result) {
      if (!call) {
        return;
      }
      call.message = result?.message || 'Команда выполнена.';
      call.result = this.createPerformerResult(toolData, result);
      call.warnings = this.createToolWarnings(toolData, result);
      this.scrollToBottom();
    },

    createGeneratedScript(toolData) {
      const tool = toolData?.tool;
      const args = toolData?.arguments || {};
      if (tool === 'bim.search' || tool === 'bim.search_and_visualize') {
        const search = args?.source?.search ?? args?.search ?? {};
        if (this.isCurrentSelectionSearch(search)) {
          return 'UseCurrentSelection()';
        }
        return `PerformSearchRequest(${JSON.stringify(search.dsl || '')})`;
      }
      if (tool === 'bim.visualize') {
        const src = args?.source?.kind ?? args?.element_ids_source ?? '';
        return `PerformVisualize(${JSON.stringify(src)})`;
      }
      if (tool === 'bim.get_properties') {
        const src = args?.source?.kind ?? args?.element_ids_source ?? '';
        return `GetProperties(${JSON.stringify(src)}, ${JSON.stringify(args.attributes || [])})`;
      }
      if (tool === 'report.create_preview') {
        const rp = args?.source?.report_plan ?? args?.report_plan;
        return `CreateReportPreview(${JSON.stringify(rp?.attributes || [])})`;
      }
      return '';
    },

    createPerformerResult(toolData, result) {
      const tool = toolData?.tool || '';
      const lines = ['Performer run result'];
      lines.push('Code: ScriptExecuted');
      lines.push(`ScriptReceived: ${Boolean(toolData)}`);
      lines.push(`SearchExecuted: ${tool === 'bim.search' || tool === 'bim.search_and_visualize'}`);
      lines.push(`SelectionCreated: ${Boolean(result?.ids?.length)}`);
      lines.push(`CurrentElementsCount: ${result?.count ?? 0}`);
      const actionResult = result?.actionResult || {};
      lines.push(`PaintExecuted: ${Boolean(actionResult.paintExecuted)}`);
      lines.push(`IsolateExecuted: ${Boolean(actionResult.isolateExecuted)}`);
      lines.push(`MathReportPreviewCreated: ${tool === 'report.create_preview'}`);
      return lines.join('\n');
    },

    createToolWarnings(toolData, result) {
      const warnings = [];
      if ((toolData?.tool === 'bim.search' || toolData?.tool === 'bim.search_and_visualize') && (!result || result.count === 0)) {
        warnings.push('Поиск выполнен, но элементы не найдены.');
      }
      if (toolData?.tool === 'bim.get_properties' && (!result || result.count === 0)) {
        warnings.push('Свойства не получены, потому что выборка пустая.');
      }
      if (toolData?.tool === 'report.create_preview' && (!result || result.count === 0)) {
        warnings.push('Предпросмотр отчёта создан без строк.');
      }
      if (result?.actionResult?.warnings?.length) {
        warnings.push(...result.actionResult.warnings);
      }
      if (result?.warnings?.length) {
        warnings.push(...result.warnings);
      }
      if (!this.advancedDebugMode) {
        return warnings.filter(warning => !String(warning || '').startsWith('Диагностика'));
      }
      return warnings;
    },

    formatJson(value) {
      if (typeof value === 'string') {
        return value;
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    },

    async executeBimSearch(args) {
      const search = args?.source?.search ?? args?.search;
      const { dsl, limit } = search;

      await this.ensureModelLoaded();
      this.propertiesCache = {};
      this._lastReportParams = null;
      this._lastReportToolCall = null;

      let result = null;
      if (this.isCurrentSelectionSearch(search)) {
        result = this.getCurrentSelectionSearchResult();
        result.message = `Получена текущая выборка. Элементов: ${result.count}`;
      } else {
        result = await this.searchElements(dsl);
      }

      result = this.applySearchLimit(result, limit);

      this.previousSearch = {
        ids: result.ids,
        element_ids: result.element_ids,
        targets: result.targets || [],
        count: result.count,
      };

      this.logs.push({text:`Произведен поиск по критерию: ${dsl}. Найдено ${result.count} элементов.`, type: 'assistant'});

      return {
        message: result.message,
        count: result.count,
        ids: result.ids,
        element_ids: result.element_ids,
        targets: result.targets || [],
        isSearch: true,
        searchAction: args,
        searchToolCall: {
          tool: 'bim.search',
          arguments: args
        },
        diagnostics: this.createEmptyDiagnostics({
          scriptExecuted: true,
          foundElementsCount: result.count
        })
      };
    },

    async executeBimSearchAndVisualize(args) {
      const search = args?.source?.search ?? args?.search;
      const action = args?.action;
      
      const searchResult = await this.executeBimSearch(args);
      
      if (searchResult.count === 0) {
        //this.logs.push({text:`Произведен поиск по критерию: ${search.dsl}. Ничего не найдено по запросу.`, type: 'assistant'});
        return {
          message: `Ничего не найдено по запросу`,
          count: 0,
          ids: [],
          diagnostics: this.createEmptyDiagnostics({
            scriptExecuted: true,
            foundElementsCount: 0
          })
        };
      }

      let actionResult = null;
      if (action) {
        actionResult = await this.applyActionToElements(searchResult.targets || searchResult.element_ids || searchResult.ids, action);
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
        ids: searchResult.ids,
        element_ids: searchResult.element_ids,
        targets: searchResult.targets || [],
        actionResult: actionResult,
        isSearch: true,
        searchAction: args,
        searchToolCall: {
          tool: 'bim.search_and_visualize',
          arguments: args
        },
        diagnostics: this.buildActionDiagnostics(actionResult, action, searchResult.count)
      };
    },

    async executeBimVisualize(args) {
      const element_ids_source = args?.source?.kind ?? args?.element_ids_source ?? 'previous_search';
      const action = args?.action;
      
      let targets = [];
      
      if (element_ids_source === 'current_selection') {
        targets = this.getCurrentSelectionSearchResult().targets;
      } else if (element_ids_source === 'previous_search') {
        targets = this.previousSearch?.targets || this.buildTargetsFromElementIds(this.previousSearch?.element_ids || []);
      } else {
        throw new Error(`Неизвестный источник: ${element_ids_source}`);
      }
      
      if (targets.length === 0) {
        console.log('Нет элементов для визуализации');
      }
      
      const actionResult = await this.applyActionToElements(targets, action);
      
      let message = `Визуализация применена к ${targets.length} элементам`;
      if (action) {
        const actionText = this.getActionDescription(action);
        message += `: ${actionText}`;
      }

      this.logs.push({text:`Произведена визуализация для: ${element_ids_source}. ` + message, type: 'assistant'});
      
      return {
        message: message,
        count: targets.length,
        ids: targets.map(target => target.elementId),
        element_ids: targets.map(target => target.elementId),
        targets: targets,
        actionResult: actionResult,
        diagnostics: this.buildActionDiagnostics(actionResult, action, targets.length)
      };
    },

    async executeBimGetProperties(args) {
      const element_ids_source = args?.source?.kind === 'previous_search' || args?.source?.kind === 'current_selection'
        ? args.source.kind
        : (args?.element_ids_source ?? args?.source?.kind ?? 'previous_search');
      const attributes = args?.attributes || [];
      
      await this.ensureModelLoaded();
      
      let ids = [];
      
      if (element_ids_source === 'current_selection') {
        ids = this.getCurrentSelectionSearchResult().element_ids;
      } else if (element_ids_source === 'previous_search') {
        ids = this.previousSearch?.element_ids || [];
      } else {
        throw new Error(`Неизвестный источник: ${element_ids_source}`);
      }
      
      const properties = {};
      for (const id of ids) {
        const attrs = await this.refreshElementAttributes(id);
        if (attrs) {
          properties[id] = {};
          for (const attr of attributes) {
            const value = this.resolveReportAttributeValue(id, attrs, attr);
            if (!this.isEmptyReportValue(value)) {
              properties[id][attr] = value;
            }
          }
        }
      }
      
      this.propertiesCache = properties;
      
      this.logs.push({text:`Произведена поиск атрибутов: ${attributes.toString()} для ${element_ids_source}. Получены свойства для ${Object.keys(properties).length} элементов`, type: 'assistant'});

      return {
        message: `Получены свойства для ${Object.keys(properties).length} элементов`,
        count: Object.keys(properties).length,
        diagnostics: this.createEmptyDiagnostics({
          scriptExecuted: true,
          foundElementsCount: Object.keys(properties).length
        })
      };
    },

    async executeReportCreatePreview(args) {
      const report_plan = args?.source?.report_plan ?? args?.report_plan;
      
      await this.ensureModelLoaded();

      let sourceIds = [];
      const sourceKind = args?.source?.kind;

      if (sourceKind === 'search' && args?.source?.search) {
        const embeddedSearch = args.source.search;
        const searchResult = await this.searchElements(embeddedSearch.dsl);
        sourceIds = searchResult?.element_ids || [];
        this.previousSearch = {
          ids: searchResult?.ids || [],
          element_ids: sourceIds,
          targets: searchResult?.targets || [],
          count: searchResult?.count || 0
        };
      } else if (sourceKind === 'current_selection') {
        sourceIds = this.getCurrentSelectionSearchResult().element_ids;
      } else {
        const cachedIds = Object.keys(this.propertiesCache || {});
        sourceIds = cachedIds.length > 0 ? cachedIds : (this.previousSearch?.element_ids || []);
      }

      const headers = report_plan.attributes || ['ElementId', 'Name', 'Type'];
      
      const rows = [];
      const missingByHeader = {};
      for (const id of sourceIds) {
        await this.refreshElementAttributes(id);
        const attrs = this.getMergedReportAttributes(id);
        if (attrs) {
          const row = {};
          for (const header of headers) {
            const value = this.resolveReportAttributeValue(id, attrs, header);
            const hasValue = !this.isEmptyReportValue(value);
            row[header] = hasValue ? value : '-';
            if (!hasValue) {
              missingByHeader[header] = (missingByHeader[header] || 0) + 1;
            }
          }
          rows.push(row);
        }
      }

      const columns = headers.map(header => ({
        field: header,
        label: header
      }));
          
      const previewParams = {
        rows: rows,
        columns: columns,
        calculatedColumns: [],
        includeTotals: true,
        totalCount: sourceIds.length,
        foundIds: sourceIds
      };
      const reportToolCall = {
        tool: 'report.create_preview',
        arguments: args
      };
      const reportCacheId = this.storeReportPreviewParams(previewParams);
      this._lastReportParams = previewParams;
      this._lastReportToolCall = reportToolCall;

      const warnings = Object.entries(missingByHeader)
        .filter(([, count]) => rows.length > 0 && count === rows.length)
        .map(([header]) => `Атрибут ${header} не найден или пуст у всех элементов отчёта.`);
      warnings.push(...this.createReportAttributeDebugWarnings(sourceIds, headers, missingByHeader, rows.length));

      this.logs.push({text:`Произведено построение отчета с атрибутами: ${report_plan.attributes.toString()}.`, type: 'assistant'});
      
      const unavailableAttributes = Object.entries(missingByHeader)
        .filter(([, count]) => rows.length > 0 && count === rows.length)
        .map(([header]) => header);
      const reportColumnStats = rows.length > 0
        ? this.computeReportColumnStats(rows, headers)
        : headers.map(h => ({ column: h, empty: 0, zero: 0 }));
      const reportSampleRows = this.buildReportSampleRows(rows, 3);

      return {
        message: `Предпросмотр отчёта создан. Строк: ${rows.length}, колонок: ${columns.length}.`,
        count: rows.length,
        hasReport: true,
        isReport: true,
        rows: rows,
        columns: columns,
        warnings: warnings,
        reportToolCall: reportToolCall,
        reportCacheId: reportCacheId,
        diagnostics: this.createEmptyDiagnostics({
          scriptExecuted: true,
          reportRowsCount: rows.length,
          reportColumnStats: reportColumnStats,
          reportSampleRows: reportSampleRows,
          unavailableAttributes: unavailableAttributes
        })
      };
    },

    isEmptyReportValue(value) {
      return value === undefined || value === null || String(value).trim() === '' || String(value).trim() === '-';
    },

    async executeBimCheckConnections(args) {
      try {
        if (!this.viewer || !this.viewer.model) {
          return {
            message: 'Модель не загружена.',
            diagnostics: this.createEmptyDiagnostics({ scriptExecuted: false, executionErrors: ['Модель не загружена.'] })
          };
        }

        const model = this.viewer.model;
        const allParts = model.getAllModelParts ? model.getAllModelParts() : [];
        if (!allParts.length) {
          return {
            message: 'Не найдено ни одной части модели.',
            diagnostics: this.createEmptyDiagnostics({ scriptExecuted: false, executionErrors: ['Нет частей модели.'] })
          };
        }

        const PIPE_TYPES = ['IfcPipeSegment', 'IfcPipeFitting', 'IfcValve', 'IfcFlowController',
          'IfcOutlet', 'IfcFlowInstrument', 'IfcFlowMeter', 'IfcSensor',
          'IfcFlowTerminal', 'IfcFlowMovingDevice', 'IfcFlowTreatmentDevice',
          'IfcDuctSegment', 'IfcDuctFitting', 'IfcDistributionChamberElement'];

        const GAP_TOL = 30;
        const DIRECT_TOL = 30;
        const BRANCH_TOL = 110;
        const MIN_DIAM = 10;

        function getGeometry(b) {
          const dims = [
            { axis: 'x', size: b.max.x - b.min.x },
            { axis: 'y', size: b.max.y - b.min.y },
            { axis: 'z', size: b.max.z - b.min.z },
          ].sort((a, b) => b.size - a.size);
          const mainLen = dims[0].size;
          const diam = (dims[1].size + dims[2].size) / 2;
          return {
            mainAxis: dims[0].axis,
            mainLen: mainLen,
            diameter: diam,
            minDiam: Math.min(dims[1].size, dims[2].size),
            elongation: diam > 0 ? mainLen / diam : 0,
            cx: (b.min.x + b.max.x) / 2,
            cy: (b.min.y + b.max.y) / 2,
            cz: (b.min.z + b.max.z) / 2,
          };
        }

        function getMainEnd(b, axis, which) {
          if (axis === 'x') return which === 'min' ? b.min.x : b.max.x;
          if (axis === 'y') return which === 'min' ? b.min.y : b.max.y;
          return which === 'min' ? b.min.z : b.max.z;
        }

        function endOverlapsBbox(tubeBbox, axis, endVal, otherBbox, tol) {
          // Проверяем пересечение торца трубы с bbox соседа
          // По главной оси - конец трубы должен быть близко к краю соседа
          const mainOk = endVal >= (axis==='x'?otherBbox.min.x:axis==='y'?otherBbox.min.y:otherBbox.min.z) - tol &&
                         endVal <= (axis==='x'?otherBbox.max.x:axis==='y'?otherBbox.max.y:otherBbox.max.z) + tol;
          if (!mainOk) return false;
          // По перпендикулярным осям - поперечники труб должны перекрываться
          const perpAxes = ['x','y','z'].filter(a => a !== axis);
          for (const pa of perpAxes) {
            const tubeMin = tubeBbox['min'][pa] - tol;
            const tubeMax = tubeBbox['max'][pa] + tol;
            const otherMin = otherBbox['min'][pa] - tol;
            const otherMax = otherBbox['max'][pa] + tol;
            if (tubeMax < otherMin || tubeMin > otherMax) return false;
          }
          return true;
        }

        // Собираем все элементы из всех частей модели
        const allElements = [];
        for (const part of allParts) {
          if (!part.elementTree) continue;
          const elements = part.elementTree.getAllElements();
          for (const el of elements) {
            if (!el.hasGeometry) continue;
            if (!PIPE_TYPES.includes(el.type)) continue;
            const b = el.viewObject?.getBoundingBox();
            if (!b || b.isEmpty()) continue;
            const g = getGeometry(b);
            const branch = el.name?.match(/BRANCH (.+)/)?.[1] || null;
            allElements.push({ el, b, g, branch, partId: part.id });
          }
        }

        // Трубы: только IfcPipeSegment
        const isTube = (x) => x.el.type === 'IfcPipeSegment' && x.g.minDiam >= MIN_DIAM;

        // Только трубы с BRANCH-форматом
        const BRANCH_FORMAT = /TUBE\s+\d+.*BRANCH/i;
        const segments = allElements.filter(x => isTube(x) && BRANCH_FORMAT.test(x.el.name));
        const fittings = allElements.filter(x => !isTube(x));

        // Определяем максимальный номер трубы для каждой ветки (по всем частям)
        const branchMax = {};
        for (const { el, branch } of segments) {
          if (!branch) continue;
          const m = el.name.match(/TUBE (\d+)/);
          if (!m) continue;
          const num = parseInt(m[1]);
          if (!branchMax[branch] || num > branchMax[branch]) branchMax[branch] = num;
        }

        // проверка на разрывы
        const disconnected = [];
        for (const seg of segments) {
          const { el, b, g, branch } = seg;
          const ends = [
            getMainEnd(b, g.mainAxis, 'min'),
            getMainEnd(b, g.mainAxis, 'max'),
          ];
          const num = parseInt(el.name.match(/TUBE (\d+)/)?.[1] || 0);
          const max = branchMax[branch] || 999;
          const isNamedEdge = num === 1 || num === max;

          for (const endVal of ends) {
            // сначала своя часть, потом остальные (стык может быть в другом IFC)
            const directOwn = allElements.some(o => {
              if (o.el.id === el.id) return false;
              if (o.partId !== seg.partId) return false;
              return endOverlapsBbox(b, g.mainAxis, endVal, o.b, DIRECT_TOL);
            });
            if (directOwn) continue;

            const viaBranchOwn = fittings.some(o => {
              if (o.partId !== seg.partId) return false;
              return endOverlapsBbox(b, g.mainAxis, endVal, o.b, BRANCH_TOL);
            });
            if (viaBranchOwn) continue;

            const directCross = allElements.some(o => {
              if (o.el.id === el.id) return false;
              if (o.partId === seg.partId) return false;
              return endOverlapsBbox(b, g.mainAxis, endVal, o.b, DIRECT_TOL);
            });
            if (directCross) continue;

            const viaBranchCross = fittings.some(o => {
              if (o.partId === seg.partId) return false;
              return endOverlapsBbox(b, g.mainAxis, endVal, o.b, BRANCH_TOL);
            });
            if (viaBranchCross) continue;

            if (!isNamedEdge) {
              disconnected.push({ id: el.id, name: el.name, partId: seg.partId });
            }
          }
        }
        const disconnectedByID = {};
        for (const d of disconnected) {
          if (!disconnectedByID[d.id]) disconnectedByID[d.id] = { id: d.id, name: d.name, partId: d.partId };
        }
        const disconnectedItems = Object.values(disconnectedByID);
        const disconnectedList = disconnectedItems.map(d => d.name);

        // проверка на смещения

        function decomposeGap(endPt, candP1, candP2) {
          const vx = candP2.x - candP1.x, vy = candP2.y - candP1.y, vz = candP2.z - candP1.z;
          const v2 = vx*vx + vy*vy + vz*vz;
          if (v2 < 1e-9) {
            const dx = endPt.x - candP1.x, dy = endPt.y - candP1.y, dz = endPt.z - candP1.z;
            return { lateral: Math.sqrt(dx*dx + dy*dy + dz*dz), longGap: 0, t: 0 };
          }
          const wx = endPt.x - candP1.x, wy = endPt.y - candP1.y, wz = endPt.z - candP1.z;
          const t = (wx*vx + wy*vy + wz*vz) / v2;
          const cx = vy*wz - vz*wy, cy = vz*wx - vx*wz, cz = vx*wy - vy*wx;
          const vlen = Math.sqrt(v2);
          const lateral = Math.sqrt(cx*cx + cy*cy + cz*cz) / vlen;
          const longGap = t < 0 ? -t * vlen : t > 1 ? (t - 1) * vlen : 0;
          return { lateral, longGap, t };
        }

        function bboxToAxis(b, g) {
          const pa = ['x', 'y', 'z'].filter(a => a !== g.mainAxis);
          const c0 = (b.min[pa[0]] + b.max[pa[0]]) / 2;
          const c1 = (b.min[pa[1]] + b.max[pa[1]]) / 2;
          const P1 = { x: 0, y: 0, z: 0 }; P1[g.mainAxis] = b.min[g.mainAxis]; P1[pa[0]] = c0; P1[pa[1]] = c1;
          const P2 = { x: 0, y: 0, z: 0 }; P2[g.mainAxis] = b.max[g.mainAxis]; P2[pa[0]] = c0; P2[pa[1]] = c1;
          return { P1, P2 };
        }

        const middleSegs = segments.filter(({ el, branch, g }) => {
          const num = parseInt(el.name.match(/TUBE (\d+)/)?.[1] || 0);
          if (num === 1) return false;
          if (!branch) return false;
          if (g.elongation < 2.0) return false;
          return true;
        });

        const misaligned = [];
        const seen = new Set();

        for (const seg of middleSegs) {
          const { el, b, g } = seg;
          const { P1: segP1, P2: segP2 } = bboxToAxis(b, g);

          for (const other of middleSegs) {
            if (other.el.id === el.id) continue;
            if (other.g.mainAxis !== g.mainAxis) continue;
            if (other.g.minDiam < MIN_DIAM) continue;

            const { P1: otherP1, P2: otherP2 } = bboxToAxis(other.b, other.g);

            const endPairs = [
              { endPt: segP1,   candP1: otherP1, candP2: otherP2 },
              { endPt: segP2,   candP1: otherP1, candP2: otherP2 },
              { endPt: otherP1, candP1: segP1,   candP2: segP2 },
              { endPt: otherP2, candP1: segP1,   candP2: segP2 },
            ];

            let bestLateral = Infinity;

            for (const ep of endPairs) {
              const { lateral, longGap } = decomposeGap(ep.endPt, ep.candP1, ep.candP2);
              if (longGap > GAP_TOL) continue;
              if (lateral < bestLateral) bestLateral = lateral;
            }

            if (!isFinite(bestLateral)) continue;

            const sumDiam = g.diameter + other.g.diameter;

            const minD = Math.min(g.diameter, other.g.diameter);
            const maxD = Math.max(g.diameter, other.g.diameter);
            if (minD > 0 && maxD / minD > 1.6) continue;

            // оси разошлись больше суммы радиусов - разные линии
            if (bestLateral > sumDiam / 2) continue;

            const crossPart = other.partId !== seg.partId;
            const e1 = getMainEnd(b, g.mainAxis, 'min');
            const e2 = getMainEnd(b, g.mainAxis, 'max');
            const JUSTIFY_NAMES = ['REDUCER', 'WELD', 'OLET'];
            const JUSTIFY_TYPES = ['IfcDistributionChamberElement'];
            const hasJustifyFitting = !crossPart && allElements.some(o => {
              const byName = JUSTIFY_NAMES.some(n => o.el.name.startsWith(n));
              const byType = JUSTIFY_TYPES.includes(o.el.type);
              if (!byName && !byType) return false;
              if (seg.branch && o.branch !== seg.branch && !byType) return false;
              return endOverlapsBbox(b, g.mainAxis, e1, o.b, BRANCH_TOL) ||
                     endOverlapsBbox(b, g.mainAxis, e2, o.b, BRANCH_TOL) ||
                     endOverlapsBbox(other.b, g.mainAxis, e1, o.b, BRANCH_TOL) ||
                     endOverlapsBbox(other.b, g.mainAxis, e2, o.b, BRANCH_TOL);
            });
            if (hasJustifyFitting) continue;

            // допуск смещения (IVT-формула)
            const maxOffset = Math.min(maxD * 0.2 + 10, maxD * 0.5);

            if (bestLateral > maxOffset) {
              const key = [el.id, other.el.id].sort().join('|');
              if (!seen.has(key)) {
                seen.add(key);
                misaligned.push({ id: el.id, partId: seg.partId, name: el.name, otherId: other.el.id, otherPartId: other.partId, other: other.el.name, offset: bestLateral.toFixed(1), maxOffset: maxOffset.toFixed(1) });
              }
            }
          }
        }

        // Формируем итоговое сообщение
        const totalChecked = segments.length;
        let message = `Проверено ${totalChecked} труб.\n`;

        if (disconnectedList.length === 0) {
          message += '✓ Разрывов не обнаружено.\n';
        } else {
          message += `✗ Разрывов: ${disconnectedList.length}:\n`;
          for (const name of disconnectedList) {
            message += `  - ${name}\n`;
          }
        }

        if (misaligned.length === 0) {
          message += '✓ Смещений не обнаружено.';
        } else {
          message += `✗ Смещений: ${misaligned.length}:\n`;
          for (const m of misaligned) {
            message += `  - ${m.name} / ${m.other}: смещение ${m.offset}мм (допуск ${m.maxOffset}мм)\n`;
          }
        }

        // сброс предыдущей покраски
        model.setGhostMode(false);
        model.showAll();
        model.clearColors();

        if (disconnectedList.length > 0 || misaligned.length > 0) {
          for (const part of allParts) {
            if (!part.elementTree) continue;
            const partId = part.id;
            const entities = part.elementTree._entities;
            if (!entities) continue;

            const disconnectedIds = new Set(disconnectedItems.filter(d => d.partId === partId).map(d => d.id));
            const misalignedRedIds = new Set(misaligned.filter(m => m.partId === partId).map(m => m.id));
            const misalignedBlueIds = new Set(misaligned.filter(m => m.otherPartId === partId).map(m => m.otherId));
            const redIdsRaw = [...new Set([...disconnectedIds, ...misalignedRedIds])];
            const blueIdsRaw = [...misalignedBlueIds].filter(id => !disconnectedIds.has(id) && !misalignedRedIds.has(id));
            const finalRedIds = redIdsRaw;
            const finalBlueIds = blueIdsRaw;
            const problemSet = new Set([...finalRedIds, ...finalBlueIds]);

            const bgList = [];
            try {
              if (typeof entities.forEach === 'function') {
                entities.forEach((_v, key) => {
                  if (typeof key === 'string' && !problemSet.has(key)) bgList.push(key);
                });
              } else if (Array.isArray(entities)) {
                for (const e of entities) {
                  const id = e?.id ?? e?.elementId;
                  if (typeof id === 'string' && !problemSet.has(id)) bgList.push(id);
                }
              }
            } catch (e) {}
            if (bgList.length > 0) {
              try { model.setColor(bgList, 245, 245, 245, 0.27, partId); } catch (e) {}
            }

            if (finalRedIds.length > 0) {
              try { model.setColor(finalRedIds, 220, 50, 50, 1, partId); } catch (e) {}
            }
            if (finalBlueIds.length > 0) {
              try { model.setColor(finalBlueIds, 50, 100, 220, 1, partId); } catch (e) {}
            }
          }

          this._highlightedIssue = null;
        }

        return {
          message: message.trim(),
          count: totalChecked,
          connectionIssues: [
            ...disconnectedList.map(name => ({ type: 'gap', label: name, name, other: null })),
            ...misaligned.map(m => ({ type: 'misalign', label: `${m.name} / ${m.other} — ${m.offset}мм`, name: m.name, other: m.other })),
          ],
          diagnostics: this.createEmptyDiagnostics({
            scriptExecuted: true,
            foundElementsCount: totalChecked,
            executionErrors: disconnectedList.length > 0 || misaligned.length > 0
              ? [`Разрывов: ${disconnectedList.length}, смещений: ${misaligned.length}`]
              : []
          })
        };

      } catch (e) {
        const errMsg = e?.message || String(e);
        console.error('[bim.check_connections] Ошибка:', e);
        return {
          message: `Ошибка при проверке коннектов: ${errMsg}`,
          diagnostics: this.createEmptyDiagnostics({ scriptExecuted: false, executionErrors: [errMsg] })
        };
      }
    },

    getMergedReportAttributes(elementId) {
      const actual = this.dataStore?.[elementId] || {};
      const cached = this.propertiesCache?.[elementId] || {};
      const merged = { ...actual };
      for (const [key, value] of Object.entries(cached)) {
        if (!this.isEmptyReportValue(value) && this.isEmptyReportValue(merged[key])) {
          merged[key] = value;
        }
      }
      return merged;
    },

    createReportAttributeDebugWarnings(sourceIds, headers, missingByHeader, rowCount) {
      if (!this.advancedDebugMode) {
        return [];
      }
      if (!rowCount) {
        return [];
      }
      const missingHeaders = headers.filter(header => missingByHeader[header] === rowCount);
      if (!missingHeaders.length) {
        return [];
      }
      const warnings = [];
      const sampleIds = sourceIds.slice(0, 3);
      warnings.push(`Диагностика отчёта: проверены ${rowCount} строк, sample element ids: ${sampleIds.join(', ')}`);
      const firstId = sampleIds[0];
      if (firstId) {
        const firstAttrs = this.getMergedReportAttributes(firstId);
        const firstKeys = Object.keys(firstAttrs).sort();
        const actualKeys = Object.keys(this.dataStore?.[firstId] || {}).sort();
        const cacheKeys = Object.keys(this.propertiesCache?.[firstId] || {}).sort();
        warnings.push(`Диагностика первого элемента ${firstId}: merged ключей ${firstKeys.length}; первые ключи: ${firstKeys.slice(0, 60).join(', ') || '(нет)'}`);
        warnings.push(`Диагностика первого элемента ${firstId}: dataStore ключей ${actualKeys.length}; первые ключи: ${actualKeys.slice(0, 60).join(', ') || '(нет)'}`);
        warnings.push(`Диагностика первого элемента ${firstId}: propertiesCache ключей ${cacheKeys.length}; ключи: ${cacheKeys.join(', ') || '(нет)'}`);
        const firstPropertySets = this.describeRawPropertySets(firstId);
        if (firstPropertySets) {
          warnings.push(`Диагностика propertySets первого элемента ${firstId}: ${firstPropertySets}`);
        }
        const adjacentDiagnostics = this.describeAdjacentElementDiagnostics(firstId, missingHeaders);
        warnings.push(...adjacentDiagnostics);
        warnings.push(this.describePropertyCallDiagnostics(firstId));
        warnings.push(...this.describeGlobalPropertyCandidateDiagnostics(firstId, missingHeaders));
      }
      for (const header of missingHeaders) {
        const candidates = [];
        for (const id of sampleIds) {
          const attrs = this.getMergedReportAttributes(id);
          for (const [key, value] of Object.entries(attrs)) {
            if (this.isReportAttributeDiagnosticCandidate(header, key)) {
              candidates.push(`${id}: ${key}=${this.formatDebugValue(value)}`);
            }
          }
          const featureCandidates = this.findRawPropertySetCandidates(id, header);
          for (const candidate of featureCandidates) {
            candidates.push(`${id}: ${candidate}`);
          }
        }
        const uniqueCandidates = Array.from(new Set(candidates)).slice(0, 12);
        if (uniqueCandidates.length) {
          warnings.push(`Диагностика ${header}: похожие raw-атрибуты первых элементов: ${uniqueCandidates.join('; ')}`);
        } else {
          warnings.push(`Диагностика ${header}: raw-атрибут с таким именем не найден в первых ${sampleIds.length} элементах отчёта.`);
        }
      }
      return warnings;
    },

    isReportAttributeDiagnosticCandidate(header, key) {
      const target = this.normalizeAttributeName(header);
      const normalizedKey = this.normalizeAttributeName(key);
      if (!target || !normalizedKey) {
        return false;
      }
      if (normalizedKey === target) {
        return true;
      }
      const groupMatch = String(key || '').match(/^\["?(.+?)"?\](.+)$/);
      if (groupMatch && this.normalizeAttributeName(groupMatch[2]) === target) {
        return true;
      }
      if (normalizedKey.startsWith(target) || normalizedKey.endsWith(target)) {
        return true;
      }
      return false;
    },

    describeAdjacentElementDiagnostics(elementId, missingHeaders) {
      if (!elementId || !Array.isArray(this.visibleElementOrder) || !this.visibleElementOrder.length) {
        return [];
      }
      const index = this.visibleElementOrder.indexOf(String(elementId));
      if (index < 0) {
        return [`Диагностика соседей ${elementId}: элемент не найден в visibleElementOrder.`];
      }
      const from = Math.max(0, index - 5);
      const to = Math.min(this.visibleElementOrder.length, index + 6);
      const neighborIds = this.visibleElementOrder.slice(from, to);
      const warnings = [];
      warnings.push(`Диагностика соседей ${elementId}: индекс ${index}, соседние ids: ${neighborIds.join(', ')}`);
      const targetHeaders = missingHeaders || [];
      const rows = [];
      for (const id of neighborIds) {
        const attrs = this.dataStore?.[id] || {};
        const keys = Object.keys(attrs);
        const candidates = [];
        for (const header of targetHeaders) {
          for (const [key, value] of Object.entries(attrs)) {
            if (this.isReportAttributeDiagnosticCandidate(header, key) && !this.isEmptyReportValue(value)) {
              candidates.push(`${key}=${this.formatDebugValue(value)}`);
            }
          }
        }
        if (!candidates.length) {
          const nonBuiltinKeys = keys.filter(key => !['ClassName','ElementId','ElementName','EntityType','GlobalId','GlobalId (readable)','GlobalIdReadable','Guid','IfcClass','IfcGuid','IfcType','ModelPartId','ModelPartName','Name','ObjectType','PartOf','Type','id','type','Название'].includes(key));
          if (nonBuiltinKeys.length) {
            candidates.push(`nonBuiltins=${nonBuiltinKeys.slice(0, 12).join('|')}`);
          }
        }
        if (candidates.length) {
          rows.push(`${id}: ${candidates.slice(0, 8).join(', ')}`);
        }
      }
      if (rows.length) {
        warnings.push(`Диагностика свойств соседей ${elementId}: ${rows.slice(0, 8).join('; ')}`);
      } else {
        warnings.push(`Диагностика свойств соседей ${elementId}: среди соседних visible elements непустые кандидаты по пустым колонкам не найдены.`);
      }
      return warnings;
    },

    describeGlobalPropertyCandidateDiagnostics(elementId, missingHeaders) {
      const warnings = [];
      if (!this.dataStore || !missingHeaders || !missingHeaders.length) {
        return warnings;
      }
      const reportAttrs = this.getMergedReportAttributes(elementId) || {};
      const reportType = this.getAttributeValue(elementId, reportAttrs, 'Type') || '';
      const reportPart = String(reportAttrs.ModelPartId || '').trim();
      const reportPartOf = String(reportAttrs.PartOf || '').trim();
      for (const header of missingHeaders) {
        const candidates = [];
        for (const [candidateId, attrs] of Object.entries(this.dataStore)) {
          if (!attrs || String(candidateId) === String(elementId)) {
            continue;
          }
          const matched = [];
          for (const [key, value] of Object.entries(attrs)) {
            if (this.isReportAttributeDiagnosticCandidate(header, key) && !this.isEmptyReportValue(value)) {
              matched.push(`${key}=${this.formatDebugValue(value)}`);
            }
          }
          if (!matched.length) {
            continue;
          }
          const candidateType = this.getAttributeValue(candidateId, attrs, 'Type') || this.getAttributeValue(candidateId, attrs, 'Common_Properties_TYPE') || attrs.TYPE || attrs.type || '';
          const candidateName = this.getAttributeValue(candidateId, attrs, 'Name') || '';
          const candidatePart = String(attrs.ModelPartId || '').trim();
          const candidatePartOf = String(attrs.PartOf || '').trim();
          let score = 0;
          if (reportType && candidateType && String(candidateType).toLowerCase() === String(reportType).toLowerCase()) {
            score += 5;
          }
          if (reportPart && candidatePart && reportPart === candidatePart) {
            score += 2;
          }
          if (reportPartOf && candidatePartOf && reportPartOf === candidatePartOf) {
            score += 1;
          }
          candidates.push({
            id: candidateId,
            score,
            type: candidateType,
            name: candidateName,
            part: candidatePart,
            partOf: candidatePartOf,
            matched: matched.slice(0, 4)
          });
        }
        candidates.sort((a, b) => b.score - a.score);
        const rows = candidates.slice(0, 6).map(candidate => `${candidate.id}: score=${candidate.score}, Type=${this.formatDebugValue(candidate.type)}, Name=${this.formatDebugValue(candidate.name)}, ModelPartId=${this.formatDebugValue(candidate.part)}, PartOf=${this.formatDebugValue(candidate.partOf)}, ${candidate.matched.join(', ')}`);
        if (rows.length) {
          warnings.push(`Диагностика по всей модели для ${header}: найдены непустые кандидаты: ${rows.join('; ')}`);
        } else {
          warnings.push(`Диагностика по всей модели для ${header}: непустые кандидаты не найдены.`);
        }
      }
      return warnings;
    },


    describeRawPropertySets(elementId) {
      const propertySets = this.dataStoreByFeatures?.[elementId];
      if (!Array.isArray(propertySets) || !propertySets.length) {
        return '';
      }
      const descriptions = [];
      for (const set of propertySets.slice(0, 8)) {
        const setName = this.getPropertySetName(set) || '(без имени)';
        const properties = set.properties || set.Properties || [];
        const propNames = Array.isArray(properties) ? properties.map(prop => this.getPropertyName(prop)).filter(Boolean).slice(0, 12) : [];
        descriptions.push(`${setName}: ${propNames.join(', ') || 'нет properties'}`);
      }
      return descriptions.join(' | ');
    },

    findRawPropertySetCandidates(elementId, header) {
      const propertySets = this.dataStoreByFeatures?.[elementId];
      if (!Array.isArray(propertySets) || !propertySets.length) {
        return [];
      }
      const candidates = [];
      for (const set of propertySets) {
        const setName = this.getPropertySetName(set);
        const properties = set.properties || set.Properties || [];
        if (!Array.isArray(properties)) {
          continue;
        }
        for (const prop of properties) {
          const propName = this.getPropertyName(prop);
          if (this.isReportAttributeDiagnosticCandidate(header, propName)) {
            candidates.push(`${setName || '(без группы)'}.${propName}=${this.formatDebugValue(this.getPropertyValue(prop))}`);
          }
        }
      }
      return candidates.slice(0, 8);
    },

    formatDebugValue(value) {
      if (value === undefined || value === null) {
        return '';
      }
      const text = String(value).replace(/\s+/g, ' ').trim();
      return text.length > 120 ? `${text.slice(0, 117)}...` : text;
    },

    async applyActionToElements(items, action) {
      if (!this.viewer || !this.viewer.model) {
        console.warn('Viewer не инициализирован');
        return { selectionCreated: false, paintExecuted: false, isolateExecuted: false, warnings: ['Viewer не инициализирован.'] };
      }

      const actionResult = { selectionCreated: false, paintExecuted: false, isolateExecuted: false, warnings: [] };

      try {
        action = action || {};
        const model = this.viewer.model;
        const targets = this.normalizeTargets(items);
        const byPart = this.groupTargetsByPart(targets);
        
        model.clearSelection();

        // showAll только если нужно сбросить предыдущую изоляцию/скрытие
        if (action.isolate || action.hide_others) {
          model.showAll();
        }

        if (action.select && targets.length > 0) {
          this.currentSelection = targets.map(target => target.elementId);
          try {
            let isFirst = true;
            for (const [partId, elementIds] of byPart.entries()) {
              model.select(elementIds, partId, isFirst ? 1 : 0, true);
              isFirst = false;
            }
            actionResult.selectionCreated = true;
          } catch(e) {
            actionResult.warnings.push(`Не удалось выделить элементы: ${e.message || e}`);
            console.warn('Не удалось выделить элементы:', e);
          }
        }

        if (action.color && action.color.rgb && targets.length > 0) {
          const [r, g, b] = action.color.rgb;
          for (const [partId, elementIds] of byPart.entries()) {
            try {
              const key = String(partId);
              if (!this.paintedTargetsByPart[key]) {
                this.paintedTargetsByPart[key] = [];
              }
              // Обновляем/добавляем цвет для каждого элемента
              const colorMap = new Map(
                this.paintedTargetsByPart[key].map(entry => [entry.id, entry])
              );
              for (const elementId of elementIds) {
                colorMap.set(String(elementId), { id: String(elementId), r, g, b });
              }
              this.paintedTargetsByPart[key] = Array.from(colorMap.values());
              this.rememberPaintedModelPart(partId);
              // Сбросить все цвета в части и перекрасить всё заново
              model.clearColors(partId);
              const grouped = new Map();
              for (const entry of this.paintedTargetsByPart[key]) {
                const colorKey = `${entry.r},${entry.g},${entry.b}`;
                if (!grouped.has(colorKey)) {
                  grouped.set(colorKey, { r: entry.r, g: entry.g, b: entry.b, ids: [] });
                }
                grouped.get(colorKey).ids.push(entry.id);
              }
              for (const { r: er, g: eg, b: eb, ids } of grouped.values()) {
                model.setColor(ids, er, eg, eb, 1, partId);
              }
              actionResult.paintExecuted = true;
            } catch(e) {
              actionResult.warnings.push(`Не удалось покрасить элементы: ${e.message || e}`);
            }
          }
        }

        if (action.isolate && targets.length > 0) {
          try {
            for (const [partId, elementIds] of byPart.entries()) {
              model.isolate(elementIds, partId, true);
            }
            actionResult.isolateExecuted = true;
          } catch(e) {
            actionResult.warnings.push(`Не удалось изолировать элементы: ${e.message || e}`);
            console.warn('Не удалось изолировать элементы:', e);
          }
        }

        if (action.hide_others && !action.isolate && targets.length > 0) {
          try {
            const targetKeys = new Set(targets.map(target => `${target.modelPartId}:${target.elementId}`));
            const hideByPart = this.groupTargetsByPart(this.getAllElementTargets().filter(target => !targetKeys.has(`${target.modelPartId}:${target.elementId}`)));
            for (const [partId, elementIds] of hideByPart.entries()) {
              if (elementIds.length > 0) {
                model.hide(elementIds, partId, false);
              }
            }
            actionResult.isolateExecuted = true;
          } catch(e) {
            actionResult.warnings.push(`Не удалось скрыть элементы: ${e.message || e}`);
            console.warn('Не удалось скрыть элементы:', e);
          }
        }


        return actionResult;
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

    getAllElementTargets() {
      return Object.keys(this.dataStore).map(elementId => this.getElementTarget(elementId)).filter(Boolean);
    },

    getElementTarget(elementId) {
      const attrs = this.dataStore[elementId];
      const modelPartId = attrs?.ModelPartId;
      if (!modelPartId) {
        return null;
      }
      return {
        elementId: String(elementId),
        modelPartId: String(modelPartId)
      };
    },

    normalizeTargets(items) {
      const result = [];
      for (const item of items || []) {
        let target = null;
        if (item && typeof item === 'object' && item.elementId && item.modelPartId) {
          target = { elementId: String(item.elementId), modelPartId: String(item.modelPartId) };
        } else {
          target = this.getElementTarget(item);
        }
        if (target && !result.some(existing => existing.elementId === target.elementId && existing.modelPartId === target.modelPartId)) {
          result.push(target);
        }
      }
      return result;
    },

    groupTargetsByPart(targets) {
      const byPart = new Map();
      for (const target of targets || []) {
        const list = byPart.get(target.modelPartId) || [];
        if (!list.includes(target.elementId)) {
          list.push(target.elementId);
        }
        byPart.set(target.modelPartId, list);
      }
      return byPart;
    },

    async ensureModelLoaded() {
      if (Object.keys(this.dataStore).length && this.loadingProgress >= 100) {
        await this.syncVisibleModelElements();
        return;
      }
      await this.loadModel();
    },

    async syncVisibleModelElements() {
      if (this.modelIndexSyncPromise) {
        return await this.modelIndexSyncPromise;
      }
      this.modelIndexSyncPromise = this.syncVisibleModelElementsInternal();
      try {
        return await this.modelIndexSyncPromise;
      } finally {
        this.modelIndexSyncPromise = null;
      }
    },

    async syncVisibleModelElementsInternal() {
      if (!this.viewer || !this.viewer.model) {
        return { added: 0, removed: 0 };
      }
      const model = this.viewer.model;
      const visible = model.getVisibleElements ? (model.getVisibleElements() || []) : [];
      const currentElementIds = new Set();
      const activePartIds = new Set();
      let added = 0;
      for (const visibleElement of visible) {
        const modelPartId = String(visibleElement.modelPartId || '');
        if (!modelPartId) {
          continue;
        }
        activePartIds.add(modelPartId);
        const modelPart = model.getModelPart ? model.getModelPart(visibleElement.modelPartId) : null;
        if (!modelPart || !modelPart.elementTree) {
          continue;
        }
        const tree = modelPart.elementTree;
        for (const rawElementId of visibleElement.elementIds || []) {
          const elementId = String(rawElementId);
          if (!elementId) {
            continue;
          }
          currentElementIds.add(elementId);
          if (!this.visibleElementOrder.includes(elementId)) {
            this.visibleElementOrder.push(elementId);
          }
          this.visibleElementPartMap[elementId] = modelPartId;
          if (this.dataStore[elementId]) {
            continue;
          }
          const element = tree.getElement ? tree.getElement(rawElementId) : null;
          const propertySets = await this.readElementPropertySets(rawElementId, visibleElement.modelPartId);
          const attributes = {};
          const elementName = this.getElementDisplayName(element, rawElementId);
          const elementType = this.getElementType(element);
          const modelPartName = this.getModelPartName(modelPart, visibleElement.modelPartId);
          const partOf = this.getElementPartOf(element);
          const readableId = this.getElementGlobalIdReadable(element, rawElementId);
          const globalId = this.getElementGlobalId(element, readableId);
          attributes.Name = elementName;
          attributes.ElementName = elementName;
          attributes['Название'] = elementName;
          attributes.Type = elementType;
          attributes.type = elementType;
          attributes.ObjectType = elementType;
          attributes.EntityType = elementType;
          attributes.IfcType = elementType;
          attributes.IfcClass = elementType;
          attributes.ClassName = elementType;
          attributes.GlobalId = globalId;
          attributes.GlobalIdReadable = readableId;
          attributes['GlobalId (readable)'] = readableId;
          attributes.ElementId = readableId;
          attributes.ModelPartId = visibleElement.modelPartId;
          attributes.ModelPartName = modelPartName;
          attributes.PartOf = partOf;
          attributes.id = readableId;
          attributes.Guid = readableId;
          attributes.IfcGuid = globalId;
          for (const set of propertySets || []) {
            const properties = set.properties || set.Properties || [];
            for (const prop of properties) {
              const propName = this.getPropertyName(prop);
              const setName = this.getPropertySetName(set);
              const value = this.getPropertyValue(prop);
              this.addAttributeValue(attributes, setName, propName, value);
            }
          }
          this.postProcessAggregateAttributes(attributes);
          this.dataStore[elementId] = { ...attributes };
          this.dataStoreByFeatures[elementId] = propertySets;
          this.geometry[elementId] = [];
          if (element && element.hasGeometry) {
            this.geometry[elementId].push(element.id);
          }
          if (element && Array.isArray(element.children)) {
            for (const child of element.children) {
              if (child.hasGeometry) {
                this.geometry[elementId].push(child.id);
              }
            }
          }
          added += 1;
        }
      }

      const indexedElementIds = Object.keys(this.dataStore || {});
      const removedIds = indexedElementIds.filter(elementId => !currentElementIds.has(String(elementId)));
      for (const elementId of removedIds) {
        delete this.dataStore[elementId];
        delete this.dataStoreByFeatures[elementId];
        delete this.geometry[elementId];
        delete this.visibleElementPartMap[elementId];
        delete this.propertiesCache[elementId];
        delete this.propertyCallDiagnostics[elementId];
      }
      if (removedIds.length > 0) {
        const removedSet = new Set(removedIds.map(String));
        this.visibleElementOrder = (this.visibleElementOrder || []).filter(elementId => !removedSet.has(String(elementId)));
        if (this.previousSearch && Array.isArray(this.previousSearch.targets)) {
          this.previousSearch = this.buildSearchResultFromTargets(this.previousSearch.targets.filter(target => !removedSet.has(String(target.elementId))));
          this.lastSearchForReport = this.previousSearch;
          this._lastSearchResult = this.previousSearch;
        }
        this._lastReportParams = null;
        this._lastReportToolCall = null;
      }
      if (added > 0 || removedIds.length > 0) {
        this.availableAttrs = this.getAvailableAttributes();
        this.collectAvailableGroups();
        this.availableAttrsProperties = this.getAvailableAttributesWithProperties();
        this.logs.push({ text: `Индекс модели обновлён. Добавлено элементов: ${added}. Удалено элементов: ${removedIds.length}. Всего в индексе: ${Object.keys(this.dataStore).length}.`, type: 'assistant' });
      }
      const stalePaintedPartIds = (this.paintedModelPartIds || []).filter(id => !activePartIds.has(String(id)));
      if (stalePaintedPartIds.length > 0) {
        this.paintedModelPartIds = (this.paintedModelPartIds || []).filter(id => activePartIds.has(String(id)));
        for (const partId of stalePaintedPartIds) {
          if (this.paintedTargetsByPart && Object.prototype.hasOwnProperty.call(this.paintedTargetsByPart, partId)) {
            delete this.paintedTargetsByPart[partId];
          }
        }
        this.logs.push({ text: `Из списка покрашенных частей модели удалены выгруженные: ${stalePaintedPartIds.join(', ')}.`, type: 'assistant' });
      }
      return { added, removed: removedIds.length };
    },

    isCurrentSelectionSearch(search) {
      return search?.search_ast?.object_kind === 'current_selection' || String(search?.dsl || '').includes('__CURRENT_SELECTION_WITHOUT_SEARCH__');
    },

    getCurrentSelectionSearchResult() {
      const targets = this.getCurrentSelectionTargets();
      const result = this.buildSearchResultFromTargets(targets);
      this.currentSelection = result.ids;
      return result;
    },

    getCurrentSelectionElementIds() {
      return this.getCurrentSelectionTargets().map(target => target.elementId);
    },

    getCurrentSelectionTargets() {
      if (!this.viewer || !this.viewer.model || !this.viewer.model.getSelection) {
        return [];
      }
      const selection = this.viewer.model.getSelection() || [];
      const targets = [];
      for (const item of selection) {
        const modelPartId = item?.modelPartId;
        const elementIds = item?.elementIds || [];
        for (const id of elementIds) {
          if (modelPartId && !targets.some(target => target.elementId === id && target.modelPartId === modelPartId)) {
            targets.push({ elementId: String(id), modelPartId: String(modelPartId) });
          }
        }
      }
      return targets;
    },

    buildSearchResultFromElementIds(elementIds) {
      return this.buildSearchResultFromTargets(this.buildTargetsFromElementIds(elementIds));
    },

    buildTargetsFromElementIds(elementIds) {
      return (elementIds || []).map(elementId => this.getElementTarget(elementId)).filter(Boolean);
    },

    buildSearchResultFromTargets(targets) {
      const normalizedTargets = this.normalizeTargets(targets);
      const elements = [];
      const geometryIds = [];
      for (const target of normalizedTargets) {
        const elementId = target.elementId;
        if (!elements.includes(elementId)) {
          elements.push(elementId);
        }
        const geomIds = this.geometry[elementId];
        if (geomIds && geomIds.length > 0) {
          for (const geomId of geomIds) {
            if (!geometryIds.includes(geomId)) {
              geometryIds.push(geomId);
            }
          }
        } else if (!geometryIds.includes(elementId)) {
          geometryIds.push(elementId);
        }
      }
      return {
        ids: geometryIds,
        element_ids: elements,
        targets: normalizedTargets,
        count: elements.length,
        message: `Найдено ${elements.length} элементов.`
      };
    },

    applySearchLimit(result, limit) {
      const numericLimit = Number(limit);
      if (!numericLimit || numericLimit <= 0 || result.element_ids.length <= numericLimit) {
        return result;
      }
      const limited = this.buildSearchResultFromTargets((result.targets || []).slice(0, numericLimit));
      limited.message = result.message;
      return limited;
    },

    getActionDescription(action) {
      const parts = [];
      
      if (action.select) parts.push('выделение');
      if (action.color) parts.push(`покраска в ${action.color.name || 'цвет'}`);
      if (action.isolate) parts.push('изоляция');
      if (action.hide_others && !action.isolate) parts.push('скрытие остальных');
      
      return parts.length > 0 ? parts.join(', ') : 'визуализация';
    },

    async searchElements(dsl) {
  
      let ast = this.parseDSL(dsl);
      if (!ast) {
        return { ids: [], count: 0, message: 'Не удалось разобрать запрос' };
      }
      
      const result = this.executeSearch(ast);
      
      this._lastSearchResult = { element_ids: result.elements_ids, targets: result.targets, geometry: result.geometry_ids, count: result.elements_ids.length };
      this.lastSearchForReport = this._lastSearchResult;
      
      return {
        ids: result.geometry_ids,
        element_ids: result.elements_ids,
        targets: result.targets,
        count: result.elements_ids.length,
        message: `Найдено ${result.elements_ids.length} элементов. Условие: (${dsl})`
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
      const notMatch = dsl.match(/^(?:NOT\s+|!\s*)(.+)$/i);
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
          const andMatch = remaining.match(/^(?:AND\s+|&&)/i);
          if (andMatch) {
            lastIndex = i;
            lastOperator = andMatch[0].startsWith('&&') ? '&&' : 'AND';
          }
          const orMatch = remaining.match(/^(?:OR\s+|\|\|)/i);
          if (orMatch) {
            lastIndex = i;
            lastOperator = orMatch[0].startsWith('||') ? '||' : 'OR';
          }
        }
      }
      if (lastIndex !== -1) {
        const opLen = lastOperator === '&&' || lastOperator === '||' ? 2 : (lastOperator === 'AND' ? 3 : 2);
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

      let match = expr.match(/^\["?(.+?)"?\](.+?)\.(Defined|NotDefined|Exists)\(\)$/i);
      if (match) {
        return {
          attribute: `["${match[1]}"]${match[2]}`,
          operator: match[3].toLowerCase(),
          value: null
        };
      }

      match = expr.match(/^(.+?)\.(Defined|NotDefined|Exists)\(\)$/i);
      if (match) {
        return {
          attribute: this.cleanAttr(match[1]),
          operator: match[2].toLowerCase(),
          value: null
        };
      }

      match = expr.match(/^\["?(.+?)"?\](.+?)\.(Contains|NotContains|Wildcard|Regexp)\(["']?(.*?)["']?\)$/i);
      if (match) {
        return {
          attribute: `["${match[1]}"]${match[2]}`,
          operator: match[3].toLowerCase(),
          value: match[4] || null
        };
      }

      match = expr.match(/^(.+?)\.(Contains|NotContains|Wildcard|Regexp)\(["']?(.*?)["']?\)$/i);
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
        if (this.isStrictNumericValue(value)) {
          return { attribute, operator, value: Number(String(value).replace(',', '.')) };
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
        if (this.isStrictNumericValue(value)) {
          return { attribute, operator, value: Number(String(value).replace(',', '.')) };
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
      const targets = [];
      for (const [elementId, attributes] of Object.entries(this.dataStore)) {
        if (this.evaluate(ast, elementId, attributes)) {
          elements.push(elementId);
          const target = this.getElementTarget(elementId);
          if (target) {
            targets.push(target);
          }
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
      return {elements_ids: elements, geometry_ids: geometryEl, targets: targets};
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
          return node.operator === 'AND' || node.operator === '&&' ? (left && right) : (left || right);
        case 'not':
          return !this.evaluate(node.child, elementId, attributes);
        default:
          return false;
      }
    },

    checkCondition(attrValue, operator, searchValue) {
      const isMissing = attrValue === undefined || attrValue === null || String(attrValue).trim() === '';
      if (operator === 'defined' || operator === 'exists') {
        return !isMissing;
      }
      if (operator === 'notdefined') {
        return isMissing;
      }
      if (isMissing) {
        if (operator === '!=') return true;
        return false;
      }
      const strValue = String(attrValue);
      const strSearch = String(searchValue !== null ? searchValue : '');
      const isNumeric = this.isStrictNumericValue(strValue) && this.isStrictNumericValue(strSearch);
      const numAttr = isNumeric ? Number(strValue.replace(',', '.')) : NaN;
      const numSearch = isNumeric ? Number(strSearch.replace(',', '.')) : NaN;
      switch (operator) {
        case 'contains':
          return strValue.toLowerCase().includes(strSearch.toLowerCase());
        case 'notcontains':
          return !strValue.toLowerCase().includes(strSearch.toLowerCase());
        case 'wildcard':
          return this.checkWildcard(strValue, strSearch);
        case 'regexp':
          return this.checkRegexp(strValue, strSearch);
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

    checkWildcard(value, pattern) {
      const source = String(value ?? '');
      const wildcard = String(pattern ?? '');
      const escaped = wildcard.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      try {
        return new RegExp(`^${escaped}$`, 'i').test(source);
      } catch {
        return false;
      }
    },

    checkRegexp(value, pattern) {
      try {
        return new RegExp(String(pattern ?? ''), 'i').test(String(value ?? ''));
      } catch {
        return false;
      }
    },

    formatExecutionTrace(trace, traceIndex) {
      const lines = [];
      lines.push(`Ход выполнения ${traceIndex >= 0 ? traceIndex + 1 : ''}`.trim());
      lines.push('Запрос в ACS/DFS:');
      lines.push(this.formatJson(trace.request));
      if (trace.finalMessage) {
        lines.push('');
        lines.push('ACS final message:');
        lines.push(trace.finalMessage);
      }
      for (const [callIndex, call] of trace.toolCalls.entries()) {
        lines.push('');
        lines.push(`Tool call ${callIndex + 1}: ${call.tool}`);
        lines.push('Message:');
        lines.push(call.message || '');
        lines.push('Raw tool_call JSON:');
        lines.push(this.formatJson(call.raw));
        if (call.script) {
          lines.push('Generated script:');
          lines.push(call.script);
        }
        if (call.result) {
          lines.push('Performer result:');
          lines.push(call.result);
        }
        if (call.warnings && call.warnings.length) {
          lines.push('Warnings:');
          for (const warning of call.warnings) {
            lines.push(`- ${warning}`);
          }
        }
      }
      return lines.join('\n');
    },

    copyExecutionTrace() {
      const text = this.executionTrace.map((trace, traceIndex) => this.formatExecutionTrace(trace, traceIndex)).join('\n\n');
      this.copyMessage(text);
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

    async autoOpenReportPreview(msg) {
      if (!msg || !msg.reportCacheId) {
        return;
      }
      if (this.isReportRunning || this.isReportOpening) {
        return;
      }
      const cachedParams = this.getCachedReportPreviewParams(msg);
      if (!cachedParams) {
        return;
      }
      try {
        await this.makeAction(cachedParams);
      } catch (e) {
        const text = String(e?.message || e || 'Не удалось автоматически открыть отчёт.');
        this.logs.push({ text: `Автооткрытие отчёта не выполнено: ${text}`, type: 'error' });
      }
    },

    async runSearchAction(msg) {
      if (!msg || !msg.searchToolCall) {
        return;
      }
      this.diagnosticMessage = null;
      this.suppressAutoScroll = true;
      try {
        this.startExecutionTrace('Повторный запуск поиска');
        const replayToolCall = { ...msg.searchToolCall, isReplay: true };
        const traceCall = this.addToolCallTrace(replayToolCall);
        const result = await this.executeToolCall(replayToolCall);
        this.completeToolCallTrace(traceCall, replayToolCall, result);
        if (msg.reportCacheId && this.reportPreviewCache?.[msg.reportCacheId]) {
          delete this.reportPreviewCache[msg.reportCacheId];
        }
        msg.reportCacheId = null;
        this.completeActiveTrace('Локальный запуск скрипта поиска выполнен.');
        msg.diagnosticText = this.formatExecutionTrace(this.activeTrace, this.executionTrace.indexOf(this.activeTrace));
        msg.hasDiagnosticAction = true;
      } catch (e) {
        this.completeActiveTrace(`Ошибка локального запуска поиска: ${e.message || e}`);
        this.showDiagnostic('Ошибка поиска', String(e.message || e));
      } finally {
        this.suppressAutoScroll = false;
      }
    },

    async runReportAction(msg) {
      if (!msg || !msg.reportToolCall) {
        return;
      }
      if (this.isReportRunning || this.isReportOpening) {
        this.showDiagnostic('Отчёт уже выполняется', 'Дождитесь завершения текущего открытия отчёта. Повторный запуск заблокирован, чтобы не подвесить вкладку.');
        return;
      }
      this.diagnosticMessage = null;
      this.suppressAutoScroll = true;
      this.isReportRunning = true;
      try {
        const cachedParams = this.getCachedReportPreviewParams(msg);
        if (cachedParams) {
          await this.makeAction(cachedParams);
          return;
        }
        this.startExecutionTrace('Повторный запуск отчёта');
        const replayToolCall = { ...msg.reportToolCall, isReplay: true };
        const traceCall = this.addToolCallTrace(replayToolCall);
        const result = await this.withTimeout(
          this.executeToolCall(replayToolCall),
          this.reportTimeoutMs,
          'Создание отчёта выполняется слишком долго. Попробуйте уменьшить выборку или повторить после обновления страницы.'
        );
        this.completeToolCallTrace(traceCall, replayToolCall, result);
        this.completeActiveTrace('Локальный запуск скрипта отчёта выполнен.');
        msg.diagnosticText = this.formatExecutionTrace(this.activeTrace, this.executionTrace.indexOf(this.activeTrace));
        msg.hasDiagnosticAction = true;
        if (result?.reportCacheId) {
          msg.reportCacheId = result.reportCacheId;
        }
        await this.makeAction(this.getCachedReportPreviewParams(msg) || this._lastReportParams);
      } catch (e) {
        this.completeActiveTrace(`Ошибка локального запуска отчёта: ${e.message || e}`);
        this.showDiagnostic('Ошибка отчёта', String(e.message || e));
      } finally {
        this.isReportRunning = false;
        this.suppressAutoScroll = false;
      }
    },


    storeReportPreviewParams(params) {
      const id = `report_${Date.now()}_${++this.reportPreviewCacheSeq}`;
      this.reportPreviewCache[id] = this.cloneReportPreviewParams(params);
      this.pruneReportPreviewCache();
      return id;
    },

    cloneReportPreviewParams(params) {
      try {
        return JSON.parse(JSON.stringify(params || {}));
      } catch (e) {
        return params;
      }
    },

    pruneReportPreviewCache() {
      const keys = Object.keys(this.reportPreviewCache || {});
      const keepCount = 10;
      if (keys.length <= keepCount) {
        return;
      }
      for (const key of keys.slice(0, keys.length - keepCount)) {
        delete this.reportPreviewCache[key];
      }
    },

    getCachedReportPreviewParams(msg) {
      if (msg?.reportCacheId && this.reportPreviewCache?.[msg.reportCacheId]) {
        return this.reportPreviewCache[msg.reportCacheId];
      }
      return null;
    },

    areReportToolCallsEqual(left, right) {
      if (!left || !right || left.tool !== right.tool) {
        return false;
      }
      try {
        return JSON.stringify(left.arguments || {}) === JSON.stringify(right.arguments || {});
      } catch {
        return false;
      }
    },

    withTimeout(promise, timeoutMs, message) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        Promise.resolve(promise)
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch((error) => {
            clearTimeout(timer);
            reject(error);
          });
      });
    },

    toggleMessageTrace(msg) {
      if (!msg) {
        return;
      }
      msg.isTraceExpanded = !msg.isTraceExpanded;
    },

    getTraceToggleText() {
      return 'Ход выполнения';
    },

    copyMessageTrace(msg) {
      if (msg && msg.diagnosticText) {
        this.copyMessage(msg.diagnosticText);
      }
    },

    isTechnicalSearchToolCall(toolCall) {
      const search = toolCall?.arguments?.search;
      return this.isCurrentSelectionSearch(search);
    },

    showDiagnostic(title, text) {
      this.diagnosticMessage = {
        title: title,
        text: text || ''
      };
    },

    isReportRequestText(text) {
      return /отч[её]т|report|предпросмотр|ведомост/i.test(String(text || ''));
    },

    getDevCommands() {
      return [
        { tool: 'bim.check_connections',    desc: 'Проверить коннекты трубопроводов',  template: '/bim.check_connections({})' },
        { tool: 'bim.search',               desc: 'Поиск элементов по DSL',             template: '/bim.search({"search": {"dsl": "Type == \\"IfcPipeSegment\\""}})' },
        { tool: 'bim.search_and_visualize', desc: 'Поиск + действие',                  template: '/bim.search_and_visualize({"search": {"dsl": "Type == \\"IfcPipeSegment\\""}, "action": {"color": {"rgb": [255, 255, 255]}}})' },
        { tool: 'bim.visualize',            desc: 'Применить действие к выделению',    template: '/bim.visualize({"element_ids_source": "previous_search", "action": {"color": {"rgb": [255, 0, 0]}}})' },
        { tool: 'bim.get_properties',       desc: 'Получить свойства элементов',       template: '/bim.get_properties({"element_ids_source": "previous_search", "attributes": []})' },
        { tool: 'report.create_preview',    desc: 'Создать отчёт',                     template: '/report.create_preview({"report_plan": {"attributes": ["ElementId", "Name", "Type"]}})' },
      ];
    },

    onQuestionInput() {
      if (!this.debugMode) {
        this.devSuggestions = [];
        return;
      }
      const q = this.question;
      if (!q.startsWith('/')) {
        this.devSuggestions = [];
        this.devSuggestionIndex = -1;
        return;
      }
      const search = q.slice(1).toLowerCase();
      this.devSuggestions = this.getDevCommands().filter(c =>
        c.tool.toLowerCase().includes(search) || c.desc.toLowerCase().includes(search)
      );
      this.devSuggestionIndex = -1;
    },

    onQuestionKeydown(e) {
      if (this.devSuggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.devSuggestionIndex = Math.min(this.devSuggestionIndex + 1, this.devSuggestions.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.devSuggestionIndex = Math.max(this.devSuggestionIndex - 1, -1);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (this.devSuggestionIndex >= 0) {
          e.preventDefault();
          this.applyDevSuggestion(this.devSuggestions[this.devSuggestionIndex]);
        }
      } else if (e.key === 'Escape') {
        this.devSuggestions = [];
        this.devSuggestionIndex = -1;
      }
    },

    applyDevSuggestion(suggestion) {
      this.question = suggestion.template;
      this.devSuggestions = [];
      this.devSuggestionIndex = -1;
      this.$nextTick(() => this.$refs.questionInput?.focus());
    },

    hideDevSuggestions() {
      setTimeout(() => {
        this.devSuggestions = [];
        this.devSuggestionIndex = -1;
      }, 150);
    },

    async executeDevCommand(input) {
      // Парсим: /tool.name или /tool.name({...args})
      const match = input.match(/^\/([a-zA-Z0-9_.]+)(?:\s*\((.+)\))?\s*$/s);
      if (!match) {
        this.messages.push({
          text: `Неверный формат команды. Используй:\n/tool.name\n/tool.name({"key": "value"})`,
          type: 'error'
        });
        this.scrollToBottom();
        return;
      }

      const tool = match[1];
      let args = {};
      if (match[2]) {
        try {
          args = JSON.parse(match[2]);
        } catch (e) {
          this.messages.push({
            text: `Ошибка парсинга аргументов: ${e.message}\nПроверь что JSON корректный.`,
            type: 'error'
          });
          this.scrollToBottom();
          return;
        }
      }

      this.messages.push({ text: input, type: 'user' });
      this.scrollToBottom();
      this.startLoadingAnimation();
      this.startExecutionTrace(`[DEV] ${input}`);

      const toolData = { tool, arguments: args, sequence: 1, total: 1 };
      const traceCall = this.addToolCallTrace(toolData);

      try {
        const result = await this.executeToolCall(toolData);
        this.completeToolCallTrace(traceCall, toolData, result);
        this.stopLoadingAnimation();

        const msgText = (result && typeof result.message === 'string' && result.message)
          ? result.message
          : JSON.stringify(result, null, 2);

        this.completeActiveTrace(`[DEV] ${tool}: выполнено`);
        this.messages.push({
          text: `[DEV] ${tool}\n\n${msgText}`,
          type: 'assistant',
          connectionIssues: result?.connectionIssues || [],
          hasDiagnosticAction: true,
          diagnosticText: this.activeTrace
            ? this.formatExecutionTrace(this.activeTrace, this.executionTrace.length - 1)
            : '',
          isTraceExpanded: false,
        });
      } catch (e) {
        this.stopLoadingAnimation();
        this.messages.push({
          text: `[DEV] Ошибка выполнения ${tool}: ${e.message || e}`,
          type: 'error'
        });
      }
      this.scrollToBottom();
    },

    async sendMessage() {
      const userMessage = this.question;

      if (!userMessage.trim()) return;

      // Dev-команды через / (только в режиме отладки)
      if (this.debugMode && userMessage.trim().startsWith('/')) {
        this.question = '';
        await this.executeDevCommand(userMessage.trim());
        return;
      }

      if (this.abortController) {
        this.abortController.abort();
      }

      this.abortController = new AbortController();

      this.question = '';
      this.messages.push({ text: userMessage, type: 'user' }); 
      this.logs.push({text: userMessage, type: 'user'});
      this.scrollToBottom();
      this.diagnosticMessage = null;
      this.startExecutionTrace(userMessage);

      this.startLoadingAnimation();

      try {
        const result = await this.sendToACS(userMessage);
        
        if (this.activeTrace) {
          this.activeTrace.request.context_id = result.context_id || null;
        }

        if (!result.success) {
          this.stopLoadingAnimation();
          this.messages.push({
            text: `Ошибка: ${result.error}`,
            type: 'error'
          });
          this.scrollToBottom();
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
        this.scrollToBottom();
        this.logs.push({
            text: `Ошибка: ${error.message}`,
            type: 'error'
        });
      } finally {
        this.abortController = null;
      }
    },

    async loadModel() {
      if (Object.keys(this.dataStore).length && !this.isCancelLoading && this.loadingProgress >= 100) {
        return
      }
      if (!this.viewer || !this.viewer.model) {
        throw new Error('Viewer не инициализирован');
      }
      this.dataStore = {}
      this.dataStoreByFeatures = {}
      this.geometry = {}
      this.visibleElementOrder = []
      this.visibleElementPartMap = {}
      this.propertyCallDiagnostics = {}
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
          this.loadingProgress = allElements ? (currentEl) / allElements * 100 : 100;
          const lastMessage = this.messages[this.messages.length - 1];
          if (lastMessage && lastMessage.isLoading) {
            lastMessage.text = `Идёт загрузка данных модели. Загружено: ${Math.round(this.loadingProgress)} %`;
          }
          const element = tree.getElement(elementId);
          if (!this.visibleElementOrder.includes(String(elementId))) {
            this.visibleElementOrder.push(String(elementId));
          }
          this.visibleElementPartMap[String(elementId)] = String(visibleElement.modelPartId);
          const propertySets = await this.readElementPropertySets(elementId, visibleElement.modelPartId);
          const attributes = {};
          const elementName = this.getElementDisplayName(element, elementId);
          const elementType = this.getElementType(element);
          const modelPartName = this.getModelPartName(modelPart, visibleElement.modelPartId);
          const partOf = this.getElementPartOf(element);
          const readableId = this.getElementGlobalIdReadable(element, elementId);
          const globalId = this.getElementGlobalId(element, readableId);
          attributes.Name = elementName;
          attributes.ElementName = elementName;
          attributes['Название'] = elementName;
          attributes.Type = elementType;
          attributes.type = elementType;
          attributes.ObjectType = elementType;
          attributes.EntityType = elementType;
          attributes.IfcType = elementType;
          attributes.IfcClass = elementType;
          attributes.ClassName = elementType;
          attributes.GlobalId = globalId;
          attributes.GlobalIdReadable = readableId;
          attributes['GlobalId (readable)'] = readableId;
          attributes.ElementId = readableId;
          attributes.ModelPartId = visibleElement.modelPartId;
          attributes.ModelPartName = modelPartName;
          attributes.PartOf = partOf;
          attributes.id = readableId;
          attributes.Guid = readableId;
          attributes.IfcGuid = globalId;
          for (const set of propertySets || []) {
            const properties = set.properties || set.Properties || [];
            for (const prop of properties) {
              const propName = this.getPropertyName(prop);
              const setName = this.getPropertySetName(set);
              const value = this.getPropertyValue(prop);
              this.addAttributeValue(attributes, setName, propName, value);
            }
          }
          this.postProcessAggregateAttributes(attributes);
          this.dataStore[elementId] = {
            ...attributes,
          };
          this.dataStoreByFeatures[elementId] = propertySets
          this.geometry[elementId] = []
          if (!element)
            continue;
          if (element.hasGeometry) {
            this.geometry[elementId].push(element.id);
          }
          for (const child of element.children) {
            if (child.hasGeometry) {
              this.geometry[elementId].push(child.id);
            }
          }
        }
        this.$emit('loading-progress', this.loadingProgress);
      }
      this.loadingProgress = 100;
      this.availableAttrs = this.getAvailableAttributes();
      this.collectAvailableGroups();
      this.availableAttrsProperties = this.getAvailableAttributesWithProperties();
      this.logs.push({text: `Модель загружена. Атрибутов: ${this.availableAttrs.length}; property aliases: ${this.availableAttrsProperties.length}.`, type: 'assistant'});
      if (this.advancedDebugMode) {
        this.logs.push({text: `Доступные атрибуты модели:
${this.availableAttrs.toString()}, ${this.availableAttrsProperties.toString()}`, type: 'assistant'});
        console.log('dataStore', this.dataStore, this.dataStoreByFeatures);
      }
    },

    async refreshElementAttributes(elementId) {
      if (!elementId) {
        return null;
      }
      const existing = this.dataStore[elementId] || {};
      if (!this.viewer || !this.viewer.model) {
        return existing;
      }
      const alreadyIndexed = Array.isArray(this.dataStoreByFeatures?.[elementId])
        && this.dataStoreByFeatures[elementId].length > 0;
      if (alreadyIndexed && Object.keys(existing).length > 0) {
        return existing;
      }
      const attributes = { ...existing };
      if (!attributes.ElementId) {
        attributes.ElementId = String(elementId);
      }
      if (!attributes.id) {
        attributes.id = String(elementId);
      }
      const propertySets = [];
      const candidateIds = this.getPropertySourceElementIds(elementId);
      for (const candidateId of candidateIds) {
        try {
          const candidatePartId = this.getModelPartIdForElement(candidateId) || attributes.ModelPartId || existing.ModelPartId;
          const sets = await this.readElementPropertySets(candidateId, candidatePartId);
          if (Array.isArray(sets) && sets.length) {
            propertySets.push(...sets);
            for (const set of sets) {
              const properties = set.properties || set.Properties || [];
              for (const prop of properties) {
                const propName = this.getPropertyName(prop);
                const setName = this.getPropertySetName(set);
                const value = this.getPropertyValue(prop);
                this.addAttributeValue(attributes, setName, propName, value);
              }
            }
          }
        } catch (e) {
        }
      }
      this.dataStoreByFeatures[elementId] = propertySets;
      this.postProcessAggregateAttributes(attributes);
      this.dataStore[elementId] = attributes;
      return attributes;
    },

    async readElementPropertySets(elementId, modelPartId) {
      const model = this.viewer?.model;
      if (!model || !model.getElementProperties || !elementId) {
        return [];
      }
      const signatures = [];
      signatures.push({ name: 'elementId', args: [elementId] });
      if (modelPartId) {
        signatures.push({ name: 'elementId,modelPartId', args: [elementId, modelPartId] });
        signatures.push({ name: 'modelPartId,elementId', args: [modelPartId, elementId] });
        signatures.push({ name: 'object:elementId+modelPartId', args: [{ elementId, modelPartId }] });
        signatures.push({ name: 'object:id+modelPartId', args: [{ id: elementId, modelPartId }] });
      }
      const diagnostics = [];
      for (const signature of signatures) {
        try {
          const sets = await model.getElementProperties(...signature.args);
          const normalized = Array.isArray(sets) ? sets : [];
          const useful = this.countUsefulPropertySets(normalized);
          diagnostics.push(`${signature.name}: sets=${normalized.length}, useful=${useful}`);
          if (normalized.length && useful > 0) {
            this.propertyCallDiagnostics[String(elementId)] = diagnostics.slice(0, 8);
            return normalized;
          }
        } catch (e) {
          diagnostics.push(`${signature.name}: error=${this.formatDebugValue(e?.message || e)}`);
        }
      }
      this.propertyCallDiagnostics[String(elementId)] = diagnostics.slice(0, 8);
      return [];
    },

    countUsefulPropertySets(sets) {
      let count = 0;
      for (const set of sets || []) {
        const properties = set?.properties || set?.Properties || [];
        for (const prop of properties || []) {
          const propName = this.getPropertyName(prop);
          const value = this.getPropertyValue(prop);
          if (propName && !this.isEmptyReportValue(value)) {
            count += 1;
          }
        }
      }
      return count;
    },

    getModelPartIdForElement(elementId) {
      const id = String(elementId || '');
      if (!id) {
        return '';
      }
      const direct = this.visibleElementPartMap?.[id];
      if (direct) {
        return direct;
      }
      const attrs = this.dataStore?.[id];
      if (attrs?.ModelPartId) {
        return attrs.ModelPartId;
      }
      return '';
    },

    describePropertyCallDiagnostics(elementId) {
      const diagnostics = this.propertyCallDiagnostics?.[String(elementId)] || [];
      if (!diagnostics.length) {
        return `Диагностика getElementProperties ${elementId}: вызовы не зафиксированы.`;
      }
      return `Диагностика getElementProperties ${elementId}: ${diagnostics.join('; ')}`;
    },

    deduplicateToolMessages(msgs) {
      if (!Array.isArray(msgs) || msgs.length === 0) {
        return [];
      }
      const lastByTool = new Map();
      for (const msg of msgs) {
        const toolKey = msg?.tool || msg?.searchToolCall?.tool || (msg?.isReport ? 'report.create_preview' : null) || '__unknown';
        lastByTool.set(toolKey, msg);
      }
      return Array.from(lastByTool.values());
    },

    isBuiltinReportAttributeKey(key) {
      return [
        'ClassName',
        'ElementId',
        'ElementName',
        'EntityType',
        'GlobalId',
        'GlobalId (readable)',
        'GlobalIdReadable',
        'Guid',
        'IfcClass',
        'IfcGuid',
        'IfcType',
        'ModelPartId',
        'ModelPartName',
        'Name',
        'ObjectType',
        'PartOf',
        'Type',
        'id',
        'type',
        'Название'
      ].includes(key);
    },

    getPropertySourceElementIds(elementId) {
      const ids = [];
      const addId = (id) => {
        if (id !== undefined && id !== null && String(id).trim() && !ids.includes(id)) {
          ids.push(id);
        }
      };
      addId(elementId);
      const geometryIds = this.geometry?.[elementId] || [];
      for (const id of geometryIds) {
        addId(id);
      }
      return ids;
    },

    getPropertyName(prop) {
      const candidates = [
        prop?.name,
        prop?.Name,
        prop?.displayName,
        prop?.DisplayName,
        prop?.caption,
        prop?.Caption,
        prop?.label,
        prop?.Label,
      ];
      for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate).trim();
        }
      }
      return '';
    },

    getPropertySetName(set) {
      const candidates = [
        set?.name,
        set?.Name,
        set?.displayName,
        set?.DisplayName,
        set?.caption,
        set?.Caption,
        set?.label,
        set?.Label,
      ];
      for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate).trim();
        }
      }
      return '';
    },

    getPropertyValue(prop) {
      let value = prop?.value ?? prop?.Value ?? prop?.displayValue ?? prop?.DisplayValue ?? prop?.formattedValue ?? prop?.FormattedValue ?? prop?.text ?? prop?.Text ?? '';
      if (value && typeof value === 'object') {
        value = value.value ?? value.Value ?? value.displayValue ?? value.DisplayValue ?? value.formattedValue ?? value.FormattedValue ?? value.text ?? value.Text ?? value.name ?? value.Name ?? String(value);
      }
      const unit = prop?.unit ?? prop?.Unit ?? prop?.units ?? prop?.Units;
      const stringValue = value !== undefined && value !== null ? String(value) : '';
      const stringUnit = unit !== undefined && unit !== null ? String(unit).trim() : '';
      if (stringUnit && !/^\d+(?:[.,]\d+)?$/.test(stringUnit)) {
        return `${stringValue} ${stringUnit}`.trim();
      }
      return stringValue;
    },

    addAttributeValue(result, propertySetName, propertyName, value) {
      if (!result || !propertyName || !String(propertyName).trim()) {
        return;
      }
      const name = String(propertyName).trim();
      const setName = String(propertySetName || '').trim();
      const safeValue = value !== undefined && value !== null ? value : '';

      if (Object.prototype.hasOwnProperty.call(result, name)) {
        const suffix = setName || 'NoSet';
        if (this.isEmptyReportValue(result[name]) && !this.isEmptyReportValue(safeValue)) {
          result[name] = safeValue;
        }
        result[`${name}_${suffix}`] = safeValue;
      } else {
        result[name] = safeValue;
      }

      if (setName) {
        result[`${name}_${setName}`] = safeValue;
        result[`${setName}_${name}`] = safeValue;
        result[`[${setName}]${name}`] = safeValue;
        result[`["${setName}"]${name}`] = safeValue;
      }
    },

    isPipeSegmentAttributes(attributes) {
      if (!attributes) {
        return false;
      }
      const values = [
        this.getAttributeValue('', attributes, 'Type'),
        this.getAttributeValue('', attributes, 'IfcType'),
        this.getAttributeValue('', attributes, 'IfcClass'),
        this.getAttributeValue('', attributes, 'ClassName'),
        this.getAttributeValue('', attributes, 'ObjectType'),
        attributes.TYPE,
        attributes.type,
      ];
      return values.some(value => {
        if (this.isEmptyReportValue(value)) {
          return false;
        }
        const normalized = this.normalizeAttributeName(value);
        return normalized === 'ifcpipesegment' || normalized === 'pipesegment';
      });
    },

    isPipeAggregateToFormat(aggregateTo) {
      if (this.isEmptyReportValue(aggregateTo)) {
        return false;
      }
      const value = String(aggregateTo).replace(/\s+0$/, '').trim();
      const parts = value.split('-').map(part => part.trim());
      if (parts.length < 5) {
        return false;
      }
      return /^\d+(?:[.,]\d+)?$/.test(parts[1]) && /^[A-Za-zА-Яа-я0-9]+$/.test(parts[2]) && /^[A-Za-zА-Яа-я0-9]+$/.test(parts[4]);
    },

    postProcessAggregateAttributes(attributes) {
      if (!this.isPipeSegmentAttributes(attributes)) {
        return;
      }
      const candidates = [];
      const seen = new Set();
      const pushCandidate = (raw) => {
        if (this.isEmptyReportValue(raw)) {
          return;
        }
        const cleaned = String(raw).replace(/\s+\d+(?:[.,]\d+)?$/, '').trim();
        if (!cleaned || seen.has(cleaned)) {
          return;
        }
        seen.add(cleaned);
        candidates.push(cleaned);
      };
      pushCandidate(attributes.AggregateTo);
      for (const key of Object.keys(attributes)) {
        if (key === 'AggregateTo' || key === '__PropertySourceElementId' || key === '__PropertySourceMatch') {
          continue;
        }
        if (this.normalizeAttributeName(key).includes('aggregateto')) {
          pushCandidate(attributes[key]);
        }
      }
      let chosen = null;
      for (const candidate of candidates) {
        if (this.isPipeAggregateToFormat(candidate)) {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) {
        return;
      }
      const parts = chosen.split('-').map(part => part.trim());
      if (parts.length > 1 && !Object.prototype.hasOwnProperty.call(attributes, 'DN')) {
        attributes.DN = parts[1];
      }
      if (parts.length > 2 && !Object.prototype.hasOwnProperty.call(attributes, 'Environment')) {
        attributes.Environment = parts[2];
      }
      if (parts.length > 4 && !Object.prototype.hasOwnProperty.call(attributes, 'MaterialClass')) {
        const part = parts[4] || '';
        if ((part && /^\d/.test(part)) || part.length === 1) {
          attributes.MaterialClass = parts[5] || '';
        } else {
          attributes.MaterialClass = part;
        }
      }
    },

    resolveReportAttributeValue(elementId, attributes, attributeName) {
      if (!attributes) {
        return null;
      }
      let value = this.getAttributeValue(elementId, attributes, attributeName);
      if ((value === undefined || value === null || value === '' || value === '-') && this.dataStore[elementId] && this.dataStore[elementId] !== attributes) {
        value = this.getAttributeValue(elementId, this.dataStore[elementId], attributeName);
      }
      return this.normalizeReportAttributeValue(attributeName, value);
    },

    normalizeReportAttributeValue(attributeName, value) {
      if (this.isEmptyReportValue(value)) {
        return value;
      }
      const raw = String(value);
      const numericMatch = raw.match(/^(-?\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?$/);
      if (numericMatch) {
        return numericMatch[1];
      }
      if (this.normalizeAttributeName(attributeName) === 'aggregateto') {
        return raw.replace(/\s+0$/, '').trim();
      }
      return value;
    },

    getElementDisplayName(element, elementId) {
      if (!element) {
        return String(elementId);
      }
      const candidates = [
        element.name,
        element.Name,
        element.displayName,
        element.title,
        element.caption,
        element.label,
        element.elementName,
      ];
      for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate);
        }
      }
      return String(elementId);
    },

    getElementType(element) {
      const candidates = [
        element?.type,
        element?.Type,
        element?.objectType,
        element?.ObjectType,
        element?.entityType,
        element?.EntityType,
        element?.ifcType,
        element?.IfcType,
        element?.ifcClass,
        element?.IfcClass,
        element?.className,
        element?.ClassName,
        element?.constructor?.name,
      ];
      for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate);
        }
      }
      return '';
    },

    getModelPartName(modelPart, modelPartId) {
      const candidates = [
        modelPart?.name,
        modelPart?.Name,
        modelPart?.displayName,
        modelPart?.title,
        modelPartId,
      ];
      for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate);
        }
      }
      return String(modelPartId ?? '');
    },

    getElementPartOf(element) {
      const candidates = [
        element?.partOf,
        element?.PartOf,
        element?.parentId,
        element?.ParentId,
        element?.parent?.id,
        element?.Parent?.Id,
      ];
      for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate);
        }
      }
      return '';
    },

    getElementGlobalIdReadable(element, elementId) {
      const candidates = [
        element?.globalIdReadable,
        element?.GlobalIdReadable,
        elementId,
      ];
      for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate);
        }
      }
      return String(elementId);
    },

    getElementGlobalId(element, readableId) {
      const candidates = [
        element?.globalId,
        element?.GlobalId,
        element?.ifcGuid,
        element?.IfcGuid,
        element?.guid,
        element?.Guid,
        readableId,
      ];
      for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate);
        }
      }
      return String(readableId);
    },

    isStrictNumericValue(value) {
      return /^-?\d+(?:[.,]\d+)?$/.test(String(value ?? '').trim());
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
              return this.getPropertyValue(prop);
            }
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(attributes, attributeName) && !this.isEmptyReportValue(attributes[attributeName])) {
        return attributes[attributeName];
      }

      const normalizedTarget = this.normalizeAttributeName(attributeName);
      for (const [name, value] of Object.entries(attributes)) {
        if (this.normalizeAttributeName(name) === normalizedTarget && !this.isEmptyReportValue(value)) {
          return value;
        }
      }

      const aliasValue = this.getAttributeAliasValue(elementId, attributes, normalizedTarget);
      if (!this.isEmptyReportValue(aliasValue)) {
        return aliasValue;
      }

      const partialValue = this.getPartialAttributeValue(attributes, normalizedTarget);
      if (partialValue !== undefined && partialValue !== null) {
        return partialValue;
      }

      return null;
    },

    getPartialAttributeValue(attributes, normalizedTarget) {
      if (!attributes || !normalizedTarget) {
        return null;
      }
      const candidates = [];
      for (const [name, value] of Object.entries(attributes)) {
        const key = String(name || '');
        if (!key) {
          continue;
        }
        const groupMatch = key.match(/^\["?(.+?)"?\](.+)$/);
        if (groupMatch && this.normalizeAttributeName(groupMatch[2]) === normalizedTarget) {
          candidates.push(value);
          continue;
        }
        const firstSeparatorIndex = key.indexOf('_');
        if (firstSeparatorIndex > 0 && this.normalizeAttributeName(key.slice(0, firstSeparatorIndex)) === normalizedTarget) {
          candidates.push(value);
          continue;
        }
        const lastSeparatorIndex = key.lastIndexOf('_');
        if (lastSeparatorIndex > 0 && this.normalizeAttributeName(key.slice(lastSeparatorIndex + 1)) === normalizedTarget) {
          candidates.push(value);
        }
      }
      const values = candidates.filter(value => value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== '-');
      if (!values.length) {
        return null;
      }
      const uniqueValues = Array.from(new Set(values.map(value => String(value))));
      return uniqueValues.length === 1 ? values[0] : null;
    },

    getAttributeAliasValue(elementId, attributes, normalizedTarget) {
      const aliases = {
        name: ['Name', 'ElementName', 'Название'],
        elementname: ['ElementName', 'Name', 'Название'],
        type: ['Type', 'type', 'ObjectType', 'EntityType', 'IfcType', 'IfcClass', 'ClassName'],
        objecttype: ['ObjectType', 'Type', 'IfcType', 'EntityType', 'IfcClass', 'ClassName'],
        entitytype: ['EntityType', 'Type', 'ObjectType', 'IfcType', 'IfcClass', 'ClassName'],
        ifctype: ['IfcType', 'Type', 'ObjectType', 'EntityType', 'IfcClass', 'ClassName'],
        ifcclass: ['IfcClass', 'IfcType', 'Type', 'ObjectType', 'EntityType', 'ClassName'],
        classname: ['ClassName', 'IfcClass', 'IfcType', 'Type', 'ObjectType', 'EntityType'],
        modelpartid: ['ModelPartId'],
        modelpartname: ['ModelPartName'],
        partof: ['PartOf'],
        aggregateto: ['AggregateTo', 'Aggregate To', 'Aggregate_To'],
        materialclass: ['MaterialClass', 'Material Class', 'Material_Class'],
        environment: ['Environment'],
        dn: [
          'DN', 'Dn',
          ':GRS_BORE', 'GRS_BORE', 'BORE',
          ':GRS_BORE_AVEVA_EntityParameters', 'AVEVA_EntityParameters_:GRS_BORE',
          '[AVEVA_EntityParameters]:GRS_BORE', '["AVEVA_EntityParameters"]:GRS_BORE',
          'NominalDiameter', 'Nominal Diameter', 'NOMINAL_DIAMETER'
        ],
        length: [
          'Length', 'LENGTH',
          ':GRS_LENG', 'GRS_LENG', 'LENG',
          ':GRS_LENG_AVEVA_EntityParameters', 'AVEVA_EntityParameters_:GRS_LENG',
          '[AVEVA_EntityParameters]:GRS_LENG', '["AVEVA_EntityParameters"]:GRS_LENG',
          'PIPE_LENGTH', 'PipeLength', 'NominalLength', 'Nominal Length', 'NOMINAL_LENGTH',
          'Длина'
        ],
        passlength: ['Pass Length', 'PassLength'],
        globalidreadable: ['GlobalIdReadable', 'GlobalId', 'GlobalId Readable', 'IfcGuid', 'Guid', 'ElementId', 'id'],
        globalid: ['GlobalId', 'GlobalIdReadable', 'GlobalId Readable', 'IfcGuid', 'Guid', 'ElementId', 'id'],
        ifcguid: ['IfcGuid', 'GlobalId', 'GlobalIdReadable', 'Guid', 'ElementId', 'id'],
        guid: ['Guid', 'GlobalId', 'GlobalIdReadable', 'IfcGuid', 'ElementId', 'id'],
        elementid: ['ElementId', 'id', 'GlobalIdReadable', 'GlobalId'],
        id: ['id', 'ElementId', 'GlobalId', 'GlobalIdReadable']
      };
      const names = aliases[normalizedTarget];
      if (!names) {
        return null;
      }
      for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(attributes, name) && !this.isEmptyReportValue(attributes[name])) {
          return attributes[name];
        }
      }
      if ((normalizedTarget === 'elementid' || normalizedTarget === 'id') && elementId !== undefined && elementId !== null && String(elementId).trim()) {
        return elementId;
      }
      return null;
    },

    normalizeAttributeName(name) {
      return String(name || '').replace(/[\s_\-]+/g, '').toLowerCase();
    },

    async makeAction(reportParams) {
      const params = reportParams || this._lastReportParams;
      if (!params || this.isReportOpening) {
        return;
      }

      this.isReportOpening = true;
      try {
        const columns = params.columns || [];
        const calculatedColumns = params.calculatedColumns || [];
        const includeTotals = params.includeTotals !== false;
        const totalCount = params.totalCount || (params.rows || []).length;
        const sourceRows = params.rows || [];
        const rowsForPreview = sourceRows;
        const allColumns = [...columns.map(c => c.label), ...calculatedColumns.map(c => c.name)];
        const totals = {};

        if (includeTotals) {
          for (const row of sourceRows) {
            for (const col of allColumns) {
              const value = row[col];
              if (typeof value === 'number' && !isNaN(value)) {
                totals[col] = (totals[col] || 0) + value;
              }
            }
          }
        }

        let html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Отчёт</title>
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
              .report-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                margin-bottom: 16px;
              }
              .report-header-titles {
                text-align: center;
                flex: 1;
              }
              .print-btn {
                padding: 6px 18px;
                font-size: 12px;
                cursor: pointer;
                background: #1a1a1a;
                color: #ffffff;
                border: none;
                border-radius: 4px;
                white-space: nowrap;
                flex-shrink: 0;
              }
              .print-btn-spacer {
                width: 76px;
                flex-shrink: 0;
              }
              .print-btn:hover {
                background: #333333;
              }
              @media print {
                .print-btn { display: none; }
                .print-btn-spacer { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="report-header">
              <button class="print-btn" onclick="window.print()">Печать</button>
              <div class="report-header-titles">
                <h1>Отчёт</h1>
                <h2>Найдено элементов: ${totalCount}</h2>
              </div>
              <div class="print-btn-spacer"></div>
            </div>
        `;

        html += `
            <table>
              <thead>
                <tr>
        `;
        
        for (const col of allColumns) {
          html += `<th>${this.escapeHtml(col)}</th>`;
        }
        
        html += `</tr></thead><tbody>`;
        
        for (const row of rowsForPreview) {
          html += `<tr>`;
          for (const col of allColumns) {
            html += `<td>${this.escapeHtml(row[col])}</td>`;
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
        if (!win) {
          throw new Error('Браузер заблокировал автоматическое открытие отчёта.');
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
      } finally {
        this.isReportOpening = false;
        this.restoreFocusToInput();
      }
    },

    restoreFocusToInput() {
      const focusOnce = () => {
        try {
          if (typeof window !== 'undefined' && typeof window.focus === 'function') {
            window.focus();
          }
        } catch (e) {}
        try {
          this.$refs.questionInput?.focus();
        } catch (e) {}
      };
      setTimeout(focusOnce, 200);
      setTimeout(focusOnce, 800);
    },

    zoomToConnectionIssue(issue) {
      try {
        const model = this.viewer?.model;
        if (!model) return;
        const allParts = model.getAllModelParts ? model.getAllModelParts() : [];

        const names = [issue.name, issue.other].filter(Boolean);
        const found = [];
        for (const part of allParts) {
          if (!part.elementTree) continue;
          const els = part.elementTree.getAllElements();
          for (const el of els) {
            if (names.includes(el.name)) found.push({ id: el.id, partId: part.id, name: el.name });
          }
        }
        if (found.length === 0) return;

        // Приблизить к первому элементу
        this.viewer.navigation.fitToView([found[0].id], found[0].partId, true);
      } catch (e) {
        console.warn('zoomToConnectionIssue failed:', e);
      }
    },

    onWindowFocus() {
      if (!this.isLoading) {
        this.$nextTick(() => {
          try {
            this.$refs.questionInput?.focus();
          } catch (e) {}
        });
      }
    },

    loadSettings() {
      // Активный URL всегда продакшн при старте
      this.acsBaseUrl = this.PRESETS.production.url;
      this.acsToken = this.PRESETS.production.token;
      // Поля в панели показывают последнее сохранённое (удобно для редактирования)
      try {
        let url = localStorage.getItem('acs_base_url');
        const token = localStorage.getItem('acs_token');
        // Миграция: убираем старый порт :5546 если остался в localStorage
        if (url) url = url.replace(':5546', '');
        this.settingsUrl = url || this.PRESETS.production.url;
        this.settingsToken = token !== null ? token : this.PRESETS.production.token;
      } catch (e) {
        this.settingsUrl = this.PRESETS.production.url;
        this.settingsToken = this.PRESETS.production.token;
      }
    },

    applyPreset(name) {
      const preset = this.PRESETS[name];
      if (!preset) return;
      this.settingsUrl = preset.url;
      this.settingsToken = preset.token;
      this.pendingPreset = name;
    },

    saveSettings() {
      const url = (this.settingsUrl || '').trim().replace(/\/+$/, '');
      const token = (this.settingsToken || '').trim();
      if (!url) return;
      this.acsBaseUrl = url;
      this.acsToken = token;
      this.pendingPreset = null;
      try {
        localStorage.setItem('acs_base_url', url);
        localStorage.setItem('acs_token', token);
      } catch (e) {}
      this.settingsSaved = true;
      setTimeout(() => { this.settingsSaved = false; }, 2000);
    },

    escapeHtml(value) {
      if (value === undefined || value === null) {
        return '';
      }
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

    startRequestTimer() {
      this.stopRequestTimer();
      this.requestTimerStartedAt = Date.now();
      this.requestElapsedSeconds = 0;
      this.requestTimerId = setInterval(() => {
        if (this.requestTimerStartedAt) {
          this.requestElapsedSeconds = Math.floor((Date.now() - this.requestTimerStartedAt) / 1000);
        }
      }, 1000);
    },

    stopRequestTimer() {
      if (this.requestTimerId) {
        clearInterval(this.requestTimerId);
        this.requestTimerId = null;
      }
      this.requestTimerStartedAt = null;
    },

    startLoadingAnimation() {
      this.isLoading = true;
      this.startRequestTimer();

      const loadingMessage = {
        text: 'ИИ-помощник думает',
        type: 'assistant',
        isLoading: true,
        loadingId: Date.now()
      };
      this.messages.push(loadingMessage);
      this.activeStatusMessage = loadingMessage;
      this.scrollToBottom();

      let dotCount = 0;
      this.loadingInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        const dots = '.'.repeat(dotCount);
        if (this.activeStatusMessage && this.activeStatusMessage.isLoading
            && !this.feedbackWaitTimerId
            && String(this.activeStatusMessage.text || '').startsWith('ИИ-помощник думает')) {
          this.activeStatusMessage.text = `ИИ-помощник думает${dots}`;
        }
      }, 500);
    },

    stopLoadingAnimation() {
      this.isLoading = false;
      this.stopRequestTimer();
      if (this.loadingInterval) {
        clearInterval(this.loadingInterval);
        this.loadingInterval = null;
      }
      this.stopFeedbackWaitTimeout();
      this.activeStatusMessage = null;
      this.messages = this.messages.filter(msg => !msg.isLoading);
    },

    rememberPaintedModelPart(partId) {
      if (!partId) {
        return;
      }
      const value = String(partId);
      if (!this.paintedModelPartIds.includes(value)) {
        this.paintedModelPartIds.push(value);
      }
    },

    rememberPaintedTargets(partId, elementIds) {
      if (!partId || !Array.isArray(elementIds) || elementIds.length === 0) {
        return;
      }
      const key = String(partId);
      if (!this.paintedTargetsByPart[key]) {
        this.paintedTargetsByPart[key] = [];
      }
      const existing = new Set(this.paintedTargetsByPart[key].map(String));
      for (const elementId of elementIds) {
        const stringId = String(elementId);
        if (!existing.has(stringId)) {
          this.paintedTargetsByPart[key].push(stringId);
          existing.add(stringId);
        }
      }
      this.rememberPaintedModelPart(partId);
    },

    collectActiveModelPartIds(model) {
      const activePartIds = new Map();
      const addId = (id) => {
        if (!id) {
          return;
        }
        activePartIds.set(String(id).toLowerCase(), String(id));
      };
      try {
        if (typeof model.getVisibleElements === 'function') {
          const visible = model.getVisibleElements() || [];
          for (const item of visible) {
            addId(item?.modelPartId);
          }
        }
      } catch (e) {
        console.warn('Не удалось получить видимые части модели:', e);
      }
      try {
        if (typeof model.getAllModelParts === 'function') {
          const parts = model.getAllModelParts() || [];
          for (const part of parts) {
            addId(part?.id || part?.modelPartId || part?.Id);
          }
        }
      } catch (e) {
        console.warn('Не удалось получить список model parts:', e);
      }
      return activePartIds;
    },

    runClearColorCall(model, label, fn) {
      try {
        fn();
        this.logs.push({ text: `Очистка цвета: ${label} - выполнено.`, type: 'assistant' });
        return true;
      } catch (e) {
        const message = e?.message || e;
        this.logs.push({ text: `Очистка цвета: ${label} - ошибка: ${message}`, type: 'error' });
        console.warn(`clearColors (${label}) failed:`, e);
        return false;
      }
    },

    forceCanvasRedraw() {
      try {
        const renderView = this.viewer?.renderView;
        if (renderView && typeof renderView.updateCurrentCanvas === 'function') {
          return renderView.updateCurrentCanvas(true);
        }
      } catch (e) {
        console.warn('Не удалось запросить перерисовку сцены:', e);
      }
      return null;
    },

    async ClearModel() {
      if (!this.viewer || !this.viewer.model) {
        console.warn('Viewer не инициализирован');
        return;
      }

      this.diagnosticMessage = null;
      try {
        await this.syncVisibleModelElements();
      } catch (e) {
        console.warn('Не удалось синхронизировать индекс перед очисткой:', e);
      }
      this.restoreSceneState();
      try {
        await this.forceCanvasRedraw();
      } catch (e) {
        console.warn('Не удалось перерисовать сцену после очистки:', e);
      }
    },

    restoreSceneState() {
      const model = this.viewer?.model;
      if (!model) {
        return;
      }

      const activePartIds = this.collectActiveModelPartIds(model);
      const paintedKeys = Object.keys(this.paintedTargetsByPart || {});
      const stillPaintedParts = [];
      const skippedParts = [];
      for (const partId of paintedKeys) {
        if (activePartIds.has(String(partId).toLowerCase())) {
          stillPaintedParts.push(partId);
        } else {
          skippedParts.push(partId);
        }
      }
      this.logs.push({
        text: `Очистка: загруженных частей: ${activePartIds.size}, покрашенных всего: ${paintedKeys.length}, из них загружены: ${stillPaintedParts.length}, выгружены: ${skippedParts.length}.`,
        type: 'assistant',
      });
      if (skippedParts.length > 0) {
        this.logs.push({ text: `Пропущены выгруженные части: ${skippedParts.join(', ')}.`, type: 'assistant' });
      }

      try {
        if (typeof model.setGhostMode === 'function') {
          model.setGhostMode(false);
        }
      } catch (e) {
        console.warn('setGhostMode(false) failed:', e);
      }
      try {
        if (typeof model.showAll === 'function') {
          model.showAll();
        }
      } catch (e) {
        console.warn('showAll() failed:', e);
      }
      try {
        if (typeof model.clearSelection === 'function') {
          model.clearSelection();
        }
      } catch (e) {
        console.warn('clearSelection() failed:', e);
      }

      // Очищаем все активные части - не только те что в paintedTargetsByPart
      for (const partId of activePartIds) {
        this.runClearColorCall(model, `clearColors(${partId})`, () => {
          model.clearColors(partId);
        });
      }

      for (const partId of stillPaintedParts) {
        const entries = (this.paintedTargetsByPart[partId] || []);
        const elementIds = entries.map(e => typeof e === 'object' ? e.id : e);
        if (elementIds.length > 0 && typeof model.setColor === 'function') {
          this.runClearColorCall(model, `setColor alpha=0 для ${elementIds.length} элементов части ${partId}`, () => {
            model.setColor(elementIds, 1, 1, 1, 0, partId);
          });
        }
        this.runClearColorCall(model, `clearColors(${partId})`, () => {
          model.clearColors(partId);
        });
      }

      this.runClearColorCall(model, 'clearColors() (глобально)', () => {
        model.clearColors();
      });

      try {
        if (typeof model.clearSelection === 'function') {
          model.clearSelection();
        }
      } catch (e) {}

      this.currentSelection = [];
      this.paintedModelPartIds = [];
      this.paintedTargetsByPart = {};

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          try {
            if (typeof model.clearColors === 'function') {
              model.clearColors();
            }
          } catch (e) {}
          this.forceCanvasRedraw();
        });
      }
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
      this.scrollToBottom();
      this.contextId = null;
      this.handledEventIds = null;
      this.handledToolRequestIds = null;
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

.bim-input-wrap {
  position: relative;
  height: 100%;
  width: 85%;
}

.bim-input-wrap .bim-input {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.dev-suggestions {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid rgba(70, 36, 103, 0.5);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  z-index: 1000;
  overflow: hidden;
}

.dev-suggestion-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.dev-suggestion-item:last-child {
  border-bottom: none;
}

.dev-suggestion-item:hover,
.dev-suggestion-item.active {
  background: rgba(70, 36, 103, 0.08);
}

.dev-suggestion-tool {
  font-family: monospace;
  font-weight: bold;
  color: #462467;
  white-space: nowrap;
}

.dev-suggestion-desc {
  color: #888;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.message-trace-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  gap: 8px;
  margin: 0 0 8px 0;
}

.trace-toggle-bttn {
  flex: 1;
  background: rgba(118, 82, 138, 0.08);
  border: 1px solid rgba(118, 82, 138, 0.25);
  color: #76528a;
  padding: 7px 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.trace-toggle-bttn:hover {
  background: rgba(118, 82, 138, 0.16);
}

.trace-toggle-bttn.active {
  background: rgba(118, 82, 138, 0.22);
  border-color: rgba(118, 82, 138, 0.5);
  color: #5e3b74;
}

.tooltip-bttn {
  position: relative;
}

.tooltip-bttn::after {
  content: attr(data-tooltip);
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  background: #ffffff;
  color: #333333;
  border: 0.5px solid rgba(70, 36, 103, 0.22);
  border-radius: 4px;
  padding: 4px 7px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 20;
}

.tooltip-bttn:hover::after {
  opacity: 1;
  transform: translateY(0);
}

.message-trace-details {
  background: #ffffff;
  color: #333333;
  border: 0.5px solid rgba(70, 36, 103, 0.22);
  border-radius: 8px;
  padding: 10px;
  margin: 0 0 8px 0;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
}

.message-trace-details pre {
  margin: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  font-weight: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 360px;
  overflow-y: auto;
}

.connection-issues-list {
  margin: 8px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.connection-issue-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  background: rgba(220, 50, 50, 0.07);
  border-left: 3px solid #dc3232;
  border-radius: 3px;
  padding: 3px 6px;
}

.connection-issue-icon {
  flex-shrink: 0;
  font-size: 12px;
}

.connection-issue-name {
  flex: 1;
  color: #333;
  word-break: break-all;
}

.connection-issue-zoom {
  flex-shrink: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.connection-issue-zoom:hover {
  opacity: 1;
}

.request-timer {
  font-size: 11px;
  color: var(--text-secondary, #888);
  margin-top: 4px;
  margin-bottom: 2px;
  letter-spacing: 0.02em;
}

.settings-btn-wrap {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding-right: 4px;
}

.settings-gear-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #555;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.15s;
}

.settings-gear-btn:hover {
  color: #462467;
}

.settings-panel {
  position: relative;
  width: 100%;
  background: #fff;
  border: 1px solid rgba(70, 36, 103, 0.5);
  border-top: none;
  padding: 12px 14px 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 999;
  box-sizing: border-box;
}

.settings-panel-title {
  font-size: 13px;
  font-weight: bold;
  color: #462467;
  margin-bottom: 12px;
}

.settings-presets {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.settings-preset-btn {
  flex: 1;
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  color: #444;
  cursor: pointer;
  transition: all 0.15s;
  box-sizing: border-box;
}

.settings-preset-btn:hover {
  border-color: #462467;
  color: #462467;
}

.settings-preset-btn.active {
  background: #462467;
  color: #fff;
  border-color: #462467;
}

.settings-preset-btn.pending {
  background: #fff;
  color: #462467;
  border-color: #462467;
  box-shadow: 0 0 0 1px #462467;
}

.settings-active-url {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
  margin-bottom: 10px;
  word-break: break-all;
}

.settings-active-url-val {
  color: #462467;
  font-family: monospace;
}

.settings-label-hint {
  color: #aaa;
  font-weight: normal;
}

.settings-field {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
}

.settings-label {
  font-size: 11px;
  color: #666;
  margin-bottom: 3px;
}

.settings-input {
  font-size: 12px;
  padding: 5px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  outline: none;
  font-family: monospace;
  color: #222;
}

.settings-input:focus {
  border-color: rgba(70, 36, 103, 0.6);
}

.settings-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.settings-save-btn {
  background: #462467;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}

.settings-save-btn:hover {
  background: #5c3285;
}

.settings-reset-btn {
  background: transparent;
  color: #555;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}

.settings-reset-btn:hover {
  border-color: #462467;
  color: #462467;
}

.settings-close-btn {
  background: transparent;
  color: #555;
  border: none;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
  margin-left: auto;
}

.settings-close-btn:hover {
  color: #222;
}

.settings-saved-hint {
  font-size: 11px;
  color: #2a7a2a;
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

.debug-toolbar {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  padding: 5px 10px 0 10px;
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
.execution-trace {
  background: #ffffff;
  color: #333333;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
}

.execution-trace-title {
  font-weight: 500;
  margin-bottom: 8px;
  color: #333333;
}

.execution-trace-row {
  font-weight: 500;
  margin: 8px 0 4px 0;
}

.execution-trace pre {
  background: #ffffff;
  color: #333333;
  border: 0.5px solid rgba(70, 36, 103, 0.16);
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  font-weight: inherit;
}

.tool-call-block {
  border-top: 1px solid rgba(70, 36, 103, 0.25);
  margin-top: 10px;
  padding-top: 10px;
}

.tool-call-title {
  font-weight: bold;
  color: #76528a;
  margin-bottom: 6px;
}

.tool-call-block summary {
  cursor: pointer;
  color: #76528a;
  margin: 6px 0;
}

.tool-call-warnings {
  margin-top: 8px;
  color: #8a5a00;
}

.diagnostic-popup {
  position: absolute;
  right: 12px;
  bottom: 90px;
  left: 12px;
  background: #ffffff;
  color: #333333;
  border: 1px solid rgba(70, 36, 103, 0.35);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  z-index: 5;
  font-size: 12px;
}

.diagnostic-popup-title {
  font-weight: bold;
  color: #76528a;
  margin-bottom: 8px;
}

.diagnostic-popup pre {
  background: #f5f5f5;
  color: #222222;
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
}

</style>