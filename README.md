# OpenUML — 受 StarUML 启发的在线 UML 建模工具

一个用**纯原生 JavaScript + SVG**（零依赖、免构建）实现的 UML 建模工具，
布局与交互方式参考了经典桌面建模工具 StarUML 7 的使用体验。

本项目是在 REA（reverse-engineer-anything）工作流指导下，
对本机安装的 StarUML 7.1.1（Electron 应用）做静态逆向分析后，
依据分析到的界面结构与交互模型**从头独立实现**的复刻版本——没有复制任何 StarUML 源码或资源。

## 运行

任意静态文件服务器即可，例如：

```bash
python3 serve.py 8642
# 打开 http://127.0.0.1:8642/
```

## 功能

### 图表与图元
- **类图**：类、接口（«interface»）、枚举、数据类型、包、注释、
  **模板参数**（右上角虚线隔间，`T` / `K : Type`）、**约束**（`{specification}` 注释形图元）、
  **标记值**（`{tag=value}`，显示在类名与属性/操作签名上）
- **用例图**：参与者（Actor）、用例（UseCase）、系统边界（Subject）、include/extend
- **序列图**：生命线（Lifeline）、同步消息（实心箭头）、异步消息（开放箭头）、
  回复消息（虚线）、**创建消息**（«create» 虚线、目标生命线自动定位）、
  **删除消息**（«destroy» + 终止 X 标记）、**发现/丢失消息**（端点实心圆点）、
  自消息（回环）、**自动激活条（Activation Bar）**、
  **组合片段**（alt/opt/loop/par/break/critical/neg/assert/ignore/consider，
  五边形 operator 页签、多操作数与守卫条件、可增删操作数、
  **操作数分隔线可拖拽**、**片段可嵌套**）、
  **交互引用（ref）** 图元
- **状态机图**：状态（圆角框）、初始/终止状态、选择（菱形）、连接点（实心菱形）、
  浅/深历史（H / H*）、迁移、自迁移（右侧回环）、**复合状态（内嵌子状态）**
- **活动图**：动作、初始节点、活动终点、流终点（⊗）、判定/合并（菱形）、
  分叉/汇合（实心横条）、控制流（守卫条件标签）、
  **对象节点/对象流/发送信号/接收信号**、**泳道（垂直/水平分区）**
- **组件图**：组件（左缘双凸tab）、构件（折角文档）、接口、依赖、组件实现
- **部署图**：节点（3D 立方体）、构件、部署关系（«deploy» 虚线）、通信路径
- **包图**：包、子系统（带组件角标）、模型、包含关系（⊕ 圆圈加号端）
- **通信图**：对象（下划线名）、链接、**序号消息叠加**（`1: 下单(items)`，
  双击链接逐条编辑，消息工具自动追加到已有链接）
- **对象图**：对象/构件实例/组件实例/节点实例（`name : Classifier` 下划线记法，
  名称自动适配宽度）、链接、定向链接、**链接对象**（链接中点上的对象框）
- **关系**：关联、定向关联、聚合（空心菱形）、组合（实心菱形）、依赖（虚线）、
  泛化（空心三角）、接口实现（虚线+空心三角）、包含/扩展（«include»/«extend»）、注释连接
- **注记图元**：文本、矩形、椭圆（纯视图元素，样式可调）、约束（`{spec}` 注释形）
- **容器包含**：泳道与复合状态是真正的容器——拖入其中的元素自动归属，
  拖动容器时子元素整体随动，移出即脱离；删除容器会释放子元素（全程可撤销）
- **自动适应高度**：类/接口/枚举框随成员数量自动增高，内容永不被裁切
- **图表外框**：按 StarUML 惯例自动绘制，左上角页签携带 UML 类型前缀
  （cd / uc / sd / stm / ad / cp / dp / pkg / comm / od）与图表名

### 交互（对标 StarUML）
- 左侧：图表列表（按类型图标区分）+ 工具箱（常用 / 类图 / 用例图 / 序列图 /
  状态机图 / 活动图 / 组件图 / 部署图 / 包图 / 通信图 / 对象图 可折叠分组，全部平铺，SVG 图标）
- 右侧：模型资源管理器（树，自动展开、右键菜单）+ 属性 / 样式面板
- **QuickEdit 快速编辑**：双击元素（或选中后按回车）弹出 StarUML 式就地编辑器——
  name / stereotype 字段，类元素带 attribute / operation 行内添加行，
  支持 `+name: type`、`name(p: type): ret` 速记语法，+ 按钮或回车即添加
