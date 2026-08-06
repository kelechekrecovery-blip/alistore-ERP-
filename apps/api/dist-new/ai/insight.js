"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInsights = buildInsights;
const HEALTHY_MARGIN_PCT = 12;
function buildInsights(input) {
    const out = [];
    if (input.paidOrders > 0) {
        if (input.marginPct < HEALTHY_MARGIN_PCT) {
            out.push({
                tone: 'warning',
                title: `Низкая маржа: ${input.marginPct}%`,
                detail: `Валовая маржа ниже ${HEALTHY_MARGIN_PCT}% — проверьте закупочные цены и скидки.`,
            });
        }
        else {
            out.push({
                tone: 'positive',
                title: `Здоровая маржа: ${input.marginPct}%`,
                detail: `Валовая прибыль ${fmt(input.grossMargin)} сом · средний чек ${fmt(input.avgCheck)} сом.`,
            });
        }
    }
    if (input.topProduct) {
        out.push({
            tone: 'info',
            title: `Лидер продаж: ${input.topProduct.name}`,
            detail: `Выручка ${fmt(input.topProduct.revenue)} сом — держите его в наличии и на витрине.`,
        });
    }
    if (input.topSeller) {
        out.push({
            tone: 'positive',
            title: `Лучший продавец: ${input.topSeller.staffId}`,
            detail: `Принёс ${fmt(input.topSeller.revenue)} сом — кандидат на бонус.`,
        });
    }
    if (input.reorderUrgent && input.reorderUrgent.count > 0) {
        const names = input.reorderUrgent.names.slice(0, 3).join(', ');
        out.push({
            tone: 'warning',
            title: `Дефицит: ${input.reorderUrgent.count} поз. нет в наличии`,
            detail: `Есть спрос, но пусто на складе${names ? `: ${names}` : ''}. Дозакажите — вкладка «Закупки».`,
        });
    }
    if (input.overstock && input.overstock.count > 0) {
        out.push({
            tone: 'info',
            title: `Затоварка: ${input.overstock.count} поз. без продаж`,
            detail: `${input.overstock.topName ?? 'Товары'} лежат без движения — снизьте цену (вкладка «Цены»).`,
        });
    }
    const grossSales = input.net + input.refunds;
    if (grossSales > 0 && input.refunds > grossSales * 0.15) {
        out.push({
            tone: 'warning',
            title: 'Высокая доля возвратов',
            detail: `Возвраты ${fmt(input.refunds)} сом — разберите причины в Dispute/Returns.`,
        });
    }
    if (input.pendingApprovals > 0) {
        out.push({
            tone: 'warning',
            title: `На одобрении: ${input.pendingApprovals}`,
            detail: 'Опасные действия ждут решения — откройте Approval Inbox.',
        });
    }
    const high = input.risks.filter((r) => r.severity === 'high');
    if (high.length > 0) {
        out.push({
            tone: 'warning',
            title: `${high.length} критичных тревог`,
            detail: high[0].detail + (high.length > 1 ? ` (+${high.length - 1})` : ''),
        });
    }
    else if (input.risks.length === 0) {
        out.push({ tone: 'positive', title: 'Всё сходится', detail: 'Тревог в Risk Center нет.' });
    }
    return out;
}
function fmt(n) {
    return new Intl.NumberFormat('ru-RU').format(n);
}
//# sourceMappingURL=insight.js.map