#!/bin/bash

# =============================================================================
#  Press Ticket® — VPS HARDENING
#  Script de endurecimento de segurança da VPS
#  Versão: 1.0.0
# =============================================================================

# ── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Log ──────────────────────────────────────────────────────────────────────
LOG_DIR="/var/log/press-ticket"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hardening_$(date +'%Y-%m-%d_%H-%M-%S').log"

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_section() {
    log ""
    log "${CYAN}══════════════════════════════════════════════════════════${RESET}"
    log "${BOLD}  $1${RESET}"
    log "${CYAN}══════════════════════════════════════════════════════════${RESET}"
    log ""
}

log_ok()   { log "${GREEN}  ✔  $1${RESET}"; }
log_warn() { log "${YELLOW}  ⚠  $1${RESET}"; }
log_err()  { log "${RED}  ✖  $1${RESET}"; }
log_info() { log "${BLUE}  ➜  $1${RESET}"; }

confirm() {
    local msg="$1"
    echo -e "${YELLOW}${BOLD}  $msg (s/n):${RESET} " >&2
    local resp
    resp=$(bash -c 'read -r R; echo "$R"' </dev/tty)
    [[ "$resp" =~ ^[sS]$ ]]
}

confirm_double() {
    local msg="$1"
    log_warn "$msg"
    echo -e "${RED}${BOLD}  Tem certeza? Esta ação pode bloquear o acesso SSH. (sim/não):${RESET} " >&2
    local resp
    resp=$(bash -c 'read -r R; echo "$R"' </dev/tty)
    [[ "$resp" == "sim" ]]
}

pause() {
    echo -e "\n${BOLD}  Pressione ENTER para continuar...${RESET}"
    bash -c 'read -r' </dev/tty
}

# =============================================================================
#  OPÇÃO 1 — CHAVE SSH: PREPARAR authorized_keys
# =============================================================================
opcao_chave_ssh() {
    log_section "PREPARAR CHAVE SSH"

    log_info "Este passo adiciona uma chave pública SSH ao usuário deploy."
    log_info "Faça isso ANTES de desativar a autenticação por senha (Opção 2)."
    log ""

    # Detectar usuário alvo
    local SSH_USER="${SUDO_USER:-deploy}"
    local SSH_HOME
    SSH_HOME=$(eval echo "~$SSH_USER")

    log_info "Usuário alvo: ${BOLD}$SSH_USER${RESET}"
    log_info "Diretório home: ${BOLD}$SSH_HOME${RESET}"
    log ""

    echo -e "${YELLOW}${BOLD}  Cole abaixo a chave pública SSH (começa com ssh-ed25519 ou ssh-rsa):${RESET}"
    echo -e "${BLUE}  Dica: no Termius → Keychain → sua chave → Export Public Key${RESET}"
    echo -n "  > "
    local PUBKEY
    PUBKEY=$(bash -c 'read -r K; echo "$K"' </dev/tty)

    if [[ -z "$PUBKEY" ]]; then
        log_err "Nenhuma chave informada. Operação cancelada."
        pause; return 1
    fi

    if [[ ! "$PUBKEY" =~ ^ssh-(ed25519|rsa|ecdsa) ]]; then
        log_err "Formato inválido. A chave deve começar com ssh-ed25519, ssh-rsa ou ssh-ecdsa."
        pause; return 1
    fi

    # Criar diretório e adicionar chave
    mkdir -p "$SSH_HOME/.ssh"
    chmod 700 "$SSH_HOME/.ssh"

    # Verificar se chave já existe
    if grep -qF "$PUBKEY" "$SSH_HOME/.ssh/authorized_keys" 2>/dev/null; then
        log_warn "Esta chave já está em authorized_keys. Nenhuma alteração feita."
        pause; return 0
    fi

    echo "$PUBKEY" >> "$SSH_HOME/.ssh/authorized_keys"
    chmod 600 "$SSH_HOME/.ssh/authorized_keys"
    chown -R "$SSH_USER:$SSH_USER" "$SSH_HOME/.ssh"

    log_ok "Chave adicionada com sucesso em $SSH_HOME/.ssh/authorized_keys"
    log ""
    log_warn "PRÓXIMO PASSO OBRIGATÓRIO:"
    log_warn "Abra uma NOVA janela do Termius e teste o login com a chave."
    log_warn "Só execute a Opção 2 (desativar senha) após confirmar o acesso."

    echo "" >> "$LOG_FILE"
    echo "CHAVE ADICIONADA: $(date)" >> "$LOG_FILE"
    echo "Usuário: $SSH_USER" >> "$LOG_FILE"
    echo "Chave: ${PUBKEY:0:60}..." >> "$LOG_FILE"

    pause
}

