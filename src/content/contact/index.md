---
formLabel: 相談フォーム
required: 必須
optional: 任意
fields:
  - id: name
    label: お名前
    type: text
    autocomplete: name
    required: true
  - id: organization
    label: 会社名
    type: text
    autocomplete: organization
  - id: email
    label: メールアドレス
    type: email
    autocomplete: email
    required: true
  - id: kind
    label: ご相談の種類
    type: select
    options:
      - "[選択肢]"
      - "[選択肢]"
  - id: timing
    label: 希望の時期
    type: select
    options:
      - "[選択肢]"
      - "[選択肢]"
  - id: budget
    label: ご予算感
    type: select
    options:
      - "[選択肢]"
      - "[選択肢]"
  - id: message
    label: ご相談内容
    type: textarea
    required: true
submit: 送信する
unavailable: フォームは準備中のため、まだ送信できません。
---
