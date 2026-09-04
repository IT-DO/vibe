#!/usr/bin/env bash
# Создание виртуальной машины под сервис. Запускать НА ХОСТЕ PROXMOX,
# а не внутри виртуалки:
#
#   ./proxmox-create-vm.sh --plan 192.168.10.100    посмотреть, что будет
#   ./proxmox-create-vm.sh 192.168.10.100           создать
#
# Адрес - тот, который получит новая машина в твоей локальной сети.
# Бери свободный: тот, что не занят другими устройствами.
#
# Машина создаётся из облачного образа Debian 13 - это тот же Debian,
# но подготовленный для автоматической настройки. Установщик проходить
# не нужно, машина сразу загружается настроенной.
set -e

PLAN=0
SSHKEY=""
while true; do
  case "${1:-}" in
    --plan)   PLAN=1; shift ;;
    --sshkey) SSHKEY="${2:-}"; shift 2 ;;
    *) break ;;
  esac
done

IP="${1:-}"
VMID="${2:-}"

MEMORY=4096
CORES=2
DISK=32G
IMAGE_URL="https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2"
IMAGE_FILE="/var/lib/vz/template/iso/debian-13-genericcloud-amd64.qcow2"
CIUSER="admin"

run() {
  if [ "$PLAN" = "1" ]; then echo "    [план] $*"; else echo "    + $*"; "$@"; fi
}

# --- Проверки ---------------------------------------------------------------

if ! command -v qm >/dev/null 2>&1; then
  echo "Команды qm нет. Этот скрипт запускается НА ХОСТЕ PROXMOX,"
  echo "а не внутри виртуальной машины или контейнера."
  exit 1
fi

if [ -z "$IP" ]; then
  echo "Не указан адрес для новой машины."
  echo
  echo "  ./proxmox-create-vm.sh --plan 192.168.10.100    посмотреть план"
  echo "  ./proxmox-create-vm.sh 192.168.10.100           создать"
  echo
  echo "Вход по SSH-ключу (надёжнее и без возни с паролями):"
  echo "  ./proxmox-create-vm.sh --sshkey /root/my.pub 192.168.10.100"
  echo
  echo "Бери свободный адрес в своей сети. Занятые видно в панели роутера."
  exit 1
fi

case "$IP" in
  *.*.*.*) : ;;
  *) echo "Это не похоже на IP-адрес: $IP"; exit 1 ;;
esac

# Номер машины: следующий свободный, если не задан вторым аргументом.
if [ -n "$SSHKEY" ] && [ ! -f "$SSHKEY" ]; then
  echo "Файла с ключом нет: $SSHKEY"
  exit 1
fi

if [ -z "$VMID" ]; then
  VMID=$(pvesh get /cluster/nextid 2>/dev/null || echo "")
  [ -z "$VMID" ] && { echo "Не удалось подобрать свободный номер. Задай вторым аргументом."; exit 1; }
fi

if qm status "$VMID" >/dev/null 2>&1; then
  echo "Машина с номером $VMID уже существует. Укажи другой номер вторым аргументом."
  exit 1
fi

# Хранилище под диск машины. Сначала ищем привычные local-lvm / local-zfs,
# и только если их нет - берём первое подходящее. Хранилище типа dir
# тоже умеет держать диски, но на нём они лежат файлами и работают
# медленнее, поэтому оно последнее в очереди.
STORAGE=""
for preferred in local-lvm local-zfs; do
  if pvesm status --content images 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$preferred"; then
    STORAGE="$preferred"; break
  fi
