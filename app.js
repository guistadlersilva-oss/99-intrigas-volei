const SB = supabase.createClient(
  VOLEI_CONFIG.supabaseUrl,
  VOLEI_CONFIG.supabaseAnonKey
);

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

const $ = id => document.getElementById(id);

const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );

const money = n =>
  Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

const dateBR = d =>
  d
    ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
    : '—';

const monthKey = () => {
  const d = new Date();

  return new Date(
    d.getFullYear(),
    d.getMonth(),
    1
  ).toISOString().slice(0, 10);
};

const toast = m => {
  const el = $('toast');

  if (!el) {
    console.log(m);
    return;
  }

  el.textContent = m;
  el.classList.remove('hidden');

  setTimeout(() => {
    el.classList.add('hidden');
  }, 2800);
};

const sum = arr =>
  arr.reduce(
    (total, player) =>
      total + (Number(player?.skill_score) || 0),
    0
  );


/* =========================================================
   NAVEGAÇÃO
========================================================= */

function setMode(mode) {
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


function playerUrl(token) {
  return `${location.origin}${location.pathname}?jogador=${token}`;
}


function registerUrl() {
  return `${location.origin}${location.pathname}?cadastro=${settings.invite_token}`;
}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function init() {
  const q = new URLSearchParams(location.search);

  if (q.get('cadastro')) {
    setMode('register');

    if ($('registerToken')) {
      $('registerToken').value =
        q.get('cadastro');
    }

    return;
  }

  if (q.get('jogador')) {
    playerToken = q.get('jogador');

    await loadPlayer();

    return;
  }

  const saved =
    localStorage.getItem(
      'volei_player_token'
    );

  if (saved) {
    playerToken = saved;

    const ok =
      await loadPlayer(true);

    if (ok) {
      return;
    }
  }

  const { data } =
    await SB.auth.getSession();

  if (data.session) {
    session = data.session;

    if (await checkAdmin()) {
      await enterAdmin();

      return;
    }
  }

  setMode('landing');

  if ($('year')) {
    $('year').textContent =
      new Date().getFullYear();
  }
}


async function checkAdmin() {
  const r =
    await SB.rpc('is_admin');

  return !r.error && r.data === true;
}


/* =========================================================
   LOGIN ADMIN
========================================================= */

async function adminLogin(e) {
  e.preventDefault();

  const email =
    $('adminEmail').value.trim();

  const password =
    $('adminPassword').value;

  const r =
    await SB.auth.signInWithPassword({
      email,
      password
    });

  if (r.error) {
    toast(r.error.message);

    return;
  }

  session = r.data.session;

  if (!await checkAdmin()) {
    await SB.auth.signOut();

    toast(
      'Este usuário não é administrador. Um administrador precisa autorizar o e-mail.'
    );

    return;
  }

  await enterAdmin();
}


async function adminSignup(e) {
  e.preventDefault();

  const email =
    $('newAdminEmail').value.trim();

  const password =
    $('newAdminPassword').value;

  if (password.length < 6) {
    toast(
      'A senha precisa ter pelo menos 6 caracteres.'
    );

    return;
  }

  const r =
    await SB.auth.signUp({
      email,
      password
    });

  if (r.error) {
    toast(r.error.message);

    return;
  }

  toast(
    'Conta criada. Se o e-mail já foi autorizado por um administrador, você poderá entrar como administrador.'
  );

  $('newAdminEmail').value = '';
  $('newAdminPassword').value = '';
}


async function enterAdmin() {
  admin = true;

  setMode('admin');

  await loadAdmin();

  buildAdminNav();

  showAdminPage('dashboard');
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
    toast(s.error.message);

    return;
  }

  settings = s.data;

  players = p.data || [];

  const games = g.data || [];

  allGames = games;

  currentGame =
    games.find(
      x =>
        x.game_date >=
        new Date()
          .toISOString()
          .slice(0, 10)
    ) ||
    games[0] ||
    null;

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
  $('adminNav').innerHTML = [
    ['dashboard', '🏠 Visão geral'],
    ['players', '🏐 Jogadores'],
    ['games', '📅 Jogo e times'],
    ['payments', '💰 Pagamentos'],
    ['cash', '🏦 Caixa'],
    ['media', '🎥 VAR / 🎵 Playlist'],
    ['settings', '⚙️ Administração']
  ]
    .map(
      ([id, title], i) =>
        `<button class="${i === 0 ? 'active' : ''}" onclick="showAdminPage('${id}',this)">${title}</button>`
    )
    .join('');
}


function showAdminPage(id, btn) {
  document
    .querySelectorAll('#adminNav button')
    .forEach(x =>
      x.classList.remove('active')
    );

  if (btn) {
    btn.classList.add('active');
  }

  document
    .querySelectorAll('#adminPages .page')
    .forEach(x =>
      x.classList.remove('active')
    );

  const page = $(`a_${id}`);

  if (page) {
    page.classList.add('active');
  }

  if (id === 'dashboard') {
    renderDashboard();
  }

  if (id === 'players') {
    renderPlayers();
  }

  if (id === 'games') {
    renderGames();
  }

  if (id === 'payments') {
    renderPayments();
  }

  if (id === 'cash') {
    renderCash();
  }

  if (id === 'media') {
    renderMedia();
  }

  if (id === 'settings') {
    renderSettings();
  }
}