# =============================================================================
#  OPÇÃO 2 — SSH: DESATIVAR AUTENTICAÇÃO POR SENHA
# =============================================================================
opcao_ssh_senha() {
    log_section "DESATIVAR AUTENTICAÇÃO POR SENHA NO SSH"

    log_warn "ATENÇÃO: Esta opção desativa o login SSH por senha."
    log_warn "Após isso, só será possível acessar a VPS com chave SSH."
    log_warn "Execute a Opção 1 e teste o login com chave ANTES de continuar."
    log ""

    # Verificar se existe ao menos uma chave autorizada
    local SSH_USER="${SUDO_USER:-deploy}"
    local AUTH_KEYS
    AUTH_KEYS=$(eval echo "~$SSH_USER/.ssh/authorized_keys")

    if [[ ! -f "$AUTH_KEYS" ]] || [[ ! -s "$AUTH_KEYS" ]]; then
        log_err "Nenhuma chave SSH encontrada em $AUTH_KEYS"
        log_err "Execute a Opção 1 e configure sua chave antes de continuar."
        pause; return 1
    fi

    log_ok "Chave SSH detectada em $AUTH_KEYS"
    log ""

    if ! confirm_double "Deseja desativar autenticação por senha no SSH?"; then
        log_info "Operação cancelada pelo usuário."
        pause; return 0
    fi

    local SSHD_CONFIG="/etc/ssh/sshd_config"
    local BACKUP="/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"

    # Backup antes de alterar
    cp "$SSHD_CONFIG" "$BACKUP"
    log_ok "Backup criado em $BACKUP"

    # Aplicar configurações
    local configs=(
        "PasswordAuthentication no"
        "PubkeyAuthentication yes"
        "AuthorizedKeysFile .ssh/authorized_keys"
        "PermitRootLogin no"
        "PermitEmptyPasswords no"
        "MaxAuthTries 3"
        "LoginGraceTime 30"
        "ChallengeResponseAuthentication no"
        "KbdInteractiveAuthentication no"
        "UsePAM yes"
    )

    for config in "${configs[@]}"; do
        local key
        key=$(echo "$config" | awk '{print $1}')
        local value
        value=$(echo "$config" | awk '{$1=""; print substr($0,2)}')

        if grep -qE "^#?${key}" "$SSHD_CONFIG"; then
            # Substituir linha existente (comentada ou não)
            sed -i "s|^#\?${key}.*|${config}|" "$SSHD_CONFIG"
        else
            # Adicionar ao final
            echo "$config" >> "$SSHD_CONFIG"
        fi
        log_ok "  $config"
    done

    log ""
    log_info "Validando sintaxe do sshd_config..."
    if sshd -t 2>>"$LOG_FILE"; then
        log_ok "Sintaxe válida."
    else
        log_err "Erro de sintaxe detectado! Restaurando backup..."
        cp "$BACKUP" "$SSHD_CONFIG"
        log_err "Backup restaurado. Nenhuma alteração aplicada."
        pause; return 1
    fi

    log_info "Restartando serviço SSH..."
    if systemctl restart sshd; then
        log_ok "SSH restartado com sucesso."
    else
        log_err "Erro ao restartar SSH. Restaurando backup..."
        cp "$BACKUP" "$SSHD_CONFIG"
        systemctl restart sshd
        pause; return 1
    fi

    log ""
    log_ok "Autenticação por senha desativada com sucesso."
    log_warn "Mantenha a sessão atual aberta até confirmar acesso por chave."

    # Verificação final
    log ""
    log_info "Verificação das configurações aplicadas:"
    sshd -T 2>/dev/null | grep -E "^passwordauth|^pubkeyauth|^permitrootlogin|^maxauthtries|^logingracetime" | while read -r line; do
        log_ok "  $line"
    done

    pause
}

