// i18n.js — lightweight UI translation layer.
// UI strings stay in Chinese as the source of truth; t(s) maps them for other
// languages and falls back to the original string when no translation exists.

const DICT = {
  en: {
    // menus
    '文件': 'File', '编辑': 'Edit', '模型': 'Model', '格式': 'Format',
    '视图': 'View', '帮助': 'Help',
    '新建': 'New', '从模板新建…': 'New from Template…', '打开项目…': 'Open Project…',
    '最近文件': 'Recent Files', '保存项目': 'Save Project', '项目另存为…': 'Save Project As…',
    '导入 StarUML 项目 (.mdj)…': 'Import StarUML Project (.mdj)…',
    '导出片段 (.mfj)…': 'Export Fragment (.mfj)…', '导入片段 (.mfj)…': 'Import Fragment (.mfj)…',
    '导出为 SVG': 'Export as SVG', '导出为 PNG': 'Export as PNG', '导出为 JPEG': 'Export as JPEG',
    '导出为 PDF（直接导出）': 'Export as PDF (direct)',
    '导出全部图表': 'Export All Diagrams', '复制图表为图片': 'Copy Diagram as Image',
    '打印 / 导出 PDF…': 'Print / Export PDF…',
    '撤销': 'Undo', '重做': 'Redo', '全选': 'Select All', '取消选择': 'Deselect',
    '剪切': 'Cut', '复制': 'Copy', '粘贴': 'Paste', '创建副本': 'Duplicate',
    '从图表删除': 'Remove from Diagram', '删除模型元素': 'Delete Model Element',
    '查找…': 'Find…', '命令面板…': 'Command Palette…',
    '在资源管理器中显示': 'Reveal in Explorer', '在图表中定位': 'Locate in Diagram',
    '偏好设置…': 'Preferences…',
    '添加图表': 'Add Diagram', '验证模型…': 'Validate Model…',
    '文档编辑器… (Markdown)': 'Documentation Editor… (Markdown)',
    '重命名…': 'Rename…',
    '对齐': 'Align', '大小相同': 'Same Size',
    '填充颜色…': 'Fill Color…', '线条颜色…': 'Line Color…', '字体颜色…': 'Font Color…',
    '置于顶层': 'Bring to Front', '置于底层': 'Send to Back',
    '放大': 'Zoom In', '缩小': 'Zoom Out', '适应窗口': 'Zoom to Fit',
    '显示网格': 'Show Grid', '吸附网格': 'Snap to Grid', '深色主题': 'Dark Theme',
    '面板': 'Panels', '关于 OpenUML': 'About OpenUML',
    // toolbox groups
    '常用': 'Basic', '类图': 'Class', '用例图': 'Use Case', '序列图': 'Sequence',
    '状态机图': 'Statechart', '活动图': 'Activity', '组件图': 'Component',
    '部署图': 'Deployment', '包图': 'Package', '通信图': 'Communication',
    '对象图': 'Object', '复合结构图': 'Composite Structure', '时序图': 'Timing',
    '交互概览图': 'Interaction Overview', '信息流图': 'Information Flow',
    'Profile 图': 'Profile', '注释': 'Annotation',
    // panels
    '图表': 'Diagrams', '属性': 'Properties', '样式': 'Styles',
    '模型资源管理器': 'Model Explorer', '工具箱': 'Toolbox',
    // status
    ' 个选中': ' selected', '项目已打开': 'Project opened',
    '已新建项目': 'New project created',
  },
};

let lang = 'zh-CN';

export function getLang() { return lang; }

export function setLang(l) {
  lang = DICT[l] ? l : 'zh-CN';
  document.documentElement.lang = lang;
}

export function availableLangs() {
  return [['zh-CN', '中文'], ['en', 'English']];
}

/** Translate a UI string; unknown strings pass through unchanged. */
export function t(s) {
  if (lang === 'zh-CN') return s;
  return (DICT[lang] && DICT[lang][s]) || s;
}
