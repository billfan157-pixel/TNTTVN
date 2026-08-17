import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('grammy', () => ({
  Bot: vi.fn(),
}))

describe('telegram', () => {
  let mockBot: { command: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; api: { sendMessage: ReturnType<typeof vi.fn> } }

  async function setupBot() {
    const { Bot } = await import('grammy')
    mockBot = { command: vi.fn(), start: vi.fn(), stop: vi.fn(), api: { sendMessage: vi.fn() } }
    vi.mocked(Bot).mockImplementation(function BotMock() { return mockBot })
  }

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_ADMIN_CHAT_ID = 'admin-chat'
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_ADMIN_CHAT_ID
  })

  it('initTelegramBot returns false when env vars not set', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_ADMIN_CHAT_ID
    vi.resetModules()
    const { initTelegramBot } = await import('../../services/telegram.js')
    expect(initTelegramBot()).toBe(false)
  })

  it('initTelegramBot returns false with empty token', async () => {
    process.env.TELEGRAM_BOT_TOKEN = ''
    vi.resetModules()
    const { initTelegramBot } = await import('../../services/telegram.js')
    expect(initTelegramBot()).toBe(false)
  })

  it('initTelegramBot returns false when Bot constructor throws', async () => {
    const { Bot } = await import('grammy')
    vi.mocked(Bot).mockImplementation(function() { throw new Error('init fail') })
    const { initTelegramBot } = await import('../../services/telegram.js')
    expect(initTelegramBot()).toBe(false)
  })

  it('initTelegramBot starts the bot and registers commands', async () => {
    await setupBot()
    const { initTelegramBot } = await import('../../services/telegram.js')
    const result = initTelegramBot()
    expect(result).toBe(true)
    expect(mockBot.command).toHaveBeenCalledWith('start', expect.any(Function))
    expect(mockBot.command).toHaveBeenCalledWith('help', expect.any(Function))
    expect(mockBot.command).toHaveBeenCalledWith('status', expect.any(Function))
    expect(mockBot.command).toHaveBeenCalledWith('health', expect.any(Function))
    expect(mockBot.start).toHaveBeenCalledWith({ onStart: expect.any(Function) })
  })

  it('sendTelegramAlert sends alert message', async () => {
    await setupBot()
    const mod = await import('../../services/telegram.js')
    mod.initTelegramBot()
    await mod.sendTelegramAlert('test alert')
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith('admin-chat', expect.stringContaining('test alert'), { parse_mode: 'Markdown' })
  })

  it('sendTelegramInfo sends info message', async () => {
    await setupBot()
    const mod = await import('../../services/telegram.js')
    mod.initTelegramBot()
    await mod.sendTelegramInfo('test info')
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith('admin-chat', expect.stringContaining('test info'), { parse_mode: 'Markdown' })
  })

  it('sendTelegramAlert does nothing when bot not initialized', async () => {
    await setupBot()
    const mod = await import('../../services/telegram.js')
    await mod.sendTelegramAlert('should not send')
    expect(mockBot.api.sendMessage).not.toHaveBeenCalled()
  })

  it('isTelegramEnabled returns correct state', async () => {
    await setupBot()
    const mod = await import('../../services/telegram.js')
    expect(mod.isTelegramEnabled()).toBe(false)
    mod.initTelegramBot()
    expect(mod.isTelegramEnabled()).toBe(true)
  })

  it('stopTelegramBot stops the bot and disables', async () => {
    await setupBot()
    const mod = await import('../../services/telegram.js')
    mod.initTelegramBot()
    await mod.stopTelegramBot()
    expect(mockBot.stop).toHaveBeenCalled()
    expect(mod.isTelegramEnabled()).toBe(false)
  })
})