done
[ -z "$STORAGE" ] && STORAGE=$(pvesm status --content images 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')
[ -z "$STORAGE" ] && STORAGE=$(pvesm status --content images 2>/dev/null | awk 'NR>1 {print $1; exit}')
[ -z "$STORAGE" ] && { echo "Не нашёл хранилище для дисков. Проверь: pvesm status"; exit 1; }

# Шлюз: берём из таблицы маршрутов хоста.
GATEWAY=$(ip route | awk '/^default/ {print $3; exit}')
[ -z "$GATEWAY" ] && { echo "Не удалось определить шлюз. Проверь: ip route"; exit 1; }

BRIDGE=$(ip route | awk '/^default/ {print $5; exit}')
[ -z "$BRIDGE" ] && BRIDGE=vmbr0

echo "════════════════════════════════════════════"
echo "  Номер машины : $VMID"
echo "  Имя          : kartochka"
echo "  Память       : $MEMORY МБ, ядер: $CORES, диск: $DISK"
echo "  Хранилище    : $STORAGE"
echo "  Сеть         : $IP, шлюз $GATEWAY, мост $BRIDGE"
echo "  Пользователь : $CIUSER"
echo "════════════════════════════════════════════"
[ "$PLAN" = "1" ] && echo "РЕЖИМ ПЛАНА: ничего не создаю."
echo

# --- Пароль -----------------------------------------------------------------

if [ "$PLAN" = "0" ] && [ -z "$SSHKEY" ]; then
  echo "Придумай пароль для пользователя $CIUSER (вводится не отображаясь):"
  read -rs CIPASS
  echo
  [ ${#CIPASS} -lt 8 ] && { echo "Пароль короче 8 символов - так не пойдёт."; exit 1; }
  echo
  echo "ВНИМАНИЕ: облачный образ Debian по умолчанию запрещает вход по SSH"
  echo "с паролем - принимает только ключи. Пароль пригодится для входа"
  echo "через консоль, а как открыть вход по паролю - скрипт скажет в конце."
  echo
fi

# --- Образ ------------------------------------------------------------------

echo "==> Облачный образ Debian 13"
if [ -f "$IMAGE_FILE" ]; then
  echo "    уже скачан: $IMAGE_FILE"
else
  run mkdir -p "$(dirname "$IMAGE_FILE")"
  # На голом хосте Proxmox может не быть чего-то одного из двух,
  # поэтому пробуем оба. Урок из практики: не предполагай, что
  # привычная команда установлена.
  if command -v wget >/dev/null 2>&1; then
    run wget -q --show-progress -O "$IMAGE_FILE" "$IMAGE_URL"
  elif command -v curl >/dev/null 2>&1; then
    run curl -fL --progress-bar -o "$IMAGE_FILE" "$IMAGE_URL"
  else
    echo "Нет ни wget, ни curl. Поставь любой: apt install -y curl"
    exit 1
  fi
fi

# --- Создание ---------------------------------------------------------------

echo "==> Создаю машину"
run qm create "$VMID" \
  --name kartochka \
  --memory "$MEMORY" \
  --cores "$CORES" \
  --cpu host \
  --net0 "virtio,bridge=$BRIDGE" \
  --scsihw virtio-scsi-single \
  --ostype l26 \
  --agent enabled=1

echo "==> Подключаю диск из образа"
run qm set "$VMID" --scsi0 "$STORAGE:0,import-from=$IMAGE_FILE,discard=on,ssd=1"

echo "==> Расширяю диск до $DISK"
run qm disk resize "$VMID" scsi0 "$DISK"

echo "==> Диск для настроек cloud-init"
run qm set "$VMID" --ide2 "$STORAGE:cloudinit"

echo "==> Порядок загрузки и консоль"
run qm set "$VMID" --boot order=scsi0 --serial0 socket --vga serial0

echo "==> Пользователь и сеть"
if [ "$PLAN" = "1" ]; then
  if [ -n "$SSHKEY" ]; then
    echo "    [план] qm set $VMID --ciuser $CIUSER --sshkeys $SSHKEY --ipconfig0 ip=$IP/24,gw=$GATEWAY"
  else
    echo "    [план] qm set $VMID --ciuser $CIUSER --cipassword <пароль> --ipconfig0 ip=$IP/24,gw=$GATEWAY"
  fi
elif [ -n "$SSHKEY" ]; then
  qm set "$VMID" \
    --ciuser "$CIUSER" \
    --sshkeys "$SSHKEY" \
    --ipconfig0 "ip=$IP/24,gw=$GATEWAY" \
    --nameserver "$GATEWAY" \
    --ciupgrade 0
  echo "    + настроено, вход по ключу"
else
  qm set "$VMID" \
    --ciuser "$CIUSER" \
    --cipassword "$CIPASS" \
    --ipconfig0 "ip=$IP/24,gw=$GATEWAY" \
    --nameserver "$GATEWAY" \
    --ciupgrade 0
  echo "    + настроено, вход по паролю (через консоль)"
fi

echo "==> Автозапуск при включении хоста"
run qm set "$VMID" --onboot 1

echo "==> Запускаю"
run qm start "$VMID"

if [ "$PLAN" = "1" ]; then
  echo
  echo "Это был план. Чтобы создать: ./proxmox-create-vm.sh $IP"
  exit 0
fi

echo
echo "Жду, пока машина загрузится (обычно 30-60 секунд)…"
for i in $(seq 1 60); do
  if ping -c1 -W1 "$IP" >/dev/null 2>&1; then echo "Отвечает."; break; fi
  [ "$i" = "60" ] && echo "Не отозвалась за минуту. Загляни в консоль: qm terminal $VMID"
  sleep 2
done

if [ -n "$SSHKEY" ]; then
cat <<NEXT

════════════════════════════════════════════════════
Машина $VMID создана и работает на $IP

Заходи по ключу:

    ssh $CIUSER@$IP

Дальше - одна строка внутри машины, целиком:

sudo apt update && sudo apt install -y git qemu-guest-agent && sudo systemctl enable --now qemu-guest-agent && sudo git clone -b claude/vibecoding-saas-service-mx3k2z https://github.com/IT-DO/vibe.git /opt/app && cd /opt/app && sudo ./install-server.sh

Удалить машину и начать заново:  qm stop $VMID && qm destroy $VMID
NEXT
else
cat <<NEXT

════════════════════════════════════════════════════
Машина $VMID создана и работает на $IP

ВАЖНО: по SSH с паролем она пока не пустит. Облачный образ Debian
принимает только вход по ключу - это его настройка по умолчанию,
не поломка. Открыть вход по паролю можно из консоли машины.

Шаг 1. Зайди в консоль (прямо здесь, на хосте Proxmox):

    qm terminal $VMID

Нажми Enter, войди как $CIUSER с паролем, который придумал.

Шаг 2. Разреши вход по паролю - одной строкой:

echo 'PasswordAuthentication yes' | sudo tee /etc/ssh/sshd_config.d/01-password.conf && sudo systemctl restart ssh

Имя файла начинается с 01 не случайно: настройки читаются по порядку,
и побеждает первая встреченная - файл с меньшим номером перекрывает
запрет, заданный образом.

Шаг 3. Выйди из консоли: Ctrl+O

Теперь с ноутбука работает:  ssh $CIUSER@$IP

Дальше - одна строка внутри машины, целиком:

sudo apt update && sudo apt install -y git qemu-guest-agent && sudo systemctl enable --now qemu-guest-agent && sudo git clone -b claude/vibecoding-saas-service-mx3k2z https://github.com/IT-DO/vibe.git /opt/app && cd /opt/app && sudo ./install-server.sh

В следующий раз проще сразу с ключом - тогда этих шагов не будет:

    ./proxmox-create-vm.sh --sshkey /root/my.pub $IP

Удалить машину и начать заново:  qm stop $VMID && qm destroy $VMID
NEXT
fi
