import { Bot } from 'grammy'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

let bot: Bot | null = null
let enabled = false

export function initTelegramBot(): boolean {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.log('Telegram bot disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not set')
    return false
  }

  try {
    bot = new Bot(BOT_TOKEN)
    bot.command('start', async (ctx: any) => {
      const botLink = process.env.TELEGRAM_BOT_USERNAME
        ? `Mở bot ${process.env.TELEGRAM_BOT_USERNAME.startsWith('@') ? '' : '@'}${process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, '')} trong Telegram.\n`
        : 'Mở Bot Giáo Lý TNTT (Brave Davinci) trong Telegram.\n'
      await ctx.reply(
        '🤖 Chào mừng bạn đến với Bot Giáo Lý TNTT (Brave Davinci)!\n\n' +
        'Để liên kết tài khoản Phụ huynh với Telegram:\n' +
        `1. ${botLink}` +
        '2. Đăng nhập vào ứng dụng, vào mục "Con Của Tôi" → "Thông Báo Telegram".\n' +
        '3. Bấm "Tạo Mã Liên Kết" để nhận mã (có giá trị 10 phút).\n' +
        '4. Gửi lệnh /link kèm mã nhận được:\n' +
        '`/link <mã_của_bạn>`\n\n' +
        'Gõ /help để xem danh sách lệnh.'
      )
    })
    bot.command('help', async (ctx: any) => {
      await ctx.reply(
        '📋 *Danh sách lệnh Bot Giáo Lý TNTT*:\n\n' +
        '/start - Hướng dẫn liên kết tài khoản\n' +
        '/link <mã> - Liên kết tài khoản phụ huynh\n' +
        '/status - Kiểm tra trạng thái liên kết\n' +
        '/optout - Tạm tắt thông báo\n' +
        '/optin - Bật lại thông báo\n' +
        '/unlink - Hủy liên kết tài khoản\n' +
        '/help - Trợ giúp lệnh',
        { parse_mode: 'Markdown' }
      )
    })
    bot.command('link', async (ctx: any) => {
      const text = ctx.message?.text || ''
      const parts = text.split(/\s+/)
      const token = parts[1]?.trim()
      if (!token) {
        await ctx.reply('⚠️ Vui lòng cung cấp mã liên kết.\nCú pháp: `/link <mã_liên_kết>`', { parse_mode: 'Markdown' })
        return
      }

      const chatId = String(ctx.chat?.id)
      const telegramUserId = ctx.from?.id ? String(ctx.from.id) : null
      const telegramUsername = ctx.from?.username || null

      try {
        const { consumeTelegramLinkToken } = await import('./telegramLinkService.js')
        const result = await consumeTelegramLinkToken(token, { chatId, telegramUserId, telegramUsername })
        if (result.ok) {
          await ctx.reply(
            `✅ *Liên kết thành công!*\n\n` +
            `Tài khoản phụ huynh: *${result.fullName}* đã được kết nối với Telegram chat này.\n` +
            `Từ nay bạn sẽ nhận được thông báo vắng học và phiếu điểm của con em ngay tại đây.`,
            { parse_mode: 'Markdown' }
          )
        } else {
          switch (result.code) {
            case 'INVALID_OR_EXPIRED_TOKEN':
              await ctx.reply('❌ Mã liên kết không hợp lệ hoặc đã hết hạn (10 phút). Vui lòng tạo mã mới từ ứng dụng Phụ huynh.')
              break
            case 'PARENT_ACCOUNT_REQUIRED':
              await ctx.reply('❌ Chỉ tài khoản phụ huynh mới được phép liên kết Telegram.')
              break
            case 'CHAT_ALREADY_LINKED':
              await ctx.reply('❌ Tài khoản Telegram này đã được liên kết với một phụ huynh khác.')
              break
          }
        }
      } catch (err) {
        console.error('Telegram link command error:', err)
        await ctx.reply('❌ Đã xảy ra lỗi hệ thống khi xử lý liên kết. Vui lòng thử lại sau.')
      }
    })
    bot.command('status', async (ctx: any) => {
      const chatId = String(ctx.chat?.id)
      try {
        const { getTelegramLinkForChat } = await import('./telegramLinkService.js')
        const link = await getTelegramLinkForChat(chatId)
        if (link) {
          await ctx.reply(
            `✅ *Trạng thái liên kết*\n\n` +
            `Phụ huynh: *${link.fullName}*\n` +
            `Nhận thông báo: *${link.notificationsEnabled ? 'Bật' : 'Tắt'}*\n` +
            `Trạng thái: *Đang hoạt động*`,
            { parse_mode: 'Markdown' }
          )
        } else {
          await ctx.reply('ℹ️ Chat Telegram này chưa được liên kết với tài khoản phụ huynh nào. Gõ /start để xem hướng dẫn.')
        }
      } catch (err) {
        console.error('Telegram status command error:', err)
        await ctx.reply('❌ Không thể kiểm tra trạng thái liên kết.')
      }
    })
    bot.command('optout', async (ctx: any) => {
      const chatId = String(ctx.chat?.id)
      try {
        const { setTelegramNotifications } = await import('./telegramLinkService.js')
        const success = await setTelegramNotifications(chatId, false)
        if (success) {
          await ctx.reply('🔕 Đã tạm tắt thông báo qua Telegram. Bạn có thể bật lại bất cứ lúc nào bằng lệnh /optin.')
        } else {
          await ctx.reply('❌ Không tìm thấy liên kết hoạt động cho chat này.')
        }
      } catch {
        await ctx.reply('❌ Lỗi hệ thống khi cập nhật cài đặt thông báo.')
      }
    })
    bot.command('optin', async (ctx: any) => {
      const chatId = String(ctx.chat?.id)
      try {
        const { setTelegramNotifications } = await import('./telegramLinkService.js')
        const success = await setTelegramNotifications(chatId, true)
        if (success) {
          await ctx.reply('🔔 Đã bật lại thông báo qua Telegram thành công!')
        } else {
          await ctx.reply('❌ Không tìm thấy liên kết hoạt động cho chat này.')
        }
      } catch {
        await ctx.reply('❌ Lỗi hệ thống khi cập nhật cài đặt thông báo.')
      }
    })
    bot.command('unlink', async (ctx: any) => {
      const chatId = String(ctx.chat?.id)
      try {
        const { revokeTelegramLink } = await import('./telegramLinkService.js')
        const success = await revokeTelegramLink(chatId)
        if (success) {
          await ctx.reply('🔌 Đã hủy liên kết tài khoản phụ huynh với chat Telegram này thành công.')
        } else {
          await ctx.reply('ℹ️ Chat Telegram này không có liên kết hoạt động nào.')
        }
      } catch {
        await ctx.reply('❌ Lỗi hệ thống khi hủy liên kết.')
      }
    })
    bot.command('health', async (ctx: any) => {
      try {
        const res = await fetch('http://localhost:3001/health')
        const data = await res.json() as { status: string }
        await ctx.reply(data.status === 'ok' ? '✅ Health check OK' : '❌ Health check FAILED')
      } catch {
        await ctx.reply('❌ Không thể kết nối đến server')
      }
    })

    Promise.resolve(bot.start({ onStart: () => console.log('Telegram bot started') })).catch(async (err) => {
      // bot.start() là promise (fire-and-forget) — rejection từ việc khởi động
      // (vd deleteWebhook 401 khi token sai, hoặc network timeout tới
      // api.telegram.org) KHÔNG bị try/catch đồng bộ bắt → unhandled rejection
      // → Node crash process. Bắt ở đây: app vẫn phải sống, bot chỉ không chạy.
      // Promise.resolve() đảm bảo an toàn cả khi start() trả undefined (test mock).
      console.error('[TELEGRAM] Bot failed to start:', err)
      enabled = false
      try {
        const { db } = await import('../db/index.js')
        const { auditLogs } = await import('../db/schema.js')
        const { generateId } = await import('../utils/id.js')
        await db.insert(auditLogs).values({
          id: generateId('AUD'),
          userId: 'system',
          action: 'TELEGRAM_BOT_START_FAILED',
          entityType: 'system',
          entityId: 'bot',
          newValue: JSON.stringify({ error: err ? String(err) : 'Unknown error' }),
          parishId: 'SYS',
        })
      } catch (logErr) {
        console.error('Failed to write audit log for telegram failure:', logErr)
      }
    })
    enabled = true
    return true
  } catch (err) {
    console.error('Telegram bot init failed:', err)
    return false
  }
}

export async function sendTelegramAlert(message: string, throwOnError = false): Promise<void> {
  if (!enabled || !bot || !ADMIN_CHAT_ID) return
  try {
    await bot.api.sendMessage(ADMIN_CHAT_ID, `⚠️ *Cảnh báo*\n${message}`, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('Telegram send failed:', err)
    if (throwOnError) throw err
  }
}

export async function sendTelegramInfo(message: string, throwOnError = false): Promise<void> {
  if (!enabled || !bot || !ADMIN_CHAT_ID) return
  try {
    await bot.api.sendMessage(ADMIN_CHAT_ID, `ℹ️ *Thông báo*\n${message}`, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('Telegram send failed:', err)
    if (throwOnError) throw err
  }
}

export async function sendTelegramMessageToChat(chatId: string, message: string, throwOnError = false): Promise<void> {
  if (!enabled || !bot) return
  try {
    await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error(`Telegram send to chat ${chatId} failed:`, err)
    if (throwOnError) throw err
  }
}

export function isTelegramEnabled(): boolean {
  return enabled
}

export async function stopTelegramBot(): Promise<void> {
  if (bot) {
    await bot.stop()
    enabled = false
  }
}
