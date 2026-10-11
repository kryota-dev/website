---
order: 1
industry: "SaaS（要件定義支援）"
period: "2026年8月〜2026年9月"
title: "デスクトップアプリ・関連 API の開発"
role: "画面・関連 API（基本設計〜保守・運用）"
highlights:
  - "AI が成果物に出す変更提案の差分表示・部分適用・状態管理を改善"
  - "AI の変更をユーザーが確認してから確定する仕組み（Human-in-the-Loop）を設計"
  - "版履歴の保存方式を改善し、複数ファイルを書き戻すときの整合性を確保"
  - "負荷試験の結果を基に、一覧 API の性能を段階的に改善（ETag による HTTP キャッシュ、カーソル方式のページング、索引の追加、重複リクエストの統合）"
tech:
  - "TypeScript"
  - "Electron"
  - "React"
  - "Hono"
  - "PostgreSQL"
  - "DynamoDB"
  - "Tailwind CSS"
  - "Zustand"
  - "Zod"
  - "Vitest"
  - "Playwright"
  - "Claude Code"
labels:
  role: 役割
  highlights: 主な取り組み
  tech: 技術スタック
---

AI と協働して要件定義を進める SaaS のデスクトップアプリ（Electron）と関連 API で、AI の変更提案を確認・適用する機能と、データ連携の改善を担当。
