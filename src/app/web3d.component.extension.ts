import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { createApp, type App as AppType } from 'vue';
import Interface from '../components/interface.vue';
import { IToolbar, IToolbarBuilder, ObjectsViewContext } from "@pilotdev/pilot-web-sdk";

export class AIExtension {
  static readonly EXTENSION_NAME = "AI.Web3DExtension";
  
  private _viewer: PilotWeb3D.GuiViewer3D;
  private _panelDiv: HTMLDivElement | null = null;
  private _toggleButton: HTMLButtonElement | null = null;
  private _vueApp: AppType<Element> | null = null;
  private _objectsRepository: any = null;
  private _bimFeatures: any = null;
  private _excelData: any = null;

  constructor(_viewer: PilotWeb3D.GuiViewer3D) {
    this._viewer = _viewer;
  }
  
  getName() {
    return AIExtension.EXTENSION_NAME;
  }

  onToolbarCreated(): void {
    console.log('Web3D extension: onToolbarCreated called');
    // Здесь можно выполнить действия после создания тулбара
  }

  onToolbarDestroyed(): void {
    console.log('Web3D extension: onToolbarDestroyed called');
  }

  async load(): Promise<boolean> {
    try {
      console.log('📦 Web3DExtension загружается');

      this._initPilotApi();
      this._createToggleButton();
      this._createVuePanel();
      return true;
    }
    catch (error) {
      console.error('Web3D extension loading failed:', error);
      return false;
    }
  }

  unload(): boolean {
    console.log('🧹 Web3DExtension выгружается');
    
    if (this._vueApp) {
      this._vueApp.unmount();
      this._vueApp = null;
    }
    
    if (this._panelDiv && this._panelDiv.parentNode) {
      this._panelDiv.parentNode.removeChild(this._panelDiv);
      this._panelDiv = null;
    }
    
    if (this._toggleButton && this._toggleButton.parentNode) {
      this._toggleButton.parentNode.removeChild(this._toggleButton);
      this._toggleButton = null;
    }
    return true
  }

  private _initPilotApi() {
    try {
      const pilot = (window as any).Pilot;
      if (pilot) {
        this._objectsRepository = pilot.getService('IObjectsRepository');
        this._bimFeatures = pilot.getService('IBimFeatures');
        console.log('✅ API Pilot получен');
      }
    } catch (e) {
      console.warn('⚠️ Не удалось получить API Pilot', e);
    }
  }

