# Деплой на свой Proxmox

Проще всего — Docker-контейнер внутри LXC или VM на Proxmox. В репозитории
уже есть `Dockerfile` и `docker-compose.yml`, деплой сводится к нескольким
командам.

## Вариант A: Docker в LXC-контейнере (рекомендуется)

1. **Создайте LXC-контейнер** в Proxmox: Debian 12, ≥2 vCPU, ≥2 GB RAM, 8+ GB
   диска. Контейнер может быть непривилегированным, но для Docker внутри LXC
   нужны Nesting и keyctl:

   - В настройках контейнера → *Options* → *Features* включите `nesting=1` и
     `keyctl=1` (или через хост: `pct set <CTID> -features nesting=1,keyctl=1`).
   - Проще всего использовать готовый скрипт из
     [Proxmox VE Helper-Scripts](https://community-scripts.github.io/ProxmoxVE/)
     — раздел Docker LXC — он сразу создаёт контейнер с нужными фичами и
     установленным Docker.

2. **Установите Docker** внутри контейнера (если не через helper-скрипт):

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

3. **Заберите код на контейнер.** Либо `git clone` репозитория, либо просто
   скопируйте проект (`scp -r` / `rsync`) с машины, где он сейчас лежит:

   ```bash
   git clone https://github.com/IT-DO/vibe.git printaukcion
   cd printaukcion
   git checkout claude/3d-printing-portal-1dmb4x   # или main, если PR смёржен
   ```

4. **Задайте секрет** для NextAuth (обязательно свой, длинный случайный):

   ```bash
   echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
   ```

5. **Соберите и запустите:**

   ```bash
   docker compose up -d --build
   ```

   При первом старте контейнер сам применит миграции Prisma
   (`prisma migrate deploy` в `docker-entrypoint.sh`). База — SQLite-файл в
   именованном томе `db-data`, переживает пересборки и рестарты контейнера.

   Чтобы сразу засеять демо-данными: добавьте в `.env` строку
   `SEED_ON_START=true` перед первым запуском (потом уберите, чтобы не
   переsead-ить пустую базу поверх боевых данных).

6. Приложение слушает `0.0.0.0:3000` внутри контейнера. Проверьте:
   `curl http://<IP-контейнера>:3000`.

## Вариант B: без Docker, напрямую через Node + systemd

1. LXC-контейнер Debian/Ubuntu, установите Node.js 22 и git:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt-get install -y nodejs git
   ```

2. Клонируйте репозиторий, поставьте зависимости и соберите:

   ```bash
   git clone https://github.com/IT-DO/vibe.git /opt/printaukcion
   cd /opt/printaukcion
   npm ci
   npm run build
   ```

3. `.env` (свой `DATABASE_URL` вне git-дерева, например `/var/lib/printaukcion`):

   ```
   DATABASE_URL="file:/var/lib/printaukcion/prod.db"
   AUTH_SECRET="<длинная случайная строка>"
   ```

   ```bash
   mkdir -p /var/lib/printaukcion
   npx prisma migrate deploy
   ```

4. systemd-юнит `/etc/systemd/system/printaukcion.service`:

   ```ini
   [Unit]
   Description=PrintAukcion
   After=network.target

   [Service]
   WorkingDirectory=/opt/printaukcion
   EnvironmentFile=/opt/printaukcion/.env
   ExecStart=/usr/bin/npx next start -H 0.0.0.0 -p 3000
   Restart=always
   User=www-data

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   systemctl daemon-reload
   systemctl enable --now printaukcion
   ```

## Доступ снаружи / домен / HTTPS

Оба варианта поднимают приложение на порту 3000 внутри контейнера/VM. Чтобы
открыть его по домену с HTTPS, поставьте перед ним реверс-прокси — проще
всего ещё один LXC/сервис с **Nginx Proxy Manager** или **Caddy**, который
проксирует на `<IP-контейнера>:3000` и сам получает сертификат Let's Encrypt.
Если приложение нужно только в локальной сети — можно оставить как есть и
просто открыть порт 3000 в файрволе Proxmox/LXC.

## Бэкапы

- Docker-вариант: бэкапьте volume `db-data` (или просто делайте
  `vzdump`/снапшот всего LXC-контейнера в Proxmox — это самый простой способ).
- Node-вариант: бэкапьте файл `/var/lib/printaukcion/prod.db`.

## Продакшн-оговорки

SQLite в текущей схеме подходит для прототипа/малой нагрузки (однопоточная
запись). Если нагрузка вырастет, можно переехать на PostgreSQL: поменять
`provider` в `prisma/schema.prisma` на `postgresql`, `DATABASE_URL` — на
строку подключения, накатить `prisma migrate dev` заново. Код приложения
менять не придётся, так как enum'ы уже реализованы как строки специально ради
совместимости с обоими движками.
