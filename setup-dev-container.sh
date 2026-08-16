#!/usr/bin/env bash
#
# Подготовка Debian LXC-контейнера в Proxmox под удалённую разработку
# с Claude Code: локали, пакеты, пользователь, SSH-ключ, sshd, Claude Code.
#
# Запускать ВНУТРИ контейнера от root:
#   pct enter 102
#   bash setup-dev-container.sh --key "ssh-ed25519 AAAA... you@host"
#
# Скрипт идемпотентен: повторный запуск ничего не ломает.

set -euo pipefail

DEV_USER="dev"
SSH_KEY=""
SSH_KEY_FILE=""
INSTALL_CLAUDE=1
HARDEN=1

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
    cat <<'EOF'
Использование: setup-dev-container.sh [опции]

  --user NAME       имя пользователя для разработки (по умолчанию: dev)
  --key "KEY"       публичный SSH-ключ строкой ("ssh-ed25519 AAAA... comment")
  --key-file PATH   файл с публичным ключом
  --no-claude       не устанавливать Claude Code
  --no-harden       не отключать вход по паролю
  -h, --help        эта справка

Без --key/--key-file ключ не ставится, а отключение паролей пропускается,
чтобы не потерять доступ. Ключ можно доставить потом руками:
  ssh-copy-id -i ~/.ssh/id_ed25519.pub dev@<IP>
и перезапустить скрипт с --key.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --user)     DEV_USER="${2:?--user требует значение}"; shift 2 ;;
        --key)      SSH_KEY="${2:?--key требует значение}"; shift 2 ;;
        --key-file) SSH_KEY_FILE="${2:?--key-file требует значение}"; shift 2 ;;
        --no-claude) INSTALL_CLAUDE=0; shift ;;
        --no-harden) HARDEN=0; shift ;;
        -h|--help)  usage; exit 0 ;;
        *)          die "неизвестная опция: $1 (см. --help)" ;;
    esac
done

[[ $EUID -eq 0 ]] || die "нужны права root — запускайте из-под root внутри контейнера"

if [[ -n "$SSH_KEY_FILE" ]]; then
    [[ -r "$SSH_KEY_FILE" ]] || die "не читается файл ключа: $SSH_KEY_FILE"
    SSH_KEY="$(< "$SSH_KEY_FILE")"
fi

if [[ -n "$SSH_KEY" ]]; then
    if grep -q 'PRIVATE KEY' <<<"$SSH_KEY"; then
        die "передан ПРИВАТНЫЙ ключ. Нужен файл .pub"
    fi
    if ! grep -qE '^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-|sk-ssh-|sk-ecdsa-)' <<<"$SSH_KEY"; then
        die "это не похоже на публичный ключ — ожидается содержимое файла .pub"
    fi
fi

export DEBIAN_FRONTEND=noninteractive

# --- 1. Локали -------------------------------------------------------------
# pct enter пробрасывает LANG с хоста; если локаль не сгенерирована,
# каждый пакет сыплет предупреждениями perl.
log "Настройка локалей"
apt-get update -qq
apt-get install -y -qq locales >/dev/null
for loc in en_US.UTF-8 ru_RU.UTF-8; do
    sed -i "s/^# *\(${loc} UTF-8\)/\1/" /etc/locale.gen
done
locale-gen >/dev/null
update-locale LANG=en_US.UTF-8
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# --- 2. Пакеты -------------------------------------------------------------
log "Установка базовых пакетов"
apt-get upgrade -y -qq >/dev/null
apt-get install -y -qq \
    openssh-server curl wget git sudo tmux ca-certificates \
    build-essential ripgrep jq unzip htop >/dev/null

systemctl enable --now ssh >/dev/null 2>&1 || systemctl enable --now sshd

# --- 3. Пользователь -------------------------------------------------------
if id "$DEV_USER" &>/dev/null; then
    log "Пользователь $DEV_USER уже есть — проверяю настройки"
else
    log "Создаю пользователя $DEV_USER"
    adduser --disabled-password --gecos "" "$DEV_USER"
fi

DEV_HOME="$(getent passwd "$DEV_USER" | cut -d: -f6)"
DEV_SHELL="$(getent passwd "$DEV_USER" | cut -d: -f7)"

if [[ -z "$DEV_HOME" || "$DEV_HOME" == "/" ]]; then
    DEV_HOME="/home/$DEV_USER"
    usermod -d "$DEV_HOME" "$DEV_USER"
fi
if [[ ! -d "$DEV_HOME" ]]; then
    log "Создаю домашний каталог $DEV_HOME"
    mkdir -p "$DEV_HOME"
    chown "$DEV_USER:$DEV_USER" "$DEV_HOME"
    chmod 755 "$DEV_HOME"
fi
if [[ "$DEV_SHELL" != */bash && "$DEV_SHELL" != */zsh ]]; then
    log "Меняю shell на /bin/bash (было: ${DEV_SHELL:-пусто})"
    usermod -s /bin/bash "$DEV_USER"
fi

id -nG "$DEV_USER" | tr ' ' '\n' | grep -qx sudo || {
    log "Добавляю $DEV_USER в группу sudo"
    usermod -aG sudo "$DEV_USER"
}

install -d -o "$DEV_USER" -g "$DEV_USER" -m 755 "$DEV_HOME/projects"