/* =========================================================
   DASHBOARD
========================================================= */

async function renderDashboard() {
  const all =
    await SB
      .from('cash_entries')
      .select(
        'entry_type,amount'
      );

  const bal =
    (all.data || []).reduce(
      (a, x) =>
        a +
        (
          x.entry_type === 'in'
            ? +x.amount
            : -+x.amount
        ),
      0
    );

  $('dashCards').innerHTML = `
    <div class="statCard">
      <span>Jogadores</span>
      <b>
        ${players.filter(p => p.active).length}
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
      <b>${money(bal)}</b>
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
        ${dateBR(currentGame.game_date)}
        · ${currentGame.teams_count} times

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
          Crie o próximo jogo na aba
          “Jogo e times”.
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
          <b>${esc(p.name)}</b>

          ${
            p.user_id
              ? '<span class="badge admin">admin/jogador</span>'
              : ''
          }
        </td>

        <td>
          ${
            SKILL_LABEL[
              p.skill_level
            ] ||
            p.skill_level
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
        </td>
      </tr>
    `
      )
      .join('');

  $('playersTable').innerHTML =
    rows ||
    '<tr><td colspan="5">Nenhum jogador cadastrado.</td></tr>';

  $('playerCount').textContent =
    `${
      players.filter(
        p => p.active
      ).length
    } ativos`;
}


async function editPlayer(id) {
  const p =
    players.find(
      x => x.id === id
    );

  if (!p) {
    return;
  }

  const name =
    prompt(
      'Nome:',
      p.name
    );

  if (name === null) {
    return;
  }

  const skill =
    prompt(
      'Habilidade (iniciante, basico, intermediario, avancado ou expert):',
      p.skill_level
    );

  if (skill === null) {
    return;
  }

  const key =
    skill
      .trim()
      .toLowerCase();

  if (!SKILLS[key]) {
    toast(
      'Habilidade inválida.'
    );

    return;
  }

  const r =
    await SB
      .from('players')
      .update({
        name: name.trim(),
        skill_level: key,
        skill_score:
          SKILLS[key]
      })
      .eq('id', id);

  if (r.error) {
    toast(r.error.message);
  } else {
    toast(
      'Jogador atualizado.'
    );

    await loadAdmin();

    renderPlayers();
  }
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
      .eq('id', id);

  if (r.error) {
    toast(r.error.message);
  } else {
    await loadAdmin();

    renderPlayers();
  }
}


/* =========================================================
   JOGOS
========================================================= */

async function renderGames() {
  $('gameFormDate').value =
    currentGame?.game_date ||
    (() => {
      let d = new Date();

      d.setDate(
        d.getDate() +
        (
          (5 -
            d.getDay() +
            7) %
          7
        )
      );

      return d
        .toISOString()
        .slice(0, 10);
    })();

  $('gameTeams').value =
    currentGame?.teams_count ||
    2;

  $('gameNotes').value =
    currentGame?.notes ||
    '';

  $('currentGameTitle').textContent =
    currentGame
      ? `Jogo de ${dateBR(
          currentGame.game_date
        )}`
      : 'Nenhum jogo';

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

  if (currentGame) {
    await renderTeamsAdmin();
  }
}


async function saveGame(e) {
  e.preventDefault();

  const payload = {
    game_date:
      $('gameFormDate').value,

    teams_count:
      +$('gameTeams').value,

    notes:
      $('gameNotes').value,

    created_by:
      session.user.id
  };

  let r;

  if (currentGame) {
    r =
      await SB
        .from('games')
        .update(payload)
        .eq(
          'id',
          currentGame.id
        )
        .select()
        .single();
  } else {
    r =
      await SB
        .from('games')
        .insert(payload)
        .select()
        .single();
  }

  if (r.error) {
    toast(r.error.message);

    return;
  }

  currentGame = r.data;

  await loadAdmin();

  toast(
    'Jogo salvo.'
  );

  renderGames();
}


