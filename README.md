# CRM Studio com PostgreSQL

O projeto continua processando os arquivos no navegador. Somente os indicadores agregados de Marines, Sirlene e Patrícia são enviados para a API e armazenados no PostgreSQL; CPF, telefone e linhas das planilhas não são persistidos.

## Pré-requisitos

- Docker Desktop com Docker Compose.
- Porta local `8080` disponível.

## Inicialização

No PowerShell, dentro desta pasta:

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up -d --build
```

Depois, abra:

```text
http://localhost:8080
```

O arquivo `.env` não entra no Git. Troque a senha de exemplo antes de utilizar o sistema fora de um computador local.

## Funcionamento

1. Calcule as conversões normalmente.
2. Abra **Resultados da Equipe**.
3. O painel envia os totais agregados para `POST /api/resultados`.
4. O histórico é consultado em `GET /api/resultados`.
5. O indicador verde confirma que o PostgreSQL está conectado.

O salvamento é idempotente: abrir a mesma execução várias vezes atualiza o mesmo registro, em vez de criar duplicatas.

## Comandos úteis

```powershell
docker compose ps
docker compose logs -f app
docker compose stop
docker compose start
```

`docker compose stop` preserva o banco. Evite `docker compose down -v`, pois a opção `-v` remove o volume e apaga o histórico.

## Backup

Crie o arquivo dentro do container e depois copie para a pasta atual:

```powershell
docker compose exec database pg_dump -U crm_studio -d crm_studio -f /tmp/crm_studio_backup.sql
$databaseContainer = docker compose ps -q database
docker cp "${databaseContainer}:/tmp/crm_studio_backup.sql" .\crm_studio_backup.sql
```

## Estrutura persistida

- `conversion_runs`: uma linha para cada processamento.
- `seller_results`: métricas de cada vendedora vinculadas ao processamento.
- Volume Docker `postgres_data`: arquivos permanentes do PostgreSQL.

## API

- `GET /api/health`: verifica aplicação e banco.
- `GET /api/resultados?limit=20`: retorna o histórico agregado.
- `POST /api/resultados`: grava ou atualiza um processamento.

O servidor valida tamanhos, tipos, nomes das responsáveis e utiliza consultas parametrizadas no PostgreSQL.
