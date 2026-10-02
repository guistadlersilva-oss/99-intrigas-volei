const SB = supabase.createClient(
  VOLEI_CONFIG.supabaseUrl,
  VOLEI_CONFIG.supabaseAnonKey
);

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const SKILLS = {
  iniciante: 1,
  basico: 2,
  intermediario: 3,
  avancado: 4,
  expert: 5
};

const SKILL_LABEL = {
  iniciante: 'Iniciante',
  basico: 'Básico',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
  expert: 'Expert'
};

let session = null;
let admin = false;
let currentGame = null;
let players = [];
let settings = null;
let playerToken = null;
let playerData = null;
let allGames = [];
let activeMode = 'landing';
let editingGameId = null;

const PUBLIC_APP_URL = 'https://99-intrigas-volei.vercel.app';
/* =========================================================
   UTILITÁRIOS
========================================================= */

const $ = id =>
  document.getElementById(id);

const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c])
  );

const money = n =>
  Number(n || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );

const dateBR = d =>
  d
    ? new Date(
        d + 'T12:00:00'
      ).toLocaleDateString('pt-BR')
    : '—';

const todayKey = () =>
  new Date()
    .toISOString()
    .slice(0, 10);

const monthKey = () => {
  const d = new Date();

  return new Date(
    d.getFullYear(),
    d.getMonth(),
    1
  )
    .toISOString()
    .slice(0, 10);
};

const sum = arr =>
  arr.reduce(
    (total, player) =>
      total +
      (Number(
        player?.skill_score
      ) || 0),
    0
  );

function toast(message) {
  const el = $('toast');

  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = message;
  el.classList.remove('hidden');

  clearTimeout(
    toast._timer
  );

  toast._timer = setTimeout(
    () => {
      el.classList.add(
        'hidden'
      );
    },
    3000
  );
}

function normalizeSkill(skill) {
  const s = String(
    skill || ''
  )
    .trim()
    .toLowerCase();

  return SKILLS[s]
    ? s
    : 'basico';
}


/* =========================================================
   NAVEGAÇÃO
========================================================= */

function setMode(mode) {
  activeMode = mode;

  $('landing')?.classList.toggle(
    'hidden',
    mode !== 'landing'
  );

  $('adminLogin')?.classList.toggle(
    'hidden',
    mode !== 'adminLogin'
  );

  $('adminApp')?.classList.toggle(
    'hidden',
    mode !== 'admin'
  );

  $('playerApp')?.classList.toggle(
    'hidden',
    mode !== 'player'
  );

  $('registerApp')?.classList.toggle(
    'hidden',
    mode !== 'register'
  );
}


function goAdminLogin() {
  playerToken = null;
  playerData = null;

  const url =
    new URL(
      window.location.href
    );

  url.searchParams.delete(
    'jogador'
  );

  url.searchParams.delete(
    'cadastro'
  );

  window.history.replaceState(
    {},
    '',
    url.pathname
  );

  setMode(
    'adminLogin'
  );
}


function exitPlayer() {
  playerToken = null;
  playerData = null;

  const url =
    new URL(
      window.location.href
    );

  url.searchParams.delete(
    'jogador'
  );

  url.searchParams.delete(
    'cadastro'
  );

  window.history.replaceState(
    {},
    '',
    url.pathname
  );

  setMode(
    'landing'
  );
}


function playerUrl(token) {
  return `${PUBLIC_APP_URL}/?jogador=${encodeURIComponent(token)}`;
}


function registerUrl() {
  const token =
    window.__INVITE_TOKEN ||
    '';

  return `${PUBLIC_APP_URL}/?cadastro=${encodeURIComponent(token)}`;
}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function init() {
  if ($('year')) {
    $('year').textContent =
      new Date().getFullYear();
  }

  const query =
    new URLSearchParams(
      location.search
    );

  if (query.get('cadastro')) {
    setMode('register');

    if ($('registerToken')) {
      $('registerToken').value =
        query.get('cadastro');
    }

    return;
  }

  if (query.get('jogador')) {
    playerToken =
      query.get('jogador');

    await loadPlayer();

    return;
  }

  const result =
    await SB.auth.getSession();

  session =
    result.data?.session ||
    null;

  if (session) {
    const isAdmin =
      await checkAdmin();

    if (isAdmin) {
      await enterAdmin();
      return;
    }
  }

  setMode('landing');
}


async function checkAdmin() {
  if (!session?.user?.id) {
    return false;
  }

  const r =
    await SB
      .from('admin_users')
      .select('user_id')
      .eq(
        'user_id',
        session.user.id
      )
      .maybeSingle();

  return !!r.data && !r.error;
}


/* =========================================================
   LOGIN ADMIN
========================================================= */

async function adminLogin(e) {
  e.preventDefault();

  const email =
    $('adminEmail')
      ?.value
      .trim();

  const password =
    $('adminPassword')
      ?.value;

  if (!email || !password) {
    toast(
      'Informe e-mail e senha.'
    );

    return;
  }

  const r =
    await SB.auth.signInWithPassword({
      email,
      password
    });

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  session =
    r.data.session;

  if (!await checkAdmin()) {
    await SB.auth.signOut();

    session = null;

    toast(
      'Este e-mail ainda não está autorizado como administrador.'
    );

    return;
  }

  await enterAdmin();
}


async function adminSignup(e) {
  e.preventDefault();

  const email =
    $('newAdminEmail')
      ?.value
      .trim();

  const password =
    $('newAdminPassword')
      ?.value;

  if (!email || !password) {
    toast(
      'Informe e-mail e senha.'
    );

    return;
  }

  if (password.length < 6) {
    toast(
      'A senha precisa ter pelo menos 6 caracteres.'
    );

    return;
  }

  const invite =
    await SB
      .from('admin_invites')
      .select('email')
      .eq(
        'email',
        email.toLowerCase()
      )
      .maybeSingle();

  if (invite.error) {
    toast(
      invite.error.message
    );

    return;
  }

  if (!invite.data) {
    toast(
      'Este e-mail não foi autorizado por um administrador.'
    );

    return;
  }

  const r =
    await SB.auth.signUp({
      email,
      password
    });

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  toast(
    'Conta criada. Confirme o e-mail, se solicitado, e depois faça login.'
  );

  if ($('newAdminEmail')) {
    $('newAdminEmail').value = '';
  }

  if ($('newAdminPassword')) {
    $('newAdminPassword').value = '';
  }
}


async function enterAdmin() {
  admin = true;

  setMode('admin');

  await loadAdmin();

  buildAdminNav();

  showAdminPage(
    'dashboard'
  );
}


async function logoutAdmin() {
  await SB.auth.signOut();

  session = null;
  admin = false;

  setMode('landing');
}


/* =========================================================
   CARREGAMENTO ADMIN
========================================================= */

