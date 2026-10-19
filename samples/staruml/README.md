# StarUML sample models (converted)

`UMLExample.ouml` is a converted copy of
[`UMLExample.mdj`](https://github.com/staruml/staruml-samples/blob/main/UMLExample.mdj)
from the StarUML sample repository.

- Source project: “Examples (from www.uml-diagrams.org)”
- Converted with `tools/mdj_to_ouml.py`
- Coverage: 28 diagrams across all 15 UML diagram types supported by OpenUML,
  719 model elements
- License: MIT, Copyright (c) 2021 MKLabs Co.,Ltd. (see `LICENSE` in this folder)

Rebuild it with:

```bash
python3 tools/mdj_to_ouml.py UMLExample.mdj samples/staruml/UMLExample.ouml \
  --report samples/staruml/UMLExample.report.json
```

The converter maps only notation implemented by OpenUML. Views that have no
OpenUML equivalent are skipped and listed in `UMLExample.report.json`; for this
sample that is limited to three control-flow and three object-flow endpoints
attached to pins/structured activity nodes, plus one structured activity node.
Expansion regions, exception handlers and activity interrupts are not represented.
