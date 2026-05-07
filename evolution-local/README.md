# Evolution API local no Windows

Arquivos desta pasta:

- docker-compose.yml: stack local com Evolution API, PostgreSQL e Redis.
- .env.example: variáveis mínimas para a stack local.

## Observacao importante

Se o Dashboard abre mas o menu Chat falha com erro 500, a causa mais provavel e a combinacao Evolution API v2.3.x + MySQL. Esta stack local foi ajustada para PostgreSQL, que evita esse erro nas consultas internas do chat.

Para aplicar a troca do banco, sera necessario resetar a stack local e reconectar a instancia do WhatsApp.

## Subida rápida

1. Instale e abra o Docker Desktop.
2. Entre nesta pasta.
3. Copie .env.example para .env.
4. Ajuste AUTHENTICATION_API_KEY para uma chave forte.
5. Rode docker compose up -d.
6. Acesse http://localhost:8080.
7. Abra o manager em http://localhost:8080/manager se ele estiver habilitado.

## Fluxo exato no PowerShell

No diretório raiz do projeto, rode:

```powershell
npm run evolution:help
npm run evolution:env:init
```

Depois edite evolution-local/.env e troque pelo menos:

```dotenv
AUTHENTICATION_API_KEY=UMA_CHAVE_FORTE_AQUI
```

Então suba a stack:

```powershell
npm run evolution:up
```

Para acompanhar os logs:

```powershell
npm run evolution:logs
```

Para desligar:

```powershell
npm run evolution:down
```

Para resetar tudo e apagar os volumes locais:

```powershell
npm run evolution:reset
```

Depois do reset, suba novamente:

```powershell
npm run evolution:up
```

## Comandos úteis

Subir a stack:

  docker compose up -d

Ver logs da Evolution:

  docker logs -f evolution_api

Parar a stack:

  docker compose down

Parar e remover volumes:

  docker compose down -v

## Fluxo para criar instância e conectar QR Code

1. Abra http://localhost:8080/manager.
2. Informe a API key global definida em AUTHENTICATION_API_KEY quando o manager solicitar autenticação.
3. Crie uma instância nova. Exemplo de nome: buzke-outbound.
4. Abra a instância criada e gere o QR Code caso ele não apareça automaticamente.
5. No celular que vai enviar as mensagens, abra WhatsApp.
6. Vá em Dispositivos conectados.
7. Toque em Conectar um dispositivo.
8. Escaneie o QR Code exibido pela Evolution.
9. Aguarde o status da instância mudar para open ou connected.
10. Use exatamente esse nome em EVOLUTION_INSTANCE_NAME no projeto principal.

## Como pegar os valores para o projeto principal

- EVOLUTION_API_URL: http://127.0.0.1:8080
- EVOLUTION_API_KEY: o mesmo valor de AUTHENTICATION_API_KEY desta stack
- EVOLUTION_INSTANCE_NAME: nome da instância criada no manager
- EVOLUTION_WEBHOOK_SECRET: uma string criada por você para o seu webhook
- APP_BASE_URL: URL pública do projeto principal, não da Evolution API

## Exemplo de .env final do projeto principal

Preencha o arquivo .env da raiz do projeto principal assim que tiver os valores reais:

EVOLUTION_API_URL=http://127.0.0.1:8080
EVOLUTION_API_KEY=SUA_CHAVE_GLOBAL_DA_EVOLUTION
EVOLUTION_INSTANCE_NAME=nome_da_instancia
EVOLUTION_WEBHOOK_SECRET=segredo_do_webhook
APP_BASE_URL=https://url-publica-do-seu-servico

## Revisão do .env final

Quando você preencher os valores reais no .env da raiz, me envie o bloco destas cinco variáveis e eu reviso se ficou consistente.

Bloco esperado para revisão:

```dotenv
EVOLUTION_API_URL=http://127.0.0.1:8080
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE_NAME=...
EVOLUTION_WEBHOOK_SECRET=...
APP_BASE_URL=...
```