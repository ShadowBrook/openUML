// plugins.js — minimal extension API exposed as window.openuml
//
// Plugins run in the same page context and get read/write access to the
// repository, the command stack, the factories and the command palette:
//
//   openuml.registerCommand('hello', { label: 'Hello Plugin', run() { … } })
//   const cls = openuml.factory.createModel('UMLClass', 'FromPlugin')

import { repository } from './core/repository.js';
import { commandStack } from './core/commands.js';
import { createModel, createDiagram } from './core/factory.js';

export function initPluginApi(app, { registerPaletteCommand, openDiagram }) {
  const api = {
    version: '1.0',
    repository: {
      get root() { return repository.root; },
      lookup: (id) => repository.lookup(id),
      walk: (fn) => repository.walk(fn),
      select: (ids, model = null) => repository.select(ids, model),
      get selection() { return repository.selections.map((id) => repository.lookup(id)); },
      get selectedModel() { return repository.selectedModel; },
    },
    commands: commandStack,
    factory: { createModel, createDiagram },
    app: {
      get activeDiagram() { return app.activeDiagram; },
      openDiagram,
      setStatus: (msg) => app.canvas.setStatusMessage(String(msg)),
    },
    registerCommand(id, def = {}) {
      registerPaletteCommand({
        id, label: def.label || id, group: def.group || '插件',
        run: def.run, enabled: def.enabled,
      });
      return id;
    },
  };
  window.openuml = api;
  return api;
}
