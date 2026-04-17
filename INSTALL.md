# Guia de Instalação Manual

Este guia explica como rodar o projeto **Dr. Flavia** em um computador novo ("cru"), sem usar o arquivo `.exe`.

## Pré-requisitos (O que instalar antes)

Para o programa funcionar, o computador precisa ter apenas dois programas instalados:

1.  **Node.js (Versão LTS)**:
    -   Esse é o motor que roda o código.
    -   **Windows (Terminal)**: Abra o PowerShell e digite:
        ```powershell
        winget install -e --id OpenJS.NodeJS.LTS
        ```
    -   **Mac (via Brew)**:
        ```bash
        brew install node
        ```
    -   **Linux (Ubuntu/Debian)**:
        ```bash
        sudo apt install nodejs npm
        ```

    > **Como saber se instalou certo?**
    > Abra o terminal e digite: `node -v`
    > Se aparecer algo como `v20.x.x` ou `v22.x.x`, está tudo certo!

2.  **Google Chrome**:
    -   O robô precisa do navegador Chrome instalado para funcionar.
    -   Se o computador já tiver o Chrome, ótimo! Se não, instale em: [https://www.google.com/chrome/](https://www.google.com/chrome/).

## Passo a Passo para Rodar

### 1. Copiar a Pasta do Projeto
Copie a pasta inteira do projeto (`Dr Flavia`) para o computador de destino.
Você pode zipar a pasta e enviar, ou copiar via pen-drive.
*Importante: Não precisa copiar a pasta `node_modules`. Ela é pesada e será recriada no passo 2.*

### 2. Instalar as Dependências (Apenas na primeira vez)
1.  Abra a pasta do projeto no computador de destino.
2.  Clique com o botão direito em um espaço vazio e selecione **"Abrir no Terminal"** (ou CMD/PowerShell no Windows).
3.  Digite o seguinte comando e aperte ENTER:
    ```bash
    npm install
    ```
    *Isso vai baixar todas as bibliotecas necessárias (como o puppeteer e o whatsapp-web.js).*

### 3. Rodar o Programa
Sempre que quiser usar o programa:
1.  Abra a pasta no terminal (como no passo anterior).
2.  Digite:
    ```bash
    npm start
    ```
3.  O navegador deve abrir e o programa estará pronto para uso.

## Resumo Rápido
1. Instale **Node.js** e **Chrome**.
2. Copie a pasta do projeto.
3. Rode `npm install` (uma vez).
4. Rode `npm start` (para usar).

## Solução de Problemas (Windows)
**Erro: 'npm' não é reconhecido como um comando interno**
Se você acabou de instalar o Node.js e apareceu esse erro, faça o seguinte:
1.  **Feche** todas as janelas do terminal (CMD ou PowerShell).
2.  Abra o terminal novamente e tente de novo.
3.  Se ainda não funcionar, **reinicie o computador**. Isso garante que o Windows reconheça o novo programa instalado.

**Erro: MODULE_NOT_FOUND (Código que você mandou na foto)**
Se aparecer um erro gigante em vermelho falando que não achou algum módulo (ex: `puppeteer/api/ElementHandle.js`), isso significa que a instalação falhou ou corrompeu.

**A Causa Provável**: Você está rodando o projeto dentro do **OneDrive** (`C:\Users\plast\OneDrive\...`). O OneDrive tenta sincronizar os milhares de arquivos da pasta `node_modules` e acaba corrompendo tudo.

**Solução Recomendada (Muito Importante):**
1.  **Mova a pasta do projeto para fora do OneDrive**.
    -   Exemplo: Coloque em `C:\ProjetoDr` ou na raiz `C:\Users\plast\ProjetoDr` (fora da Área de Trabalho se ela estiver no OneDrive).
2.  Apague a pasta `node_modules` e o arquivo `package-lock.json` que estão lá agora.
3.  Abra o terminal na nova pasta e rode:
    ```bash
    npm install
    ```
4.  Tente rodar de novo com `npm start`.

**Erro: Cannot find module './locators/locators.js' (ou erro no puppeteer)**
Isso acontece quando a instalação foi "completada", mas faltaram arquivos internos.
A solução é limpar tudo e reinstalar do zero:

1.  Abra o terminal na pasta do projeto.
2.  Apague a pasta `node_modules` e o arquivo `package-lock.json` (pode fazer pelo Windows Explorer se preferir).
3.  No terminal, rode este comando para limpar o cache do Node:
    ```bash
    npm cache clean --force
    ```
4.  Agora instale de novo:
    ```bash
    npm install
    ```
5.  Rode `npm start`.
