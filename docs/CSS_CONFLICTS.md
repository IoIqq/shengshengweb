# CSS 冲突清单（已解决）

> **状态：已于 2026-06-08 全部消除。**
>
> 此前 62 项「同选择器不同声明」的分歧，本质是同一精确选择器在多个文件里给同一属性赋了不同值，
> 靠 `@import` 顺序决出唯一胜出值——浏览器实际渲染的就是那个胜出值。
>
> 采取**去败者（loser elimination）**策略无损消除：
> - 同 `@media` 上下文 + 同精确选择器字符串 + 同属性的多条声明里，只保留层叠胜者（`!important` 优先，否则后出现者），删除被覆盖的败者。
> - **无损证明**：败者与胜者选择器字符串完全相同 ⇒ specificity 相同、命中元素集合相同 ⇒ 胜者在任意元素上恒压过败者 ⇒ 删除败者绝不改变任何计算值。
> - **安全网**：用层叠指纹 oracle（拆分组选择器、模拟全量跨选择器层叠，含 `!important`/specificity/顺序）逐键比对，改前 5851 个胜出值 == 改后 5851 个，零 LOST/CHANGED/ADDED。以独立的改前备份复核通过。
>
> 共删除 **881 条死声明**（233 条真实分歧的败者 + 648 条残余等值副本），CSS 总行数 13223 → 11677（-1546，-12%）。
> 全部花括号平衡、30 个文件均可被 prettier 解析、HTTP 31/31 返回 200。
>
> 若今后再出现同类分歧，运行 `scripts/_css-loser.cjs`（dry-run）即可重新审计；指纹零差异才允许 `--apply`。

## 历史记录（已处理的分歧项，保留备查）

下列选择器此前存在跨文件分歧，现已统一为层叠胜出值（即原渲染值），不再有重复声明：

`body`, `.date-day`, `.date-md`, `.date-time`, `.hero-stats li::before`, `.avatar-btn`, `.close-btn`,
`.input-action`, `.focus-link`, `.shortcut-btn`(:hover), `.hamburger-btn`, `.media-action-btn`,
`.media-card.is-selected`, `.media-card--enhanced`, `.media-select-overlay`, `.media-checkbox`,
`.media-thumb`(-overlay), `.media-kind-badge`, `.media-body`, `.media-topline`, `.media-note`,
`.activity-item`(:hover/ p / small), `.stat-card`, `.review-item`, `.team-card`(:hover),
`.team-actions .ghost-btn`, `.focus-card`(:hover), `.login-remember`, `.review-note-input`,
`.panel-feedback`, `.focus-empty`, `.batch-actions-bar`, `.media-preview-btn`, `.tag-chip`,
`.alert-chip`(:hover), `.alert-value`, `.alert-pulse`, `.focus-row`, `.focus-text small`,
`.profile-popover-inner`(-head), `.profile-avatar-large`, `.avatar-overlay`, `.profile-section`,
`.mobile-nav-content`(-items), `.login-layout`, `.brand-points`, `.hero-stats`(li / li:hover),
`.overview-hero`(-copy > span), `.hero-text`。