- **模型树拖拽**：从模型资源管理器把任意模型元素拖到画布，即创建其视图
- 画布：网格点阵、Ctrl+滚轮缩放、Alt/中键平移、框选、Shift 多选、
  8 向控制点缩放、方向键微移、右键菜单
- 建模：工具箱选工具 → 画布点击/拖拽创建；节点间拖拽连线（自动贴附边框、正交布线）；
  双击连线标签就地改名
- **连线路径编辑**：选中连线后，拖拽线段中点圆点插入拐点并移动、
  拖拽方形手柄移动已有拐点、**双击手柄删除拐点**；
  **连线名称标签可直接拖动**偏移（可撤销）
- 序列图：从生命线拖到生命线创建消息（箭头落在松开位置，可上下拖动调整时序）
- 编辑：Ctrl+Z / Ctrl+Y 撤销重做（命令栈）、Ctrl+C / Ctrl+V 复制粘贴、
  Ctrl+D 创建副本、Del 从图表移除（连带其关联连线）、
  **Ctrl+Del 从模型删除并向所有图表级联清理视图与关联边**
- 格式：对齐（左/水平居中/右/顶/垂直居中/底）、同尺寸（宽/高/宽高）、
  填充/线条/字体颜色、置于顶层/底层
- 文件：新建 / 打开 / 保存 `.ouml`（JSON）、localStorage 自动暂存、
  导出 SVG / PNG、**打印 / 导出 PDF**（Ctrl+P，打印对话框可选"另存为 PDF"）
- 视图：放大缩小、适应窗口、网格与吸附开关、**深色主题**（对标 StarUML Black，持久化）

## 目录结构

```
index.html            布局骨架（标题栏/菜单栏/左右面板/画布/状态栏）
css/main.css          StarUML 风格浅色主题（#1390d6 强调色）
js/core/
  geometry.js         矩形/点运算、边框吸附、正交布线
  repository.js       模型仓库（所有权树 + 事件 + 索引）
  commands.js         撤销/重做命令栈、序列化
  metamodel.js        元类型注册表、工具箱与箭头定义
  factory.js          模型元素/视图/图表工厂
js/views/
  nodeviews.js        节点 SVG 渲染（类/接口/枚举/参与者/用例/包/注释）
  edgeviews.js        连线渲染（UML 箭头、名称/多重性标签、命中测试）
  canvas.js           画布控制器（平移缩放/选择/工具/拖拽/就地编辑）
js/ui/
  toolbox.js          工具箱
  model-explorer.js   模型资源管理器
  property-editor.js  属性/样式编辑面板
  menubar.js          菜单栏 + 上下文菜单
  dialogs.js          模态对话框
js/exporter.js        SVG / PNG 导出
js/main.js            装配与快捷键
samples/demo.ouml     示例项目（电商：订单/客户/类图 + 电商系统用例图）
```

## 与 StarUML 的对应关系（来自 REA 分析）

| StarUML 7.1.1（逆向观察） | OpenUML（独立实现） |
| --- | --- |
| `src/static/index.html` 渲染端入口，main-view 布局模板 | `index.html` 相同的三栏布局 |
| 左侧 working-diagrams + toolbox，右侧 model-explorer + editors | 同布局与面板划分 |
| Backbone 风格 repository / command 引擎 | `repository.js` + `commands.js`（命令栈撤销/重做） |
| `extensions/essential/uml/toolbox/uml.json` 工具箱分组 | `metamodel.js#ToolboxGroups` |
| Canvas 2D 绘图引擎 | SVG 渲染（可无损导出 SVG） |
| UMLSequenceDiagram（生命线/消息） | `nodeviews.js` 生命线 + `edgeviews.js#renderMessage` |
| 状态机/活动图（状态、伪状态、控制流） | `nodeviews.js` 各伪状态渲染 + `renderSelfLoop` |
| Electron 壳 + IPC（`command` 通道等 43 个通道） | 纯浏览器运行，无需 IPC |

## 已知边界

- 暂不支持：Timing 时序图、交互概览图、信息流图、Profile 图、复合结构图；
  正交状态/区域、端口与引脚；代码生成；`.mfj` 项目格式兼容

> 完整的待办与差距清单（对照 StarUML）见 [TODO.md](TODO.md)。
