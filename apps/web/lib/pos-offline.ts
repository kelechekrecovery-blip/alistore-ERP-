import type { PosLine, PosPayment, PosPendingApproval, PosSaleOutcome, PosSaleResult } from './api/pos';

const STORAGE_KEY = 'alistore.pos.offlineQueue.v1';

export type OfflinePosQueueStatus = 'queued' | 'syncing' | 'synced' | 'failed' | 'approval_required';

export interface OfflinePosPayload {
  staffId: string;
  point: string;
  method: string;
  payments?: PosPayment[];
  discountPct?: number;
  approvalId?: string;
  customerBinding?: string;
  clientSaleId?: string;
  lines: PosLine[];
}

export interface PosReceiptLineSnapshot extends PosLine {
  name: string;
}

export interface PosReceiptSnapshot {
  clientSaleId: string;
  localReceiptNo: string;
  cashier: string;
  shop: string;
  point: string;
  method: string;
  payments?: PosPayment[];
  subtotal: number;
  total: number;
  discountPct: number;
  createdAt: string;
  lines: PosReceiptLineSnapshot[];
}

export interface OfflinePosQueueItem {
  id: string;
  clientSaleId: string;
  localReceiptNo: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  status: OfflinePosQueueStatus;
  attempts: number;
  lastError?: string;
  /** Прогон синка, который держит статус `syncing`; см. SYNC_RUN_ID. */
  syncRunId?: string;
  payload: OfflinePosPayload;
  snapshot: PosReceiptSnapshot;
  result?: PosSaleResult;
  approval?: PosPendingApproval;
}

export function createPosClientSaleId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `pos-${rand}`;
}

/**
 * Ключ идемпотентности незавершённой продажи переживает перезагрузку вкладки.
 *
 * Он жил только в React-стейте. Прокси отдавал 502 **после** того, как API
 * закоммитил продажу; тело не JSON, сообщение `request failed 502` под регексп
 * сетевых ошибок не подходит — в очередь не клали, чек не печатали, показывали
 * тост. Кассир жал F5, стейт терялся, генерировался новый clientSaleId, и
 * сервер проводил вторую продажу того же товара: второй заказ, второй Payment,
 * второе списание единицы. Недостача ровно в цену чека при одной ушедшей
 * коробке.
 */
const ACTIVE_SALE_KEY = 'alistore.pos.activeClientSaleId.v1';

export function loadActiveClientSaleId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ACTIVE_SALE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberActiveClientSaleId(clientSaleId: string) {
  if (typeof window === 'undefined') return;
  try {
    if (clientSaleId) window.localStorage.setItem(ACTIVE_SALE_KEY, clientSaleId);
    else window.localStorage.removeItem(ACTIVE_SALE_KEY);
  // fixtures-allowed: private-mode/storage quota failures must not block a sale.
  } catch {
    // Приватный режим/переполнение: продажа важнее памяти о ключе.
  }
}

