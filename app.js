const SB = supabase.createClient(VOLEI_CONFIG.supabaseUrl, VOLEI_CONFIG.supabaseAnonKey);

const SKILLS = { iniciante:1, basico:2, intermediario:3, avancado:4, expert:5 };
const SKILL_LABEL = { iniciante:'Iniciante', basico:'Básico', intermediario:'Intermediário', avancado:'Avançado', expert:'Expert' };
let session=null, admin=false, currentGame=null, players=[], settings=null, playerToken=null, playerData=null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateBR = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
const monthKey = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); };
const toast = m => { $('toast').textContent=m; $('toast').classList.remove('hidden'); setTimeout(()=>$('toast').classList.add('hidden'),2800); };

function setMode(mode){
  $('landing').classList.toggle('hidden', mode!=='landing');
  $('adminLogin').classList.toggle('hidden', mode!=='adminLogin');
  $('adminApp').classList.toggle('hidden', mode!=='admin');
  $('playerApp').classList.toggle('hidden', mode!=='player');
  $('registerApp').classList.toggle('hidden', mode!=='register');
}

function playerUrl(token){
  return `${location.origin}${location.pathname}?jogador=${token}`;
}
function registerUrl(){
  return `${location.origin}${location.pathname}?cadastro=${settings.invite_token}`;
}

async function init(){
  const q=new URLSearchParams(location.search);
  if(q.get('cadastro')){
    setMode('register');
    $('registerToken').value=q.get('cadastro');
    return;
  }
  if(q.get('jogador')){
    playerToken=q.get('jogador');
    await loadPlayer();
    return;
  }
  const saved=localStorage.getItem('volei_player_token');
  if(saved){
    playerToken=saved;
    const ok=await loadPlayer(true);
    if(ok) return;
  }
  const {data}=await SB.auth.getSession();
  if(data.session){
    session=data.session;
    if(await checkAdmin()) { await enterAdmin(); return; }
  }
  setMode('landing');
  $('year').textContent=new Date().getFullYear();
}

async function checkAdmin(){
  const r=await SB.rpc('is_admin');
  return !r.error && r.data===true;
}

async function adminLogin(e){
  e.preventDefault();
  const email=$('adminEmail').value.trim(), password=$('adminPassword').value;
  const r=await SB.auth.signInWithPassword({email,password});
  if(r.error){ toast(r.error.message); return; }
  session=r.data.session;
  if(!await checkAdmin()){
    await SB.auth.signOut();
    toast('Este usuário não é administrador. Um administrador precisa autorizar o e-mail.');
    return;
  }
  await enterAdmin();
}

async function adminSignup(e){
  e.preventDefault();
  const email=$('newAdminEmail').value.trim(), password=$('newAdminPassword').value;
  if(password.length<6){toast('A senha precisa ter pelo menos 6 caracteres.');return;}
  const r=await SB.auth.signUp({email,password});
  if(r.error){toast(r.error.message);return;}
  toast('Conta criada. Se o e-mail já foi autorizado por um administrador, você poderá entrar como administrador.');
  $('newAdminEmail').value=''; $('newAdminPassword').value='';
}

async function enterAdmin(){
  admin=true; setMode('admin');
  await loadAdmin();
  buildAdminNav();
  showAdminPage('dashboard');
}

async function logoutAdmin(){
  await SB.auth.signOut();
  session=null; admin=false;
  setMode('landing');
}

async function loadAdmin(){
  const [s,p,g]=await Promise.all([
    SB.from('group_settings').select('*').eq('id',true).single(),
    SB.from('players').select('*').order('name'),
    SB.from('games').select('*').order('game_date',{ascending:false})
  ]);
  if(s.error){toast(s.error.message);return;}
  settings=s.data; players=p.data||[];
  const games=g.data||[];
  currentGame=games.find(x=>x.game_date>=new Date().toISOString().slice(0,10)) || games[0] || null;
  $('adminName').textContent=session?.user?.email||'Administrador';
}

function buildAdminNav(){
  $('adminNav').innerHTML=[
    ['dashboard','🏠 Visão geral'],['players','🏐 Jogadores'],['games','📅 Jogo e times'],
    ['payments','💰 Pagamentos'],['cash','🏦 Caixa'],['media','🎥 VAR / 🎵 Playlist'],
    ['settings','⚙️ Administração']
  ].map(([id,t],i)=>`<button class="${i===0?'active':''}" onclick="showAdminPage('${id}',this)">${t}</button>`).join('');
}

