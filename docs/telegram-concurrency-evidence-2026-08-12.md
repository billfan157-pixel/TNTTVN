# Telegram concurrency evidence (2026-08-12)

## Official grammY guidance

Source: https://grammy.dev/ref/runner/sequentialize

The official grammY reference states that using the runner allows middleware to run concurrently and that race conditions can occur when messages must be processed in order. It recommends `sequentialize` with a constraint such as `String(ctx.chat.id)` to serialize updates from the same chat. The same source also notes that multiple constraints can serialize both same-chat and same-user updates.

Source: https://grammy.dev/plugins/runner

The official runner documentation explains that the runner is used for concurrent processing of long-polling updates, and that selected updates can be sequentialized when ordering matters.

## Project-specific runtime evidence

The project currently constructs a grammY `Bot` and calls `bot.start(...)` directly in `server/src/services/telegram.ts`; it does not import `@grammyjs/runner` or call `run(bot)`. The installed grammY source (`node_modules/grammy/out/bot.js`, lines 190-195 and 395-402) shows that `Bot.handleUpdates` loops through a fetched update batch and awaits `handleUpdate` for each update, while polling awaits `handleUpdates` before fetching the next batch. Therefore the current long-polling path is sequential at the batch/update loop level, unlike runner mode.

## Findings

1. The one-time token consumption path had a real local concurrency failure under parallel test execution: concurrent SQLite transactions produced `SQLITE_BUSY`.
2. `consumeTelegramLinkToken` now uses the existing `runDbTransaction` helper, which sets transaction-local `busy_timeout` and retries `SQLITE_BUSY` with exponential backoff.
3. The transaction itself uses a compare-and-set update (`consumed_at IS NULL`) and the unique `chat_id` constraint, so only one concurrent attempt can consume a token or claim a chat successfully.
4. The bot is not currently using grammY runner concurrency. Adding runner middleware without adding the dependency and lifecycle handling would be an unnecessary scope expansion for the current traffic model. If runner mode is introduced later, add `sequentialize(ctx => [String(ctx.chat?.id), String(ctx.from?.id)].filter(Boolean))` before command handlers.

## Verification

`npx vitest run server/src/__tests__/telegramLinkService.test.ts` passed 5/5 tests, including three concurrent consumption attempts where exactly one succeeds and two receive `INVALID_OR_EXPIRED_TOKEN`.

## References

1. [grammY sequentialize reference](https://grammy.dev/ref/runner/sequentialize)
2. [grammY runner plugin documentation](https://grammy.dev/plugins/runner)
3. Installed project source: `node_modules/grammy/out/bot.js`
