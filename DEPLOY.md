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

Оба варианта поднимают приложение на порту 3000 внутри контейнера/VM. Если
нужен только доступ из локальной сети — этого достаточно, дальше можно не
читать. Если хотите открыть портал по домену с HTTPS — понадобится:

1. **Домен**, у которого A-запись указывает на ваш внешний IP.
2. **Проброс портов 80 и 443** с роутера на IP этого LXC-контейнера (порт
   3000 наружу пробрасывать не нужно — снаружи всё идёт через 80/443).

Дальше — самый простой вариант, **встроенный Caddy** (в репозитории уже есть
`Caddyfile` и `docker-compose.https.yml`, ничего дополнительно устанавливать
не нужно, сертификат Let's Encrypt Caddy получит и обновит сам):

```bash
cd ~/printaukcion
echo "DOMAIN=your-domain.example" >> .env
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

Через минуту-другую сайт должен открыться на `https://your-domain.example`.
Приложение при этом остаётся доступно и по `http://<LAN-IP>:3000` — оверлей
только добавляет Caddy, ничего не убирает.

Если предпочитаете GUI — вместо Caddy можно поднять ещё один LXC/сервис с
**Nginx Proxy Manager**, который так же проксирует на `<IP-контейнера>:3000`
и сам получает сертификат.

После того как появится домен, стоит явно задать `APP_URL` в `.env` (см.
`.env.example`) — иначе ссылки в письмах и на оплату ЮKassa будут строиться
из заголовков запроса, что менее надёжно для боевого домена.

## Бэкапы

Самый простой способ — снапшот всего LXC-контейнера средствами Proxmox
(`vzdump`, из Datacenter → CT → Backup, можно по расписанию). Это резервирует
вообще всё, включая базу и загруженные файлы, без какой-либо настройки
внутри контейнера.

Второй, более гранулярный способ — скрипт `scripts/backup.sh` (для
Docker-варианта). Он делает консистентный снапшот базы через `sqlite3
.backup` (безопаснее, чем просто копировать файл во время работы сервера) и
архивирует папку с загруженными файлами — оба кладутся в `./backups/` рядом
с `docker-compose.yml`, отдельно от тома `db-data`.

Разовый запуск (из `~/printaukcion` на хосте, где лежит `docker-compose.yml`):

```bash
./scripts/backup.sh
```

По расписанию — добавьте в `crontab -e` (например, каждую ночь в 3:00):

```
0 3 * * * cd /root/printaukcion && ./scripts/backup.sh >> /var/log/printaukcion-backup.log 2>&1
```

Бэкапы копятся локально в том же контейнере — для настоящей надёжности
периодически забирайте `./backups/` на другую машину (`rsync`/`scp`) или
храните их на отдельном диске/NAS, смонтированном в LXC.

### Восстановление из `scripts/backup.sh`

```bash
cd ~/printaukcion
docker compose stop app

# узнать имя тома, если не уверены:
docker volume ls | grep db-data

docker run --rm \
  -v printaukcion_db-data:/data \
  -v "$(pwd)/backups:/backup" \
  alpine sh -c '
    cp /backup/db-<TIMESTAMP>.db /data/prod.db &&
    rm -rf /data/uploads &&
    tar -xzf /backup/uploads-<TIMESTAMP>.tar.gz -C /data
  '

docker compose up -d
```

Подставьте нужный `<TIMESTAMP>` (имена файлов в `./backups/` — `db-YYYYMMDD-HHMMSS.db`
и `uploads-YYYYMMDD-HHMMSS.tar.gz` из одного и того же запуска бэкапа).

### Node-вариант (без Docker)

Бэкапьте файл `/var/lib/printaukcion/prod.db` и папку из `UPLOAD_DIR`
напрямую (`cp`/`rsync`), Docker здесь не участвует.

## Мониторинг

Контейнер приложения сообщает Docker о своём состоянии через встроенный
healthcheck (`GET /api/health`, проверяет доступность базы) — видно в
`docker compose ps` (колонка `STATUS` покажет `healthy`/`unhealthy`), Docker
сам перезапустит контейнер при `restart: unless-stopped`, если тот перестанет
отвечать.

Место на диске у вас уже кончалось один раз — чтобы не узнавать об этом
постфактум, есть `scripts/check-disk.sh`: проверяет `df /`, и если занято
больше порога (по умолчанию 85%), шлёт письмо на `ALERT_EMAIL` через тот же
SMTP, что настроен для приложения (реального почтового сервера на хосте не
нужно). Включается двумя переменными в `.env`:

```bash
echo "ALERT_EMAIL=you@example.com" >> .env
echo "INTERNAL_ALERT_TOKEN=$(openssl rand -hex 24)" >> .env
docker compose up -d   # применить новые переменные
```

По расписанию — в `crontab -e` (например, раз в час):

```
0 * * * * cd /root/printaukcion && ./scripts/check-disk.sh
```

Без SMTP (см. «Восстановление пароля» ниже) алерт при нехватке места всё
равно попадёт в вывод скрипта (и, соответственно, в лог cron), просто не
придёт письмом.

## Продакшн-оговорки

SQLite в текущей схеме подходит для прототипа/малой нагрузки (однопоточная
запись). Если нагрузка вырастет, можно переехать на PostgreSQL: поменять
`provider` в `prisma/schema.prisma` на `postgresql`, `DATABASE_URL` — на
строку подключения, накатить `prisma migrate dev` заново. Код приложения
менять не придётся, так как enum'ы уже реализованы как строки специально ради
совместимости с обоими движками.
