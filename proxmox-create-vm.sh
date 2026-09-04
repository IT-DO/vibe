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
if [ "${1:-}" = "--plan" ]; then PLAN=1; shift; fi

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
  echo "Бери свободный адрес в своей сети. Занятые видно в панели роутера."
  exit 1
fi

case "$IP" in
  *.*.*.*) : ;;
  *) echo "Это не похоже на IP-адрес: $IP"; exit 1 ;;
esac

# Номер машины: следующий свободный, если не задан вторым аргументом.
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

if [ "$PLAN" = "0" ]; then
  echo "Придумай пароль для пользователя $CIUSER (вводится не отображаясь):"
  read -rs CIPASS
  echo
  [ ${#CIPASS} -lt 8 ] && { echo "Пароль короче 8 символов - так не пойдёт."; exit 1; }
fi

# --- Образ ------------------------------------------------------------------

echo "==> Облачный образ Debian 13"
if [ -f "$IMAGE_FILE" ]; then
  echo "    уже скачан: $IMAGE_FILE"
else
  run mkdir -p "$(dirname "$IMAGE_FILE")"
  run wget -q --show-progress -O "$IMAGE_FILE" "$IMAGE_URL"
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
  echo "    [план] qm set $VMID --ciuser $CIUSER --cipassword <пароль> --ipconfig0 ip=$IP/24,gw=$GATEWAY"
else
  qm set "$VMID" \
    --ciuser "$CIUSER" \
    --cipassword "$CIPASS" \
    --ipconfig0 "ip=$IP/24,gw=$GATEWAY" \
    --nameserver "$GATEWAY" \
    --ciupgrade 0
  echo "    + настроено"
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

cat <<NEXT

════════════════════════════════════════════════════
Машина $VMID создана и работает на $IP

Дальше - зайти в неё и поставить сервис. Выполни:

    ssh $CIUSER@$IP

и уже внутри машины:

    sudo apt update && sudo apt install -y git qemu-guest-agent
    sudo systemctl enable --now qemu-guest-agent
    sudo git clone -b claude/vibecoding-saas-service-mx3k2z \\
      https://github.com/IT-DO/vibe.git /opt/app
    cd /opt/app
    sudo ./install-server.sh

Если что-то пойдёт не так - удалить машину и начать заново:

    qm stop $VMID && qm destroy $VMID
NEXT
