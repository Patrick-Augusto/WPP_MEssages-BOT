#  WhatsApp Sender

Sistema de envio de mensagens via WhatsApp com simulação de comportamento humano.

---

## Requisitos do Servidor

- **Node.js** 18 ou superior
- **npm** (vem junto com o Node.js)
- **Google Chrome** ou **Chromium** (usado pelo Puppeteer internamente)
- **1 GB RAM** mínimo (2 GB recomendado)
- Sistema operacional: **Ubuntu/Debian**, **macOS** ou **Windows**

---

## Passo a Passo — Ubuntu/Debian (VPS)

### 1. Atualizar o sistema

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Instalar Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

Verificar instalação:

```bash
node -v
npm -v
```

### 3. Instalar dependências do Chromium (necessário para o WhatsApp Web)

```bash
sudo apt install -y \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
  libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
  libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
  libxtst6 ca-certificates fonts-liberation libappindicator1 \
  libnss3 lsb-release xdg-utils wget libgbm-dev
```

### 4. Copiar os arquivos do projeto para o servidor

Usando `scp` (do seu computador local):

```bash
scp -r "/Users/patrickaugusto/Documents/Empresa/Dr Flavia" usuario@IP_DO_SERVIDOR:/home/usuario/dr-flavia
```

Ou clone do seu repositório Git, se tiver um.

### 5. Instalar dependências do projeto

```bash
cd /home/usuario/dr-flavia
npm install
```

### 6. Testar a aplicação

```bash
node server.js
```

Acesse no navegador: `http://IP_DO_SERVIDOR:3000`

Escaneie o QR Code com o WhatsApp e pronto.

**Ctrl+C** para parar.

### 7. Rodar em background (permanente) com PM2

O PM2 mantém a aplicação rodando 24/7, reinicia em caso de crash, e sobrevive a reinícios do servidor.

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar a aplicação
cd /home/usuario/dr-flavia
pm2 start server.js --name "dr-flavia"

# Configurar para iniciar automaticamente no boot do servidor
pm2 startup
pm2 save
```

Comandos úteis do PM2:

```bash
pm2 status              # Ver status
pm2 logs dr-flavia      # Ver logs em tempo real
pm2 restart dr-flavia   # Reiniciar
pm2 stop dr-flavia      # Parar
pm2 delete dr-flavia    # Remover
```

---

## Passo a Passo — macOS

### 1. Instalar Node.js

```bash
brew install node
```

### 2. Instalar dependências e rodar

```bash
cd "/Users/patrickaugusto/Documents/Empresa/Dr Flavia"
npm install
node server.js
```

### 3. Para rodar em background

```bash
brew install pm2
pm2 start server.js --name "dr-flavia"
```

---

## Passo a Passo — Windows

### 1. Instalar Node.js

Baixe e instale em: https://nodejs.org (versão LTS)

### 2. Abrir o terminal na pasta do projeto

```cmd
cd "C:\caminho\para\dr-flavia"
npm install
node server.js
```

### 3. Para rodar em background

```cmd
npm install -g pm2
pm2 start server.js --name "dr-flavia"
```

---

## Acessar a Interface

Após iniciar, acesse no navegador:

```
http://localhost:3000
```

Se estiver em um servidor remoto:

```
http://IP_DO_SERVIDOR:3000
```

---

## Estrutura de Arquivos

```
dr-flavia/
├── server.js          # Servidor principal (backend)
├── package.json       # Dependências
├── public/
│   ├── index.html     # Interface web
│   ├── app.js         # Lógica do frontend
│   └── style.css      # Estilos
├── uploads/           # Arquivos temporários de mídia
└── .wwebjs_auth/      # Sessão do WhatsApp (criado automaticamente)
```

---

## Como Usar

1. Acesse `http://localhost:3000`
2. Escaneie o **QR Code** com o WhatsApp do celular
3. Clique em **Carregar Conversas** para listar contatos
4. Selecione os destinatários (use a busca para filtrar)
5. Escreva a mensagem (use **Spintax** para variações: `{Olá|Oi|Hey}`)
6. Clique em **Enviar Disparo**
7. Acompanhe o progresso na tela — o sistema roda sozinho, respeitando limites

---

## Proteções Anti-Detecção

| Recurso                 | Descrição                                              |
| ----------------------- | ------------------------------------------------------ |
| Simulação de digitação  | Mostra "digitando..." antes de enviar                  |
| Delays gaussianos       | Intervalos de 30s-180s entre mensagens (curva natural) |
| Presença online/offline | Alterna aleatoriamente para parecer humano             |
| Spintax                 | Cada contato recebe uma variação da mensagem           |
| Ordem aleatória         | Contatos são embaralhados antes do envio               |
| Pausas longas           | 5-15 min a cada 20-35 mensagens                        |
| Limite diário           | 200 mensagens/dia (pausa e retoma no dia seguinte)     |
| Backoff em erros        | Para automaticamente se detectar problemas             |

---

## Notas Importantes

- **Não feche o terminal/PM2** enquanto o envio estiver em andamento
- A pasta `.wwebjs_auth/` guarda a sessão do WhatsApp — se deletar, precisará escanear o QR novamente
- Para bases grandes (3000+), o sistema roda por vários dias automaticamente
- O limite diário padrão é **200 mensagens** — configurável via API (`POST /api/settings`)
