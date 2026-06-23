import { IToolbar, IToolbarBuilder, ObjectsViewContext } from "@pilotdev/pilot-web-sdk";


export class bimAiExtension implements IToolbar<ObjectsViewContext> {

  constructor(_viewer: PilotWeb3D.GuiViewer3D) {
  }
  
  public build(builder: IToolbarBuilder, context: ObjectsViewContext): void {
    console.log('PnrToolbarExtension.build ВЫЗВАН!', { builder, context });
    
    const button = builder.addButtonItem("pnr-button", 0);
    button.withHeader("ПНР");
    button.withHint("Открыть панель пусконаладочных работ");
    
    console.log('Кнопка добавлена');
  }

  onToolbarItemClick(name: string, context: ObjectsViewContext): void {
    console.log('PnrToolbarExtension.onToolbarItemClick', name);
    if (name === "pnr-button") {
      console.log('ПНР кнопка нажата');
    }
  }
}

if ((window as any).PilotWeb3D) {
  (window as any).PilotWeb3D.theExtensionManager.registerExtensionType(
    'bimAiExtension',
    bimAiExtension as any
  );
}

import { AIExtension } from "../app/web3d.component.extension";

function tryRegister(retries = 20) {
  const delay = 100;
  if ((window as any).PilotWeb3D?.theExtensionManager) {
    (window as any).PilotWeb3D.theExtensionManager.registerExtensionType(
      AIExtension.EXTENSION_NAME,
      AIExtension as any
    );
    console.log("[AIExtension] Registered successfully");
  } else if (retries > 0) {
    console.warn("[AIExtension] PilotWeb3D not ready, retrying...");
    setTimeout(() => tryRegister(retries), delay);
  } else {
    console.error("[AIExtension] Failed to register after all retries");
  }
}

tryRegister();