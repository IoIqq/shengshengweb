# 文档整合历史记录

本文记录 2026-06-04 文档整合工作的历史结果，不作为当前开发规范的来源。当前开发规范以 `docs/CODE_STANDARDS.md` 为准，当前架构/API/部署说明以 `docs/GUIDE.md` 为准。

## 当前文档职责

| 文档 | 当前职责 |
| --- | --- |
| [README.md](README.md) | 项目快速开始与入口导航。 |
| [docs/README.md](docs/README.md) | docs 目录索引。 |
| [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md) | 模块化开发强制规范。 |
| [docs/GUIDE.md](docs/GUIDE.md) | 架构、部署、维护与 API 指南。 |
| [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) | 模块化重构历史报告。 |
| [UI_OPTIMIZATION_P2_COMPLETE.md](UI_OPTIMIZATION_P2_COMPLETE.md) | UI 间距优化历史报告。 |
| [DOCS_SUMMARY.md](DOCS_SUMMARY.md) | 本文档：文档整合历史记录。 |

## 历史整合结果

2026-06-04 的目标是把分散在项目中的阶段性说明、部署说明、维护说明和 UI 报告合并为少量可维护入口，并把历史材料归档。

整合后的原则：

- 当前规范只维护在 `docs/CODE_STANDARDS.md`。
- 当前架构、部署、维护、API 只维护在 `docs/GUIDE.md`。
- 根 `README.md` 只承担快速开始和导航职责。
- 阶段完成报告保留为历史参考，不作为当前实现的权威来源。
- `docs/archive/` 和 `_archive/` 仅供回溯，不应被新开发引用为规范。

## 归档范围

历史文档已移至 `docs/archive/` 或 `_archive/`，包括：

- 旧版项目指南、部署指南、维护手册。
- 阶段完成报告和优化总结。
- 旧单体后端与旧单体样式文件。

## 维护建议

- 新增功能后，更新 `docs/GUIDE.md` 的 API 或架构章节。
- 架构约束变化后，更新 `docs/CODE_STANDARDS.md`。
- 不再新增阶段性“完成报告”作为长期活跃文档；如确需记录历史，写入归档或本文的历史记录章节。
- 避免在多个文档重复维护同一事实。

**最后更新**：2026-06-05
