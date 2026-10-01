# 99% INTRIGAS · 1% VÔLEI — versão final

## Modelo definido

### Jogador
O jogador **não tem login, senha, e-mail ou cadastro de pagamento**.

Ele recebe um link de cadastro do administrador e informa somente:
- Nome
- Nível: Iniciante, Básico, Intermediário, Avançado ou Expert

Depois do cadastro, o site gera um **link pessoal do jogador**. Por esse link ele pode:
- ver o próximo jogo;
- ver os times quando forem sorteados;
- consultar qual é o seu time;
- abrir vídeos/VAR compartilhados;
- abrir a playlist do Spotify;
- acessar o Instagram do grupo.

O jogador não vê caixa, pagamentos, mensalidades, configurações ou controles administrativos.

### Administrador
O administrador entra com **e-mail + senha** pelo Supabase Auth.

O administrador pode:
- cadastrar/editar/desativar jogadores;
- criar o jogo;
- selecionar quem vai jogar;
- escolher mensal ou individual por jogador/jogo;
- sortear times equilibrados por habilidade;
- enviar os times para o WhatsApp;
- marcar pagamentos como pagos/pendentes;
- controlar mensalidades por competência;
- controlar pagamentos individuais;
- controlar o caixa;
- registrar saídas;
- adicionar vídeos/links VAR;
- configurar Spotify e Instagram;
- gerar e trocar o link de cadastro dos jogadores;
- autorizar vários administradores.

O administrador também pode ter um cadastro de jogador vinculado à própria conta e participar normalmente do sorteio.

## Supabase

### 1. Configure a chave
`config.js` já está preparado com o projeto Supabase usado nesta versão. A Publishable Key pode ficar no frontend. **Nunca coloque a Secret/service_role key no site.**

### 2. Execute o `schema.sql`
Abra o Supabase > SQL Editor e execute o arquivo `schema.sql` inteiro.

### 3. Crie o primeiro administrador
No Supabase:
Authentication > Users > Add user

Crie seu e-mail e senha.

Depois, no final do `schema.sql`, substitua:

`SEU_EMAIL_AQUI`

pelo e-mail criado e execute:

```sql
insert into public.admin_users(user_id,email)
select id,email from auth.users
where lower(email)=lower('SEU_EMAIL_AQUI')
on conflict(user_id) do nothing;
```

A partir daí esse administrador pode autorizar outros administradores pela própria tela do site.

### 4. Outros administradores
No site:
Administração > Administradores > Autorizar administrador

Informe o e-mail.

Se a pessoa já tiver uma conta, ela passa a ser administradora. Se não tiver, ela poderá criar a própria conta na tela de login usando aquele e-mail.

Cada administrador tem seu próprio login.

## Link dos jogadores

No site:
Administração > Link de cadastro dos jogadores

Use:
- **Copiar** para colocar o link no grupo;
- **WhatsApp** para abrir uma mensagem pronta;
- **Gerar novo link** para invalidar o link anterior.

O link de cadastro é público para quem o possuir, então envie somente no grupo.

Depois que o jogador concluir o cadastro, o site cria um link pessoal para ele. É esse link que ele deve guardar.

## Publicação

Publique estes arquivos em um host HTTPS, como Vercel, Netlify ou outro serviço de hospedagem:

- `index.html`
- `app.js`
- `config.js`
- `logo.png`

O Supabase precisa ter a URL publicada configurada em Authentication > URL Configuration.

## Importante

Esta versão foi desenhada para separar claramente:

**JOGADOR**
nome + habilidade → consulta do conteúdo e do time

**ADMINISTRADOR**
login → controle total do grupo

E o administrador continua podendo ser jogador.
