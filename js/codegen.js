// codegen.js — template-driven code generation from UML classifiers.
// The template is a plain function of the model, so custom generators can be
// registered alongside the built-in Java one.

import { repository } from './core/repository.js';

const VIS = { public: 'public ', private: 'private ', protected: 'protected ', package: '' };

const defaultTemplate = {
  id: 'java',
  label: 'Java（内置模板）',
  ext: '.java',
  generate(model) {
    const pkg = namespaceOf(model);
    const head = pkg ? `package ${pkg};\n\n` : '';
    const kind = model.type === 'UMLInterface' ? 'interface'
      : model.type === 'UMLEnumeration' ? 'enum' : 'class';
    const decl = `${model.isAbstract ? 'abstract ' : ''}${kind} ${safe(model.name)}`;
    const supers = [];
    for (const rel of model.ownedElements || []) {
      if (rel.type === 'UMLGeneralization' && rel.target) supers.push(`extends ${safe(rel.target.name)}`);
    }
    const body = [];
    if (model.type === 'UMLEnumeration') {
      body.push('  ' + (model.literals || []).map((l) => safe(l.name)).join(', ') + ';');
    } else {
      for (const a of model.attributes || []) {
        body.push(`  ${VIS[a.visibility] || 'public '}${a.isStatic ? 'static ' : ''}${javaType(a.type)} ${safe(a.name)};`);
      }
      if ((model.attributes || []).length) body.push('');
      for (const a of model.attributes || []) {
        const Name = safe(a.name).charAt(0).toUpperCase() + safe(a.name).slice(1);
        body.push(`  public ${a.isStatic ? 'static ' : ''}${javaType(a.type)} get${Name}() { return this.${safe(a.name)}; }`);
        body.push(`  public void set${Name}(${javaType(a.type)} ${safe(a.name)}) { this.${safe(a.name)} = ${safe(a.name)}; }`);
      }
      if ((model.attributes || []).length) body.push('');
    }
    for (const op of model.operations || []) {
      const params = (op.parameters || []).map((p) => `${javaType(p.type)} ${safe(p.name)}`).join(', ');
      body.push(`  ${VIS[op.visibility] || 'public '}${op.isStatic ? 'static ' : ''}${javaType(op.returnType)} ${safe(op.name)}(${params}) {`);
      body.push(`    // TODO ${model.name}.${op.name}`);
      body.push('  }');
    }
    const doc = model.documentation ? `/** ${model.documentation.split('\n').join('\n * ')}\n */\n` : '';
    return `${head}${doc}public ${decl}${supers.length ? ' ' + supers.join(' ') : ''} {\n${body.join('\n')}\n}\n`;
  },
};

function javaType(t) {
  return t || 'void';
}

function safe(s) {
  return String(s || 'Unnamed').replace(/[^\w$]/g, '_');
}

function namespaceOf(model) {
  const parts = [];
  let p = model.__parent;
  while (p && p.type !== 'Project') {
    if (p.name) parts.unshift(p.name.replace(/[^\w.]/g, '_'));
    p = p.__parent;
  }
  return parts.join('.').toLowerCase();
}

export const CODEGEN_TEMPLATES = { java: defaultTemplate };

/** Register a custom generator template: { id, label, ext, generate(model) }. */
export function registerTemplate(tpl) {
  CODEGEN_TEMPLATES[tpl.id] = tpl;
}

/** Generate files for the given models (or every classifier in the project). */
export function generate(models = null, templateId = 'java') {
  const tpl = CODEGEN_TEMPLATES[templateId] || defaultTemplate;
  const targets = models && models.length ? models : collectClassifiers();
  const files = [];
  for (const m of targets) {
    if (!['UMLClass', 'UMLInterface', 'UMLEnumeration'].includes(m.type)) continue;
    files.push({ name: safe(m.name) + (tpl.ext || '.txt'), content: tpl.generate(m) });
  }
  return files;
}

function collectClassifiers() {
  const out = [];
  repository.walk((n) => {
    if (['UMLClass', 'UMLInterface', 'UMLEnumeration'].includes(n.type)) out.push(n);
  });
  return out;
}
