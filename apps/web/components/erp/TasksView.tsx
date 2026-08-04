'use client';

import { useCallback, useEffect, useState } from 'react';
import { createStaffTask, fetchStaffTaskBoard, type StaffTaskWithAssignee } from '@/lib/api/staff-tasks';
import { fetchStaffAccounts, type StaffAccountRow } from '@/lib/api/staff-auth';
import { isPermissionDenied } from '@/lib/api/http';
import { AsyncPanel } from './AsyncPanel';
import { Card } from './Card';

type BoardStatus = 'open' | 'in_progress' | 'completed';

const COLUMNS: { status: BoardStatus; title: string; dot: string }[] = [
  { status: 'open', title: 'К выполнению', dot: '#8A7F76' },
  { status: 'in_progress', title: 'В работе', dot: '#E5B23C' },
  { status: 'completed', title: 'Готово', dot: '#C6FF3D' },
];

const PRIORITY_STYLE: Record<StaffTaskWithAssignee['priority'], { background: string; color: string; label: string }> = {
  urgent: { background: 'rgba(255,91,46,0.15)', color: '#FF8A5F', label: 'срочно' },
  high: { background: 'rgba(229,178,60,0.15)', color: '#E5B23C', label: 'высокий' },
  normal: { background: 'rgba(127,176,236,0.15)', color: '#7FB0EC', label: 'обычный' },
  low: { background: 'rgba(138,127,118,0.15)', color: '#8A7F76', label: 'низкий' },
};

function dueLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  return `до ${new Date(dueAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`;
}

/**
 * Доска задач команды.
 *
 * Здесь были три колонки с шестью карточками из константы: «Инвентаризация
 * склада Центр — Сыдык», «Закупка iPhone 15 ×40 — Али», и счётчики строками
 * ('2'), которые не менялись никогда. Ни пропсов, ни запроса компонент не имел.
 *
 * Доска на чтение: перетаскивания нет намеренно. В домене нет владельческих
 * переходов — SELF_TRANSITIONS запрещает даже отмену, а updateMine требует
 * совпадения исполнителя. Кнопка, которая всегда возвращает 403, хуже её
 * отсутствия.
 */
export function TasksView({ accessToken }: { accessToken: string }) {
  const [tasks, setTasks] = useState<StaffTaskWithAssignee[] | null>(null);
  const [error, setError] = useState('');
  const [roster, setRoster] = useState<StaffAccountRow[]>([]);
  const [draft, setDraft] = useState({ title: '', assigneeId: '', priority: 'normal' as StaffTaskWithAssignee['priority'] });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [rosterError, setRosterError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setTasks(await fetchStaffTaskBoard({ status: ['open', 'in_progress', 'completed'] }, accessToken)); }
    catch (cause) {
      setTasks(null);
      const detail = cause instanceof Error ? cause.message : '';
      setError(detail ? `Не удалось загрузить задачи: ${detail}` : 'Не удалось загрузить задачи');
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  // The assignee roster needs staff:manage. An admin with only staff_tasks:manage
  // gets an empty list — the form then explains that assigning is owner-only,
  // rather than failing the whole board. Only that case is swallowed: a network
  // or server failure used to look identical to "you may not see the roster",
  // which quietly turned a broken board into a permissions story.
  useEffect(() => {
    void fetchStaffAccounts(accessToken)
      .then(setRoster)
      .catch((error: unknown) => {
        setRoster([]);
        if (isPermissionDenied(error)) return;
        const detail = error instanceof Error ? error.message : '';
        setRosterError(detail ? `Не удалось загрузить исполнителей: ${detail}` : 'Не удалось загрузить исполнителей');
      });
  }, [accessToken]);

  async function submitTask() {
    const title = draft.title.trim();
    if (!title || !draft.assigneeId) { setCreateMsg('Укажите заголовок и исполнителя'); return; }
    setCreating(true);
    setCreateMsg('');
    try {
      await createStaffTask({ title, assigneeId: draft.assigneeId, priority: draft.priority }, accessToken);
      setDraft({ title: '', assigneeId: '', priority: 'normal' });
      setCreateMsg('Задача создана.');
      await load();
    } catch (cause) {
      setCreateMsg(cause instanceof Error ? cause.message : 'Не удалось создать задачу');
    } finally {
      setCreating(false);
    }
  }

  const inputClass = 'h-10 w-full rounded-[8px] border border-surface-3 bg-surface px-3 text-sm text-white outline-none focus:border-faint';

  return (
    <div className="grid gap-3.5">
      <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
        <div className="mb-3 font-display text-[15px] font-bold">Поставить задачу</div>
        {roster.length === 0 ? (
          <p className="text-sm text-subtle">Назначение задач доступно владельцу (нужен доступ к списку сотрудников).</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <input aria-label="Заголовок задачи" placeholder="Что нужно сделать" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={`${inputClass} xl:col-span-2`} />
              <select aria-label="Исполнитель" value={draft.assigneeId} onChange={(e) => setDraft((d) => ({ ...d, assigneeId: e.target.value }))} className={inputClass}>
                <option value="">Исполнитель…</option>
                {roster.map((s) => <option key={s.id} value={s.id}>{s.username} · {s.role}</option>)}
              </select>
              <select aria-label="Приоритет" value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as StaffTaskWithAssignee['priority'] }))} className={inputClass}>
                <option value="low">низкий</option>
                <option value="normal">обычный</option>
                <option value="high">высокий</option>
                <option value="urgent">срочно</option>
              </select>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" disabled={creating} onClick={() => void submitTask()} className="rounded-btn bg-lime px-4 py-2 text-sm font-extrabold text-lime-ink disabled:opacity-50">
                Создать задачу
              </button>
              {createMsg && <span className="text-sm text-warn">{createMsg}</span>}
              {rosterError && <span className="text-sm text-warn">{rosterError}</span>}
            </div>
          </>
        )}
      </div>

      <AsyncPanel data={tasks} error={error} onRetry={() => void load()} loadingText="Загружаем задачи команды…">
      {(list) => (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const cards = list.filter((task) => task.status === column.status);
            return (
              <Card key={column.status} className="p-4">
                <div className="mb-3.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: column.dot }} aria-hidden />
                  <span className="text-[13px] font-bold text-white">{column.title}</span>
                  <span className="ml-auto text-xs tabular-nums text-[#8A7F76]">{cards.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {cards.length === 0 && <p className="py-4 text-center text-xs text-subtle">Пусто</p>}
                  {cards.map((task) => {
                    const priority = PRIORITY_STYLE[task.priority];
                    const due = dueLabel(task.dueAt);
                    return (
                      <article key={task.id} className="rounded-[11px] border border-[#2E2822] bg-[#221E19] p-3">
                        <div className="text-[13px] leading-[1.4] text-white">{task.title}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium" style={{ background: priority.background, color: priority.color }}>
                            {priority.label}
                          </span>
                          {due && <span className="text-[10px] text-[#8A7F76]">{due}</span>}
                          <span className="ml-auto text-[11px] text-[#8A7F76]">{task.assignee?.username ?? 'без исполнителя'}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </AsyncPanel>
    </div>
  );
}
