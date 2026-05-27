// Политика обработки персональных данных. Скелет — финальный текст у юриста.
import Link from "next/link";

export const metadata = { title: "Политика конфиденциальности — TenderBot" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen text-slate-100 px-6 py-10"
      style={{ background: "radial-gradient(1200px 600px at 80% -10%, #16203a 0%, #0b0f1a 55%)" }}>
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">← TenderBot</Link>
        <h1 className="text-3xl font-bold mt-6 mb-2">Политика конфиденциальности</h1>
        <p className="text-xs text-slate-500 mb-8">Редакция от 27.05.2026 · ТОО «Turanix»</p>

        <div className="prose prose-invert max-w-none text-sm leading-relaxed space-y-5 text-slate-300">
          <p>
            Настоящая Политика описывает, какие данные ТОО «Turanix» (БИН 260540022744)
            собирает у пользователей Сервиса TenderBot, как использует и как защищает.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">1. Какие данные собираем</h2>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Email и пароль (хеш) для входа в кабинет</li>
            <li>Название компании, БИН, телефон (если указали в профиле) — для счетов</li>
            <li>Сохранённые фильтры лотов</li>
            <li>Telegram chat_id, если привязали бота</li>
            <li>IP-адрес и user-agent — для безопасности и аналитики</li>
          </ul>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">2. Зачем используем</h2>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Предоставление функциональности Сервиса</li>
            <li>Отправка уведомлений о новых лотах под ваши фильтры</li>
            <li>Биллинг и выставление счетов</li>
            <li>Обеспечение безопасности и предотвращение мошенничества</li>
          </ul>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">3. Где хранятся данные</h2>
          <p>
            Данные хранятся в защищённой PostgreSQL базе на инфраструктуре Supabase
            (поставщик данных-центров: AWS). Доступ к БД ограничен принципом
            наименьших привилегий через Row Level Security.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">4. Передача третьим лицам</h2>
          <p>
            Мы не продаём и не передаём ваши персональные данные третьим лицам, кроме случаев:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>По требованию законодательства РК (запрос правоохранительных органов)</li>
            <li>Платёжные системы (Kaspi Pay) — для проведения оплаты</li>
            <li>Поставщики email-уведомлений (Resend/Postmark) — для отправки писем</li>
            <li>Telegram — если вы добровольно привязали бота для уведомлений</li>
          </ul>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">5. Ваши права</h2>
          <p>
            В соответствии с Законом РК «О персональных данных и их защите» вы имеете право:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Получить копию своих данных</li>
            <li>Запросить их изменение или удаление</li>
            <li>Отозвать согласие на обработку</li>
          </ul>
          <p>
            Для реализации этих прав — напишите на{" "}
            <a href="mailto:info@turanix.kz" className="text-blue-400 hover:underline">info@turanix.kz</a>{" "}
            с темой «Персональные данные».
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">6. Cookie</h2>
          <p>
            Используем только необходимые cookie для авторизации (Supabase Auth).
            Маркетинговых трекеров пока нет.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">7. Изменения политики</h2>
          <p>
            Мы можем обновлять эту Политику. Существенные изменения будем анонсировать
            на email активным пользователям не менее чем за 14 дней до вступления в силу.
          </p>

          <p className="text-xs text-slate-500 mt-8 italic">
            ⚠️ Шаблонный текст. Перед публичным запуском согласуйте с юристом — особенно
            пункты о трансграничной передаче данных (Supabase = AWS, дата-центры могут быть
            за пределами РК, что требует уведомления уполномоченного органа).
          </p>
        </div>
      </div>
    </main>
  );
}
