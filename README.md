# SAY Fashion — быстрый MVP магазина

Магазин одежды для Беларуси: адаптивная витрина, корзина, выбор реального отделения через API Европочты, защищённая оплата через hosted checkout bePaid, админка и создание карточки товара из обычного фото через OpenRouter.

## Запуск локально

1. Дважды нажмите `start-local.cmd`.
2. При первом запуске откройте `.env` и замените `ADMIN_PASSWORD` и `AUTH_SECRET`.
3. Магазин: `http://localhost:3000`, админка: `http://localhost:3000/admin`.

Без ключей bePaid заказ работает в демо-режиме. Без OpenRouter ручное создание товара работает, AI-кнопка — нет.

## Что нужно заполнить в `.env`

- `NEXT_PUBLIC_APP_URL` — публичный HTTPS-адрес магазина.
- `OPENROUTER_API_KEY` — ключ OpenRouter.
- `BEPAID_SHOP_ID`, `BEPAID_SECRET_KEY` — данные магазина bePaid.
- `BEPAID_PUBLIC_KEY` — RSA public key магазина из кабинета bePaid. Он обязателен: без него webhook намеренно отклоняется.
- После тестирования bePaid поставьте `BEPAID_TEST=false`.
- `EUROPOST_API_URL` и `EUROPOST_SERVICE_NUMBER` уже настроены на публичный API отделений Европочты. Список городов и ПВЗ загружается только из API, кэшируется на 15 минут и повторно проверяется сервером при заказе.

## Сервер hoster.by

Подходит VPS/VDS с Ubuntu, Docker, Docker Compose, Git и nginx. Один раз на сервере:

```bash
git clone <URL-ВАШЕГО-РЕПОЗИТОРИЯ> /opt/say-fashion
cd /opt/say-fashion
cp .env.example .env
nano .env
docker compose up -d --build
```

В nginx направьте домен на `http://127.0.0.1:3000` и подключите HTTPS. Данные магазина и загруженные фото сохраняются в `runtime/` и переживают пересборку контейнера.

## Автодеплой из GitHub

Workflow запускается при push в `main`. В GitHub → Settings → Secrets and variables → Actions добавьте:

- `DEPLOY_HOST` — IP/домен VPS;
- `DEPLOY_USER` — SSH-пользователь;
- `DEPLOY_SSH_KEY` — приватный SSH-ключ;
- `DEPLOY_PORT` — обычно `22`;
- `DEPLOY_PATH` — например `/opt/say-fashion`.

После этого архивы вручную загружать не нужно: push в `main` обновит код и контейнер.

## Перед боевым запуском

Проверьте callback bePaid на публичном HTTPS-домене, загрузите RSA public key из кабинета bePaid, заключите договор с Европочтой для автоматического создания отправлений, замените демо-товары, добавьте юридические страницы/реквизиты продавца и резервное копирование каталога `runtime/`.

## Защита оплаты bePaid

- сумма, валюта, Shop ID, режим test/live, tracking ID и токен сверяются с заказом на сервере;
- webhook принимается только с правильными Basic Auth и RSA/SHA-256 `Content-Signature`;
- подпись проверяется по исходному телу запроса до разбора JSON;
- повторные webhook обрабатываются идемпотентно;
- возврат покупателя не считается подтверждением: сервер отдельно запрашивает статус по API bePaid;
- платёжная форма ограничена тремя попытками и живёт 30 минут;
- карточные данные магазин не принимает и не хранит — ввод выполняется на странице bePaid.
