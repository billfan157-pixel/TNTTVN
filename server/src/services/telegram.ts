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
      await ctx.reply('🤖 Bot Giáo Lý TNTT đã sẵn sàng! Nhận thông báo từ hệ thống.')
    })
    bot.command('help', async (ctx) => {
      await ctx.reply(
        'Các lệnh:\n' +
        '/start - Khởi động bot\n' +
        '/help - Danh sách lệnh\n' +
        '/status - Trạng thái hệ thống\n' +
        '/health - Kiểm tra kết nối'
      )
    })
    bot.command('status', async (ctx: any) => {
      await ctx.reply(`✅ Hệ thống đang chạy\n🕐 ${new Date().toLocaleString('vi-VN')}`)
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

    bot.start({ onStart: () => console.log('Telegram bot started') })
    enabled = true
    return true
  } catch (err) {
    console.error('Telegram bot init failed:', err)
    return false
  }
}

export async function sendTelegramAlert(message: string): Promise<void> {
  if (!enabled || !bot || !ADMIN_CHAT_ID) return
  try {
    await bot.api.sendMessage(ADMIN_CHAT_ID, `⚠️ *Cảnh báo*\n${message}`, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('Telegram send failed:', err)
  }
}

export async function sendTelegramInfo(message: string): Promise<void> {
  if (!enabled || !bot || !ADMIN_CHAT_ID) return
  try {
    await bot.api.sendMessage(ADMIN_CHAT_ID, `ℹ️ *Thông báo*\n${message}`, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('Telegram send failed:', err)
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