function showAdminPage(id,btn){
  document.querySelectorAll('#adminNav button').forEach(x=>x.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.querySelectorAll('#adminPages .page').forEach(x=>x.classList.remove('active'));
  $(`a_${id}`).classList.add('active');
  if(id==='dashboard') renderDashboard();
  if(id==='players') renderPlayers();
  if(id==='games') renderGames();
  if(id==='payments') renderPayments();
  if(id==='cash') renderCash();
  if(id==='media') renderMedia();
  if(id==='settings') renderSettings();
}

async function renderDashboard(){
  const all=await SB.from('cash_entries').select('entry_type,amount');
  const bal=(all.data||[]).reduce((a,x)=>a+(x.entry_type==='in'?+x.amount:-+x.amount),0);
  $('dashCards').innerHTML=`
    <div class="statCard"><span>Jogadores</span><b>${players.filter(p=>p.active).length}</b></div>
    <div class="statCard"><span>Próximo jogo</span><b>${currentGame?dateBR(currentGame.game_date):'—'}</b></div>
    <div class="statCard"><span>Caixa</span><b>${money(bal)}</b></div>
    <div class="statCard"><span>Mensalidade</span><b>${money(settings?.monthly_fee)}</b></div>`;
  $('dashInfo').innerHTML=currentGame
    ? `<b>Próximo jogo:</b> ${dateBR(currentGame.game_date)} · ${currentGame.teams_count} times<br><span class="muted">${esc(currentGame.notes||'Sem observações')}</span>`
    : '<div class="notice">Nenhum jogo cadastrado. Crie o próximo jogo na aba “Jogo e times”.</div>';
}

async function renderPlayers(){
  const rows=players.map(p=>`<tr>
    <td><b>${esc(p.name)}</b>${p.user_id?'<span class="badge admin">admin/jogador</span>':''}</td>
    <td>${SKILL_LABEL[p.skill_level]||p.skill_level}</td>
    <td>${p.skill_score}</td>
    <td><span class="badge ${p.active?'paid':'pending'}">${p.active?'Ativo':'Inativo'}</span></td>
    <td>
      <button onclick="editPlayer('${p.id}')">Editar</button>
      <button onclick="togglePlayer('${p.id}',${!p.active})">${p.active?'Desativar':'Ativar'}</button>
    </td></tr>`).join('');
  $('playersTable').innerHTML=rows||'<tr><td colspan="5">Nenhum jogador cadastrado.</td></tr>';
  $('playerCount').textContent=`${players.filter(p=>p.active).length} ativos`;
}

async function editPlayer(id){
  const p=players.find(x=>x.id===id); if(!p)return;
  const name=prompt('Nome:',p.name); if(name===null)return;
  const skill=prompt('Habilidade (iniciante, basico, intermediario, avancado ou expert):',p.skill_level); if(skill===null)return;
  const key=skill.trim().toLowerCase();
  if(!SKILLS[key]){toast('Habilidade inválida.');return;}
  const r=await SB.from('players').update({name:name.trim(),skill_level:key,skill_score:SKILLS[key]}).eq('id',id);
  if(r.error)toast(r.error.message); else {toast('Jogador atualizado.');await loadAdmin();renderPlayers();}
}
async function togglePlayer(id,active){
  const r=await SB.from('players').update({active}).eq('id',id);
  if(r.error)toast(r.error.message); else {await loadAdmin();renderPlayers();}
}

async function renderGames(){
  $('gameFormDate').value=currentGame?.game_date||(()=>{let d=new Date();d.setDate(d.getDate()+((5-d.getDay()+7)%7));return d.toISOString().slice(0,10)})();
  $('gameTeams').value=currentGame?.teams_count||2;
  $('gameNotes').value=currentGame?.notes||'';
  $('currentGameTitle').textContent=currentGame?`Jogo de ${dateBR(currentGame.game_date)}`:'Nenhum jogo';
  $('gamePlayerList').innerHTML=currentGame?await gamePlayerRows(currentGame.id):'<div class="notice">Crie um jogo para selecionar quem vai jogar.</div>';
  if(currentGame) await renderTeamsAdmin();
}
async function saveGame(e){
  e.preventDefault();
  const payload={game_date:$('gameFormDate').value,teams_count:+$('gameTeams').value,notes:$('gameNotes').value,created_by:session.user.id};
  let r;
  if(currentGame) r=await SB.from('games').update(payload).eq('id',currentGame.id).select().single();
  else r=await SB.from('games').insert(payload).select().single();
  if(r.error){toast(r.error.message);return;}
  currentGame=r.data; await loadAdmin(); toast('Jogo salvo.'); renderGames();
}
async function gamePlayerRows(gameId){
  const gp=(await SB.from('game_players').select('*').eq('game_id',gameId)).data||[];
  return `<div class="tableWrap"><table><thead><tr><th>Jogador</th><th>Habilidade</th><th>Vai jogar?</th><th>Pagamento</th></tr></thead><tbody>${
    players.filter(p=>p.active).map(p=>{
      const x=gp.find(a=>a.player_id===p.id);
      return `<tr><td>${esc(p.name)}</td><td>${SKILL_LABEL[p.skill_level]}</td>
      <td><input type="checkbox" ${x?.present?'checked':''} onchange="saveGamePlayer('${gameId}','${p.id}',this.checked,'${x?.payment_mode||'mensal'}')"></td>
      <td><select onchange="saveGamePlayer('${gameId}','${p.id}',${!!x?.present},this.value)">
        <option value="mensal" ${(x?.payment_mode||'mensal')==='mensal'?'selected':''}>Mensal</option>
        <option value="individual" ${x?.payment_mode==='individual'?'selected':''}>Individual</option>
      </select></td></tr>`;
    }).join('')
  }</tbody></table></div>`;
}
async function saveGamePlayer(gameId,playerId,present,mode){
  const r=await SB.from('game_players').upsert({game_id:gameId,player_id:playerId,present,payment_mode:mode},{onConflict:'game_id,player_id'});
  if(r.error)toast(r.error.message);
  if(mode==='individual' && present){
    await SB.from('unit_payments').upsert({game_id:gameId,player_id:playerId,amount:settings.unit_fee},{onConflict:'game_id,player_id'});
  } else {
    await SB.from('unit_payments').delete().eq('game_id',gameId).eq('player_id',playerId);
  }
  await renderGames();
}
async function drawTeams(){
  if(!currentGame)return;
  const gp=(await SB.from('game_players').select('player_id').eq('game_id',currentGame.id).eq('present',true)).data||[];
  const ps=gp.map(x=>players.find(p=>p.id===x.player_id)).filter(Boolean).sort((a,b)=>b.skill_score-a.skill_score);
  if(ps.length<currentGame.teams_count){toast('Jogadores insuficientes para a quantidade de times.');return;}
  await SB.from('team_members').delete().in('team_id',(await SB.from('teams').select('id').eq('game_id',currentGame.id)).data?.map(x=>x.id)||['00000000-0000-0000-0000-000000000000']);
  await SB.from('teams').delete().eq('game_id',currentGame.id);
  const teams=Array.from({length:currentGame.teams_count},()=>[]);
  ps.forEach((p,i)=>{
    const order=[...Array(teams.length).keys()].sort((a,b)=>sum(teams[a])-sum(teams[b]) || a-b);
    teams[order[0]].push(p);
  });
  for(let i=0;i<teams.length;i++){
    const t=(await SB.from('teams').insert({game_id:currentGame.id,team_no:i+1,total_skill:sum(teams[i])}).select().single()).data;
    if(t) await SB.from('team_members').insert(teams[i].map(p=>({team_id:t.id,player_id:p.id})));
  }
  toast('Times sorteados e equilibrados.'); await renderGames();
}
const sum=a=>a.reduce((s,p)=>s+p.skill_score,0);
async function renderTeamsAdmin(){
  if(!currentGame)return;
  const ts=(await SB.from('teams').select('id,team_no,total_skill').eq('game_id',currentGame.id).order('team_no')).data||[];
  if(!ts.length){$('teamsAdmin').innerHTML='<div class="notice">Ainda não há times sorteados.</div>';return;}
  const members=(await SB.from('team_members').select('team_id,player_id').in('team_id',ts.map(t=>t.id))).data||[];
  $('teamsAdmin').innerHTML=ts.map(t=>`<div class="team"><h3>Time ${t.team_no} <small>${t.total_skill} pontos</small></h3>${members.filter(m=>m.team_id===t.id).map(m=>{const p=players.find(x=>x.id===m.player_id);return `<div class="person">${esc(p?.name||'')} <span>${SKILL_LABEL[p?.skill_level]||''}</span></div>`}).join('')}</div>`).join('');
}
async function sendTeamsWhatsApp(){
  if(!currentGame)return;
  const ts=(await SB.from('teams').select('id,team_no').eq('game_id',currentGame.id)).data||[];
  const members=(await SB.from('team_members').select('team_id,player_id').in('team_id',ts.map(t=>t.id))).data||[];
  const teamOf={}; members.forEach(m=>teamOf[m.player_id]=ts.find(t=>t.id===m.team_id)?.team_no);
  const text=`🏐 99% INTRIGAS · 1% VÔLEI\n\nJogo: ${dateBR(currentGame.game_date)}\n\n${ts.map(t=>`TIME ${t.team_no}: ${members.filter(m=>m.team_id===t.id).map(m=>players.find(p=>p.id===m.player_id)?.name).filter(Boolean).join(', ')}`).join('\n')}`;
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
}

async function renderPayments(){
  const comp=monthKey();
  $('paymentMonth').textContent=new Date(comp+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const mp=(await SB.from('monthly_payments').select('*').eq('competence',comp)).data||[];
  $('monthlyTable').innerHTML=players.filter(p=>p.active).map(p=>{
    const x=mp.find(a=>a.player_id===p.id);
    return `<tr><td>${esc(p.name)}</td><td>${money(x?.amount||settings.monthly_fee)}</td><td><span class="badge ${x?.paid?'paid':'pending'}">${x?.paid?'Pago':'Pendente'}</span></td><td><button onclick="toggleMonthly('${p.id}',${!!x?.paid})">${x?.paid?'Desmarcar':'Marcar pago'}</button></td></tr>`;
  }).join('');
  if(currentGame){
    const up=(await SB.from('unit_payments').select('*').eq('game_id',currentGame.id)).data||[];
    $('unitTable').innerHTML=up.map(x=>`<tr><td>${esc(players.find(p=>p.id===x.player_id)?.name||'')}</td><td>${money(x.amount)}</td><td><span class="badge ${x.paid?'paid':'pending'}">${x.paid?'Pago':'Pendente'}</span></td><td><button onclick="toggleUnit('${x.player_id}',${!!x.paid})">${x.paid?'Desmarcar':'Marcar pago'}</button></td></tr>`).join('')||'<tr><td colspan="4">Nenhum individual neste jogo.</td></tr>';
  }
}
async function toggleMonthly(pid,paid){
  const r=await SB.rpc('set_monthly_paid',{p_player:pid,p_competence:monthKey(),p_paid:!paid});
  if(r.error)toast(r.error.message); else {toast('Mensalidade atualizada.');renderPayments();}
}
async function toggleUnit(pid,paid){
  if(!currentGame)return;
  const r=await SB.rpc('set_unit_paid',{p_game:currentGame.id,p_player:pid,p_paid:!paid});
  if(r.error)toast(r.error.message); else {toast('Pagamento individual atualizado.');renderPayments();}
}

async function renderCash(){
  const ce=(await SB.from('cash_entries').select('*').order('created_at',{ascending:false})).data||[];
  const ins=ce.filter(x=>x.entry_type==='in').reduce((a,x)=>a+ +x.amount,0);
  const outs=ce.filter(x=>x.entry_type==='out').reduce((a,x)=>a+ +x.amount,0);
  $('cashStats').innerHTML=`<div class="statCard"><span>Entradas</span><b>${money(ins)}</b></div><div class="statCard"><span>Saídas</span><b>${money(outs)}</b></div><div class="statCard"><span>Saldo</span><b>${money(ins-outs)}</b></div>`;
  $('cashTable').innerHTML=ce.map(x=>`<tr><td>${new Date(x.created_at).toLocaleDateString('pt-BR')}</td><td>${x.entry_type==='in'?'Entrada':'Saída'}</td><td>${esc(x.category)}</td><td>${esc(x.description)}</td><td>${money(x.amount)}</td></tr>`).join('')||'<tr><td colspan="5">Sem movimentações.</td></tr>';
}
async function addExpense(e){
  e.preventDefault();
  const amount=+$('expenseAmount').value;
  if(!amount)return;
  const r=await SB.from('cash_entries').insert({entry_type:'out',category:$('expenseCategory').value,description:$('expenseDescription').value,amount,created_by:session.user.id});
  if(r.error){toast(r.error.message);return;}
  $('expenseForm').reset();toast('Saída registrada.');renderCash();
}

async function renderMedia(){
  const v=(await SB.from('var_links').select('*').order('created_at',{ascending:false})).data||[];
  $('varAdminList').innerHTML=v.map(x=>`<div class="mediaRow"><div><b>${esc(x.title)}</b><small>${dateBR(x.game_date)}</small></div><a target="_blank" href="${esc(x.url)}">Abrir</a></div>`).join('')||'<div class="notice">Nenhum vídeo.</div>';
  $('spotifyInput').value=settings?.spotify_url||'';
}
async function addVar(e){
  e.preventDefault();
  const r=await SB.from('var_links').insert({title:$('varTitle').value,url:$('varUrl').value,game_date:$('varDate').value||null,created_by:session.user.id});
  if(r.error)toast(r.error.message); else {toast('Vídeo adicionado.');$('varForm').reset();renderMedia();}
}
async function saveSpotify(e){
  e.preventDefault();
  const r=await SB.from('group_settings').update({spotify_url:$('spotifyInput').value.trim(),updated_at:new Date().toISOString()}).eq('id',true);
  if(r.error)toast(r.error.message);else{settings.spotify_url=$('spotifyInput').value.trim();toast('Playlist salva.');}
}

async function renderSettings(){
  const mine=(await SB.from('players').select('*').eq('user_id',session.user.id).maybeSingle()).data;
  $('adminPlayerName').value=mine?.name||'';
  $('adminPlayerSkill').value=mine?.skill_level||'intermediario';
  $('monthlyFee').value=settings.monthly_fee||0;
  $('unitFee').value=settings.unit_fee||0;
  $('instagramUrl').value=settings.instagram_url||'';
  $('registerLink').value=registerUrl();
  const admins=(await SB.from('admin_users').select('user_id,email,created_at').order('created_at')).data||[];
  $('adminsList').innerHTML=admins.map(a=>`<tr><td>${esc(a.email||'')}</td><td>${a.user_id===session.user.id?'Você':''}</td><td>${a.user_id===session.user.id?'—':`<button onclick="removeAdmin('${a.user_id}')">Remover</button>`}</td></tr>`).join('');
}
async function saveSettings(e){
  e.preventDefault();
  const r=await SB.from('group_settings').update({
    monthly_fee:+$('monthlyFee').value||0,unit_fee:+$('unitFee').value||0,
    instagram_url:$('instagramUrl').value.trim(),updated_at:new Date().toISOString()
  }).eq('id',true);
  if(r.error)toast(r.error.message);else{await loadAdmin();toast('Configurações salvas.');renderSettings();}
}
async function rotateInvite(){
  const r=await SB.from('group_settings').update({invite_token:crypto.randomUUID(),updated_at:new Date().toISOString()}).eq('id',true).select().single();
  if(r.error)toast(r.error.message);else{settings=r.data;$('registerLink').value=registerUrl();toast('Novo link de cadastro gerado. O anterior deixa de funcionar.');}
}
async function copyRegister(){
  await navigator.clipboard.writeText($('registerLink').value);toast('Link copiado.');
}
function sendRegisterWhatsApp(){
  const text=`🏐 99% INTRIGAS · 1% VÔLEI\n\nPessoal, faça seu cadastro para participar dos sorteios dos times:\n\n${$('registerLink').value}\n\nInforme apenas seu nome e seu nível de habilidade.`;
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
}
async function addAdmin(e){
  e.preventDefault();
  const r=await SB.rpc('set_admin_email',{p_email:$('adminInviteEmail').value.trim()});
  if(r.error)toast(r.error.message);else{$('adminInviteEmail').value='';toast('E-mail autorizado como administrador. Se ainda não tiver conta, poderá criar uma na tela de login.');renderSettings();}
}
async function removeAdmin(id){
  if(!confirm('Remover este administrador?'))return;
  const r=await SB.rpc('remove_admin',{p_user:id});
  if(r.error)toast(r.error.message);else{toast('Administrador removido.');renderSettings();}
}

async function saveMyPlayer(e){
  e.preventDefault();
  const name=$('adminPlayerName').value.trim(), skill=$('adminPlayerSkill').value;
  if(!name||!SKILLS[skill]){toast('Preencha nome e habilidade.');return;}
  const existing=(await SB.from('players').select('id').eq('user_id',session.user.id).maybeSingle()).data;
  const payload={user_id:session.user.id,name,skill_level:skill,skill_score:SKILLS[skill],active:true};
  const r=existing ? await SB.from('players').update(payload).eq('id',existing.id) : await SB.from('players').insert(payload);
  if(r.error)toast(r.error.message);else{toast('Seu cadastro de jogador foi salvo.');await loadAdmin();renderSettings();}
}

async function loadPlayer(silent=false){
  const r=await SB.rpc('get_player_view',{p_access_token:playerToken});
  if(r.error){if(!silent){setMode('landing');toast('Link de jogador inválido ou expirado.');}return false;}
  playerData=r.data; localStorage.setItem('volei_player_token',playerToken);
  setMode('player'); renderPlayer(); return true;
}
function renderPlayer(){
  const d=playerData, p=d.player;
  $('playerWelcome').textContent=`Olá, ${p.name}!`;
  $('playerSkill').textContent=`Nível: ${SKILL_LABEL[p.skill_level]}`;
  $('playerGame').innerHTML=d.game?`<b>Próximo jogo: ${dateBR(d.game.game_date)}</b><br><span class="muted">${d.game.teams_count} times · ${esc(d.game.notes||'')}</span>`:'Nenhum jogo cadastrado ainda.';
  const myTeam=(d.teams||[]).find(t=>(t.members||[]).some(m=>m.id===p.id));
  $('myTeam').innerHTML=myTeam?`<div class="team"><h3>Seu time: ${myTeam.team_no}</h3>${myTeam.members.map(m=>`<div class="person">${esc(m.name)} <span>${SKILL_LABEL[m.skill_level]}</span></div>`).join('')}</div>`:'<div class="notice">Seu time ainda não foi sorteado.</div>';
  $('playerTeams').innerHTML=(d.teams||[]).map(t=>`<div class="team"><h3>Time ${t.team_no} <small>${t.total_skill} pontos</small></h3>${t.members.map(m=>`<div class="person">${esc(m.name)} <span>${SKILL_LABEL[m.skill_level]}</span></div>`).join('')}</div>`).join('')||'<div class="notice">Nenhum time sorteado.</div>';
  $('playerVar').innerHTML=(d.var||[]).map(v=>`<div class="mediaRow"><div><b>${esc(v.title)}</b><small>${dateBR(v.game_date)}</small></div><a target="_blank" href="${esc(v.url)}">Assistir</a></div>`).join('')||'<div class="notice">Nenhum vídeo compartilhado.</div>';
  $('playerSpotify').innerHTML=d.settings.spotify_url?`<a class="primaryLink" target="_blank" href="${esc(d.settings.spotify_url)}">🎵 Abrir playlist no Spotify</a>`:'Playlist ainda não cadastrada.';
  $('playerInstagram').innerHTML=d.settings.instagram_url?`<a class="primaryLink" target="_blank" href="${esc(d.settings.instagram_url)}">📸 Instagram do grupo</a>`:'';
}
function copyMyLink(){
  navigator.clipboard.writeText(playerUrl(playerToken));toast('Seu link foi copiado.');
}
function shareMyLink(){
  const text=`🏐 Meu acesso ao 99% INTRIGAS · 1% VÔLEI:\n${playerUrl(playerToken)}`;
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
}

async function registerPlayer(e){
  e.preventDefault();
  const token=$('registerToken').value, name=$('regName').value.trim(), skill=$('regSkill').value;
  if(!name||!skill){toast('Informe nome e habilidade.');return;}
  const r=await SB.rpc('register_player',{p_invite_token:token,p_name:name,p_skill_level:skill});
  if(r.error){toast(r.error.message);return;}
  playerToken=r.data.access_token; localStorage.setItem('volei_player_token',playerToken);
  $('registerResult').classList.remove('hidden');
  $('myAccessLink').value=playerUrl(playerToken);
}
function copyMyAccess(){navigator.clipboard.writeText($('myAccessLink').value);toast('Seu link pessoal foi copiado.');}
function openMyAccess(){location.href=$('myAccessLink').value;}

SB.auth.onAuthStateChange(async(event,s)=>{
  if(event==='SIGNED_OUT'){session=null;admin=false;setMode('landing');}
});
window.addEventListener('load',init);
