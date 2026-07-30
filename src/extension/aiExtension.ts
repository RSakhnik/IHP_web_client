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

const aiAssistantIcon =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2RjZGNkYiIHN0cm9rZS13aWR0aD0iMS43IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMiA4VjQiLz48cGF0aCBkPSJNOC41IDRIMTUuNSIvPjxyZWN0IHg9IjUiIHk9IjgiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjMiLz48cGF0aCBkPSJNOSA5LjVoLjAxIi8+PHBhdGggZD0iTTE1IDkuNWguMDEiLz48cGF0aCBkPSJNOSAxNGM0IDIuMiA2IDAgNiAwIi8+PHBhdGggZD0iTTUgMTNoLTMiLz48cGF0aCBkPSJNMjIgMTNoLTMiLz48L3N2Zz4=';

export class BimRightPanelTabs implements ITabs<BimRightPanelContext> {
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

  getViewId(): string {
    return RightPanelTabId;
  }

  getView(context: BimRightPanelContext): HTMLElement | undefined {
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
      });

      this._vueApp.mount(this._rootElement);
    }

    return this._rootElement;
  }

  dispose(): void {
    if (this._vueApp) {
      this._vueApp.unmount();
      this._vueApp = undefined;
    }

    this._rootElement = undefined;
  }

  private _getPilotService(serviceName: string): unknown {
    try {
      return (window as any).Pilot?.getService?.(serviceName) ?? null;
    } catch {
      return null;
    }
  }
}
