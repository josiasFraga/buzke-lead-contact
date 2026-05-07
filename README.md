# Buzke Lead Contact

Serviço Node.js em TypeScript para abordar leads via WhatsApp usando Evolution API, classificar respostas com Gemini e atualizar o funil diretamente nas tabelas leads e lead_interacoes.

## O que o serviço faz

- Busca leads pendentes no MySQL.
- Normaliza e valida telefone.
- Consulta se o número possui WhatsApp via Evolution API.
- Envia a abordagem inicial dentro da janela comercial.
- Recebe respostas por webhook da Evolution API.
- Ignora mensagens automáticas para efeito de mudança de status.
- Usa Gemini para classificar a resposta do lead.
- Envia contraproposta para quem já usa sistema.
- Envia o vídeo local video/gestao-profissional-de-quadras-esportivas.mp4 quando o lead autoriza.
- Passa o lead para vendas quando houver interesse e interrompe a IA.

## Status usados

- Entrada da fila inicial: novo, capturado, validado, abordagem_pendente.
- Sem WhatsApp: sem_whatsapp.
- Número inválido: numero_invalido.
- Primeira mensagem enviada: mensagem_enviada.
- Resposta recebida: respondeu.
- Pediu vídeo e ainda não foi possível enviar: pediu_video.
- Vídeo enviado: video_enviado.
- Já usa sistema: usa_sistema.
- Contraproposta pendente fora do horário comercial: contra_argumento_sugerido.
- Handoff para humano: passar_para_vendas.
- Encerramento: sem_interesse ou pediu_para_parar.

## Variáveis de ambiente

Use a base em .env.example.

- DATABASE_URL ou o conjunto DB_HOST, DB_PORT, DB_USER, DB_PASS e DB_NAME.
- GEMINI_API_KEY obrigatório.
- EVOLUTION_API_URL obrigatório para operação com WhatsApp.
- EVOLUTION_API_KEY obrigatório para chamar a Evolution API.
- EVOLUTION_INSTANCE_NAME recomendado. Se omitido, o serviço usa PHONE como nome da instância.
- EVOLUTION_WEBHOOK_SECRET opcional, mas recomendado para validar o webhook.
- APP_BASE_URL opcional. Se informado, o serviço tenta registrar o webhook automaticamente na Evolution API.

## Configuração da Evolution API

O serviço usa estas rotas da Evolution API:

- POST /chat/whatsappNumbers/{instanceName}
- POST /message/sendText/{instanceName}
- POST /message/sendMedia/{instanceName}
- POST /webhook/set/{instanceName}

Se APP_BASE_URL estiver configurado, o serviço tenta registrar o webhook automaticamente em:

- {APP_BASE_URL}/webhooks/evolution

Caso prefira configurar manualmente, habilite ao menos os eventos:

- MESSAGES_UPSERT
- MESSAGES_UPDATE

## Horário de envio

O serviço só envia mensagens automáticas em horário comercial:

- 09:00 até 12:00
- 14:00 até 18:00

Fora desse horário ele continua recebendo webhooks e classificando o conteúdo, mas segura respostas automáticas pendentes para o próximo ciclo permitido.

## Rodando

```bash
npm install
npm run dev
```

Para build de produção:

```bash
npm run build
npm run start
```