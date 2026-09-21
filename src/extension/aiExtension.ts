import { createApp, type App as AppType } from 'vue';
import Interface from '../components/interface.vue';
import {
  BimRightPanelContext,
  IDisposable,
  IOpenspaceView,
  ITabs,
  ITabsBuilder,
} from '@pilotdev/pilot-web-sdk';

const RightPanelTabId = 'IHP_AI_Assistant_RightPanelTab';

// Провайдер команд приходит в initialize модуля (InjectionSource).
// Храним на уровне модуля, чтобы View мог его забрать без своего initialize
// (initialize на View ломает регистрацию иконки).
let sharedCommandBuilderProvider: unknown = null;

// Живёт на уровне модуля, а не компонента — переживает dispose()/unmount(),
// который Pilot вызывает при переключении на другую вкладку правой панели.
// Без этого история чата и contextId терялись при возврате на вкладку ИИ-помощника.
const sharedChatState: Record<string, unknown> = {};

const aiAssistantIcon =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2RjZGNkYiIHN0cm9rZS13aWR0aD0iMS43IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMiA4VjQiLz48cGF0aCBkPSJNOC41IDRIMTUuNSIvPjxyZWN0IHg9IjUiIHk9IjgiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjMiLz48cGF0aCBkPSJNOSA5LjVoLjAxIi8+PHBhdGggZD0iTTE1IDkuNWguMDEiLz48cGF0aCBkPSJNOSAxNGM0IDIuMiA2IDAgNiAwIi8+PHBhdGggZD0iTTUgMTNoLTMiLz48cGF0aCBkPSJNMjIgMTNoLTMiLz48L3N2Zz4=';

export class BimRightPanelTabs implements ITabs<BimRightPanelContext> {
  initialize(injectionSource: any): void {
    try {
      sharedCommandBuilderProvider = injectionSource?.commandBuilderProvider ?? null;
    } catch {
      sharedCommandBuilderProvider = null;
    }
  }

  build(builder: ITabsBuilder): void {
    builder
      .addItem(RightPanelTabId, 1)
      .withTitle('ИИ-помощник')
      .withIcon('ihp-ai-assistant-icon', aiAssistantIcon)
      .withViewId(RightPanelTabId);
  }
}

export class BimRightTabView
  implements IOpenspaceView<BimRightPanelContext>, IDisposable
{
  private _rootElement: HTMLElement | undefined;
  private _vueApp: AppType<Element> | undefined;
  private _vueInstance: any;
  private _mountedModelId: unknown;

  getViewId(): string {
    return RightPanelTabId;
  }

  getView(context: BimRightPanelContext): HTMLElement | undefined {
    // Если вкладку открыли для другого документа (другой modelId) — старый
    // инстанс со старым viewer/modelId переиспользовать нельзя, пересоздаём.
    if (this._vueApp && context?.modelId !== undefined && context.modelId !== this._mountedModelId) {
      this._destroyApp();
    }

    if (!this._rootElement) {
      this._rootElement = document.createElement('div');
      this._rootElement.style.width = '100%';
      this._rootElement.style.height = '100%';
      this._rootElement.style.boxSizing = 'border-box';
      this._rootElement.style.overflow = 'hidden';
    }

    if (!this._vueApp) {
      this._vueApp = createApp(Interface, {
        viewer: context.viewer,
        modelId: context.modelId,
        objectsRepository: this._getPilotService('IObjectsRepository'),
        bimFeatures: this._getPilotService('IBimFeatures'),
        rightPanelContext: context,
        commandBuilderProvider: sharedCommandBuilderProvider,
        chatStateStore: sharedChatState,
      });
      this._mountedModelId = context.modelId;

      this._vueInstance = this._vueApp.mount(this._rootElement);
    }

    // Скролл к последнему сообщению при каждом открытии вкладки — и при первом
    // монтировании, и при возврате на уже живой инстанс (см. dispose ниже).
    try {
      this._vueInstance?.onTabActivated?.();
    } catch {
      // не критично для отображения панели
    }

    return this._rootElement;
  }

  dispose(): void {
    // Pilot вызывает dispose()/getView() на КАЖДОЕ переключение вкладки правой
    // панели (например на "Инж проверок"), а не только при закрытии документа.
    // Раньше здесь уничтожался Vue-инстанс целиком — вместе с активными
    // таймерами запроса (requestTimer/loadingAnimation/feedbackWaitTimeout) и
    // стрим-поллингом коннектора: они оставались висеть orphan'ом в памяти
    // отмонтированного инстанса, а новый инстанс стартовал с нуля — отсюда
    // не идущий таймер, сломанный "Ход выполнения" и зависшее диагностическое
    // сообщение при возврате на вкладку во время активного запроса.
    // Теперь инстанс не уничтожается: getView() просто переиспользует его.
    // Настоящее пересоздание — только при смене документа, см. modelId-проверку
    // в getView().
  }

  private _destroyApp(): void {
    if (this._vueApp) {
      this._vueApp.unmount();
      this._vueApp = undefined;
    }
    this._vueInstance = undefined;
    this._rootElement = undefined;
    this._mountedModelId = undefined;
  }

  private _getPilotService(serviceName: string): unknown {
    try {
      return (window as any).Pilot?.getService?.(serviceName) ?? null;
    } catch {
      return null;
    }
  }
}
