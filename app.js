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
  return `${location.origin}${location.pathname}?jogador=${encodeURIComponent(token)}`;
}


function registerUrl() {
  const token =
    window.__INVITE_TOKEN ||
    '';

  return `${location.origin}${location.pathname}?cadastro=${encodeURIComponent(token)}`;
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
       3. REMOVER ENTRADAS DO CAIXA DOS PAGAMENTOS INDIVIDUAIS
    ===================================================== */

    for (
      const payment of units
    ) {
      await removeUnitCash(
        id,
        payment.player_id
      );
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

async function gamePlayerRows(gameId) {
  const gp = (
    await SB
      .from('game_players')
      .select('*')
      .eq('game_id', gameId)
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
              .filter(p => p.active)
              .map(p => {
                const x = gp.find(a => a.player_id === p.id);
                return `
                  <tr>
                    <td>${esc(p.name)}</td>
                    <td>${SKILL_LABEL[p.skill] || p.skill}</td>
                    <td>
                      <input
                        type="checkbox"
                        ${x?.present ? 'checked' : ''}
                        onchange="saveGamePlayer('${gameId}','${p.id}',this.checked)"
                      >
                    </td>
                  </tr>
                `;
              })
              .join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

async function saveGamePlayer(gameId, playerId, present) {
  const result = await SB
    .from('game_players')
    .upsert({
      game_id: gameId,
      player_id: playerId,
      present: !!present,
      payment_mode: 'mensal'
    }, {
      onConflict: 'game_id,player_id'
    });

  if (result.error) {
    toast(result.error.message);
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
        )on>
               ?.valtGame.i const payment of  .mEDi=====================e
                          )}
                        </b>

                        ${
               a 'o                           </b>

                        ${
      Fg       'gg                  )  ${
           ${Drror) {
      thp
}

/*      x.pls(
   ============Nrs'
     ).ts    n d.get  ).ts    n turn;
    }

    it_payments')
        .select('*')
        .eq(
          'game_id',
          id
        );

    if (unitsResult.error) {
          Esconde todas as       tp        players.filter(
          p => p.active
        ).length
     tive
        ).length
     tive
        ngth
==== */

    const playerDeleteResult d  }
}
 const ptorage.getItem(rage.getItem(rage.getItem(rage.getItem(rage.getItem(rage.getItem(rage.getItem(rage.getItem(rage.gu
        .sele/

funcI m       .eq(
          'id',
          id
        );

    if (
      gameDeleteResult.error
    ) {
      throw gamgam===         '                Anteger(
      teams
    ) ||
    teams < 1
  ) {
    toast(
      'Informe uma quantic =>
      }


    /* ===============d   }


    /* ==ge => {
                  s
          
      );
 c      )
    
       s
       mi=== id
    )i       
  )3 n d.ge   
       s
  Of     mi=== id
  =
        cud        ${x?.p       'Erro ao excluir jog    'individual',

      );

 p{
   
