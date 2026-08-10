import { MATERIALS, MATERIAL_PROPERTIES, MATERIAL_SPECS } from "@/lib/constants";

export const metadata = {
  title: "Материалы и технологии печати — PrintAukcion",
};

export default function MaterialsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Материалы и технологии печати</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Сравнение материалов, доступных при размещении заказа — от обычного FDM-пластика
        до печати металлом и литья по восковым моделям. Значения ниже —{" "}
        <strong>усреднённые справочные ориентиры</strong>, а не точные данные конкретного
        производителя: реальные цифры зависят от бренда филамента/смолы, настроек
        печати и постобработки. Для критичных по нагрузке или температуре деталей
        уточняйте параметры у конкретного исполнителя.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Материал</th>
              <th className="px-4 py-3 font-semibold">Технология</th>
              <th className="px-4 py-3 font-semibold">Температура печати/процесса</th>
              <th className="px-4 py-3 font-semibold">Термостойкость (HDT)</th>
              <th className="px-4 py-3 font-semibold">Ударная вязкость</th>
              <th className="px-4 py-3 font-semibold">Плотность</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MATERIALS.map((material) => {
              const spec = MATERIAL_SPECS[material];
              if (!spec) return null;
              return (
                <tr key={material} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{material}</td>
                  <td className="px-4 py-3 text-slate-600">{spec.technology}</td>
                  <td className="px-4 py-3 text-slate-600">{spec.processTemp}</td>
                  <td className="px-4 py-3 text-slate-600">{spec.heatResistance}</td>
                  <td className="px-4 py-3 text-slate-600">{spec.impactToughness}</td>
                  <td className="px-4 py-3 text-slate-600">{spec.density}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-lg font-bold text-slate-900">Технологии печати на площадке</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TechCard
          title="FDM/FFF"
          text="Послойное наплавление пластиковой нити — самая распространённая и доступная технология. Большинство материалов ниже, включая композиты с наполнителем (карбон, стекловолокно, дерево, металл)."
        />
        <TechCard
          title="SLA/DLP"
          text="Фотополимерная смола отверждается УФ-светом слой за слоем. Максимальная детализация и гладкая поверхность — для миниатюр и ювелирных изделий."
        />
        <TechCard
          title="SLS"
          text="Лазер спекает порошок (обычно нейлон) без необходимости в поддержках — можно печатать сложную геометрию, недоступную FDM. Дороже и дольше."
        />
        <TechCard
          title="DMLS/SLM"
          text="Лазерная плавка металлического порошка — печать настоящих металлических деталей (сталь, титан, алюминий). Самая дорогая и медленная технология из представленных."
        />
        <TechCard
          title="Литьё по выплавляемым моделям"
          text="Восковая модель печатается на 3D-принтере, а затем используется как заготовка для классического металлического литья — популярно в ювелирном деле."
        />
      </div>

      <h2 className="mt-10 text-lg font-bold text-slate-900">Подробнее по каждому материалу</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {MATERIALS.map((material) => (
          <div key={material} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="font-semibold text-slate-900">{material}</dt>
            <dd className="mt-1 text-sm text-slate-600">{MATERIAL_PROPERTIES[material]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TechCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}
