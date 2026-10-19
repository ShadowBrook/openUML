// tests/mdj.test.js — in-app StarUML converter

import test from 'node:test';
import assert from 'node:assert/strict';
import { convertMdj } from '../js/io/mdj.js';

test('mdj converter maps classes, members and views', () => {
  const mdj = {
    _id: 'P', _type: 'Project', name: 'Mini', ownedElements: [
      {
        _id: 'M1', _type: 'UMLModel', name: 'Model', ownedElements: [
          {
            _id: 'C1', _type: 'UMLClass', name: 'Order', ownedElements: [
              {
                _id: 'D1', _type: 'UMLClassDiagram', name: 'Main', ownedViews: [
                  { _id: 'V1', _type: 'UMLClassView', model: { $ref: 'C1' }, left: 10, top: 20, width: 160, height: 80, subViews: [] },
                ],
              },
            ],
            attributes: [{ _id: 'A1', _type: 'UMLAttribute', name: 'id', type: 'int', multiplicity: '1' }],
            operations: [{ _id: 'O1', _type: 'UMLOperation', name: 'save', parameters: [], type: 'bool' }],
          },
        ],
      },
    ],
  };
  const { project, models, diagrams, skipped } = convertMdj(mdj);
  assert.equal(models, 2);      // model + class
  assert.equal(diagrams, 1);
  assert.deepEqual(skipped, {});
  const model = project.ownedElements[0];
  const cls = model.ownedElements.find((n) => n.type === 'UMLClass');
  assert.equal(cls.name, 'Order');
  assert.equal(cls.attributes[0].multiplicity, '1');
  assert.equal(cls.operations[0].returnType, 'bool');
  const diagram = model.ownedElements.find((n) => n.type === 'UMLClassDiagram');
  assert.equal(diagram.elements.length, 1);
  assert.equal(diagram.elements[0].$type, 'UMLClass');
  assert.equal(diagram.elements[0].modelRef, cls._id);
  assert.equal(diagram.elements[0].x, 10);
});

test('mdj converter skips unsupported views with a report', () => {
  const mdj = {
    _id: 'P', _type: 'Project', name: 'X', ownedElements: [
      { _id: 'M1', _type: 'UMLModel', name: 'M', ownedElements: [
        { _id: 'C1', _type: 'UMLClass', name: 'A', ownedElements: [
          { _id: 'D1', _type: 'UMLClassDiagram', name: 'D', ownedViews: [
            { _id: 'VX', _type: 'UMLClassView', model: { $ref: 'MISSING' }, left: 0, top: 0, width: 10, height: 10 },
          ] },
        ] },
      ] },
    ],
  };
  const { skipped } = convertMdj(mdj);
  assert.ok(skipped['no-model:UMLClassView'] === 1, JSON.stringify(skipped));
});
