# 小灶知识库

本目录是需求文档第 5 节所说的知识库。它不存完整菜谱，只存驱动界面和约束生成所需的结构化知识。

## 目录

| 文件 | 内容 |
|---|---|
| `flavors.yaml` | 味型标签（面向用户），以及每个标签擅长的菜系 |
| `scenes.yaml` | 场景标签，以及每个标签对应的约束 |
| `cuisines/*.yaml` | 14 个菜系条目，每个菜系一个文件 |
| `ingredients.yaml` | 食材词典：标准名、别名、各地英文叫法、类别 |

## 审核状态

每个条目都有 `status` 字段：

- `draft`：Claude 起草并自查过，等待产品负责人终审。**线上不使用。**
- `reviewed`：已终审，可用于线上。

终审通过后，把 `status` 改为 `reviewed`，并填写 `reviewed_by` 与 `reviewed_at`。

## 菜系条目的结构

```yaml
id: sichuan                 # 唯一标识，英文小写
status: draft               # draft | reviewed
reviewed_by:                # 终审人
reviewed_at:                # 终审日期
name: {zh: 川菜, en: Sichuan}
group: chinese              # chinese | east-southeast-asia | south-asia-middle-east | europe-americas
overview: …                 # 2–3 句风格总结，会作为生成教程时的上下文
flavor_tags: […]            # 对应 flavors.yaml 的标签 id：这个菜系擅长哪些用户可选的味道
flavor_profiles:            # 菜系内部的典型味型
  - name: 麻辣
    how: 怎么调出来
core_seasonings:            # 决定风味的关键调料
  - zh: 郫县豆瓣
    en: Pixian doubanjiang
    role: 在菜里起什么作用
techniques:                 # 代表技法及要点
  - name: 小炒
    key_points: …
common_ingredients: […]     # 高频主料（对应 ingredients.yaml 的中文标准名）
representative_dishes:      # 代表菜：只存名称与要点，作为风格锚点
  - zh: 麻婆豆腐
    en: Mapo tofu
    original:               # 原文名（非中文菜系填写）
    key: 一句要点
    flavors: […]            # flavors.yaml 的标签 id
    scenes: […]             # scenes.yaml 的标签 id，可为空
    difficulty: 1           # 1 简单 / 2 中等 / 3 较难
overseas:                   # 海外采购与替代
  - item: 郫县豆瓣
    where: 去哪里买
    substitute: 买不到时用什么
    difference: 替代后风味有什么不同
review_notes: […]           # Claude 自查时没把握、需要重点核对的地方
```

## 终审时重点看三处

1. **风味特征是否准确**：`overview` 与 `flavor_profiles` 是否抓住了这个菜系的特点，有没有以偏概全。
2. **代表菜是否有代表性**：是否是该菜系里家喻户晓、在家能做的菜；难度标注是否合理。
3. **海外替代是否真的可行**：替代品在你所在的国家能否买到，替代后的风味描述是否属实。

每个文件末尾的 `review_notes` 列出了 Claude 自查时把握不足的地方，建议先看。
