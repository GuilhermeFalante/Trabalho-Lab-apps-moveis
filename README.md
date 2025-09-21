# Trabalho-Lab-apps-moveis

## Link do vídeo de apresentação
https://www.youtube.com/watch?v=OTTwQk0NWYc

## Descrição

Este projeto é uma aplicação de exemplo baseada em microsserviços, desenvolvida para fins acadêmicos na disciplina de Laboratório de Aplicações Móveis. O sistema é composto por um API Gateway e três microsserviços principais: `item-service`, `list-service` e `user-service`. Cada serviço possui seu próprio banco de dados em formato JSON e comunicação via HTTP.

## Estrutura do Projeto

- `api-gateway/`: Responsável por rotear as requisições para os microsserviços.
- `services/`
  - `item-service/`: Gerencia itens.
  - `list-service/`: Gerencia listas.
  - `user-service/`: Gerencia usuários.
- `shared/`: Código compartilhado entre os serviços, como utilitários de banco de dados e registro de serviços.

## Como Executar

1. Instale as dependências em cada pasta (`api-gateway` e cada serviço em `services/`):
	```sh
	npm install
	```
2. Inicie cada serviço individualmente:
	```sh
	node server.js
	```
3. Inicie o API Gateway:
	```sh
	node api-gateway/server.js
	```

## Observações


- Os bancos de dados são arquivos JSON locais, localizados em cada serviço.
- O projeto é para fins didáticos e pode ser expandido para novas funcionalidades.

---

## Objetivo do Sistema

O sistema simula uma aplicação de lista de compras, permitindo que usuários cadastrem listas, adicionem itens e gerenciem suas compras. A arquitetura baseada em microsserviços facilita a manutenção, escalabilidade e entendimento dos conceitos de integração entre serviços.

## Microsserviços

### 1. user-service
Responsável pelo cadastro, autenticação e gerenciamento de usuários.

- **Banco:** `services/user-service/database/users.json`
- **Principais endpoints:**
	- `POST /auth/register` — Cadastro de novo usuário
	- `POST /auth/login` — Autenticação (retorna token)
	- `GET /users/:id` — Consulta dados do usuário

### 2. list-service
Gerencia as listas de compras dos usuários.

- **Banco:** `services/list-service/database/lists.json`
- **Principais endpoints:**
	- `POST /lists` — Criação de nova lista
	- `PUT /lists/:id` — Atualizar lista
	- `DELETE /lists/:id` — Remover lista

### 3. item-service
Gerencia os itens das listas de compras.

- **Banco:** `services/item-service/database/items.json`
- **Principais endpoints:**
	- `POST /items` — Criação de um novo item
	- `PUT /items/:id` — Atualizar item
	- `DELETE /items/:id` — Remover item

### 4. api-gateway
Responsável por receber todas as requisições externas e encaminhá-las para o microsserviço correto. Também pode ser responsável por validação de tokens e agregação de respostas.

---

## Fluxo de Autenticação

O usuário realiza login via `user-service` e recebe um token de autenticação. Esse token deve ser enviado no header das requisições subsequentes para acessar recursos protegidos dos outros serviços.

Exemplo de uso do token:
```http
GET /lists/123
Authorization: Bearer <token>
```

---

## Exemplos de Requisições

### Login
```http
POST /users/login
{
	"username": "joao",
	"password": "123456"
}
// Resposta: { "token": "..." }
```

---

## Extensibilidade

- Novos microsserviços podem ser adicionados facilmente (ex: serviço de notificações).
- O banco pode ser migrado para um SGBD real.
- Pode ser integrado a um frontend web ou mobile.

## Limitações

- Não há persistência avançada (apenas arquivos locais JSON).

---

