# Edge camera integration (EZVIZ/IP)

AliStore принимает от камеры только короткое метаданное событие. Видео, звук,
лица и необезличенные кадры в API не передаются. EZVIZ/IP-камера подключается
через локальный edge-адаптер, который выполняет детекцию/редакцию и отправляет
`POST /api/camera-gateway/events`.

## Enrollment

Owner/admin вызывает `POST /api/camera-gateway/devices` с JWT staff и получает
`deviceId` и одноразовый `secret`. Секрет хранится только на edge-адаптере;
сервер хранит SHA-256 хэш.

## Signed event

Для каждого запроса edge-адаптер формирует канонический JSON payload: ключи всех
объектов сортируются по UTF-16 code-unit порядку (`a < b`), массивы сохраняют
порядок. Подписывайте точную validated-схему API: неизвестные поля и строки
вместо чисел не должны отправляться — после серверной нормализации их подпись не
совпадёт и запрос будет отклонён. Подпись:

```text
timestamp = Unix seconds
signature = HMAC-SHA256(secret, `${timestamp}.${canonicalJson(payload)}`)
```

Заголовки:

```text
x-edge-device-secret: <enrollment secret>
x-edge-device-timestamp: <timestamp>
x-edge-device-signature: <lowercase hex HMAC>
```

Подпись действительна 5 минут. Неверная, отсутствующая или просроченная
подпись отклоняется до записи в Event Ledger. `idempotencyKey` остаётся
обязательным: повтор того же подписанного события безопасно возвращает исходный
`eventId`, а повторное использование ключа с изменённым payload отклоняется.

Проверочный вектор: secret `test-secret`, timestamp `1767225600`, payload
`{"idempotencyKey":"evt-1","deviceId":"dev-1","storePointId":"point-1","eventType":"camera_offline","confidence":1,"value":{},"occurredAt":"2026-01-01T00:00:00.000Z"}`.
Каноническая строка: `{"confidence":1,"deviceId":"dev-1","eventType":"camera_offline","idempotencyKey":"evt-1","occurredAt":"2026-01-01T00:00:00.000Z","storePointId":"point-1","value":{}}`; HMAC-hex:
`59a0f46e28ae65bb5464c48494476158fd944e23df2382e32c326b7dad9ff2bd`.

Разрешённые типы: очередь, пустая полка, offline/tamper камеры, движение в
ограниченной зоне и safety incident. Низкая уверенность создаёт только
review-событие; камера не может напрямую менять остатки, деньги или права.

## Privacy and operations

- `EDGE_CAMERA_KILL_SWITCH=1` немедленно блокирует ingestion.
- Сервер принимает только metadata (`value` ограничен 4 KiB); поля `frame`,
  `video`, `audio`, `image`, `face`, `passport` и `document` запрещены.
- `retentionHours` ограничен 720 часами; после TTL metadata превращается в
  аудируемый tombstone.
- Edge-адаптер должен отключить микрофон, face recognition и demographic /
  emotion inference и вести локальный журнал отправок без секретов.
