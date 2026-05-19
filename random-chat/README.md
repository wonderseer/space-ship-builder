# Random Chat - Анонимный чат с умным матчингом

## Структура проекта

```
random-chat/
├── server/          # Backend на Node.js + Socket.io
│   ├── index.js     # Серверный код
│   └── package.json
└── client/          # Frontend на Next.js + React
    ├── app/
    │   ├── layout.tsx
    │   └── page.tsx
    ├── package.json
    ├── tsconfig.json
    └── next.config.js
```

## Запуск

### 1. Сервер (терминал 1)
```bash
cd random-chat/server
npm install
npm run dev
```
Сервер запустится на http://localhost:3001

### 2. Клиент (терминал 2)
```bash
cd random-chat/client
npm install
npm run dev
```
Клиент откроется на http://localhost:3000

## Функции

- **Анонимный чат** - случайное соединение с собеседником
- **Умный матчинг** - алгоритм избегает повторных соединений с теми, с кем уже общались
- **Таймер сессии** - 60 секунд на диалог
- **Rate limiting** - защита от спама (5 сообщений в секунду)
- **Кнопка "Next User"** - пропустить текущего собеседника

## Стек технологий

**Backend:**
- Node.js
- Express
- Socket.io
- Helmet (безопасность заголовков)
- CORS

**Frontend:**
- Next.js 14 (App Router)
- React 18
- TypeScript
- Socket.io-client
- Tailwind CSS (классы для стилей)