# =============================================================================
#  OPÇÃO 3 — UFW: CONFIGURAR FIREWALL
# =============================================================================
opcao_ufw() {
    log_section "CONFIGURAR UFW (FIREWALL)"

    log_info "Serão configuradas as seguintes regras:"
    log_info "  ALLOW  22/tcp  — SSH"
    log_info "  ALLOW  80/tcp  — HTTP (Nginx)"
    log_info "  ALLOW  443/tcp — HTTPS (Nginx)"
    log_info "  DENY   tudo mais (entrada)"
    log_info "  ALLOW  tudo (saída)"
    log ""

    # Verificar porta SSH personalizada
    local SSH_PORT
    SSH_PORT=$(sshd -T 2>/dev/null | grep "^port " | awk '{print $2}')
    SSH_PORT="${SSH_PORT:-22}"

    if [[ "$SSH_PORT" != "22" ]]; then
        log_warn "Porta SSH detectada: $SSH_PORT (diferente de 22)"
        log_warn "A regra do UFW será criada para a porta $SSH_PORT"
    fi

    if ! confirm "Deseja configurar o UFW com as regras acima?"; then
        log_info "Operação cancelada."; pause; return 0
    fi

    # Instalar se necessário
    if ! command -v ufw &>/dev/null; then
        log_info "Instalando UFW..."
        apt-get install -y ufw >>"$LOG_FILE" 2>&1
    fi

    # Resetar e configurar
    ufw --force reset >>"$LOG_FILE" 2>&1
    log_ok "Regras anteriores removidas."

    ufw allow "$SSH_PORT/tcp" comment 'SSH' >>"$LOG_FILE" 2>&1
    log_ok "ALLOW $SSH_PORT/tcp (SSH)"

    ufw allow 80/tcp comment 'HTTP Nginx' >>"$LOG_FILE" 2>&1
    log_ok "ALLOW 80/tcp (HTTP)"

    ufw allow 443/tcp comment 'HTTPS Nginx' >>"$LOG_FILE" 2>&1
    log_ok "ALLOW 443/tcp (HTTPS)"

    ufw default deny incoming >>"$LOG_FILE" 2>&1
    ufw default allow outgoing >>"$LOG_FILE" 2>&1
    log_ok "Política padrão: DENY incoming / ALLOW outgoing"

    ufw --force enable >>"$LOG_FILE" 2>&1
    log_ok "UFW ativado."

    log ""
    log_info "Estado atual do UFW:"
    ufw status numbered | tee -a "$LOG_FILE"

    log ""
    log_info "Verificando MySQL (não deve estar exposto publicamente):"
    local MYSQL_BIND
    MYSQL_BIND=$(ss -tlnp 2>/dev/null | grep 3306)
    if [[ -z "$MYSQL_BIND" ]]; then
        log_ok "MySQL não está ouvindo em nenhuma porta (OK)"
    elif echo "$MYSQL_BIND" | grep -q "127.0.0.1"; then
        log_ok "MySQL vinculado apenas a 127.0.0.1 (OK)"
    else
        log_warn "MySQL pode estar exposto publicamente:"
        log_warn "$MYSQL_BIND"
        log_warn "Revisar /etc/mysql/mysql.conf.d/mysqld.cnf — bind-address = 127.0.0.1"
    fi

    pause
}

# =============================================================================
#  OPÇÃO 4 — FAIL2BAN: INSTALAR E CONFIGURAR
# =============================================================================
opcao_fail2ban() {
    log_section "INSTALAR E CONFIGURAR FAIL2BAN"

    log_info "O Fail2ban monitora logs e bane IPs com tentativas suspeitas."
    log_info "Jails que serão configurados:"
    log_info "  sshd            — 3 tentativas → ban de 24h"
    log_info "  nginx-http-auth — 5 tentativas → ban de 1h"
    log_info "  nginx-botsearch — 10 tentativas → ban de 24h"
    log ""

    if ! confirm "Deseja instalar e configurar o Fail2ban?"; then
        log_info "Operação cancelada."; pause; return 0
    fi

    log_info "Instalando Fail2ban..."
    apt-get update -y >>"$LOG_FILE" 2>&1
    apt-get install -y fail2ban >>"$LOG_FILE" 2>&1
    log_ok "Fail2ban instalado."

    log_info "Criando configuração local..."
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true
filter   = nginx-http-auth
port     = http,https
logpath  = /var/log/nginx/error.log
maxretry = 5
bantime  = 3600

[nginx-botsearch]
enabled  = true
filter   = nginx-botsearch
port     = http,https
logpath  = /var/log/nginx/access.log
maxretry = 10
bantime  = 86400
EOF

    log_ok "Arquivo /etc/fail2ban/jail.local criado."

    systemctl enable fail2ban >>"$LOG_FILE" 2>&1
    systemctl restart fail2ban >>"$LOG_FILE" 2>&1

    sleep 2

    if systemctl is-active --quiet fail2ban; then
        log_ok "Fail2ban está ativo e rodando."
    else
        log_err "Fail2ban não iniciou corretamente."
        systemctl status fail2ban | tee -a "$LOG_FILE"
        pause; return 1
    fi

    log ""
    log_info "Jails ativos:"
    fail2ban-client status | tee -a "$LOG_FILE"

    log ""
    log_info "Status do jail SSH:"
    fail2ban-client status sshd | tee -a "$LOG_FILE"

    pause
}

