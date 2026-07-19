import { Card } from './Card';

interface TaskCard {
  text: string;
  tag: string;
  tagBg: string;
  tagFg: string;
  who: string;
}

interface TaskColumn {
  title: string;
  dot: string;
  count: string;
  cards: TaskCard[];
}

const COLUMNS: TaskColumn[] = [
  {
    title: 'К выполнению',
    dot: '#8A7F76',
    count: '2',
    cards: [
      { text: 'Инвентаризация склада Центр', tag: 'склад', tagBg: 'rgba(127,176,236,0.15)', tagFg: '#7FB0EC', who: 'Сыдык' },
      { text: 'Обновить витрину новинками', tag: 'витрина', tagBg: 'rgba(229,178,60,0.15)', tagFg: '#E5B23C', who: 'Сайкал' },
    ],
  },
  {
    title: 'В работе',
    dot: '#E5B23C',
    count: '2',
    cards: [
      { text: 'Закупка iPhone 15 ×40', tag: 'закупка', tagBg: 'rgba(255,91,46,0.15)', tagFg: '#FF8A5F', who: 'Али' },
      { text: 'Реактивация уснувших', tag: 'CRM', tagBg: 'rgba(198,255,61,0.12)', tagFg: '#C6FF3D', who: 'Тахсир' },
    ],
  },
  {
    title: 'Готово',
    dot: '#C6FF3D',
    count: '2',
    cards: [
      { text: 'Приёмка партии AirPods', tag: 'склад', tagBg: 'rgba(127,176,236,0.15)', tagFg: '#7FB0EC', who: 'Риезидин' },
      { text: 'Z-отчёт за вчера', tag: 'касса', tagBg: 'rgba(198,255,61,0.12)', tagFg: '#C6FF3D', who: 'Азизбек' },
    ],
  },
];

/** Tasks Kanban view matching AliStore ERP 2.0 design. */
export function TasksView() {
  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
      {COLUMNS.map((col) => (
        <Card key={col.title} className="p-4">
          <div className="mb-3.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
            <span className="text-[13px] font-bold text-white">{col.title}</span>
            <span className="ml-auto text-xs text-[#8A7F76]">{col.count}</span>
          </div>
          <div className="flex flex-col gap-2">
            {col.cards.map((c, index) => (
              <div
                key={index}
                className="rounded-[11px] border border-[#2E2822] bg-[#221E19] p-3"
              >
                <div className="text-[13px] leading-[1.4] text-white">{c.text}</div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: c.tagBg, color: c.tagFg }}
                  >
                    {c.tag}
                  </span>
                  <span className="ml-auto text-[11px] text-[#8A7F76]">{c.who}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
