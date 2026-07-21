-- Лента событий ERP читается как `ORDER BY ts DESC LIMIT 50` по пустому where:
-- без индекса это полный проход append-only таблицы с сортировкой при каждом
-- открытии кокпита. Второй индекс — та же лента, отфильтрованная по типу.
CREATE INDEX "AuditEvent_ts_idx" ON "AuditEvent"("ts");
CREATE INDEX "AuditEvent_type_ts_idx" ON "AuditEvent"("type", "ts");