async function loadAdmin() {
  const [s, p, g] =
    await Promise.all([
      SB
        .from('group_settings')
        .select('*')
        .eq('id', true)
        .single(),

      SB
        .from('players')
        .select('*')
        .order('name'),

      SB
        .from('games')
        .select('*')
        .order(
          'game_date',
          {
            ascending: false
          }
        )
    ]);

  if (s.error) {
    toast(
      s.error.message
    );

    return;
  }

  settings =
    s.data;

  players =
    p.data || [];

  allGames =
    g.data || [];

  if (
    currentGame &&
    allGames.some(
      x =>
        x.id ===
        currentGame.id
    )
  ) {
    currentGame =
      allGames.find(
        x =>
          x.id ===
          currentGame.id
      );
  } else {
    currentGame =
      allGames.find(
        x =>
          x.game_date >=
          todayKey()
      ) ||
      allGames[0] ||
      null;
  }

  const state =
    await SB
      .from('app_state')
      .select(
        'invite_token,cash_initial'
      )
      .eq('id', true)
      .maybeSingle();

window.__APP_STATE =
  state.data || {};

window.__INVITE_TOKEN =
  state.data?.invite_token ||
  '';

/*
  Garante que sempre exista um token
  válido para o link de cadastro.
*/
if (!window.__INVITE_TOKEN) {

  const newToken =
    crypto.randomUUID()
      .replace(/-/g, '');

  const inviteUpdate =
    await SB
      .from('app_state')
      .update({
        invite_token:
          newToken,

        updated_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        true
      );

  if (!inviteUpdate.error) {

    window.__INVITE_TOKEN =
      newToken;

    window.__APP_STATE.invite_token =
      newToken;
  }
}

if ($('adminName')) {
    $('adminName').textContent =
      session?.user?.email ||
      'Administrador';
  }
}


/* =========================================================
   MENU ADMIN
========================================================= */

function buildAdminNav() {
  const nav =
    $('adminNav');

  if (!nav) {
    return;
  }

  nav.innerHTML = [
    ['dashboard', '🏠 Visão geral'],
    ['players', '🏐 Jogadores'],
    ['games', '📅 Jogo e times'],
    ['payments', '💰 Pagamentos'],
    ['cash', '🏦 Caixa'],
    ['media', '🎥 VAR / 🎵 Playlist'],
    ['settings', '⚙️ Administração']
  ]
    .map(
      ([id, title], index) =>
        `
          <button
            class="${
              index === 0
                ? 'active'
                : ''
            }"
            onclick="showAdminPage('${id}',this)"
          >
            ${title}
          </button>
        `
    )
    .join('');
}


function showAdminPage(id, btn) {
  try {
    // Remove o destaque de todos os botões
    document
      .querySelectorAll('#adminNav button')
      .forEach(button => {
        button.classList.remove('active');
      });

    // Destaca o botão clicado
    if (btn) {
      btn.classList.add('active');
    }

    // Esconde todas as páginas
    document
      .querySelectorAll('#adminPages .page')
      .forEach(page => {
        page.classList.remove('active');
      });

    // Mostra a página selecionada
    const page = $(`a_${id}`);

    if (!page) {
      console.error(
        'Página administrativa não encontrada:',
        `a_${id}`
      );

      return;
    }

    page.classList.add('active');

    // Carrega o conteúdo da página
    if (id === 'dashboard') {
      renderDashboard().catch(error => {
        console.error(
          'Erro ao carregar Dashboard:',
          error
        );
      });
    }

    if (id === 'players') {
      renderPlayers().catch(error => {
        console.error(
          'Erro ao carregar Jogadores:',
          error
        );
      });
    }

    if (id === 'games') {
      renderGames().catch(error => {
        console.error(
          'Erro ao carregar Jogos:',
          error
        );
      });
    }

    if (id === 'payments') {
      renderPayments().catch(error => {
        console.error(
          'Erro ao carregar Pagamentos:',
          error
        );
        toast(
          'Erro ao carregar pagamentos. Veja o console.'
        );
      });
    }

    if (id === 'cash') {
      renderCash().catch(error => {
        console.error(
          'Erro ao carregar Caixa:',
          error
        );
        toast(
          'Erro ao carregar caixa. Veja o console.'
        );
      });
    }

    if (id === 'media') {
      renderMedia().catch(error => {
        console.error(
          'Erro ao carregar VAR / Playlist:',
          error
        );
        toast(
          'Erro ao carregar VAR / Playlist.'
        );
      });
    }

    if (id === 'settings') {
      renderSettings().catch(error => {
        console.error(
          'Erro ao carregar Administração:',
          error
        );
        toast(
          'Erro ao carregar Administração.'
        );
      });
    }

  } catch (error) {
    console.error(
      'Erro na navegação administrativa:',
      error
    );

    toast(
      'Erro ao abrir esta área.'
    );
  }
}

/* =========================================================
   DASHBOARD
========================================================= */

async function getCashSummary() {
  const [stateResult, entriesResult] =
    await Promise.all([
      SB
        .from('app_state')
        .select(
          'cash_initial'
        )
        .eq('id', true)
        .maybeSingle(),

      SB
        .from('cash_entries')
        .select(
          'type,amount'
        )
    ]);

  const initial =
    Number(
      stateResult.data
        ?.cash_initial || 0
    );

  let balance =
    initial;

  for (
    const row of
      entriesResult.data || []
  ) {
    const amount =
      Number(
        row.amount || 0
      );

    if (
      row.type === 'entrada' ||
      row.type === 'in'
    ) {
      balance += amount;
    } else {
      balance -= amount;
    }
  }

  return {
    initial,
    balance
  };
}


async function renderDashboard() {
  const cash =
    await getCashSummary();

  $('dashCards').innerHTML = `
    <div class="statCard">
      <span>Jogadores ativos</span>
      <b>
        ${
          players.filter(
            p => p.active
          ).length
        }
      </b>
    </div>

    <div class="statCard">
      <span>Próximo jogo</span>
      <b>
        ${
          currentGame
            ? dateBR(
                currentGame.game_date
              )
            : '—'
        }
      </b>
    </div>

    <div class="statCard">
      <span>Caixa</span>
      <b>
        ${money(
          cash.balance
        )}
      </b>
    </div>

    <div class="statCard">
      <span>Mensalidade</span>
      <b>
        ${money(
          settings?.monthly_fee
        )}
      </b>
    </div>
  `;

  $('dashInfo').innerHTML =
    currentGame
      ? `
        <b>Próximo jogo:</b>
        ${dateBR(
          currentGame.game_date
        )}
        · ${
          currentGame.teams_count
        } times

        <br>

        <span class="muted">
          ${esc(
            currentGame.notes ||
              'Sem observações'
          )}
        </span>
      `
      : `
        <div class="notice">
          Nenhum jogo cadastrado.
        </div>
      `;
}


/* =========================================================
   JOGADORES
========================================================= */

async function renderPlayers() {
  const rows =
    players
      .map(
        p => `
          <tr>

            <td>
              <b>
                ${esc(
                  p.name
                )}
              </b>
            </td>

            <td>
              ${
                SKILL_LABEL[
                  p.skill
                ] ||
                p.skill
              }
            </td>

            <td>
              ${p.skill_score}
            </td>

            <td>
              <span class="badge ${
                p.active
                  ? 'paid'
                  : 'pending'
              }">
                ${
                  p.active
                    ? 'Ativo'
                    : 'Inativo'
                }
              </span>
            </td>

            <td>
              <button
                onclick="editPlayer('${p.id}')"
              >
                Editar
              </button>

              <button
                onclick="togglePlayer('${p.id}',${!p.active})"
              >
                ${
                  p.active
                    ? 'Desativar'
                    : 'Ativar'
                }
              </button>

              <button
                onclick="deletePlayer('${p.id}')"
              >
                🗑️
              </button>
            </td>

          </tr>
        `
      )
      .join('');

  $('playersTable').innerHTML =
    rows ||
    `
      <tr>
        <td colspan="5">
          Nenhum jogador cadastrado.
        </td>
      </tr>
    `;

  if ($('playerCount')) {
    $('playerCount').textContent =
      `${
        players.filter(
          p => p.active
        ).length
      } ativos`;
  }
}


async function editPlayer(id) {
  const player =
    players.find(
      p =>
        p.id === id
    );

  if (!player) {
    return;
  }

  const name =
    prompt(
      'Nome:',
      player.name
    );

  if (name === null) {
    return;
  }

  const skill =
    prompt(
      'Habilidade:\niniciante\nbasico\nintermediario\navancado\nexpert',
      player.skill
    );

  if (skill === null) {
    return;
  }

  const normalized =
    normalizeSkill(
      skill
    );

  const r =
    await SB
      .from('players')
      .update({
        name:
          name.trim(),

        skill:
          normalized,

        skill_score:
          SKILLS[
            normalized
          ]
      })
      .eq(
        'id',
        id
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  toast(
    'Jogador atualizado.'
  );

  await loadAdmin();

  renderPlayers();
}


async function togglePlayer(
  id,
  active
) {
  const r =
    await SB
      .from('players')
      .update({
        active
      })
      .eq(
        'id',
        id
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  await loadAdmin();

  renderPlayers();
}


async function deletePlayer(id) {
  const player =
    players.find(
      p =>
        p.id === id
    );

  if (!player) {
    toast(
      'Jogador não encontrado.'
    );

    return;
  }

  if (
    !confirm(
      `Excluir definitivamente ${player.name}?\n\n` +
      `Os registros financeiros serão preservados no histórico.\n\n` +
      `Esta ação não poderá ser desfeita.`
    )
  ) {
    return;
  }

  try {
    /* =====================================================
       1. PRESERVAR MENSALIDADES NO HISTÓRICO
    ===================================================== */

    const monthlyResult =
      await SB
        .from('monthly_payments')
        .select('*')
        .eq(
          'player_id',
          id
        );

    if (monthlyResult.error) {
      throw monthlyResult.error;
    }

    const monthly =
      monthlyResult.data || [];

    for (
      const payment of monthly
    ) {
      const historyResult =
        await SB
          .from('payment_history')
          .insert({
            payment_date:
              payment.paid_at
                ? payment.paid_at.slice(
                    0,
                    10
                  )
                : todayKey(),

            /*
             * IMPORTANTE:
             * Não mantemos player_id porque
             * o jogador será excluído.
             */
            player_id:
              null,

            player_name:
              player.name,

            payment_type:
              'mensal',

            competence:
              payment.competence,

            amount:
              payment.amount,

            notes:
              'Preservado antes da exclusão do jogador'
          });

      if (historyResult.error) {
        throw historyResult.error;
      }
    }


    /* =====================================================
       2. PRESERVAR PAGAMENTOS INDIVIDUAIS
    ===================================================== */

    const unitsResult =
      await SB
        .from('unit_payments')
        .select('*')
        .eq(
          'player_id',
          id
        );

    if (unitsResult.error) {
      throw unitsResult.error;
    }

    const units =
      unitsResult.data || [];

    for (
      const payment of units
    ) {
      const game =
        allGames.find(
          g =>
            g.id ===
            payment.game_id
        );

      const historyResult =
        await SB
          .from('payment_history')
          .insert({
            payment_date:
              game?.game_date ||
              todayKey(),

            /*
             * O histórico não pode depender
             * do jogador que será excluído.
             */
            player_id:
              null,

            player_name:
              player.name,

            payment_type:
              'individual',

            game_id:
              payment.game_id,

            amount:
              payment.amount,

            notes:
              'Preservado antes da exclusão do jogador'
          });

      if (historyResult.error) {
        throw historyResult.error;
      }
    }


    /* =====================================================
       3. REMOVER MEMBROS DOS TIMES
    ===================================================== */

    const teamMembersResult =
      await SB
        .from('team_members')
        .delete()
        .eq(
          'player_id',
          id
        );

    if (
      teamMembersResult.error
    ) {
      throw teamMembersResult.error;
    }


    /* =====================================================
       4. REMOVER PARTICIPAÇÕES NOS JOGOS
    ===================================================== */

    const gamePlayersResult =
      await SB
        .from('game_players')
        .delete()
        .eq(
          'player_id',
          id
        );

    if (
      gamePlayersResult.error
    ) {
      throw gamePlayersResult.error;
    }


    /* =====================================================
       5. REMOVER PAGAMENTOS MENSAIS
    ===================================================== */

    const monthlyDeleteResult =
      await SB
        .from('monthly_payments')
        .delete()
        .eq(
          'player_id',
          id
        );

    if (
      monthlyDeleteResult.error
    ) {
      throw monthlyDeleteResult.error;
    }


    /* =====================================================
       6. REMOVER PAGAMENTOS INDIVIDUAIS
    ===================================================== */

    const unitDeleteResult =
      await SB
        .from('unit_payments')
        .delete()
        .eq(
          'player_id',
          id
        );

    if (
      unitDeleteResult.error
    ) {
      throw unitDeleteResult.error;
    }


    /* =====================================================
       7. REMOVER O JOGADOR
    ===================================================== */

    const playerDeleteResult =
      await SB
        .from('players')
        .delete()
        .eq(
          'id',
          id
        );

    if (
      playerDeleteResult.error
    ) {
      throw playerDeleteResult.error;
    }


    /* =====================================================
       8. ATUALIZAR DADOS DO ADMIN
    ===================================================== */

    const savedAdminPlayerId =
      localStorage.getItem(
        adminPlayerStorageKey()
      );

    if (
      savedAdminPlayerId ===
      id
    ) {
      localStorage.removeItem(
        adminPlayerStorageKey()
      );
    }


    /* =====================================================
       9. RECARREGAR DADOS
    ===================================================== */

    await loadAdmin();

    await renderPlayers();


    toast(
      'Jogador excluído. Histórico financeiro preservado.'
    );

  } catch (error) {
    console.error(
      'Erro ao excluir jogador:',
      error
    );

    toast(
      error?.message ||
      'Não foi possível excluir o jogador.'
    );
  }
}

/* =========================================================
   JOGOS
========================================================= */

function nextFriday() {
  const d =
    new Date();

  const diff =
    (
      5 -
      d.getDay() +
      7
    ) % 7;

  d.setDate(
    d.getDate() +
    diff
  );

  return d
    .toISOString()
    .slice(0, 10);
}


async function renderGames() {
  /* =====================================================
     FORMULÁRIO DO JOGO
  ===================================================== */

  if ($('gameFormDate')) {
    $('gameFormDate').value =
      currentGame?.game_date ||
      nextFriday();
  }

  if ($('gameTeams')) {
    $('gameTeams').value =
      currentGame?.teams_count ||
      2;
  }

  if ($('gameNotes')) {
    $('gameNotes').value =
      currentGame?.notes ||
      '';
  }


  /* =====================================================
     TÍTULO DO JOGO SELECIONADO
  ===================================================== */

  if ($('currentGameTitle')) {
    $('currentGameTitle').textContent =
      currentGame
        ? `Jogo de ${dateBR(
            currentGame.game_date
          )}`
        : 'Nenhum jogo';
  }


  /* =====================================================
     LISTA DE JOGOS CADASTRADOS
  ===================================================== */

  if ($('gamesList')) {
    if (!allGames.length) {

      $('gamesList').innerHTML = `
        <div class="notice">
          Nenhum jogo cadastrado.
        </div>
      `;

    } else {

      $('gamesList').innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Times</th>
              <th>Observações</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>

            ${
              allGames
                .map(
                  g => `
                    <tr>

                      <td>
                        <b>
                          ${dateBR(
                            g.game_date
                          )}
                        </b>

                        ${
                          currentGame?.id === g.id
                            ? `
                              <br>
                              <span class="badge paid">
                                Selecionado
                              </span>
                            `
                            : ''
                        }
                      </td>

                      <td>
                        ${g.teams_count || 0}
                      </td>

                      <td>
                        ${
                          esc(
                            g.notes ||
                            'Sem observações'
                          )
                        }
                      </td>

                      <td>

                        <button
                          onclick="selectAdminGame('${g.id}')"
                        >
                          Selecionar
                        </button>

                        <button
                          onclick="deleteGame('${g.id}')"
                        >
                          🗑️ Excluir
                        </button>

                      </td>

                    </tr>
                  `
                )
                .join('')
            }

          </tbody>
        </table>
      `;
    }
  }


  /* =====================================================
     SELETOR DE JOGO
  ===================================================== */

  if ($('gameSelectorAdmin')) {
    $('gameSelectorAdmin').innerHTML =
      allGames
        .map(
          g => `
            <option
              value="${g.id}"
              ${
                currentGame?.id ===
                g.id
                  ? 'selected'
                  : ''
              }
            >
              ${dateBR(
                g.game_date
              )}
            </option>
          `
        )
        .join('');
  }


  /* =====================================================
     JOGADORES DO JOGO
  ===================================================== */

  if ($('gamePlayerList')) {
    $('gamePlayerList').innerHTML =
      currentGame
        ? await gamePlayerRows(
            currentGame.id
          )
        : `
          <div class="notice">
            Crie um jogo para selecionar quem vai jogar.
          </div>
        `;
  }


  /* =====================================================
     TIMES
  ===================================================== */

  if (currentGame) {
    await renderTeamsAdmin();
  } else if ($('teamsAdmin')) {
    $('teamsAdmin').innerHTML = '';
  }
}

function selectAdminGame(id) {
  const game =
    allGames.find(
      g =>
        g.id === id
    );

  if (!game) {
    return;
  }

  currentGame =
    game;

  editingGameId =
    game.id;

  renderGames();
}


function newGame() {
  currentGame =
    null;

  editingGameId =
    null;

  renderGames();
}


async function saveGame(e) {
  e.preventDefault();

  const date =
    $('gameFormDate')
      ?.value;

  const teams =
    Number(
      $('gameTeams')
        ?.value
    );

  const notes =
    $('gameNotes')
      ?.value ||
    '';

  if (!date) {
    toast(
      'Informe a data do jogo.'
    );

    return;
  }

  if (
    !Number.isInteger(
      teams
    ) ||
    teams < 1
  ) {
    toast(
      'Informe uma quantidade válida de times.'
    );

    return;
  }

  let r;

  if (editingGameId) {
    r =
      await SB
        .from('games')
        .update({
          game_date:
            date,

          teams_count:
            teams,

          notes:
            notes
        })
        .eq(
          'id',
          editingGameId
        )
        .select()
        .single();
  } else {
    r =
      await SB
        .from('games')
        .insert({
          game_date:
            date,

          teams_count:
            teams,

          notes:
            notes
        })
        .select()
        .single();
  }

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  currentGame =
    r.data;

  editingGameId =
    r.data.id;

  await loadAdmin();

  toast(
    'Jogo salvo.'
  );

  renderGames();
}


async function deleteGame(id) {
  const game =
    allGames.find(
      g =>
        g.id === id
    );

  if (!game) {
    toast(
      'Jogo não encontrado.'
    );

    return;
  }

  if (
    !confirm(
      `Excluir o jogo de ${dateBR(
        game.game_date
      )}?\n\n` +
      `Os pagamentos individuais serão preservados no histórico.\n\n` +
      `Esta ação não poderá ser desfeita.`
    )
  ) {
    return;
  }

  try {
    /* =====================================================
       1. LOCALIZAR PAGAMENTOS INDIVIDUAIS
    ===================================================== */

    const unitsResult =
      await SB
        .from('unit_payments')
        .select('*')
        .eq(
          'game_id',
          id
        );

    if (unitsResult.error) {
      throw unitsResult.error;
    }

    const units =
      unitsResult.data || [];


    /* =====================================================
       2. PRESERVAR PAGAMENTOS NO HISTÓRICO
       
       IMPORTANTE:
       game_id fica NULL porque o jogo será excluído.
    ===================================================== */

    for (
      const payment of units
    ) {
      const player =
        players.find(
          p =>
            p.id ===
            payment.player_id
        );

      const historyResult =
        await SB
          .from('payment_history')
          .insert({
            payment_date:
              game.game_date ||
              todayKey(),

            player_id:
              player?.id ||
              null,

            player_name:
              player?.name ||
              'Jogador removido',

            payment_type:
              'individual',

            game_id:
              null,

            amount:
              payment.amount,

            notes:
              `Pagamento preservado antes da exclusão do jogo de ${dateBR(
                game.game_date
              )}`
          });

      if (
        historyResult.error
      ) {
        throw historyResult.error;
      }
    }


    /* =====================================================
       4. LOCALIZAR TIMES DO JOGO
    ===================================================== */

    const teamsResult =
      await SB
        .from('teams')
        .select('id')
        .eq(
          'game_id',
          id
        );

    if (teamsResult.error) {
      throw teamsResult.error;
    }

    const teams =
      teamsResult.data || [];

    const teamIds =
      teams.map(
        team =>
          team.id
      );


    /* =====================================================
       5. REMOVER MEMBROS DOS TIMES
    ===================================================== */

    if (
      teamIds.length
    ) {
      const teamMembersResult =
        await SB
          .from('team_members')
          .delete()
          .in(
            'team_id',
            teamIds
          );

      if (
        teamMembersResult.error
      ) {
        throw teamMembersResult.error;
      }
    }


    /* =====================================================
       6. REMOVER TIMES
    ===================================================== */

    const teamsDeleteResult =
      await SB
        .from('teams')
        .delete()
        .eq(
          'game_id',
          id
        );

    if (
      teamsDeleteResult.error
    ) {
      throw teamsDeleteResult.error;
    }


    /* =====================================================
       7. REMOVER PARTICIPAÇÕES DOS JOGADORES
    ===================================================== */

    const gamePlayersResult =
      await SB
        .from('game_players')
        .delete()
        .eq(
          'game_id',
          id
        );

    if (
      gamePlayersResult.error
    ) {
      throw gamePlayersResult.error;
    }


    /* =====================================================
       8. REMOVER PAGAMENTOS INDIVIDUAIS
    ===================================================== */

    const unitDeleteResult =
      await SB
        .from('unit_payments')
        .delete()
        .eq(
          'game_id',
          id
        );

    if (
      unitDeleteResult.error
    ) {
      throw unitDeleteResult.error;
    }


    /* =====================================================
       9. EXCLUIR O JOGO
    ===================================================== */

    const gameDeleteResult =
      await SB
        .from('games')
        .delete()
        .eq(
          'id',
          id
        );

    if (
      gameDeleteResult.error
    ) {
      throw gameDeleteResult.error;
    }


    /* =====================================================
       10. ATUALIZAR JOGO ATUAL
    ===================================================== */

    if (
      currentGame?.id === id
    ) {
      currentGame =
        allGames.find(
          g =>
            g.id !== id &&
            g.game_date >=
              todayKey()
        ) ||
        null;

      editingGameId =
        currentGame?.id ||
        null;
    }


    /* =====================================================
       11. RECARREGAR
    ===================================================== */

    await loadAdmin();

    renderGames();

    toast(
      'Jogo excluído. Pagamentos individuais preservados no histórico.'
    );

  } catch (error) {
    console.error(
      'Erro ao excluir jogo:',
      error
    );

    toast(
      error?.message ||
      'Não foi possível excluir o jogo.'
    );
  }
}
async function gamePlayerRows(
  gameId
) {

  const gp =
    (
      await SB
        .from(
          'game_players'
        )
        .select('*')
        .eq(
          'game_id',
          gameId
        )
    ).data || [];


  return `
    <div class="tableWrap">

      <table>

        <thead>
          <tr>
            <th>Jogador</th>
            <th>Habilidade</th>
            <th>Vai jogar?</th>
          </tr>
        </thead>

        <tbody>

          ${
            players
              .filter(
                p =>
                  p.active
              )
              .map(
                p => {

                  const x =
                    gp.find(
                      a =>
                        a.player_id ===
                        p.id
                    );


                  return `
                    <tr>

                      <td>
                        ${esc(
                          p.name
                        )}
                      </td>

                      <td>
                        ${
                          SKILL_LABEL[
                            p.skill
                          ] ||
                          p.skill
                        }
                      </td>

                      <td>
                        <input
                          type="checkbox"
                          ${
                            x?.present
                              ? 'checked'
                              : ''
                          }
                          onchange="saveGamePlayer(
                            '${gameId}',
                            '${p.id}',
                            this.checked
                          )"
                        >
                      </td>

                    </tr>
                  `;
                }
              )
              .join('')
          }

        </tbody>

      </table>

    </div>
  `;
}


async function saveGamePlayer(
  gameId,
  playerId,
  present
) {

  /*
    A presença no jogo não gera mais
    cobrança individual.
    O financeiro é controlado exclusivamente
    pelo Caixa e pelas mensalidades.
  */
  const r =
    await SB
      .from(
        'game_players'
      )
      .upsert(
        {
          game_id:
            gameId,

          player_id:
            playerId,

          present:
            !!present,

          payment_mode:
            'mensal'
        },
        {
          onConflict:
            'game_id,player_id'
        }
      );


  if (r.error) {

    toast(
      r.error.message
    );

    return;
  }


  await renderGames();
}


/* =========================================================
   SORTEIO
========================================================= */

async function drawTeams() {
  if (!currentGame) {
    toast(
      'Nenhum jogo selecionado.'
    );

    return;
  }

  const gp =
    (
      await SB
        .from(
          'game_players'
        )
        .select(
          'player_id'
        )
        .eq(
          'game_id',
          currentGame.id
        )
        .eq(
          'present',
          true
        )
    ).data || [];

  const ps =
    gp
      .map(x =>
        players.find(
          p =>
            p.id ===
            x.player_id
        )
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(
            b.skill_score
          ) -
          Number(
            a.skill_score
          )
      );

  if (!ps.length) {
    toast(
      'Nenhum jogador confirmado para este jogo.'
    );

    return;
  }

  const requestedTeams =
    Number(
      currentGame.teams_count
    ) || 2;

  const teamCount =
    Math.min(
      Math.max(
        1,
        requestedTeams
      ),
      ps.length
    );

  const baseSize =
    Math.floor(
      ps.length /
        teamCount
    );

  const remainder =
    ps.length %
    teamCount;

  const capacities =
    Array.from(
      {
        length:
          teamCount
      },
      (_, i) =>
        baseSize +
        (
          i <
          remainder
            ? 1
            : 0
        )
    );

  const oldTeams =
    (
      await SB
        .from('teams')
        .select('id')
        .eq(
          'game_id',
          currentGame.id
        )
    ).data || [];

  if (oldTeams.length) {
    const oldIds =
      oldTeams.map(
        x => x.id
      );

    await SB
      .from(
        'team_members'
      )
      .delete()
      .in(
        'team_id',
        oldIds
      );

    await SB
      .from('teams')
      .delete()
      .eq(
        'game_id',
        currentGame.id
      );
  }

  const teams =
    Array.from(
      {
        length:
          teamCount
      },
      () => []
    );

  ps.forEach(
    player => {
      const available =
        [
          ...Array(
            teamCount
          ).keys()
        ].filter(
          i =>
            teams[i]
              .length <
            capacities[i]
        );

      available.sort(
        (a, b) => {
          const skillDiff =
            sum(
              teams[a]
            ) -
            sum(
              teams[b]
            );

          if (
            skillDiff !==
            0
          ) {
            return skillDiff;
          }

          const sizeDiff =
            teams[a]
              .length -
            teams[b]
              .length;

          if (
            sizeDiff !==
            0
          ) {
            return sizeDiff;
          }

          return a - b;
        }
      );

      teams[
        available[0]
      ].push(player);
    }
  );

  for (
    let i = 0;
    i < teams.length;
    i++
  ) {
    const teamPlayers =
      teams[i];

    const teamName =
      `Time ${i + 1}`;

    const result =
      await SB
        .from('teams')
        .insert({
          game_id:
            currentGame.id,

          name:
            teamName,

          total_skill:
            sum(
              teamPlayers
            )
        })
        .select()
        .single();

    if (
      result.error
    ) {
      toast(
        result.error.message
      );

      return;
    }

    const team =
      result.data;

    if (
      teamPlayers.length
    ) {
      const members =
        teamPlayers.map(
          player => ({
            team_id:
              team.id,

            player_id:
              player.id
          })
        );

      const mr =
        await SB
          .from(
            'team_members'
          )
          .insert(
            members
          );

      if (mr.error) {
        toast(
          mr.error.message
        );

        return;
      }
    }
  }

  toast(
    `Times sorteados! ${ps.length} jogadores em ${teamCount} times.`
  );

  await renderGames();
}


/* =========================================================
   TIMES
========================================================= */

async function renderTeamsAdmin() {
  if (!currentGame) {
    return;
  }

  const ts =
    (
      await SB
        .from('teams')
        .select(
          'id,name,total_skill'
        )
        .eq(
          'game_id',
          currentGame.id
        )
        .order(
          'created_at'
        )
    ).data || [];

  if (!ts.length) {
    $('teamsAdmin').innerHTML =
      `
        <div class="notice">
          Ainda não há times sorteados.
        </div>
      `;

    return;
  }

  const members =
    (
      await SB
        .from(
          'team_members'
        )
        .select(
          'team_id,player_id'
        )
        .in(
          'team_id',
          ts.map(
            t => t.id
          )
        )
    ).data || [];

  $('teamsAdmin').innerHTML =
    ts
      .map(t => {
        const teamMembers =
          members
            .filter(
              m =>
                m.team_id ===
                t.id
            )
            .map(
              m =>
                players.find(
                  p =>
                    p.id ===
                    m.player_id
                )
            )
            .filter(Boolean);

        return `
          <div class="team">

            <h3>
              ${esc(
                t.name
              )}

              <small>
                ${
                  teamMembers.length
                } jogadores
                ·
                ${sum(
                  teamMembers
                )} pontos
              </small>
            </h3>

            ${
              teamMembers.length
                ? teamMembers
                    .map(
                      p => `
                        <div class="person">

                          <span>
                            ${esc(
                              p.name
                            )}

                            <small>
                              ${
                                SKILL_LABEL[
                                  p.skill
                                ] || ''
                              }
                            </small>
                          </span>

                          <button
                            onclick="movePlayerFromTeam(
                              '${p.id}',
                              '${t.id}'
                            )"
                          >
                            ↔️ Mover
                          </button>

                        </div>
                      `
                    )
                    .join('')
                : `
                    <div class="muted">
                      Nenhum jogador neste time.
                    </div>
                  `
            }

          </div>
        `;
      })
      .join('');
}


async function movePlayerFromTeam(
  playerId,
  currentTeamId
) {
  if (!currentGame) {
    return;
  }

  const teams =
    (
      await SB
        .from('teams')
        .select(
          'id,name'
        )
        .eq(
          'game_id',
          currentGame.id
        )
        .order(
          'created_at'
        )
    ).data || [];

  const available =
    teams.filter(
      t =>
        t.id !==
        currentTeamId
    );

  if (!available.length) {
    toast(
      'Não existem outros times.'
    );

    return;
  }

  const player =
    players.find(
      p =>
        p.id ===
        playerId
    );

  if (!player) {
    return;
  }

  const options =
    available
      .map(
        (t, i) =>
          `${i + 1} - ${t.name}`
      )
      .join('\n');

  const answer =
    prompt(
      `Mover ${player.name} para:\n\n${options}\n\nDigite o número:`
    );

  if (answer === null) {
    return;
  }

  const index =
    Number(answer) - 1;

  if (
    index < 0 ||
    index >=
      available.length
  ) {
    toast(
      'Time inválido.'
    );

    return;
  }

  const target =
    available[index];

  const r =
    await SB
      .from(
        'team_members'
      )
      .update({
        team_id:
          target.id
      })
      .eq(
        'team_id',
        currentTeamId
      )
      .eq(
        'player_id',
        playerId
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  await recalculateTeamScores();

  toast(
    `${player.name} foi movido.`
  );

  await renderGames();
}


async function recalculateTeamScores() {
  if (!currentGame) {
    return;
  }

  const teams =
    (
      await SB
        .from('teams')
        .select('id')
        .eq(
          'game_id',
          currentGame.id
        )
    ).data || [];

  for (
    const team of teams
  ) {
    const members =
      (
        await SB
          .from(
            'team_members'
          )
          .select(
            'player_id'
          )
          .eq(
            'team_id',
            team.id
          )
      ).data || [];

    const score =
      sum(
        members
          .map(m =>
            players.find(
              p =>
                p.id ===
                m.player_id
            )
          )
          .filter(Boolean)
      );

    await SB
      .from('teams')
      .update({
        total_skill:
          score
      })
      .eq(
        'id',
        team.id
      );
  }
}


async function sendTeamsWhatsApp() {
  if (!currentGame) {
    toast(
      'Nenhum jogo selecionado.'
    );

    return;
  }

  const ts =
    (
      await SB
        .from('teams')
        .select(
          'id,name'
        )
        .eq(
          'game_id',
          currentGame.id
        )
        .order(
          'created_at'
        )
    ).data || [];

  const members =
    (
      await SB
        .from(
          'team_members'
        )
        .select(
          'team_id,player_id'
        )
        .in(
          'team_id',
          ts.map(
            t => t.id
          )
        )
    ).data || [];

  const text =
    `🏐 99% INTRIGAS · 1% VÔLEI\n\n` +
    `Jogo: ${dateBR(
      currentGame.game_date
    )}\n\n` +
    ts
      .map(
        t =>
          `${t.name.toUpperCase()}:\n` +
          members
            .filter(
              m =>
                m.team_id ===
                t.id
            )
            .map(
              m =>
                players.find(
                  p =>
                    p.id ===
                    m.player_id
                )?.name
            )
            .filter(Boolean)
            .join(', ')
      )
      .join('\n\n');

  window.open(
    'https://wa.me/?text=' +
      encodeURIComponent(
        text
      ),
    '_blank'
  );
}


/* =========================================================
   PAGAMENTOS
========================================================= */

let paymentCompetence =
  monthKey();


/* =====================================================
   CONTROLES DE MENSALIDADE
===================================================== */

function ensurePaymentControls() {

  const monthly =
    $('monthlyTable');

  if (!monthly) {
    return;
  }

  const parent =
    monthly.closest(
      '.tableWrap'
    ) ||
    monthly.parentElement;

  if (
    parent &&
    !$('paymentAdvancedControls')
  ) {

    const box =
      document.createElement(
        'div'
      );

    box.id =
      'paymentAdvancedControls';

    box.className =
      'card';

    box.style.marginBottom =
      '18px';

    box.innerHTML = `
      <div
        style="
          display:grid;
          gap:12px;
          grid-template-columns:
          repeat(auto-fit,minmax(220px,1fr));
          align-items:end;
        "
      >

        <label>
          <span>
            Competência
          </span>

          <input
            id="paymentCompetence"
            type="month"
            onchange="changePaymentCompetence(this.value)"
          >
        </label>


        <label>
          <span>
            Valor padrão mensal
          </span>

          <input
            id="monthlyValueEdit"
            type="number"
            step="0.01"
            min="0"
          >
        </label>


        <button
          type="button"
          onclick="saveDefaultMonthlyValue()"
        >
          💾 Salvar valor
        </button>

      </div>
    `;

    parent.parentElement.insertBefore(
      box,
      parent
    );
  }
}


/* =====================================================
   SELETORES / COMPATIBILIDADE
   ===================================================== */

function renderPaymentSelectors() {

  if (
    $('paymentCompetence')
  ) {
    $('paymentCompetence').value =
      paymentCompetence.slice(
        0,
        7
      );
  }

  if (
    $('monthlyValueEdit')
  ) {
    $('monthlyValueEdit').value =
      Number(
        settings?.monthly_fee ||
        0
      ).toFixed(2);
  }
}


async function changePaymentCompetence(
  value
) {

  if (!value) {
    return;
  }

  paymentCompetence =
    `${value}-01`;

  await renderPayments();
}


/*
  O index usa estes nomes para o seletor
  mensal. Eles agora trabalham somente
  com a competência das mensalidades.
*/
async function changePaymentMonth() {

  const value =
    $('paymentMonthInput')
      ?.value;

  if (!value) {
    return;
  }

  paymentCompetence =
    `${value}-01`;

  await renderPayments();
}


async function refreshPayments() {
  await renderPayments();
}


/*
  O botão "Registrar mensalidade" não cria
  uma cobrança paralela. O registro da
  mensalidade é feito na própria linha do
  jogador através de "Marcar pago".
*/
async function addMonthlyPayment() {

  const table =
    $('monthlyTable');

  if (table) {
    table.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  toast(
    'Use "Marcar pago" na linha do jogador para registrar a mensalidade.'
  );
}


async function changePaymentGame() {
  /*
    Mantido apenas para compatibilidade
    com versões antigas da página.
    Pagamentos individuais não são mais
    usados pela interface.
  */
  return;
}


/* =====================================================
   PAGAMENTOS MENSAIS
===================================================== */

async function renderPayments() {

  ensurePaymentControls();

  if (
    $('paymentMonth')
  ) {

    $('paymentMonth').textContent =
      new Date(
        paymentCompetence +
        'T12:00:00'
      ).toLocaleDateString(
        'pt-BR',
        {
          month:
            'long',

          year:
            'numeric'
        }
      );
  }


  if (
    $('paymentMonthInput')
  ) {
    $('paymentMonthInput').value =
      paymentCompetence.slice(
        0,
        7
      );
  }


  const result =
    await SB
      .from(
        'monthly_payments'
      )
      .select('*')
      .eq(
        'competence',
        paymentCompetence
      );


  if (
    result.error
  ) {

    console.error(
      'Erro ao carregar mensalidades:',
      result.error
    );

    toast(
      'Erro ao carregar mensalidades.'
    );

    return;
  }


  const monthly =
    result.data || [];


  const table =
    $('monthlyTable');

  if (!table) {
    return;
  }


  table.innerHTML =
    players
      .filter(
        p =>
          p.active
      )
      .map(
        p => {

          const row =
            monthly.find(
              x =>
                x.player_id ===
                p.id
            );


          const amount =
            Number(
              row?.amount ??
              settings?.monthly_fee ??
              0
            );


          return `
            <tr>

              <td>
                ${esc(
                  p.name
                )}
              </td>

              <td>
                ${paymentCompetence.slice(
                  0,
                  7
                )}
              </td>

              <td>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value="${amount.toFixed(2)}"
                  style="max-width:120px"
                  onchange="editMonthlyAmount(
                    '${p.id}',
                    this.value
                  )"
                >
              </td>

              <td>
                <span
                  class="badge ${
                    row?.paid
                      ? 'paid'
                      : 'pending'
                  }"
                >
                  ${
                    row?.paid
                      ? 'Pago'
                      : 'Pendente'
                  }
                </span>
              </td>

              <td>
                <button
                  onclick="toggleMonthly(
                    '${p.id}',
                    ${!!row?.paid}
                  )"
                >
                  ${
                    row?.paid
                      ? 'Desmarcar'
                      : 'Marcar pago'
                  }
                </button>
              </td>

              <td>
                <span class="muted">
                  O lançamento financeiro é feito no Caixa.
                </span>
              </td>

            </tr>
          `;
        }
      )
      .join('') ||
    `
      <tr>
        <td colspan="6">
          Nenhum jogador ativo.
        </td>
      </tr>
    `;


  renderPaymentSelectors();
}


async function saveDefaultMonthlyValue() {

  const value =
    Number(
      $('monthlyValueEdit')
        ?.value
    );

  if (
    !Number.isFinite(
      value
    ) ||
    value < 0
  ) {

    toast(
      'Informe um valor válido.'
    );

    return;
  }


  const r =
    await SB
      .from(
        'group_settings'
      )
      .update({
        monthly_fee:
          value,

        updated_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        true
      );


  if (r.error) {

    toast(
      r.error.message
    );

    return;
  }


  settings.monthly_fee =
    value;

  toast(
    'Valor mensal atualizado.'
  );

  await renderPayments();
}


async function editMonthlyAmount(
  playerId,
  value
) {

  const amount =
    Number(value);

  if (
    !Number.isFinite(
      amount
    ) ||
    amount < 0
  ) {

    toast(
      'Valor inválido.'
    );

    return;
  }


  const r =
    await SB
      .from(
        'monthly_payments'
      )
      .upsert(
        {
          player_id:
            playerId,

          competence:
            paymentCompetence,

          amount
        },
        {
          onConflict:
            'player_id,competence'
        }
      );


  if (r.error) {

    toast(
      r.error.message
    );

    return;
  }


  toast(
    'Valor mensal atualizado.'
  );

  await renderPayments();
}


async function toggleMonthly(
  playerId,
  paid
) {

  const r =
    await SB.rpc(
      'set_monthly_paid',
      {
        p_player:
          playerId,

        p_competence:
          paymentCompetence,

        p_paid:
          !paid
      }
    );


  if (r.error) {

    toast(
      r.error.message
    );

    return;
  }


  toast(
    !paid
      ? 'Mensalidade marcada como paga.'
      : 'Mensalidade desmarcada.'
  );

  await renderPayments();
}


/* =====================================================
   FUNÇÕES LEGADAS DE PAGAMENTO INDIVIDUAL
   NÃO SÃO MAIS USADAS PELA INTERFACE.
   Os registros antigos permanecem no banco.
===================================================== */

async function editUnitAmount() {
  toast(
    'Pagamentos individuais não são mais usados. Registre a movimentação no Caixa.'
  );
}

async function addUnitCharge() {
  toast(
    'Pagamentos individuais não são mais usados. Registre a movimentação no Caixa.'
  );
}

async function toggleUnit() {
  toast(
    'Pagamentos individuais não são mais usados. Registre a movimentação no Caixa.'
  );
}

async function removeUnit() {
  toast(
    'Pagamentos individuais não são mais usados. Registre a movimentação no Caixa.'
  );
}

/* =========================================================
   HISTÓRICO DE PAGAMENTOS
========================================================= */

async function addHistoricalPayment() {
  const paymentDate =
    $('historyDate')
      ?.value ||
    todayKey();

  const playerName =
    $('historyName')
      ?.value
      .trim();

  const amount =
    Number(
      $('historyAmount')
        ?.value
    );

  const type =
    $('historyType')
      ?.value ||
    'individual';

  const gameId =
    $('historyGame')
      ?.value ||
    null;

  const alreadyInCash =
    !!$(
      'historyAlreadyInCash'
    )?.checked;

  if (!playerName) {
    toast(
      'Informe o nome do pagador.'
    );

    return;
  }

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    toast(
      'Informe um valor válido.'
    );

    return;
  }

  const linked =
    players.find(
      p =>
        p.name
          .trim()
          .toLowerCase() ===
        playerName
          .toLowerCase()
    );

  const r =
    await SB
      .from(
        'payment_history'
      )
      .insert({
        payment_date:
          paymentDate,

        player_id:
          linked?.id ||
          null,

        player_name:
          playerName,

        payment_type:
          type,

        game_id:
          gameId,

        competence:
          type === 'mensal'
            ? `${paymentDate.slice(
                0,
                7
              )}-01`
            : null,

        amount,

        notes:
          alreadyInCash
            ? 'Pagamento histórico já incluído no saldo inicial'
            : 'Pagamento histórico'
      })
      .select()
      .single();

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  /*
    Se o valor NÃO estiver no saldo inicial,
    adicionamos a entrada ao caixa.
  */
  if (!alreadyInCash) {
    await SB
      .from(
        'cash_entries'
      )
      .insert({
        entry_date:
          paymentDate,

        type:
          'entrada',

        category:
          type === 'mensal'
            ? 'Mensalidade'
            : 'Pagamento individual',

        description:
          `Histórico | ${playerName} | pagamento:${r.data.id}`,

        amount
      });
  }

  if ($('historyName')) {
    $('historyName').value =
      '';
  }

  if ($('historyAmount')) {
    $('historyAmount').value =
      '';
  }

  toast(
    'Pagamento histórico salvo.'
  );

  await renderPaymentHistory();
}


async function renderPaymentHistory() {
  const wrap =
    $('historyTableWrap');

  if (!wrap) {
    return;
  }

  const history =
    (
      await SB
        .from(
          'payment_history'
        )
        .select('*')
        .order(
          'payment_date',
          {
            ascending:
              false
          }
        )
        .limit(100)
    ).data || [];

  wrap.innerHTML = `
    <div class="tableWrap">

      <table>

        <thead>
          <tr>
            <th>Data</th>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Jogo</th>
            <th>Valor</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>

          ${
            history.length
              ? history
                  .map(
                    h => {
                      const game =
                        allGames.find(
                          g =>
                            g.id ===
                            h.game_id
                        );

                      return `
                        <tr>

                          <td>
                            ${dateBR(
                              h.payment_date
                            )}
                          </td>

                          <td>
                            ${esc(
                              h.player_name
                            )}
                          </td>

                          <td>
                            ${
                              h.payment_type ===
                              'mensal'
                                ? 'Mensal'
                                : 'Individual'
                            }
                          </td>

                          <td>
                            ${
                              game
                                ? dateBR(
                                    game.game_date
                                  )
                                : '—'
                            }
                          </td>

                          <td>
                            ${money(
                              h.amount
                            )}
                          </td>

                          <td>

                            <button
                              onclick="editHistoricalPayment('${h.id}')"
                            >
                              Editar
                            </button>

                            <button
                              onclick="deleteHistoricalPayment('${h.id}')"
                            >
                              🗑️
                            </button>

                            ${
                              !h.player_id
                                ? `
                                  <button
                                    onclick="linkHistoricalPayment('${h.id}')"
                                  >
                                    Vincular
                                  </button>
                                `
                                : ''
                            }

                          </td>

                        </tr>
                      `;
                    }
                  )
                  .join('')
              : `
                  <tr>
                    <td colspan="6">
                      Nenhum histórico cadastrado.
                    </td>
                  </tr>
                `
          }

        </tbody>

      </table>

    </div>
  `;
}


async function editHistoricalPayment(
  id
) {
  const result =
    await SB
      .from(
        'payment_history'
      )
      .select('*')
      .eq(
        'id',
        id
      )
      .single();

  if (result.error) {
    toast(
      result.error.message
    );

    return;
  }

  const h =
    result.data;

  const name =
    prompt(
      'Nome:',
      h.player_name
    );

  if (name === null) {
    return;
  }

  const amount =
    Number(
      prompt(
        'Valor:',
        h.amount
      )
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    toast(
      'Valor inválido.'
    );

    return;
  }

  const date =
    prompt(
      'Data (AAAA-MM-DD):',
      h.payment_date
    );

  if (!date) {
    return;
  }

  const r =
    await SB
      .from(
        'payment_history'
      )
      .update({
        player_name:
          name.trim(),

        amount,

        payment_date:
          date
      })
      .eq(
        'id',
        id
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  toast(
    'Histórico atualizado.'
  );

  await renderPaymentHistory();
}


async function deleteHistoricalPayment(
  id
) {
  if (
    !confirm(
      'Excluir este registro histórico?'
    )
  ) {
    return;
  }

  const r =
    await SB
      .from(
        'payment_history'
      )
      .delete()
      .eq(
        'id',
        id
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  await SB
    .from(
      'cash_entries'
    )
    .delete()
    .like(
      'description',
      `%pagamento:${id}`
    );

  toast(
    'Histórico excluído.'
  );

  await renderPaymentHistory();
}


async function linkHistoricalPayment(
  id
) {
  const result =
    await SB
      .from(
        'payment_history'
      )
      .select('*')
      .eq(
        'id',
        id
      )
      .single();

  if (result.error) {
    toast(
      result.error.message
    );

    return;
  }

  const h =
    result.data;

  const options =
    players
      .map(
        (p, i) =>
          `${i + 1} - ${p.name}`
      )
      .join('\n');

  const answer =
    prompt(
      `Vincular "${h.player_name}" a qual jogador?\n\n${options}\n\nDigite o número:`
    );

  if (answer === null) {
    return;
  }

  const index =
    Number(answer) - 1;

  if (
    index < 0 ||
    index >=
      players.length
  ) {
    toast(
      'Jogador inválido.'
    );

    return;
  }

  const player =
    players[index];

  const r =
    await SB
      .from(
        'payment_history'
      )
      .update({
        player_id:
          player.id,

        player_name:
          player.name
      })
      .eq(
        'id',
        id
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  toast(
    'Histórico vinculado ao jogador.'
  );

  await renderPaymentHistory();
}


/* =========================================================
   CAIXA
========================================================= */


async function saveCashInitial() {

  const value =
    Number(
      $('cashInitialInput')
        ?.value
    );

  if (
    !Number.isFinite(
      value
    ) ||
    value < 0
  ) {

    toast(
      'Informe um saldo válido.'
    );

    return;
  }


  const r =
    await SB
      .from('app_state')
      .update({
        cash_initial:
          value,

        updated_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        true
      );


  if (r.error) {

    toast(
      r.error.message
    );

    return;
  }


  window.__APP_STATE =
    window.__APP_STATE || {};

  window.__APP_STATE.cash_initial =
    value;

  toast(
    'Saldo inicial atualizado.'
  );

  await renderCash();
}


/* =====================================================
   SALDO INICIAL
===================================================== */

async function editOpeningBalance() {

  const current =
    Number(
      window.__APP_STATE?.cash_initial ||
      0
    );

  const answer =
    prompt(
      'Informe o novo saldo inicial do Caixa:',
      current.toFixed(2)
    );

  if (
    answer ===
    null
  ) {
    return;
  }

  const value =
    Number(
      String(answer)
        .replace(',', '.')
    );

  if (
    !Number.isFinite(
      value
    ) ||
    value < 0
  ) {
    toast(
      'Informe um saldo válido.'
    );

    return;
  }

  if ($('cashInitialInput')) {
    $('cashInitialInput').value =
      value.toFixed(2);
  }

  await saveCashInitial();
}


/* =====================================================
   FORMULÁRIO UNIFICADO DO CAIXA
===================================================== */

function toggleCashNameField() {

  const type =
    $('cashType')
      ?.value ||
    'entrada';

  const field =
    $('cashNameField');

  const input =
    $('cashName');

  if (!field) {
    return;
  }

  if (
    type ===
    'entrada'
  ) {

    field.style.display =
      '';

    if (input) {
      input.required =
        true;
    }

  } else {

    field.style.display =
      'none';

    if (input) {
      input.required =
        false;

      input.value =
        '';
    }
  }
}


function ensureCashForm() {

  /*
    Remove categorias antigas que pertenciam
    ao pagamento individual.
  */
  const category =
    $('cashCategory');

  if (category) {

    [
      ...category.options
    ]
      .filter(
        option =>
          option.value ===
          'Pagamento individual'
      )
      .forEach(
        option =>
          option.remove()
      );
  }


  if (
    $('cashDate') &&
    !$('cashDate').value
  ) {
    $('cashDate').value =
      todayKey();
  }


  toggleCashNameField();


  /*
    O HTML antigo tinha duas tabelas com
    o mesmo id. Mantemos somente o primeiro
    histórico visível.
  */
  const tables =
    document.querySelectorAll(
      '#cashTable'
    );

  if (
    tables.length >
    1
  ) {

    for (
      let i = 1;
      i < tables.length;
      i++
    ) {

      const card =
        tables[i].closest(
          '.card'
        );

      if (card) {
        card.remove();
      } else {
        tables[i].remove();
      }
    }
  }


  /*
    Remove formulários antigos de entrada
    e saída caso ainda existam em uma versão
    antiga do index.html.
  */
  [
    'cashIncomeForm',
    'expenseForm'
  ].forEach(
    id => {

      const form =
        $(id);

      if (form) {
        const card =
          form.closest(
            '.card'
          );

        if (card) {
          card.remove();
        } else {
          form.remove();
        }
      }
    }
  );
}


async function addCashEntry(
  e
) {

  if (e) {
    e.preventDefault();
  }


  const date =
    $('cashDate')
      ?.value ||
    todayKey();

  const type =
    $('cashType')
      ?.value ||
    'entrada';

  const category =
    $('cashCategory')
      ?.value ||
    'Outro';

  const name =
    $('cashName')
      ?.value
      ?.trim() ||
    '';

  const amount =
    Number(
      $('cashAmount')
        ?.value
    );

  const observation =
    $('cashDescription')
      ?.value
      ?.trim() ||
    '';


  if (!date) {

    toast(
      'Informe a data.'
    );

    return;
  }


  if (
    type ===
      'entrada' &&
    !name
  ) {

    toast(
      'Informe o nome de quem realizou o pagamento.'
    );

    return;
  }


  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {

    toast(
      'Informe um valor válido.'
    );

    return;
  }


  if (!observation) {

    toast(
      'Informe uma observação.'
    );

    return;
  }


  /*
    Para entrada, o nome fica junto da
    descrição para que o histórico antigo
    continue usando somente o campo description.
  */
  const description =
    type ===
      'entrada'
      ? `${name} | ${observation}`
      : observation;


  const result =
    await SB
      .from(
        'cash_entries'
      )
      .insert({
        entry_date:
          date,

        type:
          type,

        category:
          category,

        description:
          description,

        amount:
          amount
      });


  if (result.error) {

    console.error(
      'Erro ao registrar movimentação:',
      result.error
    );

    toast(
      result.error.message
    );

    return;
  }


  if ($('cashForm')) {
    $('cashForm').reset();
  }


  if ($('cashDate')) {
    $('cashDate').value =
      todayKey();
  }


  if ($('cashType')) {
    $('cashType').value =
      'entrada';
  }


  toggleCashNameField();


  toast(
    type ===
      'entrada'
      ? 'Entrada registrada.'
      : 'Saída registrada.'
  );


  await renderCash();
}


/* =====================================================
   HISTÓRICO DO CAIXA
===================================================== */

async function renderCash() {

  ensureCashForm();


  const [state, result] =
    await Promise.all([
      SB
        .from('app_state')
        .select(
          'cash_initial'
        )
        .eq(
          'id',
          true
        )
        .maybeSingle(),

      SB
        .from('cash_entries')
        .select('*')
        .order(
          'entry_date',
          {
            ascending:
              false
          }
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        )
    ]);


  if (result.error) {

    console.error(
      'Erro ao carregar Caixa:',
      result.error
    );

    toast(
      result.error.message
    );

    return;
  }


  if (state.error) {
    console.error('Erro ao carregar saldo inicial:', state.error);
    toast('Erro ao carregar saldo inicial: ' + state.error.message);
    return;
  }

  if (result.error) {
    console.error('Erro ao carregar histórico do caixa:', result.error);
    toast('Erro ao carregar caixa: ' + result.error.message);
    return;
  }

  const initial =
    Number(
      state.data?.cash_initial ||
      0
    );

  const entries =
    result.data || [];


  let entradas =
    0;

  let saidas =
    0;


  for (
    const row of entries
  ) {

    const amount =
      Number(
        row.amount || 0
      );

    if (
      row.type ===
        'entrada' ||
      row.type ===
        'in'
    ) {

      entradas +=
        amount;

    } else {

      saidas +=
        amount;
    }
  }


  const balance =
    initial +
    entradas -
    saidas;


  window.__APP_STATE =
    window.__APP_STATE || {};

  window.__APP_STATE.cash_initial =
    initial;


  if (
    $('cashInitialInput')
  ) {

    $('cashInitialInput').value =
      initial.toFixed(2);
  }


  if (
    $('cashStats')
  ) {

    $('cashStats').innerHTML = `
      <div class="statCard">
        <span>Saldo inicial</span>
        <b>
          ${money(
            initial
          )}
        </b>
      </div>

      <div class="statCard">
        <span>Entradas</span>
        <b>
          ${money(
            entradas
          )}
        </b>
      </div>

      <div class="statCard">
        <span>Saídas</span>
        <b>
          ${money(
            saidas
          )}
        </b>
      </div>

      <div class="statCard">
        <span>Saldo atual</span>
        <b>
          ${money(
            balance
          )}
        </b>
      </div>
    `;
  }


  const rows =
    entries
      .map(
        row => `

          <tr>

            <td>
              ${dateBR(
                row.entry_date
              )}
            </td>

            <td>
              ${
                row.type ===
                  'entrada' ||
                row.type ===
                  'in'
                  ? 'Entrada'
                  : 'Saída'
              }
            </td>

            <td>
              ${esc(
                row.category ||
                'Outro'
              )}
            </td>

            <td>
              ${esc(
                row.description ||
                ''
              )}
            </td>

            <td>
              ${money(
                row.amount
              )}
            </td>

            <td>
              <button
                onclick="editCashEntry('${row.id}')"
              >
                Editar
              </button>

              <button
                onclick="deleteCashEntry('${row.id}')"
              >
                🗑️
              </button>
            </td>

          </tr>
        `
      )
      .join('');


  const table =
    $('cashTable');

  if (table) {

    table.innerHTML =
      rows ||
      `
        <tr>
          <td colspan="6">
            Nenhuma movimentação.
          </td>
        </tr>
      `;
  }
}


async function editCashEntry(
  id
) {

  const result =
    await SB
      .from(
        'cash_entries'
      )
      .select('*')
      .eq(
        'id',
        id
      )
      .single();


  if (result.error) {

    toast(
      result.error.message
    );

    return;
  }


  const row =
    result.data;


  const description =
    prompt(
      'Observação:',
      row.description ||
        ''
    );


  if (
    description ===
    null
  ) {
    return;
  }


  const amount =
    Number(
      prompt(
        'Valor:',
        row.amount
      )
    );


  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {

    toast(
      'Valor inválido.'
    );

    return;
  }


  const r =
    await SB
      .from(
        'cash_entries'
      )
      .update({
        description:
          description.trim(),

        amount
      })
      .eq(
        'id',
        id
      );


  if (r.error) {

    toast(
      r.error.message
    );

    return;
  }


  toast(
    'Lançamento atualizado.'
  );

  await renderCash();
}


async function deleteCashEntry(
  id
) {

  if (
    !confirm(
      'Excluir este lançamento do caixa?'
    )
  ) {
    return;
  }


  const r =
    await SB
      .from(
        'cash_entries'
      )
      .delete()
      .eq(
        'id',
        id
      );


  if (r.error) {

    toast(
      r.error.message
    );

    return;
  }


  toast(
    'Lançamento excluído.'
  );

  await renderCash();
}


/* =========================================================
   VAR / SPOTIFY
========================================================= */

async function renderMedia() {
  const result =
    await SB
      .from('var_links')
      .select('*')
      .order(
        'created_at',
        {
          ascending:
            false
        }
      );

  if (result.error) {
    console.error('Erro ao carregar VAR:', result.error);
    if ($('varAdminList')) {
      $('varAdminList').innerHTML = `
        <div class="notice">
          Erro ao carregar os vídeos: ${esc(result.error.message)}
        </div>
      `;
    }
    toast('Erro ao carregar VAR: ' + result.error.message);
    return;
  }

  const links =
    result.data || [];

  $('varAdminList').innerHTML =
    links
      .map(
        x => `
          <div class="mediaRow">

            <div>
              <b>
                ${esc(
                  x.title
                )}
              </b>

              <small>
                ${dateBR(
                  x.link_date
                )}
              </small>
            </div>

            <div
              style="
                display:flex;
                gap:8px;
                align-items:center;
              "
            >

              <a
                target="_blank"
                href="${esc(
                  x.url
                )}"
              >
                Abrir
              </a>

              <button
                onclick="editVar('${x.id}')"
              >
                Editar
              </button>

              <button
                onclick="deleteVar('${x.id}')"
              >
                🗑️
              </button>

            </div>

          </div>
        `
      )
      .join('') ||
    `
      <div class="notice">
        Nenhum vídeo cadastrado.
      </div>
    `;

  if ($('spotifyInput')) {
    $('spotifyInput').value =
      settings?.spotify_url ||
      '';
  }
}


async function addVar(e) {
  e.preventDefault();

  const title =
    $('varTitle')
      ?.value
      .trim();

  const url =
    $('varUrl')
      ?.value
      .trim();

  const date =
    $('varDate')
      ?.value ||
    null;

  if (!title || !url) {
    toast(
      'Informe título e link.'
    );

    return;
  }

  const r =
    await SB
      .from(
        'var_links'
      )
      .insert({
        title,

        url,

        link_date:
          date
      });

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  $('varForm')
    ?.reset();

  toast(
    'Vídeo adicionado.'
  );

  await renderMedia();
}


async function editVar(id) {
  const result =
    await SB
      .from(
        'var_links'
      )
      .select('*')
      .eq(
        'id',
        id
      )
      .single();

  if (result.error) {
    toast(
      result.error.message
    );

    return;
  }

  const row =
    result.data;

  const title =
    prompt(
      'Título:',
      row.title
    );

  if (
    title ===
    null
  ) {
    return;
  }

  const url =
    prompt(
      'Link:',
      row.url
    );

  if (
    url ===
    null
  ) {
    return;
  }

  const r =
    await SB
      .from(
        'var_links'
      )
      .update({
        title:
          title.trim(),

        url:
          url.trim()
      })
      .eq(
        'id',
        id
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  toast(
    'Vídeo atualizado.'
  );

  await renderMedia();
}


async function deleteVar(
  id
) {
  if (
    !confirm(
      'Excluir este vídeo?'
    )
  ) {
    return;
  }

  const r =
    await SB
      .from(
        'var_links'
      )
      .delete()
      .eq(
        'id',
        id
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  toast(
    'Vídeo excluído.'
  );

  await renderMedia();
}


async function saveSpotify(e) {
  e.preventDefault();

  const url =
    $('spotifyInput')
      ?.value
      .trim() ||
    '';

  const r =
    await SB
      .from(
        'group_settings'
      )
      .update({
        spotify_url:
          url,

        updated_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        true
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  settings.spotify_url =
    url;

  toast(
    'Playlist salva.'
  );
}


/* =========================================================
   ADMINISTRAÇÃO
========================================================= */

function adminPlayerStorageKey() {
  return session?.user?.id
    ? `volei_admin_player_${session.user.id}`
    : '';
}


async function renderSettings() {
  const savedPlayerId =
    localStorage.getItem(
      adminPlayerStorageKey()
    );

  const mine =
    players.find(
      p =>
        p.id ===
        savedPlayerId
    );

  if ($('adminPlayerName')) {
    $('adminPlayerName').value =
      mine?.name ||
      '';
  }

  if ($('adminPlayerSkill')) {
    $('adminPlayerSkill').value =
      mine?.skill ||
      'intermediario';
  }

  if ($('monthlyFee')) {
    $('monthlyFee').value =
      settings?.monthly_fee ||
      0;
  }

  if ($('instagramUrl')) {
    $('instagramUrl').value =
      settings?.instagram_url ||
      '';
  }

  if ($('registerLink')) {
    $('registerLink').value =
      registerUrl();
  }

  const adminsResult =
    await SB
      .from(
        'admin_users'
      )
      .select(
        'user_id,email,created_at'
      )
      .order(
        'created_at'
      );

  if (adminsResult.error) {
    console.error('Erro ao carregar administradores:', adminsResult.error);
    if ($('adminsList')) {
      $('adminsList').innerHTML = `
        <tr>
          <td colspan="3">
            ${esc(adminsResult.error.message)}
          </td>
        </tr>
      `;
    }
    toast('Erro ao carregar Administração: ' + adminsResult.error.message);
    return;
  }

  const admins =
    adminsResult.data || [];

  if ($('adminsList')) {
    $('adminsList').innerHTML =
      admins
        .map(
          a => `
            <tr>

              <td>
                ${esc(
                  a.email
                )}
              </td>

              <td>
                ${
                  a.user_id ===
                  session.user.id
                    ? 'Você'
                    : ''
                }
              </td>

              <td>
                ${
                  a.user_id ===
                  session.user.id
                    ? '—'
                    : `
                      <button
                        onclick="removeAdmin('${a.user_id}')"
                      >
                        Remover
                      </button>
                    `
                }
              </td>

            </tr>
          `
        )
        .join('');
  }
}


async function saveSettings(e) {
  e.preventDefault();

  const r =
    await SB
      .from(
        'group_settings'
      )
      .update({
        monthly_fee:
          Number(
            $('monthlyFee')
              ?.value
          ) || 0,

        instagram_url:
          $('instagramUrl')
            ?.value
            .trim() ||
          '',

        updated_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        true
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  await loadAdmin();

  toast(
    'Configurações salvas.'
  );

  renderSettings();
}


async function rotateInvite() {

  const newToken =
    crypto.randomUUID()
      .replace(/-/g, '');

  const r =
    await SB
      .from('app_state')
      .update({
        invite_token:
          newToken,

        updated_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        'true'
      );

  if (r.error) {

    toast(
      r.error.message
    );

    console.error(
      'Erro ao gerar link:',
      r.error
    );

    return;
  }

  window.__INVITE_TOKEN =
    newToken;

  if ($('registerLink')) {

    $('registerLink').value =
      registerUrl();
  }

  toast(
    'Novo link de cadastro criado.'
  );
}
async function copyRegister() {
  const value =
    $('registerLink')
      ?.value;

  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(
    value
  );

  toast(
    'Link copiado.'
  );
}


function sendRegisterWhatsApp() {
  const link =
    $('registerLink')
      ?.value;

  const text =
    `🏐 99% INTRIGAS · 1% VÔLEI\n\n` +
    `Faça seu cadastro para participar dos jogos e sorteios dos times:\n\n` +
    `${link}`;

  window.open(
    'https://wa.me/?text=' +
      encodeURIComponent(
        text
      ),
    '_blank'
  );
}


async function addAdmin(e) {
  e.preventDefault();

  const email =
    $('adminInviteEmail')
      ?.value
      .trim()
      .toLowerCase();

  if (!email) {
    toast(
      'Informe o e-mail.'
    );

    return;
  }

  const r =
    await SB
      .from(
        'admin_invites'
      )
      .upsert(
        {
          email
        },
        {
          onConflict:
            'email'
        }
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  $('adminInviteEmail').value =
    '';

  toast(
    'E-mail autorizado como administrador.'
  );

  await renderSettings();
}


async function removeAdmin(
  id
) {
  if (
    id ===
    session?.user?.id
  ) {
    toast(
      'Você não pode remover seu próprio acesso por aqui.'
    );

    return;
  }

  if (
    !confirm(
      'Remover este administrador?'
    )
  ) {
    return;
  }

  const r =
    await SB
      .from(
        'admin_users'
      )
      .delete()
      .eq(
        'user_id',
        id
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  toast(
    'Administrador removido.'
  );

  await renderSettings();
}


async function saveMyPlayer(e) {
  e.preventDefault();

  const name =
    $('adminPlayerName')
      ?.value
      .trim();

  const skill =
    normalizeSkill(
      $('adminPlayerSkill')
        ?.value
    );

  if (!name) {
    toast(
      'Informe seu nome.'
    );

    return;
  }

  const savedId =
    localStorage.getItem(
      adminPlayerStorageKey()
    );

  let player =
    savedId
      ? players.find(
          p =>
            p.id ===
            savedId
        )
      : null;

  if (player) {
    const r =
      await SB
        .from('players')
        .update({
          name,

          skill,

          skill_score:
            SKILLS[
              skill
            ],

          active:
            true
        })
        .eq(
          'id',
          player.id
        );

    if (r.error) {
      toast(
        r.error.message
      );

      return;
    }

    localStorage.setItem(
      adminPlayerStorageKey(),
      player.id
    );
  } else {
    const r =
      await SB
        .from('players')
        .insert({
          name,

          skill,

          skill_score:
            SKILLS[
              skill
            ],

          active:
            true
        })
        .select()
        .single();

    if (r.error) {
      toast(
        r.error.message
      );

      return;
    }

    localStorage.setItem(
      adminPlayerStorageKey(),
      r.data.id
    );
  }

  toast(
    'Seu cadastro de jogador foi salvo.'
  );

  await loadAdmin();

  renderSettings();
}


/* =========================================================
   PLAYER
========================================================= */

async function loadPlayer() {
  if (!playerToken) {
    setMode(
      'landing'
    );

    return false;
  }

  const result =
    await SB
      .from('players')
      .select('*')
      .eq(
        'token',
        playerToken
      )
      .eq(
        'active',
        true
      )
      .maybeSingle();

  if (
    result.error ||
    !result.data
  ) {
    playerData =
      null;

    setMode(
      'landing'
    );

    toast(
      'Link de jogador inválido ou jogador inativo.'
    );

    return false;
  }

  const player =
    result.data;

  const today =
    todayKey();

  const gameResult =
    await SB
      .from('games')
      .select('*')
      .gte(
        'game_date',
        today
      )
      .order(
        'game_date',
        {
          ascending:
            true
        }
      )
      .limit(1)
      .maybeSingle();

  const game =
    gameResult.data ||
    null;

  let teams = [];

  if (game) {
    const teamRows =
      (
        await SB
          .from('teams')
          .select(
            'id,name,total_skill'
          )
          .eq(
            'game_id',
            game.id
          )
          .order(
            'created_at'
          )
      ).data || [];

    if (teamRows.length) {
      const members =
        (
          await SB
            .from(
              'team_members'
            )
            .select(
              'team_id,player_id'
            )
            .in(
              'team_id',
              teamRows.map(
                t =>
                  t.id
              )
            )
        ).data || [];

      teams =
        teamRows.map(
          team => ({
            ...team,

            members:
              members
                .filter(
                  m =>
                    m.team_id ===
                    team.id
                )
                .map(
                  m =>
                    players.find(
                      p =>
                        p.id ===
                        m.player_id
                    )
                )
                .filter(Boolean)
          })
        );
    }
  }

  const varResult =
    await SB
      .from(
        'var_links'
      )
      .select('*')
      .order(
        'created_at',
        {
          ascending:
            false
        }
      );

  const settingResult =
    await SB
      .from(
        'group_settings'
      )
      .select('*')
      .eq(
        'id',
        true
      )
      .single();

  playerData = {
    player,
    game,
    teams,
    var:
      varResult.data ||
      [],
    settings:
      settingResult.data ||
      {}
  };

  setMode(
    'player'
  );

  renderPlayer();

  return true;
}


function renderPlayer() {
  const d =
    playerData;

  if (!d) {
    return;
  }

  const p =
    d.player;

  if ($('playerWelcome')) {
    $('playerWelcome').textContent =
      `Olá, ${p.name}!`;
  }

  if ($('playerSkill')) {
    $('playerSkill').textContent =
      `Nível: ${
        SKILL_LABEL[
          p.skill
        ] || p.skill
      }`;
  }

  if ($('playerGame')) {
    $('playerGame').innerHTML =
      d.game
        ? `
          <b>
            Próximo jogo:
            ${dateBR(
              d.game.game_date
            )}
          </b>

          <br>

          <span class="muted">
            ${d.game.teams_count}
            times
            ${
              d.game.notes
                ? ' · ' +
                  esc(
                    d.game.notes
                  )
                : ''
            }
          </span>
        `
        : `
          Nenhum jogo cadastrado ainda.
        `;
  }

  const myTeam =
    (
      d.teams ||
      []
    ).find(
      team =>
        (
          team.members ||
          []
        ).some(
          member =>
            member.id ===
            p.id
        )
    );

  if ($('myTeam')) {
    $('myTeam').innerHTML =
      myTeam
        ? `
          <div class="team">

            <h3>
              Seu time:
              ${esc(
                myTeam.name
              )}
            </h3>

            ${
              myTeam.members
                .map(
                  member => `
                    <div class="person">

                      ${esc(
                        member.name
                      )}

                      <span>
                        ${
                          SKILL_LABEL[
                            member.skill
                          ]
                        }
                      </span>

                    </div>
                  `
                )
                .join('')
            }

          </div>
        `
        : `
          <div class="notice">
            Seu time ainda não foi sorteado.
          </div>
        `;
  }

  if ($('playerTeams')) {
    $('playerTeams').innerHTML =
      (
        d.teams ||
        []
      )
        .map(
          team => `
            <div class="team">

              <h3>
                ${esc(
                  team.name
                )}

                <small>
                  ${
                    team.total_skill
                  } pontos
                </small>
              </h3>

              ${
                team.members
                  .map(
                    member => `
                      <div class="person">

                        ${esc(
                          member.name
                        )}

                        <span>
                          ${
                            SKILL_LABEL[
                              member.skill
                            ]
                          }
                        </span>

                      </div>
                    `
                  )
                  .join('')
              }

            </div>
          `
        )
        .join('') ||
      `
        <div class="notice">
          Nenhum time sorteado.
        </div>
      `;
  }

  if ($('playerVar')) {
    $('playerVar').innerHTML =
      (
        d.var ||
        []
      )
        .map(
          v => `
            <div class="mediaRow">

              <div>
                <b>
                  ${esc(
                    v.title
                  )}
                </b>

                <small>
                  ${dateBR(
                    v.link_date
                  )}
                </small>
              </div>

              <a
                target="_blank"
                href="${esc(
                  v.url
                )}"
              >
                Assistir
              </a>

            </div>
          `
        )
        .join('') ||
      `
        <div class="notice">
          Nenhum vídeo compartilhado.
        </div>
      `;
  }

  if ($('playerSpotify')) {
    $('playerSpotify').innerHTML =
      d.settings?.spotify_url
        ? `
          <a
            class="primaryLink"
            target="_blank"
            href="${esc(
              d.settings.spotify_url
            )}"
          >
            🎵 Abrir playlist no Spotify
          </a>
        `
        : 'Playlist ainda não cadastrada.';
  }

  if ($('playerInstagram')) {
    $('playerInstagram').innerHTML =
      d.settings?.instagram_url
        ? `
          <a
            class="primaryLink"
            target="_blank"
            href="${esc(
              d.settings.instagram_url
            )}"
          >
            📸 Instagram do grupo
          </a>
        `
        : '';
  }
}


async function copyMyLink() {
  if (!playerToken) {
    return;
  }

  await navigator.clipboard.writeText(
    playerUrl(
      playerToken
    )
  );

  toast(
    'Seu link foi copiado.'
  );
}


function shareMyLink() {
  if (!playerToken) {
    return;
  }

  const text =
    `🏐 Meu acesso ao 99% INTRIGAS · 1% VÔLEI:\n\n` +
    playerUrl(
      playerToken
    );

  window.open(
    'https://wa.me/?text=' +
      encodeURIComponent(
        text
      ),
    '_blank'
  );
}


/* =========================================================
   CADASTRO DE JOGADOR
========================================================= */

async function registerPlayer(e) {
  e.preventDefault();

  const invite =
    $('registerToken')
      ?.value
      .trim() || '';

  const name =
    $('regName')
      ?.value
      .trim() || '';

  const skill =
    normalizeSkill(
      $('regSkill')
        ?.value
    );

  if (!invite) {
    toast(
      'Link de cadastro inválido.'
    );

    return;
  }

  if (!name) {
    toast(
      'Informe seu nome.'
    );

    return;
  }

  const state =
    await SB
      .from('app_state')
      .select('invite_token')
      .eq(
        'id',
        'true'
      )
      .maybeSingle();

  if (state.error) {
    console.error(
      'Erro ao validar convite:',
      state.error
    );

    toast(
      'Não foi possível validar o link de cadastro.'
    );

    return;
  }

  if (
    !state.data ||
    state.data.invite_token !==
      invite
  ) {
    toast(
      'Este link de cadastro não é mais válido.'
    );

    return;
  }

  const accessToken =
    crypto.randomUUID();

  const r =
    await SB
      .from('players')
      .insert({
        name,

        skill_level:
          skill,

        skill_score:
          SKILLS[
            skill
          ],

        active:
          true,

        access_token:
          accessToken
      })
      .select()
      .single();

  if (r.error) {
    console.error(
      'Erro ao cadastrar jogador:',
      r.error
    );

    toast(
      r.error.message
    );

    return;
  }

  playerToken =
    r.data.access_token;

  if ($('registerResult')) {
    $('registerResult')
      .classList.remove(
        'hidden'
      );
  }

  if ($('myAccessLink')) {
    $('myAccessLink').value =
      playerUrl(
        r.data.access_token
      );
  }

  toast(
    'Cadastro realizado com sucesso!'
  );
}
async function copyMyAccess() {
  const value =
    $('myAccessLink')
      ?.value;

  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(
    value
  );

  toast(
    'Link copiado.'
  );
}


function openMyAccess() {
  const value =
    $('myAccessLink')
      ?.value;

  if (value) {
    location.href =
      value;
  }
}


/* =========================================================
   AUTH
========================================================= */

SB.auth.onAuthStateChange(
  async (
    event,
    currentSession
  ) => {
    session =
      currentSession;

    if (
      event ===
      'SIGNED_OUT'
    ) {
      admin = false;
      session = null;

      if (
        activeMode !==
        'player'
      ) {
        setMode(
          'landing'
        );
      }
    }
  }
);


/* =========================================================
   COMPATIBILIDADE COM BOTÕES DO INDEX
========================================================= */

function openAdmin() {
  goAdminLogin();
}

function showAdminLogin() {
  goAdminLogin();
}

function backHome() {
  setMode(
    'landing'
  );
}

function logoutPlayer() {
  exitPlayer();
}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

window.addEventListener(
  'load',
  init
);