  private _createToggleButton() {
    const waitForToolbar = setInterval(() => {
      const toolbar = document.querySelector('#mainToolbar');
      if (!toolbar) return;
      clearInterval(waitForToolbar);
      const existingButton = toolbar.querySelector('.ascn-control-button');
      const btn = document.createElement('div');
      btn.className = 'ascn-control ascn-control-button ascn-toolbar-button';
      btn.setAttribute('data-tooltip-id', 'ai-tooltip');
      btn.setAttribute('title', 'ИИ-помощник');
      btn.setAttribute('aria-label', 'ИИ-помощник');
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C9.38 2 7.25 4.13 7.25 6.75C7.25 9.37 9.38 11.5 12 11.5C14.62 11.5 16.75 9.37 16.75 6.75C16.75 4.13 14.62 2 12 2Z" fill="currentColor"/>
          <path d="M12 14.5C8.14 14.5 5 17.64 5 21.5H19C19 17.64 15.86 14.5 12 14.5Z" fill="currentColor"/>
          <path d="M21 8.5L19.75 10.75L21 13H18V8.5H21Z" fill="currentColor"/>
          <path d="M3 8.5H6V13H3L4.25 10.75L3 8.5Z" fill="currentColor"/>
        </svg>
      `;
      if (existingButton) {
        const styles = window.getComputedStyle(existingButton);
        btn.style.cssText = `
          display: ${styles.display};
          align-items: ${styles.alignItems};
          justify-content: ${styles.justifyContent};
          cursor: ${styles.cursor};
          width: ${styles.width};
          height: ${styles.height};
          margin: ${styles.margin};
          padding: ${styles.padding};
          border-radius: ${styles.borderRadius};
          background: ${styles.background};
          color: ${styles.color};
          opacity: ${styles.opacity};
        `;
      } else {
        btn.style.cssText = `
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          width: 32px;
          height: 32px;
          margin: 0;
          border-radius: 0;
          background: transparent;
          color: #ffffff;
          opacity: 0.7;
        `;
      }
      
      btn.addEventListener('mouseenter', () => {
        btn.style.backgroundColor = 'rgba(11, 10, 10, 0.15)';
        btn.style.opacity = '1';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.backgroundColor = 'transparent';
        btn.style.opacity = '0.7';
      });
      
      btn.addEventListener('click', () => this._togglePanel());
      
      toolbar.appendChild(btn);
      console.log('✅ Кнопка добавлена в mainToolbar');
    }, 100);
  }

  private _togglePanel() {
    if (!this._panelDiv) return;
    
    if (this._panelDiv.style.display === 'none') {
      this._panelDiv.style.display = 'block';
      if (this._toggleButton) {
        this._toggleButton.style.backgroundColor = 'rgba(70, 36, 103, 0.81)';
        this._toggleButton.innerHTML = '✕ Закрыть';
      }
    } else {
      this._panelDiv.style.display = 'none';
      if (this._toggleButton) {
        this._toggleButton.style.backgroundColor = 'rgba(70, 36, 103, 0.81)';
        this._toggleButton.innerHTML = 'ПНР';
      }
    }
  }

  private _createVuePanel() {
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.right = '0px';
    div.style.top = '50px';
    div.style.width = '30vw';
    div.style.height = 'calc(100vh - 50px)';
    div.style.border = '2px rgba(70, 36, 103, 0.81)';
    div.style.zIndex = '1000';
    div.style.overflow = 'hidden';
    div.style.display = 'none';
    
    div.appendChild(container);
    document.body.appendChild(div);
    
    this._vueApp = createApp(Interface, {
      viewer: this._viewer,
    });

    this._vueApp = createApp(Interface, {
      viewer: this._viewer,
      objectsRepository: this._objectsRepository,
      bimFeatures: this._bimFeatures, 
      extension: this,
      excelData: this._excelData
    });
    
    this._vueApp.mount(container);
    
    this._panelDiv = div;
    console.log('✅ Vue-панель создана');
  }
}

export default AIExtension;









// <template>
//   <div class = "ai_chat_bim">
//     <div class="header">
//       <h1> Чат с помощником </h1>
//     </div>
//     <div class = "bim-main">
//       <div class="bim-chat-history">
//         <div v-for="(msg, index) in messages" :key="index" 
//           :class="['bim-message', msg.type]">
//           <div class="bim-message-bubble">
//             <p>{{ msg.text }}</p>
//             <div class="message-actions">
//               <button 
//                 class="copy-bttn" 
//                 @click="copyMessage(msg.text)">
//                 📋
//               </button>
//               <button 
//                 v-if="msg.type === 'assistant' && !msg.isLoading && !msg.isCancel"
//                 class="action-bttn" 
//                 @click="makeAction(msg.text)">
//                 ▶
//               </button>
//               <button v-if="msg.isLoading" class="cancel-bttn" @click="cancelRequest">✕</button>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//     <div class = "bim-send_messages">
//       <input type = "text" class="bim-input" placeholder = "Введите запрос" v-model="question" @keyup.enter="sendMessage">
//       <div class = "bim-send">
//         <button class = "button" @click="sendMessage"> ↑ </button>
//       </div>
//     </div>
//     <div class = "bim-settings">
//       <div class="mode">
//         <h2>Режим:</h2>
//           <div class="styled-select" @change="changeMode($event.target.value)">
//             <select>
//               <option value="Thinking"> Thinking </option>
//               <option value="Instance"> Instance </option>
//             </select>
//           </div>
//       </div>
//     </div>
//   </div>
// </template>

// <script>

// export default {
//   props: {
//     viewer: Object,
//     objectsRepository: Object,
//     bimFeatures: Object,
//     extension: Object,
//     excelData: Object,
//   },
//   data() {
//     return {
//       question: '',
//       ask: '',
//       messages: [],
//       configuration: 'Search',
//       mode: 'Thinking',
//       dataStore: {},
//       isLoading: false,
//       loadingDots: '',
//       loadingInterval: null,
//       abortController: null
//     }
//   },
//   mounted() {
//     this.loadModel();
//   },
//   methods: {

//     changeConfiguration(value) {
//       this.configuration  = value
//     },
    
//     changeMode(value) {
//       this.mode  = value
//     },

//     copyMessage(text) {
//       const textarea = document.createElement('textarea');
//       textarea.value = text;
//       textarea.style.position = 'fixed';
//       textarea.style.top = '-9999px';
//       textarea.style.left = '-9999px';
//       document.body.appendChild(textarea);
      
//       textarea.select();
//       textarea.setSelectionRange(0, textarea.value.length);
      
//       try {
//         document.execCommand('copy');
//       } catch (err) {
//         console.error('❌ Ошибка:', err);
//       }
      
//       document.body.removeChild(textarea);
//     },

//     async sendMessage() {
//       const userMessage = this.question;

//       if (!userMessage.trim()) return;

//       if (this.abortController) {
//         this.abortController.abort();
//       }

//       this.abortController = new AbortController();

//       this.question = '';
//       this.messages.push({ text: userMessage, type: 'user' }); 

//       this.startLoadingAnimation();

//       try {
//         const response = await this.askLLMWithTools(userMessage, this.abortController.signal);
//         const message = response.choices[0].message;

//         if (message.tool_calls && message.tool_calls.length > 0) {
//           for (const toolCall of message.tool_calls) {
//             if (toolCall.function.name === 'searchElements') {

//               const params = JSON.parse(toolCall.function.arguments);
//               const result = await this.searchElements(params);

//               // if (result.ids.length > 0 && this.viewer && this.viewer.model) {
//               //   try {
//               //     this.viewer.model.clearColors();
//               //     let colored = 0;
//               //     for (const id of result.ids) {
//               //       try {
//               //         this.viewer.model.setColor(id, 0, 255, 0, 255);
//               //         colored++;
//               //       } catch(e) {}
//               //     }
//               //     console.log(`✅ Подсвечено ${colored} элементов`);
//               //   } catch(e) {
//               //     console.warn('Ошибка подсветки:', e);
//               //   }
//               // }
//               this.stopLoadingAnimation();
//               this.messages.push({
//                 text: result.message,
//                 type: 'assistant'
//               });
//             } else if (toolCall.function.name === 'buildReport') {
//               const params = JSON.parse(toolCall.function.arguments);
//               const result = await this.buildReport(params);
              
//               this.stopLoadingAnimation();
//               this.messages.push({
//                 text: result.message,
//                 type: 'assistant',
//               });
//             }
//           }
//         } else {
//           this.stopLoadingAnimation();
//           this.messages.push({
//             text: message.content || 'Не удалось обработать запрос',
//             type: 'assistant'
//           });
//         }
//       } catch (error) {
//         if (error.name === 'AbortError') {
//           return;
//         }
//         console.error('Ошибка в sendMessage:', error);
//         this.stopLoadingAnimation();
//         this.messages.push({
//           text: `Ошибка: ${error.message}`,
//           type: 'error'
//         });
//       } finally {
//         this.abortController = null;
//       }
//     },

//     async loadModel() {
//       if (Object.keys(this.dataStore).length) {
//         return
//       }
//       this.dataStore = {}
//       this.loadingProgress = 0;
//       const model = this.viewer.model;
//       const visible = model.getVisibleElements();
//       const allIds = [];
//       for (const part of visible) {
//         if (part.elementIds && part.elementIds.length) {
//           allIds.push(...part.elementIds);
//         }
//       }
//       for (let i = 0; i < allIds.length; i++) {
//         const elId = allIds[i];
//         try {
//           const propertySets = await model.getElementProperties(elId);
//           let attributes = {};
//           for (const set of propertySets) {
//             for (const prop of set.properties) {
//               const value = prop.value?.value ?? prop.value;
//               attributes[prop.name] = value;
//             }
//           }
//           if (!attributes['PipeRun'] && attributes['System Path']) {
//             const result = this.extractFromSystemPath(attributes['System Path'])
//             const pipeline = result.pipeline;
//             const pipeRun = result.pipeRun;
//             const system_data = this.extractSystemAndSubsystem(pipeRun);
//             const system = system_data.system;
//             const subsystem = system_data.subsystem;
//             const diameter = system_data.diameter;
//             this.dataStore[elId] = {
//               ...attributes,
//               PipeRun: pipeRun,
//               Pipeline: pipeline,
//               System: system,
//               Subsystem: subsystem,
//               Diam: diameter
//             };
//           } else  if (attributes['System Path']) {
//             const system_data = this.extractSystemAndSubsystem(attributes['PipeRun']);
//             const system = system_data.system;
//             const subsystem = system_data.subsystem;
//             const diameter = system_data.diameter;
//             this.dataStore[elId] = {
//               ...attributes,
//               System: system,
//               Subsystem: subsystem,
//               Diam: diameter
//             };
//           }
//         } catch (e) {
//           console.warn(`Ошибка для ${elId}:`, e);
//         }
//         this.$emit('loading-progress', this.loadingProgress);
//       }
//     },

//     async askLLMWithTools(userMessage, signal) {
//       this.loadModel();
//       const tools = [
//         {
//           type: "function",
//           function: {
//             name: "searchElements",
//             description: "Поиск элементов в 3D-модели по атрибутам. Возвращает список ID найденных элементов и их количество.",
//             parameters: {
//               type: "object",
//               properties: {
//                 attribute: {
//                   type: "string",
//                   description: "Атрибут для поиска. Доступные атрибуты: Name (название), Type (тип: Pipe, Flange, Elbow и т.д.), PipeRun (ID трубопровода), Pipeline (ID линии), System (система: HTWS, HTWR, OD, FA), Subsystem (подсистема), NPD (диаметр в мм), 'Dry Weight' (вес в кг), Length (длина в мм), 'Pass Length' (длина сварного шва в мм), MaterialDescription (материал)",
//                   enum: ["Name", "Type", "PipeRun", "Pipeline", "System", "Subsystem", "Diam", "Dry Weight", "Length", "Pass Length", "MaterialDescription"]
//                 },
//                 operator: {
//                   type: "string",
//                   description: "Оператор сравнения. Для строк: contains (содержит), equals (равно). Для чисел: > (больше), < (меньше), >= (больше или равно), <= (меньше или равно), equals (равно)",
//                   enum: ["contains", "equals", ">", "<", ">=", "<="]
//                 },
//                 value: {
//                   type: "string",
//                   description: "Значение для поиска. Для чисел можно передавать цифры (например, 100), для строк — текст (например, Pipe)."
//                 }
//               },
//               required: ["attribute", "operator", "value"]
//             }
//           }
//         },
//         {
//           type: "function",
//           function: {
//             name: "buildReport",
//             description: "Построить отчёт по элементам модели. Позволяет задать фильтры, выбрать колонки и добавить вычисляемые колонки (например, объём трубы).",
//             parameters: {
//               type: "object",
//               properties: {
//                 filters: {
//                   type: "array",
//                   description: "Условия фильтрации (какие элементы включить в отчёт)",
//                   items: {
//                     type: "object",
//                     properties: {
//                       attribute: { type: "string" },
//                       operator: { type: "string" },
//                       value: { type: "string" }
//                     },
//                     required: ["attribute", "operator", "value"]
//                   }
//                 },
//                 columns: {
//                   type: "array",
//                   description: "Список колонок для отображения. Доступные поля: Name, Type, System, Subsystem, PipeRun, NPD, Dry Weight, Length, Pass Length, MaterialDescription",
//                   items: {
//                     type: "object",
//                     properties: {
//                       field: { type: "string" },
//                       label: { type: "string" }
//                     },
//                     required: ["field", "label"]
//                   }
//                 },
//                 calculatedColumns: {
//                   type: "array",
//                   description: "Вычисляемые колонки. Поддерживается formula: 'volume' (объём трубы по диаметру и длине)",
//                   items: {
//                     type: "object",
//                     properties: {
//                       name: { type: "string" },
//                       formula: { type: "string", enum: ["volume"] }
//                     }
//                   }
//                 },
//                 includeTotals: {
//                   type: "boolean",
//                   description: "Показывать итоговую строку",
//                   default: true
//                 }
//               },
//               required: ["filters", "columns"]
//             }
//           }
//         }
//       ];
//       const endpoint = this.mode === 'Thinking' 
//         ? 'https://360pilot.ru:5546/oss/v1/chat/completions'
//         : 'https://360pilot.ru:5546/qwen/v1/chat/completions';
      
//       const modelName = this.mode === 'Thinking' ? 'gpt-oss-20b' : 'qwen3.6-30b-A3B';
//       const systemPrompt = `
//       Ты помощник по работе с 3D-моделью трубопроводов.

//       Доступные функции:
//       1. searchElements - поиск элементов по атрибутам
//       2. buildReport - построение отчёта

//       Доступные атрибуты:
//       - Name: название элемента (у труб обычно "Pipe")
//       - PipeRun: идентификатор трубопровода
//       - Pipeline: идентификатор линии
//       - System: система (02-HTWS/HTWR, 06-OD и т.д.)
//       - Subsystem: подсистема
//       - Thickness: толщина
//       - Design Max Pressure: давление
//       - Design Max Temperature: температура
//       - Diam: диаметр
//       - Dry Weight: вес в кг
//       - Length: длина в мм

//       Правила:
//       - Для поиска используй searchElements
//       - Для отчёта используй buildReport. Если пользователь просит "отчёт", "таблицу", "статистику" — вызывай buildReport
//       - В buildReport нужно указать filters, columns, опционально calculatedColumns (например, для объёма)

//       Примеры:
//       - "найди все трубы" → searchElements({ attribute: "Name", operator: "contains", value: "Pipe" })
//       - "сделай отчёт по трубам с колонками имя, длина, диаметр" → buildReport({ 
//           filters: [{ attribute: "Name", operator: "contains", value: "Pipe" }],
//           columns: [
//             { field: "Name", label: "Имя" },
//             { field: "Length", label: "Длина, м" },
//             { field: "Diam", label: "Диаметр" }
//           ]
//         })
//       - "отчёт по фланцам с объёмом" → buildReport({
//           filters: [{ attribute: "Type", operator: "contains", value: "Flange" }],
//           columns: [{ field: "Name", label: "Имя" }],
//           calculatedColumns: [{ name: "Объём, м³", formula: "volume" }]
//         })
//       `;

//       const response = await fetch(endpoint, {
//         method: 'POST',
//         headers: {
//           'Authorization': 'Bearer @r6|zzN1B?270{O0xn?JkCtWjTpi~Z',
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//           model: modelName,
//           messages: [
//             { role: 'system', content: systemPrompt },
//             { role: 'user', content: userMessage }
//           ],
//           tools: tools,
//           tool_choice: 'auto',
//           temperature: 0.7
//         }),
//         signal: signal
//       });
//       return await response.json();
//     },

//     async searchElements(params) {
//       const attribute = params.attribute;      
//       const operator = params.operator;        
//       const searchValue = params.value;      
//       console.log(`🔍 Поиск: атрибут="${attribute}", оператор="${operator}", значение="${searchValue}"`);
//       const foundIds = [];
//       for (const [elementId, attributes] of Object.entries(this.dataStore)) {
//         let attrValue = attributes[attribute];
//         if (!attrValue) continue;
//         let isMatch = false;
//         const isNumericSearch = !isNaN(parseFloat(searchValue)) && isFinite(searchValue);
//         if (isNumericSearch) {
//           const cleanValue = String(attrValue).replace(/[^0-9.-]/g, '');
//           const numAttr = parseFloat(cleanValue);
//           const numSearch = parseFloat(searchValue);
          
//           if (isNaN(numAttr)) {
//             continue;
//           }
//           switch (operator) {
//             case '>': isMatch = numAttr > numSearch; break;
//             case '<': isMatch = numAttr < numSearch; break;
//             case '>=': isMatch = numAttr >= numSearch; break;
//             case '<=': isMatch = numAttr <= numSearch; break;
//             case 'equals':
//             case '=':
//               isMatch = Math.abs(numAttr - numSearch) < 0.001;
//               break;
//             default:
//               const valueStr = String(attrValue).toLowerCase();
//               const searchStr = String(searchValue).toLowerCase();
//               isMatch = valueStr.includes(searchStr);
//           }
//         } else {
//           const valueStr = String(attrValue).toLowerCase();
//           const searchStr = String(searchValue).toLowerCase();
//           switch (operator) {
//             case 'contains':
//               isMatch = valueStr.includes(searchStr);
//               break;
//             case 'equals':
//               isMatch = valueStr === searchStr;
//               break;
//             case 'starts_with':
//               isMatch = valueStr.startsWith(searchStr);
//               break;
//             case 'ends_with':
//               isMatch = valueStr.endsWith(searchStr);
//               break;
//             default:
//               isMatch = valueStr.includes(searchStr);
//           }
//         }
//         if (isMatch) {
//           foundIds.push(elementId);
//         }
//       }
//       console.log(`✅ Найдено ${foundIds.length} элементов`);
//       this._lastSearchResult = {
//         ids: foundIds,
//         count: foundIds.length,
//         params: params
//       };
//       return {
//         ids: foundIds,
//         count: foundIds.length,
//         message: `Найдено ${foundIds.length} элементов по критерию: ${attribute} ${operator} "${searchValue}"`
//       };
//     },

//     async buildReport(params) {
//       const filters = params.filters || [];
//       const columns = params.columns || [];
//       const calculatedColumns = params.calculatedColumns || [];
//       const includeTotals = params.includeTotals !== false;
      
//       const foundIds = [];
//       for (const [elementId, attributes] of Object.entries(this.dataStore)) {
//         let matched = true;
//         for (const filter of filters) {
//           const attrValue = attributes[filter.attribute];
//           if (!attrValue) {
//             matched = false;
//             break;
//           }
          
//           const isNumeric = !isNaN(parseFloat(filter.value)) && isFinite(filter.value);
//           if (isNumeric) {
//             const cleanValue = String(attrValue).replace(/[^0-9.-]/g, '');
//             const numAttr = parseFloat(cleanValue);
//             const numSearch = parseFloat(filter.value);
            
//             switch (filter.operator) {
//               case '>': matched = numAttr > numSearch; break;
//               case '<': matched = numAttr < numSearch; break;
//               case '>=': matched = numAttr >= numSearch; break;
//               case '<=': matched = numAttr <= numSearch; break;
//               case 'equals': matched = Math.abs(numAttr - numSearch) < 0.001; break;
//               default: matched = false;
//             }
//           } else {
//             const valueStr = String(attrValue).toLowerCase();
//             const searchStr = String(filter.value).toLowerCase();
//             switch (filter.operator) {
//               case 'contains': matched = valueStr.includes(searchStr); break;
//               case 'equals': matched = valueStr === searchStr; break;
//               default: matched = false;
//             }
//           }
//           if (!matched) break;
//         }
//         if (matched) foundIds.push(elementId);
//       }
      
//       if (foundIds.length === 0) {
//         return { message: 'Нет данных' };
//       }
      
//       this._lastReportParams = {
//         filters,
//         columns,
//         calculatedColumns,
//         includeTotals,
//         foundIds,
//         totalCount: foundIds.length
//       };
      
//       return {
//         message: `Отчёт готов. Найдено ${foundIds.length} элементов`
//       };
//     },

//     async makeAction(messageText) {

//       if (this._lastReportParams) {
//         const params = this._lastReportParams;
//         const { columns, calculatedColumns, includeTotals, foundIds, totalCount } = params;
        
//         const rows = [];
//         const totals = {};
        
//         for (const id of foundIds.slice(0, 200)) {
//           const attrs = this.dataStore[id];
//           const row = {};
          
//           for (const col of columns) {
//             let value = attrs[col.field];
//             if (col.field === 'Dry Weight') {
//               value = this.parseNumberValue(value);
//             } else if (col.field === 'Length' || col.field === 'Pass Length') {
//               value = this.parseNumberValue(value) / 1000;
//             }
//             row[col.label] = value || '-';
            
//             if (includeTotals && typeof value === 'number' && !isNaN(value)) {
//               totals[col.label] = (totals[col.label] || 0) + value;
//             }
//           }
          
//           for (const calc of calculatedColumns) {
//             let value = null;
//             if (calc.formula === 'volume') {
//               const diameterMm = this.parseNumberValue(attrs.Diam);
//               const diameter = diameterMm / 1000;
//               const length = this.parseNumberValue(attrs.Length || attrs['Pass Length']) / 1000;
//               if (diameter > 0 && length > 0) {
//                 const radius = diameter / 2000;
//                 value = Math.PI * radius * radius * length;
//               }
//             }
//             row[calc.name] = value !== null ? value.toFixed(3) : '-';
//             if (includeTotals && value !== null && !isNaN(value)) {
//               totals[calc.name] = (totals[calc.name] || 0) + value;
//             }
//           }
          
//           rows.push(row);
//         }
        
//         const allColumns = [...columns.map(c => c.label), ...calculatedColumns.map(c => c.name)];
        
//         let html = `
//           <!DOCTYPE html>
//           <html>
//           <head>
//             <meta charset="utf-8">
//             <title>Отчёт ПНР</title>
//             <style>
//               body {
//                 font-family: 'Times New Roman', Arial, sans-serif;
//                 margin: 20px;
//                 font-size: 12px;
//                 color: #000000;
//               }
//               h1 {
//                 text-align: center;
//                 font-size: 18px;
//                 font-weight: bold;
//                 margin: 0 0 5px 0;
//                 color: #000000;
//               }
//               h2 {
//                 text-align: center;
//                 font-size: 14px;
//                 font-weight: normal;
//                 margin: 0 0 20px 0;
//                 color: #333333;
//               }
//               table {
//                 border-collapse: collapse;
//                 width: 100%;
//                 margin-top: 10px;
//               }
//               th, td {
//                 border: 1px solid #000000;
//                 padding: 8px;
//                 text-align: center;
//               }
//               th {
//                 background-color: #e0e0e0;
//                 color: #000000;
//                 font-weight: bold;
//               }
//               td {
//                 background-color: #ffffff;
//                 font-weight: normal;
//                 color: #000000;
//               }
//               .footer {
//                 margin-top: 30px;
//                 font-size: 10px;
//                 color: #666666;
//                 text-align: center;
//               }
//             </style>
//           </head>
//           <body>
//             <h1>Отчёт ПНР</h1>
//             <h2>Найдено элементов: ${totalCount}</h2>
//             <table>
//               <thead>
//                 <tr>
//         `;
        
//         for (const col of allColumns) {
//           html += `<th>${col}</th>`;
//         }
        
//         html += `</tr></thead><tbody>`;
        
//         for (const row of rows) {
//           html += `<tr>`;
//           for (const col of allColumns) {
//             html += `<td>${row[col]}</td>`;
//           }
//           html += `</tr>`;
//         }
        
//         html += `</tbody>`;
        
//         if (includeTotals && Object.keys(totals).length > 0) {
//           html += `<tfoot><tr style="background: #f0f0f0; font-weight: bold;">`;
//           for (const col of allColumns) {
//             const total = totals[col];
//             html += `<td>${total !== undefined ? total.toFixed(2) : ''}</td>`;
//           }
//           html += `</tr></tfoot>`;
//         }
        
//         html += `
//             </table>
//             <div class="footer">
//               Отчёт сгенерирован: ${new Date().toLocaleString()}
//             </div>
//           </body>
//           </html>
//         `;
        
//         const win = window.open();
//         win.document.write(html);
//         win.document.close();
//         win.print();
        
//         this._lastReportParams = null;
//       }
//       if (this._lastSearchResult) {
//         const result = this._lastSearchResult;
        
//         if (result.ids.length > 0 && this.viewer && this.viewer.model) {
//           try {
//             this.viewer.model.clearColors();
//             let colored = 0;
//             for (const id of result.ids) {
//               try {
//                 this.viewer.model.setColor(id, 255, 0, 0, 255);
//                 colored++;
//               } catch(e) {}
//             }
//             console.log(`✅ Подсвечено ${colored} элементов`);
//           } catch(e) {
//             console.warn('Ошибка подсветки:', e);
//           }
//         }
        
//         this._lastSearchResult = null;
//         return;
//       }
//     },

//     parseNumberValue(value) {
//       if (!value) return 0;
//       if (typeof value === 'number') return value;
//       const cleaned = String(value).replace(/[^0-9.-]/g, '');
//       const num = parseFloat(cleaned);
//       return isNaN(num) ? 0 : num;
//     },
    
//     extractSystemAndSubsystem(pipeRun) {
//       if (!pipeRun) {
//         return { system: 'ND', subsystem: 'ND', diameter: '0' };
//       }
//       const parts = pipeRun.split('-');
//       if (parts.length < 3) {
//         return { system: 'ND', subsystem: 'ND', diameter: '0' };
//       }
//       let diameter = "0";
//       const code = parts[1];     
//       const number = parts[2];      
//       const suffix = parts[3];      
//       const system01Codes = [
//         "S", "BA", "AG", "FA", "FG", "A", "LA", "RA", 
//         "H", "GL", "ADH", "CHR", "FC"
//       ];
//       const pMatch = code.match(/^P(\d+)$/);
//       const isPCode = pMatch && parseInt(pMatch[1]) <= 100;
//       let system = 'ND';
//       let env = code;
//       if (system01Codes.includes(code) || isPCode) {
//         const section = number.substring(0, 3);
//         system = `01-${section}`;
//         diameter = section;
//       }
//       else if (["IA", "PA", "LI", "BFW", "LPBD", "MPBD", "HPBD", "W7", "DW", "LSS", "HS", "HC", "LS", "LC"].includes(code)) {
//         system = `02-${code}`;
//       }
//       else if (pipeRun.includes("CWI") || pipeRun.includes("CWRI")) {
//         system = "02-CWI/CWRI";
//         env = "CWI/CWRI";
//       }
//       else if (pipeRun.includes("HTWS") || pipeRun.includes("HTWR")) {
//         system = "02-HTWS/HTWR";
//         env = "HTWS/HTWR";
//       }
//       else if (["W19", "POW", "WF", "TA", "ASUE", "HV", "GT", "PZ"].includes(code)) {
//         system = `05-${code}`;
//       }
//       else if (["PR", "OD", "K1", "AR"].includes(code)) {
//         system = `06-${code}`;
//       }
//       else {
//         system = 'ND';
//       }
//       let subsystem = 'ND';
//       if (system !== 'ND') {
//         const section = number.substring(0, 3);
//         diameter = section;
//         if (system.startsWith('01-')) {
//           subsystem = `${system}-${env}`;
//         }
//         else {
//           const groupCode = system.substring(0, 2);
//           subsystem = `${groupCode}-${section}-${env}`;
//         }
//       }
//       return { system, subsystem, diameter };
//     },

//     isValidPipeRunFormat(str) {
//       const pattern = /^(\d{1,4})-([A-Z0-9]+)-([A-Z0-9]*\d+[A-Z0-9]*)(?:-([A-Z0-9]+))?(?:-([A-Z0-9]+))?$/i;
//       return pattern.test(str);
//     },

//     extractFromSystemPath(systemPath) {
//       const segments = systemPath.split(/[\\\/]/);
//       for (let i = 0; i < segments.length; i++) {
//         const segment = segments[i];
//         if (this.isValidPipeRunFormat(segment)) {
//           return { pipeRun: segment, pipeline: i > 0 ? segments[i - 1] : null };
//         }
//       }
//       return { pipeRun: null, pipeline: null };
//     },

//     getAvailableAttributes() {
//       if (Object.keys(this.dataStore).length === 0) {
//         return [];
//       }

//       const allAttributes = new Set();
      
//       for (const [id, attributes] of Object.entries(this.dataStore)) {
//         Object.keys(attributes).forEach(attr => allAttributes.add(attr));
//       }

//       return Array.from(allAttributes).sort();
//     },

//     startLoadingAnimation() {
//       this.isLoading = true;

//       this.messages.push({
//         text: 'ИИ-помощник думает',
//         type: 'assistant',
//         isLoading: true,
//         loadingId: Date.now()
//       });

//       let dotCount = 0;
//       this.loadingInterval = setInterval(() => {
//         dotCount = (dotCount + 1) % 4;
//         const dots = '.'.repeat(dotCount);
//         const lastMsg = this.messages[this.messages.length - 1];
//         if (lastMsg && lastMsg.isLoading) {
//           lastMsg.text = `ИИ-помощник думает${dots}`;
//         } else {
//         }
//       }, 500);
//     },

//     stopLoadingAnimation() {
//       this.isLoading = false;
//       if (this.loadingInterval) {
//         clearInterval(this.loadingInterval);
//         this.loadingInterval = null;
//       }
//       this.messages = this.messages.filter(msg => !msg.isLoading);
//     },

//     cancelRequest() {
//       if (this.abortController) {
//         this.abortController.abort();
//         this.abortController = null;
//       }
//       this.stopLoadingAnimation();
//       this.messages.push({
//         text: 'Запрос отменён пользователем',
//         type: 'assistant',
//         isCancel: true,
//       });
//     }
//   }
// }
// </script>

// <style>
// @font-face {
//   font-family: 'GPN_DIN Condensed Bold';
//   src: url('@/assets/fonts/gpn_din-condensed-bold.ttf') format('truetype');
//   font-weight: bold;
//   font-style: normal;
//   font-display: swap;
// }

// * {
//   margin: 0;
//   padding: 0;
//   box-sizing: border-box;
// }

// .ai_chat_bim {
//   display: flex;
//   flex-direction: column;
//   align-items: center;
//   height: 100%;
//   width: 100%;
//   background-color: #f2f2f2;
//   color: white;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .header {
//   display: flex;
//   justify-content: center;
//   flex-direction: row;
//   width: 100%;
//   height: 30px;
//   background: rgba(70, 36, 103, 0.81);
//   color: #f2f2f2;
// }

// .indicators {
//   height: calc(10% - 10px);
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .bim-main {
//   height: calc(80% - 15px);
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
//   overflow: auto;
// }

// .bim-send_messages {
//   height: calc(10% - 15px);
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
//   border-top: none;
// }

// .bim-input {
//   height: 100%;
//   width: 90%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .bim-send {
//   height: 100%;
//   width: 10%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   align-items: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .bim-settings {
//   height: 10%;
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
//   border-top: none;
// }

// .bim-settings h2 {
//   font-family: 'GPN_DIN Condensed Bold', Arial, sans-serif;
//   font-size: 14px;
//   color: #333;
//   margin: 5px 0;
//   padding-left: 5px;
// }

// .configuration {
//   height: 100%;
//   width: 50%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: space-between;
//   align-items: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .mode {
//   height: 100%;
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: space-between;
//   align-items: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .button {
//   margin: 5px;
//   width: 90%;
//   height: 90%;
//   background-color: #76528a;
//   border: 0px;
//   font-size: 1.1vw;
//   cursor: pointer;
//   transition: all 0.3s ease;
//   text-align: center;
//   appearance: none;
//   color: #ffffff;
// }

// .button span {
//   flex: 1;
//   text-align: center;
// }

// .button:active{
//   background: linear-gradient(to bottom, #edebee, #a89eb5);
// }

// .button:hover{
//   box-shadow: 5px 5px 7px #770c67
// }

// .bim-chat-history {
//   width: 100%;
//   height: 100%;
//   overflow-y: auto;
//   padding: 20px;
//   display: flex;
//   flex-direction: column;
//   gap: 15px;
// }

// .bim-message {
//   display: flex;
//   width: 100%;
// }

// .bim-message.user {
//   justify-content: flex-end;
// }

// .bim-message.assistant {
//   justify-content: flex-start;
// }

// .bim-message.error {
//   justify-content: flex-start;
// }





// .bim-message-bubble {
//   display: flex;
//   flex-direction: column;
//   white-space: pre-line;
//   word-break: break-word;
//   user-select: text;
//   max-width: 70%;
//   padding: 12px 18px;
//   border-radius: 18px;
//   font-size: 14px;
//   line-height: 1.5;
//   box-shadow: 0 2px 5px rgba(0,0,0,0.1);
// }

// .bim-message-bubble p {
//   margin: 0 0 8px 0;
//   width: 100%;
// }

// .message-actions {
//   display: flex;
//   flex-direction: row;
//   justify-content: flex-end;
//   width: 100%;
//   gap: 8px;
// }

// .copy-bttn, .action-bttn {
//   background: transparent;
//   border: none;
//   padding: 4px 8px;
//   cursor: pointer;
//   font-size: 12px;
//   opacity: 0.5;
//   border-radius: 4px;
//   transition: all 0.2s ease;
// }

// .copy-bttn:hover, .action-bttn:hover {
//   opacity: 1;
//   background-color: rgba(0,0,0,0.1);
// }

// .action-bttn {
//   color: #4caf50;
// }

// .cancel-bttn {
//   background: transparent;
//   border: none;
//   padding: 4px 8px;
//   cursor: pointer;
//   font-size: 12px;
//   opacity: 0.7;
//   border-radius: 4px;
//   transition: all 0.2s ease;
//   color: #dc3545;
// }

// .cancel-bttn:hover {
//   opacity: 1;
//   background-color: rgba(220, 53, 69, 0.1);
// }





// .bim-message.user .bim-message-bubble {
//   background: #76528a;
//   color: white;
//   border-bottom-right-radius: 4px;
// }

// .bim-message.assistant .bim-message-bubble {
//   background: white;
//   color: #333;
//   border-bottom-left-radius: 4px;
// }

// .bim-message.error .bim-message-bubble {
//   background: #f8d7da;
//   color: #721c24;
//   border-radius: 8px;
//   text-align: center;
// }

// h1 {
//   font-family: 'GPN_DIN Condensed Bold', Arial, sans-serif;
//   font-style: normal;
//   font-weight: 700;
//   font-size: 24px;
//   line-height: 120%;
//   display: flex;
//   align-items: center;
//   text-align: center;
//   color: #FFFFFF;
// }

// .selector {
//   height: 10%;
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: space-between;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .styled-select {
//   width: 50%;
//   height: 90%;
//   margin: 5px;
// }

// .styled-select select {
//   width: 100%;
//   height: 100%;
//   background-color: #76528a;
//   font-size: 1.0vw;
//   cursor: pointer;
//   transition: all 0.3s ease;
//   text-align: center;
//   appearance: none;
//   padding-right: 15px;
//   color: #ffffff;
//   background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fff'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
//   background-repeat: no-repeat;
//   background-position: right 15px center;
//   background-size: 16px;
//   text-overflow: ellipsis;
// }

// .styled-select select:focus {
//   outline: none;
//   border-color: rgba(70, 36, 103, 0.81);
// }

// .styled-select select:hover {
//   border-color: rgba(70, 36, 103, 0.81);
// }
// </style>


//-------------------------------------------------------------------


// <template>
//   <div class = "ai_chat_bim">
//     <div class="header">
//       <h1> Чат с помощником </h1>
//     </div>
//     <div class = "bim-main">
//       <div class="bim-chat-history">
//         <div v-for="(msg, index) in messages" :key="index" 
//           :class="['bim-message', msg.type]">
//           <div class="bim-message-bubble">
//             <p>{{ msg.text }}</p>
//             <div class="message-actions">
//               <button 
//                 class="copy-bttn" 
//                 @click="copyMessage(msg.text)">
//                 📋
//               </button>
//               <button 
//                 v-if="msg.type === 'assistant' && !msg.isLoading && !msg.isCancel"
//                 class="action-bttn" 
//                 @click="makeAction(msg.text)">
//                 ▶
//               </button>
//               <button v-if="msg.isLoading" class="cancel-bttn" @click="cancelRequest">✕</button>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//     <div class = "bim-send_messages">
//       <input type = "text" class="bim-input" placeholder = "Введите запрос" v-model="question" @keyup.enter="sendMessage">
//       <div class = "bim-send">
//         <button class = "button" @click="sendMessage"> ↑ </button>
//       </div>
//     </div>
//     <div class = "bim-settings">
//       <div class="mode">
//         <h2>Режим:</h2>
//           <div class="styled-select" @change="changeMode($event.target.value)">
//             <select>
//               <option value="Thinking"> Thinking </option>
//               <option value="Instance"> Instance </option>
//             </select>
//           </div>
//       </div>
//     </div>
//   </div>
// </template>

// <script>

// export default {
//   props: {
//     viewer: Object,
//     objectsRepository: Object,
//     bimFeatures: Object,
//     extension: Object,
//     excelData: Object,
//   },
//   data() {
//     return {
//       question: '',
//       ask: '',
//       messages: [],
//       configuration: 'Search',
//       mode: 'Thinking',
//       dataStore: {},
//       dataStoreByFeatures: {},
//       geometry: {},
//       availableAttrs: [],
//       availableGroups: [], 
//       availablePropertiesByGroup: {},
//       isLoading: false,
//       loadingDots: '',
//       loadingInterval: null,
//       abortController: null,
//       isLoadingModel: false,
//       isCancelLoading: false
//     }
//   },
//   mounted() {
//     //this.loadModel();
//   },
//   methods: {

//     changeConfiguration(value) {
//       this.configuration  = value
//     },
    
//     changeMode(value) {
//       this.mode  = value
//     },

//     copyMessage(text) {
//       const textarea = document.createElement('textarea');
//       textarea.value = text;
//       textarea.style.position = 'fixed';
//       textarea.style.top = '-9999px';
//       textarea.style.left = '-9999px';
//       document.body.appendChild(textarea);
      
//       textarea.select();
//       textarea.setSelectionRange(0, textarea.value.length);
      
//       try {
//         document.execCommand('copy');
//       } catch (err) {
//         console.error('❌ Ошибка:', err);
//       }
      
//       document.body.removeChild(textarea);
//     },

//     async sendMessage() {
//       const userMessage = this.question;

//       if (!userMessage.trim()) return;

//       if (this.abortController) {
//         this.abortController.abort();
//       }

//       this.abortController = new AbortController();

//       this.question = '';
//       this.messages.push({ text: userMessage, type: 'user' }); 

//       this.startLoadingAnimation();

//       try {
//         const response = await this.askLLMWithTools(userMessage, this.abortController.signal);
//         const message = response.choices[0].message;

//         if (message.tool_calls && message.tool_calls.length > 0) {
//           for (const toolCall of message.tool_calls) {
//             if (toolCall.function.name === 'searchElements') {

//               const params = JSON.parse(toolCall.function.arguments);
//               const result = await this.searchElements(params);

//               // if (result.ids.length > 0 && this.viewer && this.viewer.model) {
//               //   try {
//               //     this.viewer.model.clearColors();
//               //     let colored = 0;
//               //     for (const id of result.ids) {
//               //       try {
//               //         this.viewer.model.setColor(id, 0, 255, 0, 255);
//               //         colored++;
//               //       } catch(e) {}
//               //     }
//               //     console.log(`✅ Подсвечено ${colored} элементов`);
//               //   } catch(e) {
//               //     console.warn('Ошибка подсветки:', e);
//               //   }
//               // }
//               this.stopLoadingAnimation();
//               this.messages.push({
//                 text: result.message,
//                 type: 'assistant'
//               });
//             } else if (toolCall.function.name === 'buildReport') {
//               const params = JSON.parse(toolCall.function.arguments);
//               const result = await this.buildReport(params);
              
//               this.stopLoadingAnimation();
//               this.messages.push({
//                 text: result.message,
//                 type: 'assistant',
//               });
//             }
//           }
//         } else {
//           this.stopLoadingAnimation();
//           this.messages.push({
//             text: message.content || 'Не удалось обработать запрос',
//             type: 'assistant'
//           });
//         }
//       } catch (error) {
//         if (error.name === 'AbortError') {
//           return;
//         }
//         console.error('Ошибка в sendMessage:', error);
//         this.stopLoadingAnimation();
//         this.messages.push({
//           text: `Ошибка: ${error.message}`,
//           type: 'error'
//         });
//       } finally {
//         this.abortController = null;
//       }
//     },

//     async loadModel() {
//       if (Object.keys(this.dataStore).length && !this.isCancelLoading) {
//         return
//       }
//       this.dataStore = {}
//       this.loadingProgress = 0;
//       this.isCancelLoading = false;
//       const model = this.viewer.model;
//       const visible = model.getVisibleElements();
//       const allIds = [];
//       for (const part of visible) {
//         if (part.elementIds && part.elementIds.length) {
//           allIds.push(...part.elementIds);
//         }
//       }
//       for (let i = 0; i < allIds.length; i++) {
//         if (this.isCancelLoading) {
//           return
//         }
//         this.messages[this.messages.length-1].text = `Идёт загрузка данных модели. Загружено: ${Math.round((i+1)/allIds.length*100)} %`;
//         const elId = allIds[i];
//         try {
//           const propertySets = await model.getElementProperties(elId);
//           console.log(propertySets)
//           let attributes = {};
//           for (const set of propertySets) {
//             for (const prop of set.properties) {
//               const value = prop.value?.value ?? prop.value;
//               attributes[prop.name] = value;
//             }
//           }
//           if (!attributes['PipeRun'] && attributes['System Path']) {
//             const result = this.extractFromSystemPath(attributes['System Path'])
//             const pipeline = result.pipeline;
//             const pipeRun = result.pipeRun;
//             const system_data = this.extractSystemAndSubsystem(pipeRun);
//             const system = system_data.system;
//             const subsystem = system_data.subsystem;
//             const diameter = system_data.diameter;
//             this.dataStore[elId] = {
//               ...attributes,
//               PipeRun: pipeRun,
//               Pipeline: pipeline,
//               System: system,
//               Subsystem: subsystem,
//               Diam: diameter
//             };
//             this.dataStoreByFeatures[elId] = propertySets
//             this.dataStoreByFeatures[elId]['Smart Plant 3D'] = {
//               ...this.dataStoreByFeatures[elId]['Smart Plant 3D'],
//               PipeRun: pipeRun,
//               Pipeline: pipeline,
//               System: system,
//               Subsystem: subsystem,
//               Diam: diameter
//             }
//             this.geometry[elId] = []
//             if (attributes["REPRESENTATION_STATUS"] == 'SUCCESS') {
//               this.geometry[elId].push(elId)
//             } else {
//               let flag = true;
//               let geometries = 1;
//               while (flag) {
//                 const geometrySets = await model.getElementProperties(allIds[i+geometries]);
//                 let geometryAttributes = {};
//                 for (const set of geometrySets) {
//                   for (const prop of set.properties) {
//                     const value = prop.value?.value ?? prop.value;
//                     geometryAttributes[prop.name] = value;
//                   }
//                 }
//                 if (allIds[i+geometries] && geometryAttributes.REPRESENTATION_STATUS == 'SUCCESS') {
//                   this.geometry[elId].push(allIds[i+geometries]);
//                 }
//                 else {
//                   flag = false;
//                 }
//                 geometries += 1;
//               }
//             }
//           } else  if (attributes['System Path']) {
//             const system_data = this.extractSystemAndSubsystem(attributes['PipeRun']);
//             const system = system_data.system;
//             const subsystem = system_data.subsystem;
//             const diameter = system_data.diameter;
//             this.dataStore[elId] = {
//               ...attributes,
//               System: system,
//               Subsystem: subsystem,
//               Diam: diameter
//             };
//             this.dataStoreByFeatures[elId] = propertySets
//             this.dataStoreByFeatures[elId]['Smart Plant 3D'] = {
//               ...this.dataStoreByFeatures[elId]['Smart Plant 3D'],
//               System: system,
//               Subsystem: subsystem,
//               Diam: diameter
//             }
//             this.geometry[elId] = []
//             if (attributes["REPRESENTATION_STATUS"] == 'SUCCESS') {
//               this.geometry[elId].push(elId)
//             } else {
//               let flag = true;
//               let geometries = 1;
//               while (flag) {
//                 const geometrySets = await model.getElementProperties(allIds[i+geometries]);
//                 let geometryAttributes = {};
//                 for (const set of geometrySets) {
//                   for (const prop of set.properties) {
//                     const value = prop.value?.value ?? prop.value;
//                     geometryAttributes[prop.name] = value;
//                   }
//                 }
//                 if (allIds[i+geometries] && geometryAttributes.REPRESENTATION_STATUS == 'SUCCESS' && !geometryAttributes['System Path']) {
//                   this.geometry[elId].push(allIds[i+geometries]);
//                 }
//                 else {
//                   flag = false;
//                 }
//                 geometries += 1;
//               }
//             }
//           }
//         } catch (e) {
//           console.warn(`Ошибка для ${elId}:`, e);
//         }
//         this.$emit('loading-progress', this.loadingProgress);
//         console.log(this.geometry, this.dataStore)
//         this.availableAttrs = this.getAvailableAttributes();
//         this.collectAvailableGroups();
//         //this.availableAttrsProperties = this.getAvailableAttributesWithProperties();
//       }
//     },

//     async askLLMWithTools(userMessage, signal) {
//       await this.loadModel();
//       const tools = [
//         {
//           type: "function",
//           function: {
//             name: "searchElements",
//             description: "Поиск элементов в 3D-модели по атрибутам. Возвращает список ID найденных элементов и их количество.",
//             parameters: {
//               type: "object",
//               properties: {
//                 attribute: {
//                   type: "string",
//                   description: `Атрибут для поиска. Доступные обычные атрибуты: ${this.availableAttrs.slice(0).join(', ')}. Доступные групповые атрибуты: ${this.getAvailableAttributesWithProperties().slice(0).join(', ')}`,
//                 },
//                 operator: {
//                   type: "string",
//                   description: "Оператор сравнения. Для строк: contains (содержит), equals (равно). Для чисел: > (больше), < (меньше), >= (больше или равно), <= (меньше или равно), equals (равно)",
//                   enum: ["contains", "equals", ">", "<", ">=", "<="]
//                 },
//                 value: {
//                   type: "string",
//                   description: "Значение для поиска. Для чисел можно передавать цифры (например, 100), для строк — текст (например, Pipe)."
//                 }
//               },
//               required: ["attribute", "operator", "value"]
//             }
//           }
//         },
//         {
//           type: "function",
//           function: {
//             name: "buildReport",
//             description: "Построить отчёт по элементам модели. Позволяет задать фильтры, выбрать колонки и добавить вычисляемые колонки (например, объём трубы).",
//             parameters: {
//               type: "object",
//               properties: {
//                 filters: {
//                   type: "array",
//                   description: "Условия фильтрации (какие элементы включить в отчёт)",
//                   items: {
//                     type: "object",
//                     properties: {
//                       attribute: { type: "string" },
//                       operator: { type: "string" },
//                       value: { type: "string" }
//                     },
//                     required: ["attribute", "operator", "value"]
//                   }
//                 },
//                 columns: {
//                   type: "array",
//                   description: "Список колонок для отображения. Доступные поля",
//                   enum: this.availableAttrs,
//                   items: {
//                     type: "object",
//                     properties: {
//                       field: { type: "string" },
//                       label: { type: "string" }
//                     },
//                     required: ["field", "label"]
//                   }
//                 },
//                 calculatedColumns: {
//                   type: "array",
//                   description: "Вычисляемые колонки. Поддерживается formula: 'volume' (объём трубы по диаметру и длине)",
//                   items: {
//                     type: "object",
//                     properties: {
//                       name: { type: "string" },
//                       formula: { type: "string", enum: ["volume"] }
//                     }
//                   }
//                 },
//                 includeTotals: {
//                   type: "boolean",
//                   description: "Показывать итоговую строку",
//                   default: true
//                 }
//               },
//               required: ["filters", "columns"]
//             }
//           }
//         }
//       ];
//       const endpoint = this.mode === 'Thinking' 
//         ? 'https://360pilot.ru:5546/oss/v1/chat/completions'
//         : 'https://360pilot.ru:5546/qwen/v1/chat/completions';
      
//       const modelName = this.mode === 'Thinking' ? 'gpt-oss-20b' : 'qwen3.6-30b-A3B';
//       const systemPrompt = `
//       Ты помощник по работе с 3D-моделью трубопроводов.

//       Доступные функции:
//       1. searchElements - поиск по обычным атрибутам (Name, Type, System, Subsystem, PipeRun, Diam, Length и т.д.)
//       2. buildReport - построение отчёта

//       Доступные атрибуты в текущей модели (используй ТОЛЬКО их):
//       ${this.availableAttrs.slice(0, 40).join(', ')}

//       ВАЖНЫЕ ПРАВИЛА:
//       ВАЖНЫЕ ПРАВИЛА:
//       1. Используй ТОЛЬКО атрибуты из списка выше
//       2. Если пользователь указал атрибут, которого нет в списке, НЕ вызывай функцию, а сообщи об этом пользователю
//       3. Если пользователь написал русскими буквами (например "диаметр") — сопоставь с правильным атрибутом из списка (например "Diam")
//       4. Если пользователь написал с опечаткой (например "Nam") — сообщи об этом пользователю
//       5. Если пользователь ЯВНО указал группу свойств в запросе (например "[Smart Plant 3D]MaterialDescription" или "[Common_Properties]GLOBAL_ID" или "из группы Material свойство Name"), передавай атрибут С ГРУППОЙ в таком формате [Common_Properties]GLOBAL_ID
//       6. Если пользователь НЕ указал группу свойств, передавай атрибут БЕЗ ГРУППЫ (просто имя атрибута)

//       Соответствия русских слов атрибутам:
//       - "имя", "название" → Name
//       - "материал" → NAME
//       - "тип" → Type
//       - "диаметр" → Diam
//       - "вес" → Dry Weight
//       - "длина" → Length
//       - "система" → System
//       - "подсистема" → Subsystem
//       - "трубопровод" → PipeRun
//       - "линия" → Pipeline

//       Правила:
//       - Для поиска используй searchElements
//       - Если пользователь 
//       - Для отчёта используй buildReport. Если пользователь просит "отчёт", "таблицу", "статистику" — вызывай buildReport
//       - В buildReport нужно указать filters, columns, опционально calculatedColumns (например, для объёма)

//       Примеры правильных вызовов:
//       - "найди все трубы" → searchElements({ attribute: "NAME", operator: "contains", value: "Pipe" })
//       - "найди элементы из стали" → searchElements({ attribute: "Name", operator: "contains", value: "STEEL" })
//       - "найди с диаметром больше 100" → searchElements({ attribute: "Diam", operator: ">", value: 100 })
//       - "найди в группе свойств Material свойство Name содержит STEEL" → searchElements({ attribute: "[\"Material\"]Name", operator: "contains", value: "STEEL" })
//       - "сделай отчёт по трубам с колонками имя, длина, диаметр" → buildReport({ 
//           filters: [{ attribute: "Name", operator: "contains", value: "Pipe" }],
//           columns: [
//             { field: "Name", label: "Имя" },
//             { field: "Length", label: "Длина, м" },
//             { field: "Diam", label: "Диаметр" }
//           ]
//         })
//       - "отчёт по фланцам с объёмом" → buildReport({
//         filters: [{ attribute: "Type", operator: "contains", value: "Flange" }],
//         columns: [{ field: "Name", label: "Имя" }],
//         calculatedColumns: [{ name: "Объём, м³", formula: "volume" }]
//       })


//       Если пользователь ввёл атрибут, которого нет в списке, ответь так:
//       "Атрибут 'XXX' не найден в модели. Доступные атрибуты: Name, Type, PipeRun, System, Subsystem, Diam, Dry Weight, Length... Пожалуйста, уточните запрос."
//       `;

//       const response = await fetch(endpoint, {
//         method: 'POST',
//         headers: {
//           'Authorization': 'Bearer @r6|zzN1B?270{O0xn?JkCtWjTpi~Z',
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//           model: modelName,
//           messages: [
//             { role: 'system', content: systemPrompt },
//             { role: 'user', content: userMessage }
//           ],
//           tools: tools,
//           tool_choice: 'auto',
//           temperature: 0.7
//         }),
//         signal: signal
//       });
//       return await response.json();
//     },

//     // async searchElements(params) {
//     //   const attribute = params.attribute;      
//     //   const operator = params.operator;        
//     //   const searchValue = params.value;      
//     //   const foundIds = [];
//     //   for (const [elementId, attributes] of Object.entries(this.dataStore)) {
//     //     let attrValue = attributes[attribute];
//     //     if (!attrValue) continue;
//     //     let isMatch = false;
//     //     const isNumericSearch = !isNaN(parseFloat(searchValue)) && isFinite(searchValue);
//     //     if (isNumericSearch) {
//     //       const cleanValue = String(attrValue).replace(/[^0-9.-]/g, '');
//     //       const numAttr = parseFloat(cleanValue);
//     //       const numSearch = parseFloat(searchValue);
          
//     //       if (isNaN(numAttr)) {
//     //         continue;
//     //       }
//     //       switch (operator) {
//     //         case '>': isMatch = numAttr > numSearch; break;
//     //         case '<': isMatch = numAttr < numSearch; break;
//     //         case '>=': isMatch = numAttr >= numSearch; break;
//     //         case '<=': isMatch = numAttr <= numSearch; break;
//     //         case 'equals':
//     //         case '=':
//     //           isMatch = Math.abs(numAttr - numSearch) < 0.001;
//     //           break;
//     //         default:
//     //           const valueStr = String(attrValue).toLowerCase();
//     //           const searchStr = String(searchValue).toLowerCase();
//     //           isMatch = valueStr.includes(searchStr);
//     //       }
//     //     } else {
//     //       const valueStr = String(attrValue).toLowerCase();
//     //       const searchStr = String(searchValue).toLowerCase();
//     //       switch (operator) {
//     //         case 'contains':
//     //           isMatch = valueStr.includes(searchStr);
//     //           break;
//     //         case 'equals':
//     //           isMatch = valueStr === searchStr;
//     //           break;
//     //         case 'starts_with':
//     //           isMatch = valueStr.startsWith(searchStr);
//     //           break;
//     //         case 'ends_with':
//     //           isMatch = valueStr.endsWith(searchStr);
//     //           break;
//     //         default:
//     //           isMatch = valueStr.includes(searchStr);
//     //       }
//     //     }
//     //     if (isMatch) {
//     //       foundIds.push(elementId);
//     //     }
//     //   }
//     //   console.log(`✅ Найдено ${foundIds.length} элементов`);
//     //   this._lastSearchResult = {
//     //     ids: foundIds,
//     //     count: foundIds.length,
//     //     params: params
//     //   };
//     //   return {
//     //     ids: foundIds,
//     //     count: foundIds.length,
//     //     message: `Найдено ${foundIds.length} элементов по критерию: ${attribute} ${operator} "${searchValue}"`
//     //   };
//     // },

//     async searchElements(params) {
//   const attribute = params.attribute;
//   const operator = params.operator;
//   const searchValue = params.value;
//   const foundIds = [];
  
//   // Проверяем, есть ли группа свойств
//   const groupMatch = attribute.match(/^\[(.+?)\](.+)$/);
//   const useGroup = groupMatch !== null;
//   let groupName = null;
//   let propertyName = attribute;
  
//   if (useGroup) {
//     groupName = groupMatch[1];
//     propertyName = groupMatch[2];
//     console.log(`🔍 Поиск по группе: "${groupName}", свойству: "${propertyName}"`);
//   } else {
//     console.log(`🔍 Поиск по обычному атрибуту: "${attribute}"`);
//   }
  
//   for (const [elementId, attributes] of Object.entries(this.dataStore)) {
//     let attrValue = null;
    
//     if (useGroup) {
//       // Ищем в групповых свойствах
//       const features = this.dataStoreByFeatures[elementId];
//       if (features) {
//         const propertySet = features.find(ps => ps.name === groupName);
//         if (propertySet && propertySet.properties) {
//           const prop = propertySet.properties.find(p => p.name === propertyName);
//           if (prop) {
//             attrValue = prop.value?.value ?? prop.value;
//           }
//         }
//       }
//     } else {
//       // Ищем в обычных атрибутах
//       attrValue = attributes[attribute];
//     }
    
//     if (!attrValue) continue;
    
//     let isMatch = false;
//     const isNumericSearch = !isNaN(parseFloat(searchValue)) && isFinite(searchValue);
    
//     if (isNumericSearch) {
//       const cleanValue = String(attrValue).replace(/[^0-9.-]/g, '');
//       const numAttr = parseFloat(cleanValue);
//       const numSearch = parseFloat(searchValue);
      
//       if (isNaN(numAttr)) continue;
      
//       switch (operator) {
//         case '>': isMatch = numAttr > numSearch; break;
//         case '<': isMatch = numAttr < numSearch; break;
//         case '>=': isMatch = numAttr >= numSearch; break;
//         case '<=': isMatch = numAttr <= numSearch; break;
//         case 'equals': isMatch = Math.abs(numAttr - numSearch) < 0.001; break;
//         default: isMatch = String(attrValue).toLowerCase().includes(String(searchValue).toLowerCase());
//       }
//     } else {
//       const valueStr = String(attrValue).toLowerCase();
//       const searchStr = String(searchValue).toLowerCase();
//       switch (operator) {
//         case 'contains': isMatch = valueStr.includes(searchStr); break;
//         case 'equals': isMatch = valueStr === searchStr; break;
//         default: isMatch = valueStr.includes(searchStr);
//       }
//     }
    
//     if (isMatch) {
//       // Добавляем геометрические ID для подсветки
//       const geomIds = this.geometry[elementId];
//       if (geomIds && geomIds.length > 0) {
//         for (const geomId of geomIds) {
//           if (!foundIds.includes(geomId)) {
//             foundIds.push(geomId);
//           }
//         }
//       } else {
//         if (!foundIds.includes(elementId)) {
//           foundIds.push(elementId);
//         }
//       }
//     }
//   }
  
//   const displayAttribute = useGroup ? `[${groupName}]${propertyName}` : attribute;
//   console.log(`✅ Найдено ${foundIds.length} элементов по критерию: ${displayAttribute} ${operator} "${searchValue}"`);
  
//   this._lastSearchResult = {
//     ids: foundIds,
//     count: foundIds.length,
//     params: params
//   };
  
//   return {
//     ids: foundIds,
//     count: foundIds.length,
//     message: `Найдено ${foundIds.length} элементов по критерию: ${displayAttribute} ${operator} "${searchValue}"`
//   };
// },

//     async searchElementsWithProperties(params) {
//       console.log('this.searchElementsWithProperties called')
//       let attributePath = params.attribute;
//       let groupName = null;
//       let propertyName = attributePath;
      
//       const groupMatch = attributePath.match(/^\[(.+?)\](.+)$/);
//       if (groupMatch) {
//         groupName = groupMatch[1];
//         propertyName = groupMatch[2];
//       }
      
//       const operator = params.operator;
//       const searchValue = params.value;
//       const foundIds = [];
      
//       for (const [elementId, attributes] of Object.entries(this.dataStore)) {
//         let attrValue = null;
        
//         if (groupName && this.dataStoreByFeatures[elementId]) {
//           const propertySet = this.dataStoreByFeatures[elementId].find(
//             ps => ps.name === groupName
//           );
//           if (propertySet && propertySet.properties) {
//             const prop = propertySet.properties.find(p => p.name === propertyName);
//             if (prop) {
//               attrValue = prop.value?.value ?? prop.value;
//             }
//           }
//         } else {
//           attrValue = attributes[attributePath];
//         }
        
//         if (!attrValue) continue;
        
//         let isMatch = false;
//         const isNumericSearch = !isNaN(parseFloat(searchValue)) && isFinite(searchValue);
        
//         if (isNumericSearch) {
//           const cleanValue = String(attrValue).replace(/[^0-9.-]/g, '');
//           const numAttr = parseFloat(cleanValue);
//           const numSearch = parseFloat(searchValue);
          
//           if (isNaN(numAttr)) continue;
          
//           switch (operator) {
//             case '>': isMatch = numAttr > numSearch; break;
//             case '<': isMatch = numAttr < numSearch; break;
//             case '>=': isMatch = numAttr >= numSearch; break;
//             case '<=': isMatch = numAttr <= numSearch; break;
//             case 'equals': isMatch = Math.abs(numAttr - numSearch) < 0.001; break;
//             default:
//               isMatch = String(attrValue).toLowerCase().includes(String(searchValue).toLowerCase());
//           }
//         } else {
//           const valueStr = String(attrValue).toLowerCase();
//           const searchStr = String(searchValue).toLowerCase();
//           switch (operator) {
//             case 'contains':
//               isMatch = valueStr.includes(searchStr);
//               break;
//             case 'equals':
//               isMatch = valueStr === searchStr;
//               break;
//             default:
//               isMatch = valueStr.includes(searchStr);
//           }
//         }
        
//         if (isMatch) {
//           foundIds.push(elementId);
//         }
//       }
      
//       console.log(`Найдено ${foundIds.length} элементов`);
//       this._lastSearchResult = {
//         ids: foundIds,
//         count: foundIds.length,
//         params: params
//       };
      
//       const displayAttribute = groupName ? `[${groupName}]${propertyName}` : attributePath;
//       return {
//         ids: foundIds,
//         count: foundIds.length,
//         message: `Найдено ${foundIds.length} элементов по критерию: ${displayAttribute} ${operator} "${searchValue}"`
//       };
//     },

//     async buildReport(params) {
//       const filters = params.filters || [];
//       const columns = params.columns || [];
//       const calculatedColumns = params.calculatedColumns || [];
//       const includeTotals = params.includeTotals !== false;
      
//       const foundIds = [];
//       for (const [elementId, attributes] of Object.entries(this.dataStore)) {
//         let matched = true;
//         for (const filter of filters) {
//           const attrValue = attributes[filter.attribute];
//           if (!attrValue) {
//             matched = false;
//             break;
//           }
          
//           const isNumeric = !isNaN(parseFloat(filter.value)) && isFinite(filter.value);
//           if (isNumeric) {
//             const cleanValue = String(attrValue).replace(/[^0-9.-]/g, '');
//             const numAttr = parseFloat(cleanValue);
//             const numSearch = parseFloat(filter.value);
            
//             switch (filter.operator) {
//               case '>': matched = numAttr > numSearch; break;
//               case '<': matched = numAttr < numSearch; break;
//               case '>=': matched = numAttr >= numSearch; break;
//               case '<=': matched = numAttr <= numSearch; break;
//               case 'equals': matched = Math.abs(numAttr - numSearch) < 0.001; break;
//               default: matched = false;
//             }
//           } else {
//             const valueStr = String(attrValue).toLowerCase();
//             const searchStr = String(filter.value).toLowerCase();
//             switch (filter.operator) {
//               case 'contains': matched = valueStr.includes(searchStr); break;
//               case 'equals': matched = valueStr === searchStr; break;
//               default: matched = false;
//             }
//           }
//           if (!matched) break;
//         }
//         if (matched) foundIds.push(elementId);
//       }
      
//       if (foundIds.length === 0) {
//         return { message: 'Нет данных' };
//       }
      
//       this._lastReportParams = {
//         filters,
//         columns,
//         calculatedColumns,
//         includeTotals,
//         foundIds,
//         totalCount: foundIds.length
//       };
      
//       return {
//         message: `Отчёт готов. Найдено ${foundIds.length} элементов`
//       };
//     },

//     async makeAction(messageText) {

//       if (this._lastReportParams) {
//         const params = this._lastReportParams;
//         const { columns, calculatedColumns, includeTotals, foundIds, totalCount } = params;
        
//         const rows = [];
//         const totals = {};
        
//         for (const id of foundIds.slice(0)) {
//           const attrs = this.dataStore[id];
//           const row = {};
          
//           for (const col of columns) {
//             let value = attrs[col.field];
//             if (col.field === 'Dry Weight') {
//               value = this.parseNumberValue(value);
//             } else if (col.field === 'Length' || col.field === 'Pass Length') {
//               value = this.parseNumberValue(value) / 1000;
//             }
//             row[col.label] = value || '-';
            
//             if (includeTotals && typeof value === 'number' && !isNaN(value)) {
//               totals[col.label] = (totals[col.label] || 0) + value;
//             }
//           }
          
//           for (const calc of calculatedColumns) {
//             let value = null;
//             if (calc.formula === 'volume') {
//               const diameterMm = this.parseNumberValue(attrs.Diam);
//               const diameter = diameterMm / 1000;
//               const length = this.parseNumberValue(attrs.Length || attrs['Pass Length']) / 1000;
//               if (diameter > 0 && length > 0) {
//                 const radius = diameter / 2;
//                 value = Math.PI * radius * radius * length;
//               }
//             }
//             row[calc.name] = value !== null ? value.toFixed(5) : '-';
//             if (includeTotals && value !== null && !isNaN(value)) {
//               totals[calc.name] = (totals[calc.name] || 0) + value;
//             }
//           }
          
//           rows.push(row);
//         }
        
//         const allColumns = [...columns.map(c => c.label), ...calculatedColumns.map(c => c.name)];
        
//         let html = `
//           <!DOCTYPE html>
//           <html>
//           <head>
//             <meta charset="utf-8">
//             <title>Отчёт ПНР</title>
//             <style>
//               body {
//                 font-family: 'Times New Roman', Arial, sans-serif;
//                 margin: 20px;
//                 font-size: 12px;
//                 color: #000000;
//               }
//               h1 {
//                 text-align: center;
//                 font-size: 18px;
//                 font-weight: bold;
//                 margin: 0 0 5px 0;
//                 color: #000000;
//               }
//               h2 {
//                 text-align: center;
//                 font-size: 14px;
//                 font-weight: normal;
//                 margin: 0 0 20px 0;
//                 color: #333333;
//               }
//               table {
//                 border-collapse: collapse;
//                 width: 100%;
//                 margin-top: 10px;
//               }
//               th, td {
//                 border: 1px solid #000000;
//                 padding: 8px;
//                 text-align: center;
//               }
//               th {
//                 background-color: #e0e0e0;
//                 color: #000000;
//                 font-weight: bold;
//               }
//               td {
//                 background-color: #ffffff;
//                 font-weight: normal;
//                 color: #000000;
//               }
//               .footer {
//                 margin-top: 30px;
//                 font-size: 10px;
//                 color: #666666;
//                 text-align: center;
//               }
//             </style>
//           </head>
//           <body>
//             <h1>Отчёт ПНР</h1>
//             <h2>Найдено элементов: ${totalCount}</h2>
//             <table>
//               <thead>
//                 <tr>
//         `;
        
//         for (const col of allColumns) {
//           html += `<th>${col}</th>`;
//         }
        
//         html += `</tr></thead><tbody>`;
        
//         for (const row of rows) {
//           html += `<tr>`;
//           for (const col of allColumns) {
//             html += `<td>${row[col]}</td>`;
//           }
//           html += `</tr>`;
//         }
        
//         html += `</tbody>`;
        
//         if (includeTotals && Object.keys(totals).length > 0) {
//           html += `<tfoot><tr style="background: #f0f0f0; font-weight: bold;">`;
//           for (const col of allColumns) {
//             const total = totals[col];
//             html += `<td>${total !== undefined ? total.toFixed(2) : ''}</td>`;
//           }
//           html += `</tr></tfoot>`;
//         }
        
//         html += `
//             </table>
//             <div class="footer">
//               Отчёт сгенерирован: ${new Date().toLocaleString()}
//             </div>
//           </body>
//           </html>
//         `;
        
//         const win = window.open();
//         win.document.write(html);
//         win.document.close();
//         win.print();
        
//         this._lastReportParams = null;
//       }
//       if (this._lastSearchResult) {
//         const result = this._lastSearchResult;

//         if (result.ids.length > 0 && this.viewer && this.viewer.model) {
//           try {
//             this.viewer.model.clearColors();
//             let colored = 0;
//             for (const id of result.ids) {
//               for (const geomId of this.geometry[id]) {
//                 try {
//                   this.viewer.model.setColor(geomId, 255, 0, 0, 255);
//                   colored++;
//                 } catch(e) {}
//               }
//             }
//             console.log(`Подсвечено ${colored} элементов`);
//           } catch(e) {
//             console.warn('Ошибка подсветки:', e);
//           }
//         }
//         this._lastSearchResult = null;
//         return;
//       }
//     },

//     parseNumberValue(value) {
//       if (!value) return 0;
//       if (typeof value === 'number') return value;
//       const cleaned = String(value).replace(/[^0-9.-]/g, '');
//       const num = parseFloat(cleaned);
//       return isNaN(num) ? 0 : num;
//     },
    
//     extractSystemAndSubsystem(pipeRun) {
//       if (!pipeRun) {
//         return { system: 'ND', subsystem: 'ND', diameter: '0' };
//       }
//       const parts = pipeRun.split('-');
//       if (parts.length < 3) {
//         return { system: 'ND', subsystem: 'ND', diameter: '0' };
//       }
//       let diameter = "0";
//       const code = parts[1];     
//       const number = parts[2];      
//       const suffix = parts[3];      
//       const system01Codes = [
//         "S", "BA", "AG", "FA", "FG", "A", "LA", "RA", 
//         "H", "GL", "ADH", "CHR", "FC"
//       ];
//       const pMatch = code.match(/^P(\d+)$/);
//       const isPCode = pMatch && parseInt(pMatch[1]) <= 100;
//       let system = 'ND';
//       let env = code;
//       if (system01Codes.includes(code) || isPCode) {
//         const section = number.substring(0, 3);
//         system = `01-${section}`;
//         diameter = section;
//       }
//       else if (["IA", "PA", "LI", "BFW", "LPBD", "MPBD", "HPBD", "W7", "DW", "LSS", "HS", "HC", "LS", "LC"].includes(code)) {
//         system = `02-${code}`;
//       }
//       else if (pipeRun.includes("CWI") || pipeRun.includes("CWRI")) {
//         system = "02-CWI/CWRI";
//         env = "CWI/CWRI";
//       }
//       else if (pipeRun.includes("HTWS") || pipeRun.includes("HTWR")) {
//         system = "02-HTWS/HTWR";
//         env = "HTWS/HTWR";
//       }
//       else if (["W19", "POW", "WF", "TA", "ASUE", "HV", "GT", "PZ"].includes(code)) {
//         system = `05-${code}`;
//       }
//       else if (["PR", "OD", "K1", "AR"].includes(code)) {
//         system = `06-${code}`;
//       }
//       else {
//         system = 'ND';
//       }
//       let subsystem = 'ND';
//       if (system !== 'ND') {
//         const section = number.substring(0, 3);
//         diameter = section;
//         if (system.startsWith('01-')) {
//           subsystem = `${system}-${env}`;
//         }
//         else {
//           const groupCode = system.substring(0, 2);
//           subsystem = `${groupCode}-${section}-${env}`;
//         }
//       }
//       return { system, subsystem, diameter };
//     },

//     isValidPipeRunFormat(str) {
//       const pattern = /^(\d{1,4})-([A-Z0-9]+)-([A-Z0-9]*\d+[A-Z0-9]*)(?:-([A-Z0-9]+))?(?:-([A-Z0-9]+))?$/i;
//       return pattern.test(str);
//     },

//     extractFromSystemPath(systemPath) {
//       const segments = systemPath.split(/[\\\/]/);
//       for (let i = 0; i < segments.length; i++) {
//         const segment = segments[i];
//         if (this.isValidPipeRunFormat(segment)) {
//           return { pipeRun: segment, pipeline: i > 0 ? segments[i - 1] : null };
//         }
//       }
//       return { pipeRun: null, pipeline: null };
//     },

//     getAvailableAttributes() {
//       if (Object.keys(this.dataStore).length === 0) {
//         return [];
//       }

//       const allAttributes = new Set();
      
//       for (const [id, attributes] of Object.entries(this.dataStore)) {
//         Object.keys(attributes).forEach(attr => allAttributes.add(attr));
//       }

//       return Array.from(allAttributes).sort();
//     },

//     collectAvailableGroups() {
//       const groups = new Set();
//       const propsByGroup = {};
      
//       for (const features of Object.values(this.dataStoreByFeatures)) {
//         for (const propertySet of features) {
//           const groupName = propertySet.name;
//           groups.add(groupName);
          
//           if (!propsByGroup[groupName]) {
//             propsByGroup[groupName] = new Set();
//           }
          
//           if (propertySet.properties) {
//             for (const prop of propertySet.properties) {
//               propsByGroup[groupName].add(prop.name);
//             }
//           }
//         }
//       }
      
//       this.availableGroups = Array.from(groups);
//       this.availablePropertiesByGroup = propsByGroup;
//     },

//     getAvailableAttributesWithProperties() {
//       const allAttributes = [];
      
//       for (const group of this.availableGroups) {
//         const props = this.availablePropertiesByGroup[group];
//         if (props) {
//           for (const prop of props) {
//             allAttributes.push(`[${group}]${prop}`);
//           }
//         }
//       }
      
//       return allAttributes.sort();
//     },

//     validateAttributesInQuery(userMessage) {
//       const availableAttrs = this.getAvailableAttributes();
      
//       const russianKeywords = ['имя', 'название', 'тип', 'вес', 'длина', 'диаметр', 'система'];
      
//       const foundAttributes = [];
//       const notFoundAttributes = [];
      
//       const words = userMessage.split(/\s+/);
      
//       for (const word of words) {
//         const cleanWord = word.replace(/[^\w]/g, '');
        
//         if (cleanWord.length < 2) continue;
//         if (russianKeywords.some(rus => rus.toLowerCase() === cleanWord.toLowerCase())) continue;
        
//         const matchedAttr = availableAttrs.find(attr => 
//           attr.toLowerCase() === cleanWord.toLowerCase()
//         );
        
//         if (matchedAttr) {
//           if (!foundAttributes.includes(matchedAttr)) {
//             foundAttributes.push(matchedAttr);
//           }
//         } else {
//           const hasLatin = /[a-zA-Z]/.test(cleanWord);
//           if (hasLatin && cleanWord.length > 2) {
//             const isUpperCase = cleanWord[0] === cleanWord[0].toUpperCase();
//             if (isUpperCase || cleanWord.length > 3) {
//               if (!notFoundAttributes.includes(cleanWord)) {
//                 notFoundAttributes.push(cleanWord);
//               }
//             }
//           }
//         }
//       }
      
//       return {
//         found: foundAttributes,
//         notFound: notFoundAttributes,
//         hasAttributes: foundAttributes.length > 0 || notFoundAttributes.length > 0
//       };
//     },

//     suggestCorrectAttribute(wrongAttr) {
//       const availableAttrs = this.getAvailableAttributes();
      
//       const suggestions = availableAttrs.filter(attr => 
//         attr.toLowerCase().startsWith(wrongAttr.toLowerCase().substring(0, 3))
//       );
      
//       return suggestions.slice(0, 3);
//     },

//     startLoadingAnimation() {
//       this.isLoading = true;

//       this.messages.push({
//         text: 'ИИ-помощник думает',
//         type: 'assistant',
//         isLoading: true,
//         loadingId: Date.now()
//       });

//       let dotCount = 0;
//       this.loadingInterval = setInterval(() => {
//         dotCount = (dotCount + 1) % 4;
//         const dots = '.'.repeat(dotCount);
//         const lastMsg = this.messages[this.messages.length - 1];
//         if (lastMsg && lastMsg.isLoading) {
//           lastMsg.text = `ИИ-помощник думает${dots}`;
//         } else {
//         }
//       }, 500);
//     },

//     stopLoadingAnimation() {
//       this.isLoading = false;
//       if (this.loadingInterval) {
//         clearInterval(this.loadingInterval);
//         this.loadingInterval = null;
//       }
//       this.messages = this.messages.filter(msg => !msg.isLoading);
//     },

//     cancelRequest() {
//       if (this.abortController) {
//         this.abortController.abort();
//         this.abortController = null;
//       }
//       this.isCancelLoading = true;
//       this.stopLoadingAnimation();
//       this.messages.push({
//         text: 'Запрос отменён пользователем',
//         type: 'assistant',
//         isCancel: true,
//       });
//     }
//   }
// }
// </script>

// <style>
// @font-face {
//   font-family: 'GPN_DIN Condensed Bold';
//   src: url('@/assets/fonts/gpn_din-condensed-bold.ttf') format('truetype');
//   font-weight: bold;
//   font-style: normal;
//   font-display: swap;
// }

// * {
//   margin: 0;
//   padding: 0;
//   box-sizing: border-box;
// }

// .ai_chat_bim {
//   display: flex;
//   flex-direction: column;
//   align-items: center;
//   height: 100%;
//   width: 100%;
//   background-color: #f2f2f2;
//   color: white;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .header {
//   display: flex;
//   justify-content: center;
//   flex-direction: row;
//   width: 100%;
//   height: 30px;
//   background: rgba(70, 36, 103, 0.81);
//   color: #f2f2f2;
// }

// .indicators {
//   height: calc(10% - 10px);
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .bim-main {
//   height: calc(80% - 15px);
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
//   overflow: auto;
// }

// .bim-send_messages {
//   height: calc(10% - 15px);
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
//   border-top: none;
// }

// .bim-input {
//   height: 100%;
//   width: 85%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .bim-send {
//   height: 100%;
//   width: 15%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: center;
//   align-items: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .bim-settings {
//   height: 10%;
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
//   border-top: none;
// }

// .bim-settings h2 {
//   font-family: 'GPN_DIN Condensed Bold', Arial, sans-serif;
//   font-size: 14px;
//   color: #333;
//   margin: 5px 0;
//   padding-left: 5px;
// }

// .configuration {
//   height: 100%;
//   width: 50%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: space-between;
//   align-items: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .mode {
//   height: 100%;
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: space-between;
//   align-items: center;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .button {
//   margin: 5px;
//   width: 90%;
//   height: 90%;
//   background-color: #76528a;
//   border-radius: 5px;
//   border: 0px;
//   font-size: 1.1vw;
//   cursor: pointer;
//   transition: all 0.3s ease;
//   text-align: center;
//   appearance: none;
//   color: #ffffff;
// }

// .button span {
//   flex: 1;
//   text-align: center;
// }

// .button:active{
//   background: linear-gradient(to bottom, #edebee, #a89eb5);
// }

// .button:hover{
//   box-shadow: 5px 5px 7px #770c67
// }

// .bim-chat-history {
//   width: 100%;
//   height: 100%;
//   overflow-y: auto;
//   padding: 20px;
//   display: flex;
//   flex-direction: column;
//   gap: 15px;
// }

// .bim-message {
//   display: flex;
//   width: 100%;
// }

// .bim-message.user {
//   justify-content: flex-end;
// }

// .bim-message.assistant {
//   justify-content: flex-start;
// }

// .bim-message.error {
//   justify-content: flex-start;
// }





// .bim-message-bubble {
//   display: flex;
//   flex-direction: column;
//   white-space: pre-line;
//   word-break: break-word;
//   user-select: text;
//   max-width: 70%;
//   padding: 12px 18px;
//   border-radius: 18px;
//   font-size: 14px;
//   line-height: 1.5;
//   box-shadow: 0 2px 5px rgba(0,0,0,0.1);
// }

// .bim-message-bubble p {
//   margin: 0 0 8px 0;
//   width: 100%;
// }

// .message-actions {
//   display: flex;
//   flex-direction: row;
//   justify-content: flex-end;
//   width: 100%;
//   gap: 8px;
// }

// .copy-bttn, .action-bttn {
//   background: transparent;
//   border: none;
//   padding: 4px 8px;
//   cursor: pointer;
//   font-size: 12px;
//   opacity: 0.5;
//   border-radius: 4px;
//   transition: all 0.2s ease;
// }

// .copy-bttn:hover, .action-bttn:hover {
//   opacity: 1;
//   background-color: rgba(0,0,0,0.1);
// }

// .action-bttn {
//   color: #4caf50;
// }

// .cancel-bttn {
//   background: transparent;
//   border: none;
//   padding: 4px 8px;
//   cursor: pointer;
//   font-size: 12px;
//   opacity: 0.7;
//   border-radius: 4px;
//   transition: all 0.2s ease;
//   color: #dc3545;
// }

// .cancel-bttn:hover {
//   opacity: 1;
//   background-color: rgba(220, 53, 69, 0.1);
// }





// .bim-message.user .bim-message-bubble {
//   background: #76528a;
//   color: white;
//   border-bottom-right-radius: 4px;
// }

// .bim-message.assistant .bim-message-bubble {
//   background: white;
//   color: #333;
//   border-bottom-left-radius: 4px;
// }

// .bim-message.error .bim-message-bubble {
//   background: #f8d7da;
//   color: #721c24;
//   border-radius: 8px;
//   text-align: center;
// }

// h1 {
//   font-family: 'GPN_DIN Condensed Bold', Arial, sans-serif;
//   font-style: normal;
//   font-weight: 700;
//   font-size: 24px;
//   line-height: 120%;
//   display: flex;
//   align-items: center;
//   text-align: center;
//   color: #FFFFFF;
// }

// .selector {
//   height: 10%;
//   width: 100%;
//   padding: 5px;
//   display: flex;
//   flex-direction: row;
//   justify-content: space-between;
//   background-color: #f2f2f2;
//   border: 1px solid rgba(70, 36, 103, 0.81);
// }

// .styled-select {
//   width: 50%;
//   height: 90%;
//   margin: 5px;
// }

// .styled-select select {
//   width: 100%;
//   height: 100%;
//   background-color: #76528a;
//   font-size: 1.0vw;
//   cursor: pointer;
//   transition: all 0.3s ease;
//   text-align: center;
//   appearance: none;
//   padding-right: 15px;
//   color: #ffffff;
//   background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fff'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
//   background-repeat: no-repeat;
//   background-position: right 15px center;
//   background-size: 16px;
//   text-overflow: ellipsis;
// }

// .styled-select select:focus {
//   outline: none;
//   border-color: rgba(70, 36, 103, 0.81);
// }

// .styled-select select:hover {
//   border-color: rgba(70, 36, 103, 0.81);
// }
// </style>


// <!-- async searchElements(params) {
//       const attribute = params.attribute;      
//       const operator = params.operator;        
//       const searchValue = params.value;      
//       const foundIds = [];
//       for (const [elementId, attributes] of Object.entries(this.dataStore)) {
//         let attrValue = attributes[attribute];
//         if (!attrValue) continue;
//         let isMatch = false;
//         const isNumericSearch = !isNaN(parseFloat(searchValue)) && isFinite(searchValue);
//         if (isNumericSearch) {
//           const cleanValue = String(attrValue).replace(/[^0-9.-]/g, '');
//           const numAttr = parseFloat(cleanValue);
//           const numSearch = parseFloat(searchValue);
          
//           if (isNaN(numAttr)) {
//             continue;
//           }
//           switch (operator) {
//             case '>': isMatch = numAttr > numSearch; break;
//             case '<': isMatch = numAttr < numSearch; break;
//             case '>=': isMatch = numAttr >= numSearch; break;
//             case '<=': isMatch = numAttr <= numSearch; break;
//             case 'equals':
//             case '=':
//               isMatch = Math.abs(numAttr - numSearch) < 0.001;
//               break;
//             default:
//               const valueStr = String(attrValue).toLowerCase();
//               const searchStr = String(searchValue).toLowerCase();
//               isMatch = valueStr.includes(searchStr);
//           }
//         } else {
//           const valueStr = String(attrValue).toLowerCase();
//           const searchStr = String(searchValue).toLowerCase();
//           switch (operator) {
//             case 'contains':
//               isMatch = valueStr.includes(searchStr);
//               break;
//             case 'equals':
//               isMatch = valueStr === searchStr;
//               break;
//             case 'starts_with':
//               isMatch = valueStr.startsWith(searchStr);
//               break;
//             case 'ends_with':
//               isMatch = valueStr.endsWith(searchStr);
//               break;
//             default:
//               isMatch = valueStr.includes(searchStr);
//           }
//         }
//         if (isMatch) {
//           foundIds.push(elementId);
//         }
//       }
//       console.log(`✅ Найдено ${foundIds.length} элементов`);
//       this._lastSearchResult = {
//         ids: foundIds,
//         count: foundIds.length,
//         params: params
//       };
//       return {
//         ids: foundIds,
//         count: foundIds.length,
//         message: `Найдено ${foundIds.length} элементов по критерию: ${attribute} ${operator} "${searchValue}"`
//       };
//     }, -->