export function createLocalReceiptNo(clientSaleId: string): string {
  return `OFF-${clientSaleId.replace(/^pos-/, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Метка живого прогона синхронизации: `syncing` без неё — продажа, за которую уже
 * некому ответить.
 *
 * Статус `syncing` пишется в localStorage перед `await sendSale` и снимается только
 * после ответа. Вкладку закрыли, приложение убили, запрос повис на оборванной сети —
 * и продажа остаётся `syncing` навсегда: цикл синка берёт только
 * `queued`/`failed`/`approval_required`, в `offlineQueueStats` она не попадает ни в
 * pending, ни в failed, «очистить synced» её не трогает. Деньги приняты, чек отдан,
 * на сервер продажа не ушла, а у кассира нет ни повтора, ни удаления.
 *
 * Идентификатор живёт в памяти модуля, то есть ровно столько же, сколько вкладка
 * (это просто уникальный токен, к самой продаже он отношения не имеет): чужой или
 * отсутствующий id при загрузке означает, что тот прогон уже не жив. Повтор
 * безопасен — ключ идемпотентности `clientSaleId` лежит в самом элементе очереди и
 * не пересоздаётся, поэтому сервер по `pos:<clientSaleId>` либо проведёт продажу
 * впервые, либо вернёт ту же самую вместо второй.
 */
const SYNC_RUN_ID = createPosClientSaleId();

/**
 * Запас на живой запрос из соседней вкладки: у fetch здесь нет таймаута, так что
 * чужой `syncing` считаем брошенным не сразу, а когда он старше этого окна.
 */
const STALE_SYNC_MS = 120_000;

function reviveInterruptedSync(item: OfflinePosQueueItem): OfflinePosQueueItem {
  if (item.status !== 'syncing' || item.syncRunId === SYNC_RUN_ID) return item;
  // Битую или уехавшую вперёд метку времени считаем не «свежей», а мёртвой:
  // зависнуть в очереди навсегда хуже, чем повториться по идемпотентному ключу.
  const elapsed = Date.now() - Date.parse(item.updatedAt);
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < STALE_SYNC_MS) return item;
  return {
    ...item,
    status: 'failed',
    lastError: 'Синхронизация прервана — продажа не подтверждена, нужен повтор',
  };
}

export function loadOfflinePosQueue(): OfflinePosQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflinePosQueueItem[];
    return Array.isArray(parsed) ? parsed.map(reviveInterruptedSync) : [];
  } catch {
    return [];
  }
}

export function saveOfflinePosQueue(queue: OfflinePosQueueItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueueOfflinePosSale(payload: OfflinePosPayload, snapshot: Omit<PosReceiptSnapshot, 'clientSaleId' | 'localReceiptNo' | 'createdAt'>) {
  const clientSaleId = payload.clientSaleId ?? createPosClientSaleId();
  const now = new Date().toISOString();
  const item: OfflinePosQueueItem = {
    id: clientSaleId,
    clientSaleId,
    localReceiptNo: createLocalReceiptNo(clientSaleId),
    createdAt: now,
    updatedAt: now,
    status: 'queued',
    attempts: 0,
    payload: { ...payload, clientSaleId },
    snapshot: {
      ...snapshot,
      clientSaleId,
      localReceiptNo: createLocalReceiptNo(clientSaleId),
      createdAt: now,
    },
  };
  saveOfflinePosQueue([item, ...loadOfflinePosQueue().filter((q) => q.clientSaleId !== clientSaleId)]);
  return item;
}

export function clearSyncedOfflinePosQueue(): OfflinePosQueueItem[] {
  const queue = loadOfflinePosQueue().filter((item) => item.status !== 'synced');
  saveOfflinePosQueue(queue);
  return queue;
}

export function removeOfflinePosQueueItem(id: string): OfflinePosQueueItem[] {
  const queue = loadOfflinePosQueue().filter((item) => item.id !== id);
  saveOfflinePosQueue(queue);
  return queue;
}

export function offlineQueueStats(queue: OfflinePosQueueItem[]) {
  return {
    pending: queue.filter((item) => ['queued', 'failed', 'approval_required'].includes(item.status)).length,
    synced: queue.filter((item) => item.status === 'synced').length,
    failed: queue.filter((item) => item.status === 'failed').length,
    approval: queue.filter((item) => item.status === 'approval_required').length,
  };
}

export function isLikelyNetworkError(error: unknown, online: boolean): boolean {
  if (!online) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed|request failed 0|fetch/i.test(msg);
}

export async function syncOfflinePosQueue(
  sendSale: (payload: OfflinePosPayload) => Promise<PosSaleOutcome>,
  onChange?: (queue: OfflinePosQueueItem[]) => void,
): Promise<OfflinePosQueueItem[]> {
  let queue = loadOfflinePosQueue();

  for (const current of queue) {
    if (!['queued', 'failed', 'approval_required'].includes(current.status)) continue;

    const previousStatus = current.status;
    let item: OfflinePosQueueItem = {
      ...current,
      status: 'syncing',
      syncRunId: SYNC_RUN_ID,
      attempts: current.attempts + 1,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    };
    queue = replace(queue, item);
    saveOfflinePosQueue(queue);
    onChange?.(queue);

    try {
      const outcome = await sendSale(item.payload);
      if (outcome.pendingApproval) {
        item = {
          ...item,
          status: 'approval_required',
          approval: outcome,
          payload: { ...item.payload, approvalId: outcome.approvalId },
          lastError: `Нужно одобрение скидки #${outcome.approvalId.slice(-8)}`,
          updatedAt: new Date().toISOString(),
        };
      } else {
        item = {
          ...item,
          status: 'synced',
          result: outcome,
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка синхронизации';
      const stillWaitingApproval = previousStatus === 'approval_required' && /одобрен|approved|approval/i.test(message);
      item = {
        ...item,
        status: stillWaitingApproval ? 'approval_required' : 'failed',
        lastError: message,
        updatedAt: new Date().toISOString(),
      };
    }

    queue = replace(queue, item);
    saveOfflinePosQueue(queue);
    onChange?.(queue);
  }

  return queue;
}

function replace(queue: OfflinePosQueueItem[], item: OfflinePosQueueItem) {
  return queue.map((q) => (q.id === item.id ? item : q));
}