async function gamePlayerRows(
  gameId
) {
  const gp =
    (
      await SB
        .from('game_players')
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
            <th>Pagamento</th>
          </tr>
        </thead>

        <tbody>

          ${
            players
              .filter(
                p => p.active
              )
              .map(p => {
                const x =
                  gp.find(
                    a =>
                      a.player_id ===
                      p.id
                  );

                return `
                  <tr>

                    <td>
                      ${esc(p.name)}
                    </td>

                    <td>
                      ${
                        SKILL_LABEL[
                          p.skill_level
                        ]
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
                          this.checked,
                          '${x?.payment_mode || 'mensal'}'
                        )"
                      >
                    </td>

                    <td>
                      <select
                        onchange="saveGamePlayer(
                          '${gameId}',
                          '${p.id}',
                          ${!!x?.present},
                          this.value
                        )"
                      >

                        <option
                          value="mensal"
                          ${
                            (
                              x?.payment_mode ||
                              'mensal'
                            ) ===
                            'mensal'
                              ? 'selected'
                              : ''
                          }
                        >
                          Mensal
                        </option>

                        <option
                          value="individual"
                          ${
                            x?.payment_mode ===
                            'individual'
                              ? 'selected'
                              : ''
                          }
                        >
                          Individual
                        </option>

                      </select>
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


async function saveGamePlayer(
  gameId,
  playerId,
  present,
  mode
) {
  const r =
    await SB
      .from('game_players')
      .upsert(
        {
          game_id:
            gameId,

          player_id:
            playerId,

          present,

          payment_mode:
            mode
        },
        {
          onConflict:
            'game_id,player_id'
        }
      );

  if (r.error) {
    toast(r.error.message);

    return;
  }

  if (
    mode === 'individual' &&
    present
  ) {
    await SB
      .from('unit_payments')
      .upsert(
        {
          game_id:
            gameId,

          player_id:
            playerId,

          amount:
            settings.unit_fee
        },
        {
          onConflict:
            'game_id,player_id'
        }
      );
  } else {
    await SB
      .from('unit_payments')
      .delete()
      .eq(
        'game_id',
        gameId
      )
      .eq(
        'player_id',
        playerId
      );
  }

  await renderGames();
}


/* =========================================================
   SORTEIO DOS TIMES
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
        .from('game_players')
        .select('player_id')
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

    const deleteMembers =
      await SB
        .from(
          'team_members'
        )
        .delete()
        .in(
          'team_id',
          oldIds
        );

    if (
      deleteMembers.error
    ) {
      toast(
        deleteMembers.error.message
      );

      return;
    }

    const deleteTeams =
      await SB
        .from('teams')
        .delete()
        .eq(
          'game_id',
          currentGame.id
        );

    if (
      deleteTeams.error
    ) {
      toast(
        deleteTeams.error.message
      );

      return;
    }
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

    const result =
      await SB
        .from('teams')
        .insert({
          game_id:
            currentGame.id,

          team_no:
            i + 1,

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
   TIMES ADMIN
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
          'id,team_no,total_skill'
        )
        .eq(
          'game_id',
          currentGame.id
        )
        .order(
          'team_no'
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
        .from('team_members')
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
                  x =>
                    x.id ===
                    m.player_id
                )
            )
            .filter(Boolean);

        return `
          <div class="team">

            <h3>
              Time ${t.team_no}

              <small>
                ${teamMembers.length}
                jogador${
                  teamMembers.length === 1
                    ? ''
                    : 'es'
                }

                ·
                ${sum(
                  teamMembers
                )}
                pontos
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
                                  p.skill_level
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
          'id,team_no'
        )
        .eq(
          'game_id',
          currentGame.id
        )
        .order(
          'team_no'
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
      'Não existem outros times para mover este jogador.'
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
        t =>
          `${t.team_no} - Time ${t.team_no}`
      )
      .join('\n');

  const answer =
    prompt(
      `Mover ${player.name} para qual time?\n\n${options}\n\nDigite o número do time:`
    );

  if (answer === null) {
    return;
  }

  const teamNo =
    Number(answer);

  if (
    !Number.isInteger(
      teamNo
    )
  ) {
    toast(
      'Informe um número de time válido.'
    );

    return;
  }

  const target =
    available.find(
      t =>
        t.team_no ===
        teamNo
    );

  if (!target) {
    toast(
      'Time inválido.'
    );

    return;
  }

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
    `${player.name} foi movido para o Time ${teamNo}.`
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
    return;
  }

  const ts =
    (
      await SB
        .from('teams')
        .select(
          'id,team_no'
        )
        .eq(
          'game_id',
          currentGame.id
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
          `TIME ${t.team_no}: ` +
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
      .join('\n');

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

function ensurePaymentControls() {
  const monthlyTable =
    $('monthlyTable');

  const unitTable =
    $('unitTable');

  if (
    !monthlyTable ||
    !unitTable
  ) {
    return;
  }

  const monthlyParent =
    monthlyTable.closest(
      '.tableWrap'
    ) ||
    monthlyTable.parentElement;

  const unitParent =
    unitTable.closest(
      '.tableWrap'
    ) ||
    unitTable.parentElement;

  if (
    monthlyParent &&
    !$('paymentAdvancedControls')
  ) {
    const box =
      document.createElement(
        'div'
      );

    box.id =
      'paymentAdvancedControls';

    box.style.marginBottom =
      '16px';

    box.innerHTML = `
      <div
        style="
          display:grid;
          gap:12px;
          grid-template-columns:
            repeat(auto-fit,minmax(220px,1fr));
        "
      >

        <label>
          <span>
            Valor mensal
          </span>

          <input
            id="monthlyValueEdit"
            type="number"
            step="0.01"
            min="0"
            placeholder="Valor mensal"
          >

        </label>

        <button
          type="button"
          onclick="saveDefaultMonthlyValue()"
        >
          💾 Salvar valor mensal
        </button>

      </div>
    `;

    monthlyParent.parentElement.insertBefore(
      box,
      monthlyParent
    );
  }

  if (
    unitParent &&
    !$('unitAdvancedControls')
  ) {
    const box =
      document.createElement(
        'div'
      );

    box.id =
      'unitAdvancedControls';

    box.style.marginBottom =
      '16px';

    box.innerHTML = `
      <div
        style="
          display:grid;
          gap:12px;
          grid-template-columns:
            repeat(auto-fit,minmax(200px,1fr));
          align-items:end;
        "
      >

        <label>
          <span>
            Jogo
          </span>

          <select
            id="payGameSelect"
            onchange="changePaymentGame(this.value)"
          ></select>
        </label>

        <label>
          <span>
            Jogador
          </span>

          <select
            id="unitPlayerSelect"
          ></select>
        </label>

        <label>
          <span>
            Valor
          </span>

          <input
            id="unitAmount"
            type="number"
            step="0.01"
            min="0"
            placeholder="Valor"
          >
        </label>

        <button
          type="button"
          onclick="addUnitCharge()"
        >
          ➕ Adicionar cobrança
        </button>

        <button
          type="button"
          onclick="applyGameValue()"
        >
          💰 Aplicar valor aos pendentes
        </button>

      </div>
    `;

    unitParent.parentElement.insertBefore(
      box,
      unitParent
    );
  }
}


function renderPaymentGameSelector() {
  const select =
    $('payGameSelect');

  if (!select) {
    return;
  }

  select.innerHTML =
    allGames.length
      ? allGames
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
                ${
                  g.notes
                    ? ' · ' +
                      esc(
                        g.notes
                      )
                    : ''
                }
              </option>
            `
          )
          .join('')
      : `
          <option value="">
            Nenhum jogo cadastrado
          </option>
        `;
}


function renderUnitPlayerSelector(
  selectedGameId
) {
  const select =
    $('unitPlayerSelect');

  if (!select) {
    return;
  }

  const activePlayers =
    players.filter(
      p => p.active
    );

  select.innerHTML =
    activePlayers.length
      ? activePlayers
          .map(
            p => `
              <option value="${p.id}">
                ${esc(p.name)}
              </option>
            `
          )
          .join('')
      : `
          <option value="">
            Nenhum jogador
          </option>
        `;
}


async function changePaymentGame(
  gameId
) {
  if (!gameId) {
    return;
  }

  const game =
    allGames.find(
      g =>
        g.id ===
        gameId
    );

  if (!game) {
    return;
  }

  currentGame = game;

  await renderPayments();
}


async function renderPayments() {
  ensurePaymentControls();

  const comp =
    monthKey();

  if ($('paymentMonth')) {
    $('paymentMonth').textContent =
      new Date(
        comp +
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
    $('monthlyValueEdit')
  ) {
    $('monthlyValueEdit').value =
      Number(
        settings?.monthly_fee ||
        0
      ).toFixed(2);
  }

  renderPaymentGameSelector();

  if (
    currentGame
  ) {
    renderUnitPlayerSelector(
      currentGame.id
    );
  }

  const mp =
    (
      await SB
        .from(
          'monthly_payments'
        )
        .select('*')
        .eq(
          'competence',
          comp
        )
    ).data || [];

  const activePlayers =
    players.filter(
      p => p.active
    );

  $('monthlyTable').innerHTML =
    activePlayers
      .map(p => {
        const x =
          mp.find(
            a =>
              a.player_id ===
              p.id
          );

        const amount =
          Number(
            x?.amount ??
            settings.monthly_fee ??
            0
          );

        return `
          <tr>

            <td>
              ${esc(p.name)}
            </td>

            <td>
              <input
                type="number"
                step="0.01"
                min="0"
                value="${amount.toFixed(2)}"
                style="max-width:120px"
                onchange="editMonthlyAmount(
                  '${p.id}',
                  this.value
                )"
              >
            </td>

            <td>
              <span class="badge ${
                x?.paid
                  ? 'paid'
                  : 'pending'
              }">
                ${
                  x?.paid
                    ? 'Pago'
                    : 'Pendente'
                }
              </span>
            </td>

            <td>

              <button
                onclick="toggleMonthly(
                  '${p.id}',
                  ${!!x?.paid}
                )"
              >
                ${
                  x?.paid
                    ? 'Desmarcar'
                    : 'Marcar pago'
                }
              </button>

            </td>

          </tr>
        `;
      })
      .join('') ||
    `
      <tr>
        <td colspan="4">
          Nenhum jogador ativo.
        </td>
      </tr>
    `;

  if (!currentGame) {
    $('unitTable').innerHTML =
      `
        <tr>
          <td colspan="5">
            Nenhum jogo selecionado.
          </td>
        </tr>
      `;

    return;
  }

  const up =
    (
      await SB
        .from(
          'unit_payments'
        )
        .select('*')
        .eq(
          'game_id',
          currentGame.id
        )
    ).data || [];

  $('unitTable').innerHTML =
    up
      .map(
        x => {
          const player =
            players.find(
              p =>
                p.id ===
                x.player_id
            );

          return `
            <tr>

              <td>
                ${esc(
                  player?.name ||
                  'Jogador removido'
                )}
              </td>

              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value="${Number(
                    x.amount || 0
                  ).toFixed(2)}"
                  style="max-width:120px"
                  onchange="editUnitAmount(
                    '${x.player_id}',
                    this.value
                  )"
                >
              </td>

              <td>
                <span class="badge ${
                  x.paid
                    ? 'paid'
                    : 'pending'
                }">
                  ${
                    x.paid
                      ? 'Pago'
                      : 'Pendente'
                  }
                </span>
              </td>

              <td>

                <button
                  onclick="toggleUnit(
                    '${x.player_id}',
                    ${!!x.paid}
                  )"
                >
                  ${
                    x.paid
                      ? 'Desmarcar'
                      : 'Marcar pago'
                  }
                </button>

              </td>

              <td>

                <button
                  onclick="removeUnit(
                    '${x.player_id}'
                  )"
                >
                  🗑️ Remover
                </button>

              </td>

            </tr>
          `;
        }
      )
      .join('') ||
    `
      <tr>
        <td colspan="5">
          Nenhum pagamento individual neste jogo.
        </td>
      </tr>
    `;
}


async function saveDefaultMonthlyValue() {
  const value =
    Number(
      $('monthlyValueEdit')?.value
    );

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    toast(
      'Informe um valor mensal válido.'
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
    'Valor mensal padrão atualizado.'
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

    await renderPayments();

    return;
  }

  const comp =
    monthKey();

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
            comp,

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
    'Valor da mensalidade atualizado.'
  );
}


async function editUnitAmount(
  playerId,
  value
) {
  if (!currentGame) {
    return;
  }

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

    await renderPayments();

    return;
  }

  const r =
    await SB
      .from(
        'unit_payments'
      )
      .update({
        amount
      })
      .eq(
        'game_id',
        currentGame.id
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

  toast(
    'Valor individual atualizado.'
  );
}


async function addUnitCharge() {
  const gameId =
    $('payGameSelect')?.value;

  const playerId =
    $('unitPlayerSelect')?.value;

  const amount =
    Number(
      $('unitAmount')?.value
    );

  if (!gameId) {
    toast(
      'Selecione um jogo.'
    );

    return;
  }

  if (!playerId) {
    toast(
      'Selecione um jogador.'
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

  const r =
    await SB
      .from(
        'unit_payments'
      )
      .upsert(
        {
          game_id:
            gameId,

          player_id:
            playerId,

          amount
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

  const gp =
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
            true,

          payment_mode:
            'individual'
        },
        {
          onConflict:
            'game_id,player_id'
        }
      );

  if (gp.error) {
    toast(
      gp.error.message
    );

    return;
  }

  currentGame =
    allGames.find(
      g =>
        g.id ===
        gameId
    ) ||
    currentGame;

  if (
    $('unitAmount')
  ) {
    $('unitAmount').value =
      '';
  }

  toast(
    'Cobrança individual adicionada.'
  );

  await renderPayments();
}


async function applyGameValue() {
  if (!currentGame) {
    toast(
      'Selecione um jogo.'
    );

    return;
  }

  const amount =
    Number(
      $('unitAmount')?.value ||
      settings?.unit_fee ||
      0
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    toast(
      'Informe o valor que será aplicado.'
    );

    return;
  }

  const up =
    (
      await SB
        .from(
          'unit_payments'
        )
        .select(
          'player_id,paid'
        )
        .eq(
          'game_id',
          currentGame.id
        )
    ).data || [];

  const pending =
    up.filter(
      x => !x.paid
    );

  if (!pending.length) {
    toast(
      'Não há cobranças individuais pendentes neste jogo.'
    );

    return;
  }

  const r =
    await SB
      .from(
        'unit_payments'
      )
      .update({
        amount
      })
      .eq(
        'game_id',
        currentGame.id
      )
      .eq(
        'paid',
        false
      );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  toast(
    `Valor de ${money(amount)} aplicado às cobranças pendentes.`
  );

  await renderPayments();
}


async function removeUnit(
  playerId
) {
  if (!currentGame) {
    return;
  }

  if (
    !confirm(
      'Remover esta cobrança individual?'
    )
  ) {
    return;
  }

  const r =
    await SB
      .from(
        'unit_payments'
      )
      .delete()
      .eq(
        'game_id',
        currentGame.id
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

  toast(
    'Cobrança removida.'
  );

  await renderPayments();
}


async function toggleMonthly(
  pid,
  paid
) {
  const r =
    await SB.rpc(
      'set_monthly_paid',
      {
        p_player:
          pid,

        p_competence:
          monthKey(),

        p_paid:
          !paid
      }
    );

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    toast(
      'Mensalidade atualizada.'
    );

    await renderPayments();
  }
}


async function toggleUnit(
  pid,
  paid
) {
  if (!currentGame) {
    return;
  }

  const r =
    await SB.rpc(
      'set_unit_paid',
      {
        p_game:
          currentGame.id,

        p_player:
          pid,

        p_paid:
          !paid
      }
    );

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    toast(
      'Pagamento individual atualizado.'
    );

    await renderPayments();
  }
}


/* =========================================================
   CAIXA
========================================================= */

function ensureCashControls() {
  const table =
    $('cashTable');

  if (
    !table ||
    $('cashAdvancedControls')
  ) {
    return;
  }

  const parent =
    table.closest(
      '.tableWrap'
    ) ||
    table.parentElement;

  if (!parent) {
    return;
  }

  const box =
    document.createElement(
      'div'
    );

  box.id =
    'cashAdvancedControls';

  box.style.marginBottom =
    '16px';

  box.innerHTML = `
    <div
      style="
        display:grid;
        gap:12px;
        grid-template-columns:
          repeat(auto-fit,minmax(180px,1fr));
        align-items:end;
      "
    >

      <label>
        <span>Descrição</span>

        <input
          id="cashIncomeDescription"
          type="text"
          placeholder="Ex.: Pagamento individual"
        >
      </label>

      <label>
        <span>Categoria</span>

        <input
          id="cashIncomeCategory"
          type="text"
          value="Mensalidade"
          placeholder="Categoria"
        >
      </label>

      <label>
        <span>Valor</span>

        <input
          id="cashIncomeAmount"
          type="number"
          min="0"
          step="0.01"
          placeholder="0,00"
        >
      </label>

      <button
        type="button"
        onclick="addCashIncome()"
      >
        ➕ Registrar entrada
      </button>

    </div>
  `;

  parent.parentElement.insertBefore(
    box,
    parent
  );
}


async function renderCash() {
  ensureCashControls();

  const ce =
    (
      await SB
        .from(
          'cash_entries'
        )
        .select('*')
        .order(
          'created_at',
          {
            ascending:
              false
          }
        )
    ).data || [];

  const ins =
    ce
      .filter(
        x =>
          x.entry_type ===
          'in'
      )
      .reduce(
        (a, x) =>
          a +
          +x.amount,
        0
      );

  const outs =
    ce
      .filter(
        x =>
          x.entry_type ===
          'out'
      )
      .reduce(
        (a, x) =>
          a +
          +x.amount,
        0
      );

  $('cashStats').innerHTML = `
    <div class="statCard">
      <span>Entradas</span>
      <b>
        ${money(ins)}
      </b>
    </div>

    <div class="statCard">
      <span>Saídas</span>
      <b>
        ${money(outs)}
      </b>
    </div>

    <div class="statCard">
      <span>Saldo</span>
      <b>
        ${money(ins - outs)}
      </b>
    </div>
  `;

  $('cashTable').innerHTML =
    ce
      .map(
        x => `
          <tr>

            <td>
              ${new Date(
                x.created_at
              ).toLocaleDateString(
                'pt-BR'
              )}
            </td>

            <td>
              ${
                x.entry_type ===
                'in'
                  ? 'Entrada'
                  : 'Saída'
              }
            </td>

            <td>
              ${esc(
                x.category
              )}
            </td>

            <td>
              ${esc(
                x.description
              )}
            </td>

            <td>
              ${money(
                x.amount
              )}
            </td>

            <td>
              <button
                onclick="deleteCashEntry('${x.id}')"
              >
                🗑️ Excluir
              </button>
            </td>

          </tr>
        `
      )
      .join('') ||
    `
      <tr>
        <td colspan="6">
          Sem movimentações.
        </td>
      </tr>
    `;
}


async function addCashIncome() {
  const amount =
    Number(
      $('cashIncomeAmount')
        ?.value
    );

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

  const description =
    $('cashIncomeDescription')
      ?.value
      .trim() ||
    'Entrada';

  const category =
    $('cashIncomeCategory')
      ?.value
      .trim() ||
    'Outros';

  const r =
    await SB
      .from(
        'cash_entries'
      )
      .insert({
        entry_type:
          'in',

        category,

        description,

        amount,

        created_by:
          session.user.id
      });

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  if (
    $('cashIncomeAmount')
  ) {
    $('cashIncomeAmount').value =
      '';
  }

  if (
    $('cashIncomeDescription')
  ) {
    $('cashIncomeDescription').value =
      '';
  }

  toast(
    'Entrada registrada.'
  );

  await renderCash();
}


async function addExpense(e) {
  e.preventDefault();

  const amount =
    +$('expenseAmount').value;

  if (!amount) {
    return;
  }

  const r =
    await SB
      .from(
        'cash_entries'
      )
      .insert({
        entry_type:
          'out',

        category:
          $('expenseCategory')
            .value,

        description:
          $('expenseDescription')
            .value,

        amount,

        created_by:
          session.user.id
      });

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  $('expenseForm').reset();

  toast(
    'Saída registrada.'
  );

  renderCash();
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
  const v =
    (
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
        )
    ).data || [];

  $('varAdminList').innerHTML =
    v
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
                  x.game_date
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
        Nenhum vídeo.
      </div>
    `;

  $('spotifyInput').value =
    settings?.spotify_url ||
    '';
}


