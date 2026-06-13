# CSS 去重方法

> 状态：已于 2026-06-08 完成。共删除 881 条死声明，CSS 13223→11677 行（-12%）。

## 方法

采取**去败者（loser elimination）**策略：同选择器、同属性、同 `@media` 上下文的多条声明中，只保留层叠胜者（`!important` 优先，否则后出现者），删除被覆盖的败者。

**无损性**：败者与胜者选择器字符串完全相同 ⇒ specificity 相同 ⇒ 胜者恒压过败者 ⇒ 删除败者不改变任何计算值。

## 工具

若再出现同类分歧，运行审计脚本：

```bash
node scripts/_css-loser.cjs          # dry-run，查看分歧
node scripts/_css-loser.cjs --apply  # 确认指纹零差异后执行
```