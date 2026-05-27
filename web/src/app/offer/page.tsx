// Договор-оферта SaaS-сервиса. Скелет — финальный текст должен подготовить юрист.
import Link from "next/link";

export const metadata = { title: "Договор-оферта — TenderBot" };

export default function OfferPage() {
  return (
    <main className="min-h-screen text-slate-100 px-6 py-10"
      style={{ background: "radial-gradient(1200px 600px at 80% -10%, #16203a 0%, #0b0f1a 55%)" }}>
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">← TenderBot</Link>
        <h1 className="text-3xl font-bold mt-6 mb-2">Договор-оферта</h1>
        <p className="text-xs text-slate-500 mb-8">Редакция от 27.05.2026 · ТОО «Turanix», БИН 260540022744</p>

        <div className="prose prose-invert max-w-none text-sm leading-relaxed space-y-5 text-slate-300">
          <p>
            Настоящий документ (далее — «Оферта») является официальным предложением ТОО «Turanix»
            (БИН 260540022744, адрес: г. Алматы, далее — «Исполнитель») заключить договор на
            оказание услуг сервиса TenderBot (далее — «Сервис») на нижеизложенных условиях.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">1. Предмет договора</h2>
          <p>
            1.1. Исполнитель предоставляет Заказчику доступ к Сервису по сбору и фильтрации
            публичной информации о тендерных закупках на территории Республики Казахстан.
          </p>
          <p>
            1.2. Сервис не является участником тендерных закупок и не несёт ответственности
            за решения, принятые Заказчиком на основании предоставленных данных.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">2. Стоимость и порядок оплаты</h2>
          <p>
            2.1. Стоимость подписки указывается на странице{" "}
            <Link href="/#plans" className="text-blue-400 hover:underline">тарифов</Link>.
          </p>
          <p>
            2.2. Оплата производится ежемесячной предоплатой через Kaspi Pay либо банковским
            переводом по выставленному счёту.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">3. Пробный период</h2>
          <p>
            3.1. Новым пользователям предоставляется 7-дневный бесплатный пробный период
            на тарифе Starter. По окончании пробного периода доступ к Сервису приостанавливается
            до оформления подписки.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">4. Ответственность сторон</h2>
          <p>
            4.1. Исполнитель прилагает разумные усилия для обеспечения актуальности данных,
            но не гарантирует 100% полноту покрытия всех тендерных площадок.
          </p>
          <p>
            4.2. Сервис предоставляется «как есть». Исполнитель не несёт ответственности за
            упущенную выгоду, прямой или косвенный ущерб.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">5. Расторжение договора</h2>
          <p>
            5.1. Заказчик может расторгнуть договор в любой момент, отменив подписку в Личном
            кабинете. Возврат за неиспользованный период не производится.
          </p>

          <h2 className="text-lg font-semibold text-slate-100 mt-6">6. Контакты Исполнителя</h2>
          <p>
            ТОО «Turanix»<br />
            БИН: 260540022744<br />
            Email: <a href="mailto:info@turanix.kz" className="text-blue-400 hover:underline">info@turanix.kz</a><br />
            Сайт: <a href="https://turanix.kz" className="text-blue-400 hover:underline">turanix.kz</a>
          </p>

          <p className="text-xs text-slate-500 mt-8 italic">
            ⚠️ Это шаблонный текст. Перед публичным запуском обязательно согласуйте финальную
            редакцию с юристом — особенно разделы об ответственности и обработке персональных
            данных в части соответствия Закону РК «О персональных данных и их защите».
          </p>
        </div>
      </div>
    </main>
  );
}
