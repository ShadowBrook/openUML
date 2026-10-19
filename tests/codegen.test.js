// tests/codegen.test.js — template-driven code generation

import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../js/codegen.js';

test('java generator emits fields, accessors and method stubs', () => {
  const cls = {
    _id: 'm1', type: 'UMLClass', name: 'Order', documentation: 'An order.\nSecond line',
    attributes: [
      { name: 'id', type: 'int', visibility: 'private', isStatic: false },
      { name: 'flag', type: 'bool', visibility: 'public', isStatic: true },
    ],
    operations: [{ name: 'save', visibility: 'public', returnType: 'void', parameters: [{ name: 'x', type: 'int' }] }],
    __parent: null,
  };
  const files = generate([cls]);
  assert.equal(files.length, 1);
  const code = files[0].content;
  assert.match(code, /public class Order/);
  assert.match(code, /private int id;/);
  assert.match(code, /public static bool flag;/);
  assert.match(code, /public int getId\(\)/);
  assert.match(code, /public void setFlag\(bool flag\)/);
  assert.match(code, /public void save\(int x\)/);
  assert.match(code, /An order\./);
});