# --- 4. SSH-ключ -----------------------------------------------------------
AUTH_KEYS="$DEV_HOME/.ssh/authorized_keys"
install -d -o "$DEV_USER" -g "$DEV_USER" -m 700 "$DEV_HOME/.ssh"
touch "$AUTH_KEYS"
chown "$DEV_USER:$DEV_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

if [[ -n "$SSH_KEY" ]]; then
    if grep -qxF "$SSH_KEY" "$AUTH_KEYS"; then
        log "Ключ уже в authorized_keys"
    else
        log "Добавляю публичный ключ"
        printf '%s\n' "$SSH_KEY" >> "$AUTH_KEYS"
    fi
fi

HAS_KEY=0
[[ -s "$AUTH_KEYS" ]] && HAS_KEY=1

# --- 5. Ужесточение sshd ---------------------------------------------------
# Только при наличии ключа — иначе рискуем закрыть себе вход.
if [[ $HARDEN -eq 1 && $HAS_KEY -eq 1 ]]; then
    log "Отключаю вход по паролю и root-логин"
    install -d -m 755 /etc/ssh/sshd_config.d
    cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
# Managed by setup-dev-container.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
    grep -q '^Include /etc/ssh/sshd_config.d/\*.conf' /etc/ssh/sshd_config \
        || sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' /etc/ssh/sshd_config

    if sshd -t; then
        systemctl restart ssh
        log "sshd перезапущен"
    else
        warn "Конфиг sshd не прошёл проверку — откатываю"
        rm -f /etc/ssh/sshd_config.d/10-hardening.conf
    fi
elif [[ $HARDEN -eq 1 ]]; then
    warn "Ключ не задан — вход по паролю оставлен включённым (иначе потеряете доступ)"
fi

# --- 6. Claude Code --------------------------------------------------------
if [[ $INSTALL_CLAUDE -eq 1 ]]; then
    if runuser -l "$DEV_USER" -c 'command -v claude' &>/dev/null; then
        log "Claude Code уже установлен"
    else
        log "Устанавливаю Claude Code от имени $DEV_USER"
        INSTALLER="$DEV_HOME/.claude-install.sh"

        # Скачиваем в файл, а не в пайп: сервер может вернуть HTML
        # (страница-заглушка, портал Wi-Fi, ошибка прокси), и тогда
        # `curl | bash` попытается выполнить разметку как команды.
        if ! runuser -l "$DEV_USER" -c \
                "curl -fsSL https://claude.ai/install.sh -o '$INSTALLER'"; then
            warn "Не удалось скачать установщик — проверьте сеть и DNS в контейнере"
        elif ! head -c 2 "$INSTALLER" | grep -q '#!'; then
            warn "Сервер вернул не скрипт установки, а что-то другое."
            if grep -qi 'unavailable.in.region\|not available in your' "$INSTALLER"; then
                warn "Claude Code недоступен в вашем регионе — установка невозможна."
                warn "Список поддерживаемых стран: https://www.anthropic.com/supported-countries"
            else
                warn "Первые строки ответа:"
                head -c 300 "$INSTALLER" | tr -d '\000' >&2
                echo >&2
            fi
            rm -f "$INSTALLER"
        elif runuser -l "$DEV_USER" -c "bash '$INSTALLER'"; then
            log "Claude Code установлен"
            rm -f "$INSTALLER"
        else
            warn "Установщик завершился с ошибкой — вывод выше"
            rm -f "$INSTALLER"
        fi
    fi

    BASHRC="$DEV_HOME/.bashrc"
    if ! grep -q '.local/bin' "$BASHRC" 2>/dev/null; then
        printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$BASHRC"
        chown "$DEV_USER:$DEV_USER" "$BASHRC"
    fi
fi

# --- 7. tmux ---------------------------------------------------------------
TMUX_CONF="$DEV_HOME/.tmux.conf"
if [[ ! -f "$TMUX_CONF" ]]; then
    cat > "$TMUX_CONF" <<'EOF'
set -g mouse on
set -g history-limit 50000
set -g default-terminal "tmux-256color"
setw -g mode-keys vi
EOF
    chown "$DEV_USER:$DEV_USER" "$TMUX_CONF"
fi

# --- Итог ------------------------------------------------------------------
IP_ADDR="$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1)"

cat <<EOF

$(log "Готово")

  Пользователь : $DEV_USER ($DEV_HOME)
  Группы       : $(id -nG "$DEV_USER")
  IP           : ${IP_ADDR:-не определён}
  SSH-ключ     : $([[ $HAS_KEY -eq 1 ]] && echo "установлен" || echo "НЕ установлен")
  Пароли по SSH: $([[ $HARDEN -eq 1 && $HAS_KEY -eq 1 ]] && echo "отключены" || echo "включены")
  Claude Code  : $(runuser -l "$DEV_USER" -c 'command -v claude' 2>/dev/null || echo "не установлен")

Дальше — с вашей рабочей машины:

  ssh $DEV_USER@${IP_ADDR:-<IP>}
  tmux new -s claude
  cd ~/projects && claude

При первом запуске Claude Code выдаст ссылку для авторизации —
откройте её в браузере на своей машине и верните код в терминал.

EOF