async function addVar(e) {
  e.preventDefault();

  const r =
    await SB
      .from(
        'var_links'
      )
      .insert({
        title:
          $('varTitle')
            .value,

        url:
          $('varUrl')
            .value,

        game_date:
          $('varDate')
            .value ||
          null,

        created_by:
          session.user.id
      });

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    toast(
      'Vídeo adicionado.'
    );

    $('varForm').reset();

    renderMedia();
  }
}


async function deleteVar(
  id
) {
  if (
    !confirm(
      'Excluir este vídeo do VAR?'
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
      .value
      .trim();

  const r =
    await SB
      .from(
        'group_settings'
      )
      .update({
        spotify_url:
          url,

        updated_at:
          new Date()
            .toISOString()
      })
      .eq(
        'id',
        true
      );

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    settings.spotify_url =
      url;

    toast(
      'Playlist salva.'
    );
  }
}


/* =========================================================
   ADMINISTRAÇÃO
========================================================= */

async function renderSettings() {
  const mine =
    (
      await SB
        .from('players')
        .select('*')
        .eq(
          'user_id',
          session.user.id
        )
        .maybeSingle()
    ).data;

  $('adminPlayerName').value =
    mine?.name ||
    '';

  $('adminPlayerSkill').value =
    mine?.skill_level ||
    'intermediario';

  $('monthlyFee').value =
    settings.monthly_fee ||
    0;

  $('unitFee').value =
    settings.unit_fee ||
    0;

  $('instagramUrl').value =
    settings.instagram_url ||
    '';

  $('registerLink').value =
    registerUrl();

  const admins =
    (
      await SB
        .from(
          'admin_users'
        )
        .select(
          'user_id,email,created_at'
        )
        .order(
          'created_at'
        )
    ).data || [];

  $('adminsList').innerHTML =
    admins
      .map(
        a => `
          <tr>

            <td>
              ${esc(
                a.email || ''
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


async function saveSettings(e) {
  e.preventDefault();

  const r =
    await SB
      .from(
        'group_settings'
      )
      .update({
        monthly_fee:
          +$(
            'monthlyFee'
          ).value || 0,

        unit_fee:
          +$(
            'unitFee'
          ).value || 0,

        instagram_url:
          $('instagramUrl')
            .value
            .trim(),

        updated_at:
          new Date()
            .toISOString()
      })
      .eq(
        'id',
        true
      );

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    await loadAdmin();

    toast(
      'Configurações salvas.'
    );

    renderSettings();
  }
}


async function rotateInvite() {
  const r =
    await SB
      .from(
        'group_settings'
      )
      .update({
        invite_token:
          crypto.randomUUID(),

        updated_at:
          new Date()
            .toISOString()
      })
      .eq(
        'id',
        true
      )
      .select()
      .single();

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    settings =
      r.data;

    $('registerLink').value =
      registerUrl();

    toast(
      'Novo link de cadastro gerado. O anterior deixa de funcionar.'
    );
  }
}


async function copyRegister() {
  await navigator.clipboard.writeText(
    $('registerLink')
      .value
  );

  toast(
    'Link copiado.'
  );
}


function sendRegisterWhatsApp() {
  const text =
    `🏐 99% INTRIGAS · 1% VÔLEI\n\n` +
    `Pessoal, faça seu cadastro para participar dos sorteios dos times:\n\n` +
    `${$('registerLink').value}\n\n` +
    `Informe apenas seu nome e seu nível de habilidade.`;

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

  const r =
    await SB.rpc(
      'set_admin_email',
      {
        p_email:
          $('adminInviteEmail')
            .value
            .trim()
      }
    );

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    $('adminInviteEmail')
      .value = '';

    toast(
      'E-mail autorizado como administrador. Se ainda não tiver conta, poderá criar uma na tela de login.'
    );

    renderSettings();
  }
}


async function removeAdmin(
  id
) {
  if (
    !confirm(
      'Remover este administrador?'
    )
  ) {
    return;
  }

  const r =
    await SB.rpc(
      'remove_admin',
      {
        p_user:
          id
      }
    );

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    toast(
      'Administrador removido.'
    );

    renderSettings();
  }
}


async function saveMyPlayer(e) {
  e.preventDefault();

  const name =
    $('adminPlayerName')
      .value
      .trim();

  const skill =
    $('adminPlayerSkill')
      .value;

  if (
    !name ||
    !SKILLS[skill]
  ) {
    toast(
      'Preencha nome e habilidade.'
    );

    return;
  }

  const existing =
    (
      await SB
        .from('players')
        .select('id')
        .eq(
          'user_id',
          session.user.id
        )
        .maybeSingle()
    ).data;

  const payload = {
    user_id:
      session.user.id,

    name,

    skill_level:
      skill,

    skill_score:
      SKILLS[skill],

    active:
      true
  };

  const r =
    existing
      ? await SB
          .from(
            'players'
          )
          .update(
            payload
          )
          .eq(
            'id',
            existing.id
          )
      : await SB
          .from(
            'players'
          )
          .insert(
            payload
          );

  if (r.error) {
    toast(
      r.error.message
    );
  } else {
    toast(
      'Seu cadastro de jogador foi salvo.'
    );

    await loadAdmin();

    renderSettings();
  }
}


/* =========================================================
   PLAYER
========================================================= */

async function loadPlayer(
  silent = false
) {
  const r =
    await SB.rpc(
      'get_player_view',
      {
        p_access_token:
          playerToken
      }
    );

  if (r.error) {
    if (!silent) {
      setMode(
        'landing'
      );

      toast(
        'Link de jogador inválido ou expirado.'
      );
    }

    return false;
  }

  playerData =
    r.data;

  localStorage.setItem(
    'volei_player_token',
    playerToken
  );

  setMode(
    'player'
  );

  renderPlayer();

  return true;
}


function renderPlayer() {
  const d =
    playerData;

  const p =
    d.player;

  $('playerWelcome')
    .textContent =
    `Olá, ${p.name}!`;

  $('playerSkill')
    .textContent =
    `Nível: ${
      SKILL_LABEL[
        p.skill_level
      ]
    }`;

  $('playerGame')
    .innerHTML =
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
          ${
            d.game.teams_count
          } times
          ·
          ${esc(
            d.game.notes ||
              ''
          )}
        </span>
      `
      : 'Nenhum jogo cadastrado ainda.';

  const myTeam =
    (
      d.teams ||
      []
    ).find(
      t =>
        (
          t.members ||
          []
        ).some(
          m =>
            m.id ===
            p.id
        )
    );

  $('myTeam')
    .innerHTML =
    myTeam
      ? `
        <div class="team">

          <h3>
            Seu time:
            ${myTeam.team_no}
          </h3>

          ${
            myTeam.members
              .map(
                m => `
                  <div class="person">
                    ${esc(
                      m.name
                    )}

                    <span>
                      ${
                        SKILL_LABEL[
                          m.skill_level
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

  $('playerTeams')
    .innerHTML =
    (
      d.teams ||
      []
    )
      .map(
        t => `
          <div class="team">

            <h3>
              Time ${t.team_no}

              <small>
                ${
                  t.total_skill
                } pontos
              </small>
            </h3>

            ${
              t.members
                .map(
                  m => `
                    <div class="person">

                      ${esc(
                        m.name
                      )}

                      <span>
                        ${
                          SKILL_LABEL[
                            m.skill_level
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

  $('playerVar')
    .innerHTML =
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
                  v.game_date
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

  $('playerSpotify')
    .innerHTML =
    d.settings.spotify_url
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

  $('playerInstagram')
    .innerHTML =
    d.settings.instagram_url
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


function copyMyLink() {
  navigator.clipboard.writeText(
    playerUrl(
      playerToken
    )
  );

  toast(
    'Seu link foi copiado.'
  );
}


function shareMyLink() {
  const text =
    `🏐 Meu acesso ao 99% INTRIGAS · 1% VÔLEI:\n` +
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
   CADASTRO
========================================================= */

async function registerPlayer(e) {
  e.preventDefault();

  const token =
    $('registerToken')
      .value;

  const name =
    $('regName')
      .value
      .trim();

  const skill =
    $('regSkill')
      .value;

  if (
    !name ||
    !skill
  ) {
    toast(
      'Informe nome e habilidade.'
    );

    return;
  }

  const r =
    await SB.rpc(
      'register_player',
      {
        p_invite_token:
          token,

        p_name:
          name,

        p_skill_level:
          skill
      }
    );

  if (r.error) {
    toast(
      r.error.message
    );

    return;
  }

  playerToken =
    r.data.access_token;

  localStorage.setItem(
    'volei_player_token',
    playerToken
  );

  $('registerResult')
    .classList.remove(
      'hidden'
    );

  $('myAccessLink')
    .value =
    playerUrl(
      playerToken
    );
}


function copyMyAccess() {
  navigator.clipboard.writeText(
    $('myAccessLink')
      .value
  );

  toast(
    'Link copiado.'
  );
}


function openMyAccess() {
  location.href =
    $('myAccessLink')
      .value;
}


/* =========================================================
   AUTH
========================================================= */

SB.auth.onAuthStateChange(
  async (
    event,
    s
  ) => {
    if (
      event ===
      'SIGNED_OUT'
    ) {
      session = null;
      admin = false;

      setMode(
        'landing'
      );
    }
  }
);


/* =========================================================
   LOAD
========================================================= */

window.addEventListener(
  'load',
  init
);