# =============================================================================
#  OPÇÃO 5 — ATUALIZAÇÕES AUTOMÁTICAS DE SEGURANÇA
# =============================================================================
opcao_auto_update() {
    log_section "ATUALIZAÇÕES AUTOMÁTICAS DE SEGURANÇA"

    log_info "Configura o Ubuntu para aplicar patches de segurança automaticamente."
    log_info "Apenas atualizações de segurança — não upgrades gerais."
    log_info "Reinicialização automática às 03:00 se necessário."
    log ""

    if ! confirm "Deseja configurar atualizações automáticas de segurança?"; then
        log_info "Operação cancelada."; pause; return 0
    fi

    log_info "Instalando unattended-upgrades..."
    apt-get install -y unattended-upgrades apt-listchanges >>"$LOG_FILE" 2>&1
    log_ok "Pacotes instalados."

    log_info "Configurando /etc/apt/apt.conf.d/50unattended-upgrades..."
    cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:00";
Unattended-Upgrade::SyslogEnable "true";
EOF
    log_ok "50unattended-upgrades configurado."

    log_info "Configurando /etc/apt/apt.conf.d/20auto-upgrades..."
    cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF
    log_ok "20auto-upgrades configurado."

    systemctl enable unattended-upgrades >>"$LOG_FILE" 2>&1
    systemctl restart unattended-upgrades >>"$LOG_FILE" 2>&1

    log ""
    log_info "Testando em modo dry-run..."
    unattended-upgrades --dry-run --debug 2>&1 | tail -10 | tee -a "$LOG_FILE"

    log ""
    local STATUS
    STATUS=$(systemctl is-active unattended-upgrades)
    if [[ "$STATUS" == "active" ]]; then
        log_ok "unattended-upgrades ativo: $STATUS"
    else
        log_warn "Status: $STATUS — verificar com: systemctl status unattended-upgrades"
    fi

    pause
}

# =============================================================================
#  OPÇÃO 6 — PM2-LOGROTATE: ROTAÇÃO DE LOGS
# =============================================================================
opcao_logrotate() {
    log_section "CONFIGURAR PM2-LOGROTATE"

    log_info "Configura rotação de logs do PM2 para evitar acúmulo de dados."
    log_info "  Tamanho máximo por arquivo: 10MB"
    log_info "  Retenção: 30 arquivos"
    log_info "  Compressão: ativada"
    log_info "  Rotação automática: todo dia às 03:00"
    log ""

    if ! confirm "Deseja configurar o pm2-logrotate?"; then
        log_info "Operação cancelada."; pause; return 0
    fi

    # Instalar módulo se necessário
    if ! pm2 list 2>/dev/null | grep -q "pm2-logrotate"; then
        log_info "Instalando pm2-logrotate..."
        pm2 install pm2-logrotate >>"$LOG_FILE" 2>&1
        log_ok "pm2-logrotate instalado."
    else
        log_ok "pm2-logrotate já está instalado."
    fi

    pm2 set pm2-logrotate:max_size 10M          >>"$LOG_FILE" 2>&1
    pm2 set pm2-logrotate:retain 30             >>"$LOG_FILE" 2>&1
    pm2 set pm2-logrotate:compress true         >>"$LOG_FILE" 2>&1
    pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss >>"$LOG_FILE" 2>&1
    pm2 set pm2-logrotate:rotateModule true     >>"$LOG_FILE" 2>&1
    pm2 set pm2-logrotate:workerInterval 3600   >>"$LOG_FILE" 2>&1
    pm2 set pm2-logrotate:rotateInterval "0 3 * * *" >>"$LOG_FILE" 2>&1

    log ""
    log_info "Configuração atual:"
    pm2 get pm2-logrotate 2>/dev/null | grep -E "max_size|retain|compress|dateFormat|rotateInterval" | while read -r line; do
        log_ok "  $line"
    done

    pause
}

