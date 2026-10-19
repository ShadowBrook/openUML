// property-editor.js — right-side Properties/Styles panels

import { repository } from '../core/repository.js';
import { commandStack } from '../core/commands.js';
import { ModelKinds, VISIBILITY } from '../core/metamodel.js';
import { createAttribute, createOperation, createLiteral, createSlot } from '../core/factory.js';

export class PropertyEditor {
  constructor() {
    this.propPanel = document.getElementById('property-editor');
    this.stylePanel = document.getElementById('style-editor');
    this.currentModel = null;
    this.currentView = null;
    // remember the selected member row per model/list across panel re-renders
    this.listSelections = new Map();
    repository.on('select', ({ model }) => {
      this.show(model);
    });
    repository.on('change', () => {
      if (this.currentModel || this.currentView) this.show(this.currentModel, { keepFocus: true });
    });
    document.addEventListener('stack-changed', () => {
      if (this.currentModel) this.show(repository.lookup(this.currentModel._id) || this.currentModel, { keepFocus: true });
      else if (this.currentView) this.show(null, { keepFocus: true });
    });
  }

  show(model, { keepFocus = false } = {}) {
    const active = document.activeElement;
    this.currentModel = model;
    this.currentView = null;
    // find selected view for style editing; view-only edges have no model
    const viewId = repository.selections[0];
    if (viewId) {
      const v = repository.lookup(viewId);
      if (v && (model ? v.modelRef === model._id : v.isEdge)) this.currentView = v;
    }
    if (!model) {
      this.propPanel.innerHTML = '';
      if (this.currentView && this.currentView.isEdge) this._renderViewEdgeProps(this.currentView);
      else this.propPanel.innerHTML = '<div class="prop-empty">在图表或模型资源管理器中选择一个元素</div>';
      this._renderStyles(null);
      if (keepFocus && active && active.tagName === 'INPUT') active.focus();
      return;
    }
    this._renderProps(model);
    this._renderStyles(model);
    if (keepFocus && active && active.tagName === 'INPUT') active.focus();
  }

  /** Properties for view-only edges (object links, note links, communication links). */
  _renderViewEdgeProps(v) {
    const sec = this._section(`${v.$type.replace(/^UML/, '')} — 视图`);
    if (v.$type === 'UMLLinkObject') {
      this._row(sec, 'name', v.name || '', (val) => this._setView(v, 'name', val));
    }
    if (['UMLLink', 'UMLDirectedLink', 'UMLLinkObject'].includes(v.$type)) {
      this._row(sec, 'end1 (tail) role', v.tailRoleName || '', (val) => this._setView(v, 'tailRoleName', val));
      this._row(sec, 'end1 multiplicity', v.tailMultiplicity || '', (val) => this._setView(v, 'tailMultiplicity', val));
      this._row(sec, 'end2 (head) role', v.headRoleName || '', (val) => this._setView(v, 'headRoleName', val));
      this._row(sec, 'end2 multiplicity', v.headMultiplicity || '', (val) => this._setView(v, 'headMultiplicity', val));
    }
    this._row(sec, '显示名称', v.nameVisible !== false, (val) => this._setView(v, 'nameVisible', val === 'true'), 'select', [['true', '是'], ['false', '否']]);
    this._row(sec, '线型', v.lineStyle || 'solid', (val) => this._setView(v, 'lineStyle', val), 'select', [['solid', '实线'], ['dashed', '虚线'], ['dotted', '点线']]);
    if (v.$type === 'UMLConnector' && (v.messages || []).length) {
      const hint = document.createElement('div');
      hint.className = 'pref-hint';
      hint.textContent = `${v.messages.length} 条消息；双击连线可编辑文本与方向。`;
      sec.appendChild(hint);
    }
  }

  _section(title, open = true) {
    const sec = document.createElement('div');
    sec.className = 'prop-section';
    const h = document.createElement('div');
    h.className = 'prop-section-header';
    h.innerHTML = `<span class="arrow">${open ? '▾' : '▸'}</span><span>${title}</span>`;
    const body = document.createElement('div');
    h.onclick = () => {
      body.classList.toggle('hidden');
      h.querySelector('.arrow').textContent = body.classList.contains('hidden') ? '▸' : '▾';
    };
    sec.appendChild(h);
    sec.appendChild(body);
    this.propPanel.appendChild(sec);
    return body;
  }

