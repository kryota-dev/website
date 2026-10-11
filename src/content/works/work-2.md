---
order: 2
industry: "SaaS（要件定義支援）"
period: "2025年1月〜2026年8月"
title: "Web アプリ・AI エージェント機能の開発"
role: "画面・API・DB（基本設計〜保守・運用）"
highlights:
  - "要求管理・コメント・お知らせなどの機能を、設計書（Design Doc / ADR）から DB・API・画面まで実装"
  - "AI 生成データの検証ルール（Zod）と、検証エラーを AI エージェント（Mastra）に渡して直させる自動補正"
  - "AI エージェントが実行前にユーザーへ確認する仕組み（Human-in-the-Loop）を、MCP ツール・API・確認 UI まで実装"
  - "AI エージェント実行基盤の信頼性を改善（依頼範囲を逸脱した生成を止める仕組み、壊れたサンドボックスの自動復旧）"
  - "ハーネスエンジニアリング：AI エージェント向けの指示書（AGENTS.md）、AI が作った PR に自動でレビューを起動するワークフロー、Claude Code のカスタムエージェント・skill を整備"
  - "GitHub Actions の権限の明示、template injection の解消、静的解析（actionlint・zizmor）の導入など、CI/CD のセキュリティ対策"
tech:
  - "TypeScript"
  - "React"
  - "Hono"
  - "Drizzle ORM"
  - "PostgreSQL"
  - "Zod"
  - "React Flow"
  - "Tailwind CSS"
  - "Storybook"
  - "Vitest"
  - "Mastra"
  - "MCP"
  - "E2B"
  - "Liveblocks"
  - "Sentry"
  - "Terraform"
  - "AWS（ECS・CloudFront）"
  - "GitHub Actions"
  - "Claude Code"
  - "GitHub Copilot coding agent"
  - "CodeRabbit"
labels:
  role: 役割
  highlights: 主な取り組み
  tech: 技術スタック
---

AI と協働して要件定義を進める SaaS の Web アプリで、画面・API・DB の機能開発と、AI エージェント機能・開発環境のハーネスエンジニアリングを担当。