# =============================================================================
#  OPÇÃO 7 — STATUS GERAL DA VPS
# =============================================================================
opcao_status() {
    log_section "STATUS GERAL DE SEGURANÇA DA VPS"

    # SSH
    log_info "── SSH ──────────────────────────────────────────"
    sshd -T 2>/dev/null | grep -E "^passwordauth|^pubkeyauth|^permitrootlogin|^maxauthtries|^logingracetime" | while read -r line; do
        local key val
        key=$(echo "$line" | awk '{print $1}')
        val=$(echo "$line" | awk '{print $2}')
        case "$key:$val" in
            passwordauthentication:no)  log_ok  "  $line" ;;
            pubkeyauthentication:yes)   log_ok  "  $line" ;;
            permitrootlogin:no)         log_ok  "  $line" ;;
            passwordauthentication:yes) log_warn "  $line  ← senha ainda ativa" ;;
            permitrootlogin:yes)        log_warn "  $line  ← root login ativo" ;;
            *)                          log_info "  $line" ;;
        esac
    done

    # Chaves autorizadas
    local DEPLOY_KEYS="/home/deploy/.ssh/authorized_keys"
    if [[ -f "$DEPLOY_KEYS" ]] && [[ -s "$DEPLOY_KEYS" ]]; then
        local KEY_COUNT
        KEY_COUNT=$(grep -c "^ssh" "$DEPLOY_KEYS" 2>/dev/null || echo 0)
        log_ok "  authorized_keys: $KEY_COUNT chave(s) configurada(s)"
    else
        log_warn "  authorized_keys: sem chaves configuradas"
    fi

    log ""

    # UFW
    log_info "── UFW ──────────────────────────────────────────"
    if command -v ufw &>/dev/null; then
        local UFW_STATUS
        UFW_STATUS=$(ufw status 2>/dev/null | head -1)
        if echo "$UFW_STATUS" | grep -q "active"; then
            log_ok "  UFW: ativo"
            ufw status numbered 2>/dev/null | grep -E "^\[" | while read -r rule; do
                log_info "  $rule"
            done
        else
            log_warn "  UFW: $UFW_STATUS"
        fi
    else
        log_warn "  UFW não instalado"
    fi

    log ""

    # MySQL
    log_info "── MySQL ─────────────────────────────────────────"
    local MYSQL_BIND
    MYSQL_BIND=$(ss -tlnp 2>/dev/null | grep 3306)
    if [[ -z "$MYSQL_BIND" ]]; then
        log_info "  MySQL não está rodando ou porta não detectada"
    elif echo "$MYSQL_BIND" | grep -q "127.0.0.1"; then
        log_ok "  MySQL vinculado apenas a 127.0.0.1"
    else
        log_warn "  MySQL pode estar exposto publicamente: $MYSQL_BIND"
    fi

    log ""

    # Fail2ban
    log_info "── Fail2ban ─────────────────────────────────────"
    if command -v fail2ban-client &>/dev/null; then
        if systemctl is-active --quiet fail2ban; then
            log_ok "  Fail2ban: ativo"
            fail2ban-client status 2>/dev/null | grep "Jail list" | while read -r line; do
                log_info "  $line"
            done
            local BANNED
            BANNED=$(fail2ban-client status sshd 2>/dev/null | grep "Banned IP" | awk -F: '{print $2}' | xargs)
            [[ -n "$BANNED" ]] && log_warn "  IPs banidos (SSH): $BANNED" || log_ok "  Nenhum IP banido no momento"
        else
            log_warn "  Fail2ban: inativo"
        fi
    else
        log_warn "  Fail2ban não instalado"
    fi

    log ""

    # Unattended-upgrades
    log_info "── Atualizações Automáticas ─────────────────────"
    if systemctl is-active --quiet unattended-upgrades 2>/dev/null; then
        log_ok "  unattended-upgrades: ativo"
    else
        log_warn "  unattended-upgrades: inativo ou não instalado"
    fi

    log ""

    # PM2 logrotate
    log_info "── PM2 Logrotate ─────────────────────────────────"
    if pm2 list 2>/dev/null | grep -q "pm2-logrotate"; then
        local MAX_SIZE RETAIN
        MAX_SIZE=$(pm2 get pm2-logrotate 2>/dev/null | grep max_size | awk '{print $NF}')
        RETAIN=$(pm2 get pm2-logrotate 2>/dev/null | grep retain | awk '{print $NF}')
        log_ok "  pm2-logrotate: configurado (max: ${MAX_SIZE:-?}, retain: ${RETAIN:-?})"
    else
        log_warn "  pm2-logrotate: não configurado"
    fi

    log ""
    log_info "Log completo desta verificação: $LOG_FILE"

    pause
}

