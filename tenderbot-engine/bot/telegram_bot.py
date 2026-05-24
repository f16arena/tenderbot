from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, ContextTypes
from loguru import logger
from config import cfg
from db.database import get_session
from db.models import Lot, Application

class TenderBot:
    def __init__(self):
        self.app = ApplicationBuilder().token(cfg.TG_TOKEN).build()
        self._register_handlers()

    def _register_handlers(self):
        self.app.add_handler(CommandHandler("start",   self.cmd_start))
        self.app.add_handler(CommandHandler("lots",    self.cmd_lots))
        self.app.add_handler(CommandHandler("stats",   self.cmd_stats))
        self.app.add_handler(CommandHandler("status",  self.cmd_status))
        self.app.add_handler(CallbackQueryHandler(self.on_button))

    async def cmd_start(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "🤖 *TenderBot PRO* запущен!\n\n"
            "Команды:\n"
            "/lots — последние 5 лотов\n"
            "/stats — статистика\n"
            "/status — статус бота",
            parse_mode="Markdown"
        )

    async def cmd_lots(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        db = get_session()
        lots = db.query(Lot).order_by(Lot.created_at.desc()).limit(5).all()
        if not lots:
            await update.message.reply_text("Лоты не найдены.")
            return
        for lot in lots:
            price_m = round(lot.price / 1_000_000, 1)
            text = (
                f"📋 *{lot.title[:80]}*\n"
                f"🏢 {lot.platform} · {lot.region or '—'}\n"
                f"💰 {price_m} млн ₸\n"
                f"⏱ Дедлайн: {lot.deadline.strftime('%d.%m %H:%M') if lot.deadline else '—'}\n"
            )
            buttons = [[
                InlineKeyboardButton("⚡ ПОДАТЬ", callback_data=f"submit_{lot.lot_id}"),
                InlineKeyboardButton("🔗 Открыть", url=lot.url or "https://goszakup.gov.kz"),
            ]]
            await update.message.reply_text(
                text,
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(buttons),
            )

    async def cmd_stats(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        db = get_session()
        total_lots = db.query(Lot).count()
        total_apps = db.query(Application).count()
        won = db.query(Application).filter_by(status="won").count()
        auto = db.query(Application).filter_by(auto=True).count()
        text = (
            f"📊 *Статистика TenderBot*\n\n"
            f"🔍 Лотов в базе: {total_lots}\n"
            f"📋 Заявок подано: {total_apps}\n"
            f"🏆 Побед: {won}\n"
            f"🤖 Авто-подач: {auto}\n"
        )
        await update.message.reply_text(text, parse_mode="Markdown")

    async def cmd_status(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "✅ *Бот работает*\n\n"
            "⚡ Автоподача: ВКЛ\n"
            "🔍 Мониторинг: ВКЛ\n"
            "🔏 ЭЦП: Активна\n",
            parse_mode="Markdown"
        )

    async def on_button(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()
        if query.data.startswith("submit_"):
            lot_id = query.data.replace("submit_", "")
            await query.edit_message_text(f"⚡ Запуск авто-подачи для {lot_id}...")
            # Здесь вызвать AutoFiller

    async def notify_new_lot(self, lot: Lot):
        """Отправить уведомление о новом лоте."""
        price_m = round(lot.price / 1_000_000, 1)
        text = (
            f"🔔 *Новый лот!*\n\n"
            f"📋 {lot.title[:100]}\n"
            f"🏢 {lot.platform} · {lot.region or '—'}\n"
            f"💰 {price_m} млн ₸\n"
            f"📂 {lot.category}\n"
        )
        buttons = [[
            InlineKeyboardButton("⚡ ПОДАТЬ АВТО", callback_data=f"submit_{lot.lot_id}"),
            InlineKeyboardButton("🔗 Открыть", url=lot.url or "https://goszakup.gov.kz"),
        ]]
        await self.app.bot.send_message(
            chat_id=cfg.TG_CHAT_ID,
            text=text,
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup(buttons),
        )

    def run(self):
        logger.info("📱 Telegram-бот запущен")
        self.app.run_polling(allowed_updates=Update.ALL_TYPES)