  _row(parent, label, value, onChange, input = 'text', options = null) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    row.appendChild(l);
    const val = document.createElement('div');
    val.className = 'prop-value';
    let el;
    if (input === 'select') {
      el = document.createElement('select');
      for (const [v, text] of options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = text;
        if (v === value) o.selected = true;
        el.appendChild(o);
      }
    } else if (input === 'textarea') {
      el = document.createElement('textarea');
      el.value = value ?? '';
    } else {
      el = document.createElement('input');
      el.type = 'text';
      el.value = value ?? '';
    }
    el.addEventListener('change', () => onChange(el.value));
    el.addEventListener('keydown', (e) => e.stopPropagation());
    val.appendChild(el);
    row.appendChild(val);
    parent.appendChild(row);
    return el;
  }

  _checkRow(parent, label, checked, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    row.appendChild(l);
    const val = document.createElement('div');
    val.className = 'prop-value';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    input.addEventListener('keydown', (e) => e.stopPropagation());
    val.appendChild(input);
    row.appendChild(val);
    parent.appendChild(row);
    return input;
  }

  _renderProps(model) {
    const panel = this.propPanel;
    panel.innerHTML = '';
    if (!model) {
      panel.innerHTML = '<div class="prop-empty">在图表或模型资源管理器中选择一个元素</div>';
      return;
    }
    const meta = ModelKinds[model.type] || { name: model.type };
    // Identity
    const idSec = this._section(`${meta.name} — ${model.name || ''}`);
    this._row(idSec, 'name', model.name, (v) => this._set(model, 'name', v));
    if (model.type !== 'UMLNote') {
      this._row(idSec, 'stereotype', model.stereotype || '', (v) => this._set(model, 'stereotype', v));
    }
    // Documentation (constraints carry their specification here)
    const docSec = this._section(model.type === 'UMLConstraint' ? '约束规范 (Specification)' : '文档');
    this._row(docSec, model.type === 'UMLConstraint' ? 'specification' : 'documentation',
      model.documentation || '', (v) => this._set(model, 'documentation', v), 'textarea');

    // Display options for class-like nodes
    if (this.currentView && ['UMLClass', 'UMLInterface', 'UMLDataType', 'UMLSignal',
      'UMLStereotype', 'UMLInformationItem', 'UMLAssociationClass'].includes(model.type)) {
      const sec = this._section('显示 (Display)');
      this._row(sec, '构造型显示', this.currentView.stereotypeDisplay || 'label',
        (v) => this._setView(this.currentView, 'stereotypeDisplay', v), 'select',
        [['label', '标签'], ['none', '隐藏']]);
      this._checkRow(sec, '显示可见性', this.currentView.showVisibility !== false,
        (v) => this._setView(this.currentView, 'showVisibility', v));
      this._checkRow(sec, '显示类型', this.currentView.showType !== false,
        (v) => this._setView(this.currentView, 'showType', v));
      this._checkRow(sec, '显示操作参数/返回类型', this.currentView.showOperationSignature !== false,
        (v) => this._setView(this.currentView, 'showOperationSignature', v));
      this._checkRow(sec, '抑制属性隔间', this.currentView.suppressAttributes === true,
        (v) => this._setView(this.currentView, 'suppressAttributes', v));
      this._checkRow(sec, '抑制操作隔间', this.currentView.suppressOperations === true,
        (v) => this._setView(this.currentView, 'suppressOperations', v));
    }
    if (this.currentView && model.type === 'UMLEnumeration') {
      const sec = this._section('显示 (Display)');
      this._checkRow(sec, '抑制字面量隔间', this.currentView.suppressLiterals === true,
        (v) => this._setView(this.currentView, 'suppressLiterals', v));
    }

    // Template parameters (classifiers)
    if (Array.isArray(model.templateParameters)) {
      const sec = this._section('模板参数 (Template Parameters)');
      this._listEditor(sec, model, 'templateParameters',
        () => ({ _id: 'tp-' + Math.random().toString(36).slice(2, 9), name: 'T', type: '' }),
        (p) => ({ vis: '«T»', name: p.name, type: p.type }),
        [
          { key: 'name', label: '名称' },
          { key: 'type', label: '类型 (可选)' },
        ]);
    }
    // Tag values (any model element)
    {
      const sec = this._section('标记值 (Tags)');
      this._listEditor(sec, model, 'tags',
        () => ({ _id: 'tag-' + Math.random().toString(36).slice(2, 9), name: 'tag', value: '' }),
        (t) => ({ vis: '=', name: t.name, type: t.value }),
        [
          { key: 'name', label: '名称' },
          { key: 'value', label: '值' },
        ]);
    }

    // Attributes
    if (Array.isArray(model.attributes)) {
      const sec = this._section('属性 (Attributes)');
      this._listEditor(sec, model, 'attributes', createAttribute, (a) => {
        const vis = VISIBILITY[a.visibility]?.symbol ?? '+';
        return { vis, name: a.name, type: a.type };
      }, [
        { key: 'name', label: '名称' },
        { key: 'type', label: '类型' },
      ]);
    }
    // Operations
    if (Array.isArray(model.operations)) {
      const sec = this._section('操作 (Operations)');
      this._listEditor(sec, model, 'operations', createOperation, (o) => {
        const vis = VISIBILITY[o.visibility]?.symbol ?? '+';
        const params = (o.parameters || []).map((p) => p.name).join(', ');
        return { vis, name: `${o.name}(${params})`, type: o.returnType };
      }, [
        { key: 'name', label: '名称' },
        { key: 'returnType', label: '返回类型' },
      ]);
    }
    // Literals
    if (Array.isArray(model.literals)) {
      const sec = this._section('枚举字面量');
      this._listEditor(sec, model, 'literals', createLiteral, (l) => ({ vis: '', name: l.name, type: '' }), [
        { key: 'name', label: '名称' },
      ]);
    }
    // Association / link ends
    if (this.currentView && (model.type === 'UMLAssociation'
      || ['UMLLink', 'UMLDirectedLink'].includes(this.currentView.$type))) {
      const sec = this._section(model.type === 'UMLAssociation' ? '关联端 (Ends)' : '链接端 (Link Ends)');
      const v = this.currentView;
      this._row(sec, 'end1 (tail) role', v.tailRoleName || '', (val) => this._setView(v, 'tailRoleName', val));
      this._row(sec, 'end1 multiplicity', v.tailMultiplicity || '', (val) => this._setView(v, 'tailMultiplicity', val));
      this._row(sec, 'end2 (head) role', v.headRoleName || '', (val) => this._setView(v, 'headRoleName', val));
      this._row(sec, 'end2 multiplicity', v.headMultiplicity || '', (val) => this._setView(v, 'headMultiplicity', val));
    }
    // Combined fragment: operator + interaction operands
    if (model.type === 'UMLCombinedFragment') {
      const sec = this._section('组合片段 (Combined Fragment)');
      this._row(sec, 'operator', model.operator || 'alt', (v) => this._set(model, 'operator', v), 'select',
        [['alt', 'alt'], ['opt', 'opt'], ['loop', 'loop'], ['par', 'par'], ['break', 'break'],
         ['critical', 'critical'], ['neg', 'neg'], ['assert', 'assert'], ['ignore', 'ignore'], ['consider', 'consider']]);
      (model.operands || []).forEach((op, i) => {
        this._row(sec, `operand ${i + 1} 守卫`, op.guard || '', (v) => {
          const old = model.operands;
          const next = old.map((o, j) => (j === i ? { ...o, guard: v } : o));
          commandStack.exec({ label: 'set guard', redo: () => { model.operands = next; }, undo: () => { model.operands = old; } });
        });
      });
      const ctrl = document.createElement('div');
      ctrl.className = 'prop-row';
      const lbl = document.createElement('label');
      lbl.textContent = 'operands';
      const val = document.createElement('div');
      val.className = 'prop-value';
      val.style.display = 'flex';
      val.style.gap = '4px';
      const add = document.createElement('button');
      add.className = 'btn';
      add.textContent = '＋ 添加';
      add.onclick = () => {
        const old = model.operands || [];
        const next = [...old, { guard: '' }];
        commandStack.exec({ label: 'add operand', redo: () => { model.operands = next; }, undo: () => { model.operands = old; } });
      };
      const del = document.createElement('button');
      del.className = 'btn';
      del.textContent = '－ 删除';
      del.onclick = () => {
        const old = model.operands || [];
        if (old.length <= 1) return;
        const next = old.slice(0, -1);
        commandStack.exec({ label: 'remove operand', redo: () => { model.operands = next; }, undo: () => { model.operands = old; } });
      };
      val.appendChild(add);
      val.appendChild(del);
      ctrl.appendChild(lbl);
      ctrl.appendChild(val);
      sec.appendChild(ctrl);
    }

    if (model.type === 'UMLSubmachineState') {
      const sec = this._section('子机状态 (Submachine)');
      this._row(sec, 'submachine', model.submachine || '', (v) => this._set(model, 'submachine', v.trim()));
    }

    // Instance: classifier (the type being instantiated)
    if (['UMLObject', 'UMLArtifactInstance', 'UMLComponentInstance', 'UMLNodeInstance'].includes(model.type)) {
      const sec = this._section('实例 (Instance)');
      this._row(sec, 'classifier', model.classifier || '', (v) => this._set(model, 'classifier', v.trim()));
      if (model.type === 'UMLObject') {
        const slotSec = this._section('槽 (Slots)');
        this._listEditor(slotSec, model, 'slots', createSlot, (s) => ({ vis: '=', name: s.name, type: s.value }), [
          { key: 'name', label: '名称' },
          { key: 'value', label: '值' },
        ]);
      }
    }

    // Composite structure: port / part details
    if (['UMLPort', 'UMLPart'].includes(model.type)) {
      const sec = this._section('结构特征 (Structural Feature)');
      this._row(sec, 'type', model.typeName || '', (v) => this._set(model, 'typeName', v.trim()));
      this._row(sec, 'multiplicity', model.multiplicity || '', (v) => this._set(model, 'multiplicity', v.trim()));
      if (model.type === 'UMLPart') {
        this._row(sec, 'aggregation', model.aggregation || 'composite',
          (v) => this._set(model, 'aggregation', v), 'select',
          [['composite', '组合 (实线)'], ['shared', '共享 (虚线)']]);
      }
    }
    if (model.type === 'UMLCollaborationUse') {
      const sec = this._section('协作使用 (Collaboration Use)');
      this._row(sec, 'type', model.typeName || '', (v) => this._set(model, 'typeName', v.trim()));
    }

    // Edge naming
    if (this.currentView && this.currentView.isEdge) {
      const sec = this._section('连接');
      if (this.currentView.$type === 'UMLLinkObject') {
        this._row(sec, 'name', this.currentView.name || '', (val) => this._setView(this.currentView, 'name', val));
      }
      if (this.currentView.$type === 'UMLRoleBinding') {
        this._row(sec, 'role name', this.currentView.roleName || '', (val) => this._setView(this.currentView, 'roleName', val));
      }
      this._row(sec, '显示名称', this.currentView.nameVisible !== false, (val) => this._setView(this.currentView, 'nameVisible', val === 'true'), 'select', [['true', '是'], ['false', '否']]);
      this._row(sec, '线型', this.currentView.lineStyle, (val) => this._setView(this.currentView, 'lineStyle', val), 'select', [['solid', '实线'], ['dashed', '虚线']]);
    }
  }

  _listEditor(parent, model, listKey, creator, formatter, editableFields) {
    const wrap = document.createElement('div');
    wrap.className = 'list-editor';
    const toolbar = document.createElement('div');
    toolbar.className = 'list-editor-toolbar';
    const addBtn = document.createElement('button');
    addBtn.textContent = '＋ 添加';
    const delBtn = document.createElement('button');
    delBtn.textContent = '－ 删除';
    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.title = '上移';
    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.title = '下移';
    toolbar.appendChild(addBtn);
    toolbar.appendChild(delBtn);
    toolbar.appendChild(upBtn);
    toolbar.appendChild(downBtn);
    wrap.appendChild(toolbar);
    const items = document.createElement('div');
    items.className = 'list-editor-items';
    wrap.appendChild(items);
    const detail = document.createElement('div');
    detail.className = 'item-detail';

    const selKey = `${model._id}::${listKey}`;
    let selectedIdx = this.listSelections.has(selKey) ? this.listSelections.get(selKey) : -1;
    if (selectedIdx >= (model[listKey] || []).length) selectedIdx = -1;
    const setSelection = (idx) => {
      selectedIdx = idx;
      if (idx < 0) this.listSelections.delete(selKey);
      else this.listSelections.set(selKey, idx);
    };
    const renderItems = () => {
      items.innerHTML = '';
      (model[listKey] || []).forEach((item, idx) => {
        const f = formatter(item);
        const row = document.createElement('div');
        row.className = 'list-editor-item' + (idx === selectedIdx ? ' selected' : '');
        row.innerHTML = `<span class="li-vis">${esc(f.vis)}</span><span class="li-name">${esc(f.name)}</span><span class="li-type">${esc(f.type)}</span>`;
        row.onclick = () => { setSelection(idx); renderItems(); };
        items.appendChild(row);
      });
      if (selectedIdx >= 0 && model[listKey][selectedIdx]) {
        this._itemDetail(model[listKey][selectedIdx], editableFields, listKey, detail);
      } else {
        detail.innerHTML = '';
      }
    };
    addBtn.onclick = () => {
      const item = creator();
      const old = model[listKey];
      // update the remembered row before the synchronous stack-changed rebuild
      setSelection(old.length);
      commandStack.exec({
        label: 'add member',
        redo: () => { model[listKey] = [...old, item]; },
        undo: () => { model[listKey] = old; },
      });
      renderItems();
    };
    delBtn.onclick = () => {
      if (selectedIdx < 0) return;
      const old = model[listKey];
      const removeIdx = selectedIdx;
      setSelection(-1);
      commandStack.exec({
        label: 'remove member',
        redo: () => { model[listKey] = old.filter((_, i) => i !== removeIdx); },
        undo: () => { model[listKey] = old; },
      });
      renderItems();
    };
    const moveItem = (delta) => {
      if (selectedIdx < 0) return;
      const from = selectedIdx;
      const to = from + delta;
      if (to < 0 || to >= (model[listKey] || []).length) return;
      const old = model[listKey];
      const next = [...old];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setSelection(to);
      commandStack.exec({
        label: 'reorder member',
        redo: () => { model[listKey] = next; },
        undo: () => { model[listKey] = old; },
      });
      renderItems();
    };
    upBtn.onclick = () => moveItem(-1);
    downBtn.onclick = () => moveItem(1);
    parent.appendChild(wrap);
    parent.appendChild(detail);
    this._renderListItems = renderItems;
    renderItems();
  }

  _itemDetail(item, editableFields, listKey = '', host = null) {
    const old = host || this.propPanel.querySelector('.item-detail');
    if (old) old.innerHTML = '';
    if (!old) return;
    for (const f of editableFields) {
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.innerHTML = `<label>${f.label}</label>`;
      const val = document.createElement('div');
      val.className = 'prop-value';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = item[f.key] ?? '';
      input.addEventListener('change', () => {
        const prev = item[f.key];
        commandStack.exec({
          label: 'edit member',
          redo: () => { item[f.key] = input.value; },
          undo: () => { item[f.key] = prev; },
        });
      });
      input.addEventListener('keydown', (e) => e.stopPropagation());
      val.appendChild(input);
      row.appendChild(val);
      old.appendChild(row);
    }
    // operation signature: edit the parameter list in place
    if (listKey === 'operations') {
      if (!Array.isArray(item.parameters)) item.parameters = [];
      const heading = document.createElement('div');
      heading.className = 'item-detail-heading';
      heading.textContent = '参数 (Parameters)';
      old.appendChild(heading);
      const renderParams = () => {
        old.querySelectorAll('.param-row, .param-add').forEach((n) => n.remove());
        item.parameters.forEach((p, i) => {
          const row = document.createElement('div');
          row.className = 'prop-row param-row';
          row.innerHTML = `<label>param ${i + 1}</label>`;
          const val = document.createElement('div');
          val.className = 'prop-value';
          const name = document.createElement('input');
          name.type = 'text';
          name.value = p.name ?? '';
          name.placeholder = 'name';
          const type = document.createElement('input');
          type.type = 'text';
          type.value = p.type ?? '';
          type.placeholder = 'type';
          const del = document.createElement('button');
          del.className = 'btn';
          del.textContent = '－';
          const commit = () => {
            const next = { ...p, name: name.value, type: type.value };
            const oldParams = item.parameters;
            const nextParams = oldParams.map((x, j) => (j === i ? next : x));
            commandStack.exec({
              label: 'edit parameter',
              redo: () => { item.parameters = nextParams; },
              undo: () => { item.parameters = oldParams; },
            });
          };
          name.addEventListener('change', commit);
          type.addEventListener('change', commit);
          del.onclick = () => {
            const oldParams = item.parameters;
            const nextParams = oldParams.filter((_, j) => j !== i);
            commandStack.exec({
              label: 'remove parameter',
              redo: () => { item.parameters = nextParams; },
              undo: () => { item.parameters = oldParams; },
            });
            renderParams();
          };
          for (const el of [name, type]) {
            el.addEventListener('keydown', (e) => e.stopPropagation());
          }
          val.style.display = 'flex';
          val.style.gap = '4px';
          val.appendChild(name);
          val.appendChild(type);
          val.appendChild(del);
          row.appendChild(val);
          old.appendChild(row);
        });
        const add = document.createElement('button');
        add.className = 'btn param-add';
        add.textContent = '＋ 参数';
        add.onclick = () => {
          const oldParams = item.parameters;
          const nextParams = [...oldParams, { name: 'param' + (oldParams.length + 1), type: '' }];
          commandStack.exec({
            label: 'add parameter',
            redo: () => { item.parameters = nextParams; },
            undo: () => { item.parameters = oldParams; },
          });
          renderParams();
        };
        old.appendChild(add);
      };
      renderParams();
    }
  }

  _renderStyles(model) {
    const panel = this.stylePanel;
    panel.innerHTML = '';
    if (!this.currentView) {
      panel.innerHTML = '<div class="prop-empty">选择图表中的元素后可编辑样式</div>';
      return;
    }
    const v = this.currentView;
    const sec = document.createElement('div');
    sec.className = 'prop-section';
    sec.innerHTML = '<div class="prop-section-header"><span class="arrow">▾</span><span>填充与线条</span></div>';
    const body = document.createElement('div');
    sec.appendChild(body);
    panel.appendChild(sec);

    this._row(body, 'fillColor', v.fillColor || '', (val) => this._setView(v, 'fillColor', val));
    this._row(body, 'lineColor', v.lineColor || '', (val) => this._setView(v, 'lineColor', val));
    this._row(body, 'fontColor', v.fontColor || '', (val) => this._setView(v, 'fontColor', val));
    this._row(body, 'fontSize', v.fontSize || 12, (val) => this._setView(v, 'fontSize', parseInt(val) || 12), 'number');
    // color picker row helper
    for (const [key, label] of [['fillColor', '填充颜色'], ['lineColor', '线条颜色'], ['fontColor', '字体颜色']]) {
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.innerHTML = `<label>${label}</label>`;
      const val = document.createElement('div');
      val.className = 'prop-value';
      const pick = document.createElement('input');
      pick.type = 'color';
      pick.value = v[key] || '#ffffff';
      pick.style.width = '40px';
      pick.addEventListener('change', () => this._setView(v, key, pick.value));
      val.appendChild(pick);
      row.appendChild(val);
      body.appendChild(row);
    }
  }

  _set(model, prop, value) {
    const old = model[prop];
    if (old === value) return;
    commandStack.exec({
      label: 'set ' + prop,
      redo: () => { model[prop] = value; },
      undo: () => { model[prop] = old; },
    });
  }
  _setView(view, prop, value) {
    const old = view[prop];
    if (old === value) return;
    commandStack.exec({
      label: 'set style',
      redo: () => { view[prop] = value; },
      undo: () => { view[prop] = old; },
    });
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