# =============================================================================
#  MENU PRINCIPAL
# =============================================================================
menu() {
    while true; do
        clear
        echo -e "${CYAN}${BOLD}"
        echo "  ╔══════════════════════════════════════════════════════════╗"
        echo "  ║         Press Ticket® — VPS Hardening                   ║"
        echo "  ║         Endurecimento de Segurança da VPS                ║"
        echo "  ╚══════════════════════════════════════════════════════════╝"
        echo -e "${RESET}"
        echo -e "  ${BOLD}Escolha uma opção:${RESET}"
        echo ""
        echo -e "  ${GREEN}1)${RESET} Adicionar chave SSH ao authorized_keys"
        echo -e "     ${BLUE}↳ Executar ANTES de desativar a senha (opção 2)${RESET}"
        echo ""
        echo -e "  ${YELLOW}2)${RESET} Desativar autenticação por senha no SSH"
        echo -e "     ${BLUE}↳ Requer chave configurada e testada (opção 1)${RESET}"
        echo ""
        echo -e "  ${GREEN}3)${RESET} Configurar UFW (firewall)"
        echo -e "     ${BLUE}↳ Libera portas 22/80/443 e bloqueia o restante${RESET}"
        echo ""
        echo -e "  ${GREEN}4)${RESET} Instalar e configurar Fail2ban"
        echo -e "     ${BLUE}↳ Bane IPs com tentativas suspeitas de acesso${RESET}"
        echo ""
        echo -e "  ${GREEN}5)${RESET} Atualizações automáticas de segurança"
        echo -e "     ${BLUE}↳ Patches do Ubuntu aplicados diariamente${RESET}"
        echo ""
        echo -e "  ${GREEN}6)${RESET} Configurar rotação de logs do PM2"
        echo -e "     ${BLUE}↳ Limite de 10MB, retenção de 30 arquivos${RESET}"
        echo ""
        echo -e "  ${CYAN}7)${RESET} Ver status geral de segurança da VPS"
        echo ""
        echo -e "  ${RED}0)${RESET} Sair"
        echo ""
        echo -e "  ${BLUE}Log desta sessão: $LOG_FILE${RESET}"
        echo ""
        echo -n "  Opção: "

        local OPCAO
        OPCAO=$(bash -c 'read -r O; echo "$O"' </dev/tty)

        case "$OPCAO" in
            1) opcao_chave_ssh ;;
            2) opcao_ssh_senha ;;
            3) opcao_ufw ;;
            4) opcao_fail2ban ;;
            5) opcao_auto_update ;;
            6) opcao_logrotate ;;
            7) opcao_status ;;
            0)
                echo ""
                log_ok "Saindo. Log salvo em: $LOG_FILE"
                echo ""
                exit 0
                ;;
            *)
                echo -e "${RED}  Opção inválida.${RESET}"
                sleep 1
                ;;
        esac
    done
}

# =============================================================================
#  VERIFICAÇÃO DE ROOT
# =============================================================================
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}${BOLD}"
    echo "  Este script precisa ser executado como root."
    echo "  Use: sudo bash HARDENING.sh"
    echo -e "${RESET}"
    exit 1
fi

log "╔══════════════════════════════════════════════════════════╗" 
log "║   Press Ticket® VPS Hardening — $(date +'%d/%m/%Y %H:%M:%S')       ║"
log "╚══════════════════════════════════════════════════════════╝"

menu
