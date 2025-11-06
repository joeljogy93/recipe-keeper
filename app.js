// ===== Version (for cache-busting in localStorage) =====
const APP_VERSION = '3';

// ===== Core keys & helpers =====
const STORE_KEY='recipe_keeper_store_v1';
const PASS_KEY='rk_local_pass_plain_v1'; // local-only password (plain text, device only)
const DEFAULT_CATS=[
  "Kerala Non veg","Kerala veg","Dessert","Cakes","Filling","Cookies",
  "Without egg dessert","Without egg cakes","Without egg cookies"
];
const SCOPES='https://www.googleapis.com/auth/drive.file';
const DISCOVERY=['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const DRIVE_FOLDER='RecipeKeeper', DRIVE_FILE='recipes.json', IMAGES_FOLDER='images';

const $=id=>document.getElementById(id);
const els={ q:$('q'), list:$('list'), editor:$('editor'), formTitle:$('formTitle'),
  catBar:$('catBar'), themeToggle:$('themeToggle'), syncStatus:$('syncStatus'),
  driveSetupCard:$('driveSetupCard'), clientId:$('clientId'), apiKey:$('apiKey'), driveMsg:$('driveMsg'),
  catDlg:$('catDlg'), newCatName:$('newCatName'), catList:$('catList'),
  settingsDlg:$('settingsDlg'), newPass:$('newPass'), settingsMsg:$('settingsMsg'),
  imgInput:$('imgInput'), uploadStatus:$('uploadStatus'), uploadImgBtn:$('uploadImgBtn')
};
const fields={ title:$('title'), category:$('category'), prep:$('prep'),
  ingredients:$('ingredients'), steps:$('steps'), notes:$('notes'), photo:$('photo') };

let auth=null, editId=null, selectedCategory='All', uploadsInProgress=0;

const esc=s=>(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const attr=s=>esc(s).replace(/"/g,'&quot;');
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
const setStatus=(t,cls)=>{ els.syncStatus.textContent=t; els.syncStatus.className='chip '+(cls||'') };

// ===== Local password (plain, device-only) =====
function hasLocalPassword(){ return !!localStorage.getItem(PASS_KEY) }
async function tryUnlock(pass){ const saved=localStorage.getItem(PASS_KEY); if(!saved) return true; return saved===(pass||'') }
async function setLocalPassword(pass){ if(!pass){localStorage.removeItem(PASS_KEY)} else {localStorage.setItem(PASS_KEY,pass)} }
function showLock(on){ document.getElementById('lock').classList.toggle('hidden',!on) }

// ===== Store =====
function initStore(){
  const s={version:APP_VERSION,recipes:[],categories:[...DEFAULT_CATS],meta:{clientId:'',apiKey:'',drive:{}},updated:Date.now()};
  localStorage.setItem(STORE_KEY,JSON.stringify(s)); return s;
}
function getStore(){
  try{
    const obj = JSON.parse(localStorage.getItem(STORE_KEY));
    if(!obj || obj.version!==APP_VERSION) return initStore();
    return obj;
  }catch{ return initStore() }
}
function setStore(s){ s.updated=Date.now(); localStorage.setItem(STORE_KEY,JSON.stringify(s)) }
const getRecipes=()=>getStore().recipes||[];
function getCategories(){ const s=getStore(); if(!s.categories?.length){ s.categories=[...DEFAULT_CATS]; setStore(s)} return s.categories }
function setCategories(arr){ const s=getStore(); s.categories=arr; setStore(s); if(selectedCategory!=='All'&&!arr.includes(selectedCategory)) selectedCategory='All'; renderCatBar(); renderCategorySelect(); renderList(); pushNow() }

// ===== Theme =====
function loadTheme(){ const t=localStorage.getItem('rk_theme')||'light'; document.documentElement.setAttribute('data-theme',t); els.themeToggle.checked=(t==='dark') }
function saveTheme(){ const t=els.themeToggle.checked?'dark':'light'; document.documentElement.setAttribute('data-theme',t); localStorage.setItem('rk_theme',t) }

// ===== Google Drive helpers =====
async function gapiInit(clientId, apiKey){ await new Promise(res=>gapi.load('client:auth2',res)); await gapi.client.init({ apiKey, clientId, discoveryDocs:DISCOVERY, scope:SCOPES }); return gapi.auth2.getAuthInstance() }
async function ensureSignedIn(a){ if(!a.isSignedIn.get()) await a.signIn() }
async function findOrCreateFolder(name, parentId){
  const q=parentId?`'${parentId}' in parents and name='${name.replace(/'/g,"\\'")}' and trashed=false`:`name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r=await gapi.client.drive.files.list({ q, fields:'files(id,name)', spaces:'drive' });
  if(r.result.files?.length) return r.result.files[0].id;
  const meta={ name, mimeType:'application/vnd.google-apps.folder' }; if(parentId) meta.parents=[parentId];
  const c=await gapi.client.drive.files.create({ resource:meta, fields:'id' }); return c.result.id;
}
function mp(metadata,data,contentType){ const b='-------314159265358979323846', d="\r\n--"+b+"\r\n", end="\r\n--"+b+"--"; const body=d+'Content-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+d+'Content-Type: '+(contentType||'application/octet-stream')+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+btoa(data)+end; return {body,boundary:b} }
async function uploadJsonNew(folderId,name,obj){ const meta={name,parents:[folderId]}, data=JSON.stringify(obj); const {body,boundary}=mp(meta,data,'application/json'); const r=await gapi.client.request({ path:'/upload/drive/v3/files', method:'POST', params:{uploadType:'multipart'}, headers:{'Content-Type':'multipart/related; boundary="'+boundary+'"'}, body}); return r.result }
async function updateJson(fileId,obj){ const meta={name:DRIVE_FILE}, data=JSON.stringify(obj); const {body,boundary}=mp(meta,data,'application/json'); await gapi.client.request({ path:'/upload/drive/v3/files/'+fileId, method:'PATCH', params:{uploadType:'multipart'}, headers:{'Content-Type':'multipart/related; boundary="'+boundary+'"'}, body}) }
async function downloadJson(fileId){ const r=await gapi.client.drive.files.get({ fileId, alt:'media' }); return r.result }
async function ensureRoots(a,store){ await ensureSignedIn(a); const folderId=store.meta.drive?.folderId||await findOrCreateFolder(DRIVE_FOLDER); const fileId=store.meta.drive?.fileId||(await uploadJsonNew(folderId,DRIVE_FILE,store)).id; const imagesId=store.meta.drive?.imagesFolderId||await findOrCreateFolder(IMAGES_FOLDER,folderId); store.meta.drive={folderId,fileId,imagesFolderId:imagesId}; return store.meta.drive }
async function pullMerge(store){ try{ const remote=await downloadJson(store.meta.drive.fileId); if(remote?.updated&&(remote.updated>(store.updated||0))) return remote; if((store.updated||0)>=(remote?.updated||0)) await updateJson(store.meta.drive.fileId,store) }catch(_){} return store }
async function push(store){ if(!store.meta.drive?.fileId) return; await updateJson(store.meta.drive.fileId,store) }
async function uploadImage(file, store){
  if(!store.meta.drive?.imagesFolderId) throw new Error('Images folder missing');
  const bin=await new Promise((res,rej)=>{ const rd=new FileReader(); rd.onload=()=>res(rd.result); rd.onerror=rej; rd.readAsBinaryString(file) });
  const meta={ name:file.name, parents:[store.meta.drive.imagesFolderId] };
  const b='-------314159265358979323846', d="\r\n--"+b+"\r\n", end="\r\n--"+b+"--";
  const body=d+'Content-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+
             d+'Content-Type: '+(file.type||'application/octet-stream')+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+btoa(bin)+end;
  const r=await gapi.client.request({ path:'/upload/drive/v3/files', method:'POST', params:{uploadType:'multipart'}, headers:{'Content-Type':'multipart/related; boundary="'+b+'"'}, body });
  const fileId=r.result.id; const perm=await gapi.client.drive.files.get({ fileId, fields:'id, webViewLink' }); return { fileId, webViewLink:perm.result.webViewLink, name:file.name };
}
async function deleteDriveFile(fileId){ try{ await gapi.client.drive.files.delete({ fileId }) }catch(_){} }

// ===== UI render =====
function renderCatBar(){ const cats=['All',...getCategories()]; els.catBar.innerHTML=cats.map(c=>`<span class="pill ${c===selectedCategory?'active':''}" onclick="selectCat('${attr(c)}')">${esc(c)}</span>`).join('') }
function renderCategorySelect(){ const cats=getCategories(); fields.category.innerHTML=cats.map(c=>`<option value="${attr(c)}">${esc(c)}</option>`).join('') }
const recipeThumb=r=>{ const first=(r.images?.[0]?.webViewLink)||''; const url=first||(r.photo||''); return url?`<img alt="" src="${attr(url)}" style="width:100%;height:160px;object-fit:cover;border:1px solid var(--stroke);border-radius:12px">`:'' }
function renderList(){
  const q=(els.q.value||'').toLowerCase().trim();
  const data=getRecipes().filter(r=>{
    const catOk=(selectedCategory==='All'||r.category===selectedCategory);
    const text=[r.title||'',r.ingredients||'',r.notes||'',r.category||''].join('\n').toLowerCase();
    return catOk && (!q || text.includes(q));
  });
  if(!data.length){ els.list.innerHTML='<div class="card muted">No recipes yet. Add one.</div>'; return }
  els.list.innerHTML=data.sort((a,b)=>(b.updated||0)-(a.updated||0)).map(r=>`
    <article class="recipe" data-id="${r.id}">
      ${recipeThumb(r)}
      <h3>${esc(r.title||'(no title)')}</h3>
      <div class="muted small">${esc(r.category||'')} • ${r.prep?esc(r.prep)+' • ':''}${new Date(r.updated).toLocaleDateString()}</div>
      <div class="muted small">${esc((r.ingredients||'').split('\n').filter(Boolean).slice(0,3).join(' | '))}</div>
      <div class="actions">
        <button class="btn" onclick="editRecipe('${r.id}')">Edit</button>
        <button class="btn warn" onclick="delRecipe('${r.id}')">Delete</button>
      </div>
    </article>`).join('');
}
function clearForm(){ for(const k in fields){ if(k!=='category') fields[k].value='' } const cats=getCategories(); if(cats.length) fields.category.value=cats[0]; editId=null; $('formTitle').textContent='New recipe'; updatePreview() }
function openEditor(){ els.editor.classList.remove('hidden'); window.scrollTo({top:els.editor.offsetTop-8,behavior:'smooth'}) }
function closeEditor(){ els.editor.classList.add('hidden') }
function updatePreview(){
  const title=fields.title.value||'(no title)'; const photo=fields.photo.value.trim();
  const img=photo?`<img alt="" src="${attr(photo)}" style="width:100%;height:160px;object-fit:cover;border:1px solid var(--stroke);border-radius:12px">`:'';
  $('preview').innerHTML=`${img}
    <h3 style="margin:6px 0 2px">${esc(title)}</h3>
    <div class="muted small">${esc(fields.category.value||'')} • ${fields.prep.value?esc(fields.prep.value)+' • ':''}Preview</div>
    <h4>Ingredients</h4><div class="muted small">${esc(fields.ingredients.value).replace(/\n/g,'<br>')||'<i>None</i>'}</div>
    <h4>Steps</h4><div class="muted small">${esc(fields.steps.value).replace(/\n/g,'<br>')||'<i>None</i>'}</div>`;
}

// ===== Actions =====
window.selectCat=name=>{ selectedCategory=name; renderCatBar(); renderList() }
window.editRecipe=id=>{ const r=getRecipes().find(x=>x.id===id); if(!r) return; editId=id; $('formTitle').textContent='Edit recipe';
  fields.title.value=r.title||''; fields.category.value=r.category||getCategories()[0]||''; fields.prep.value=r.prep||'';
  fields.ingredients.value=r.ingredients||''; fields.steps.value=r.steps||''; fields.notes.value=r.notes||''; fields.photo.value=r.photo||'';
  openEditor(); updatePreview();
}
window.delRecipe=async id=>{ const s=getStore(); const r=s.recipes.find(x=>x.id===id); if(!r) return;
  if(!confirm('Delete this recipe (and its images) from Drive?')) return;
  for(const img of (r.images||[])){ if(img.fileId) await deleteDriveFile(img.fileId).catch(()=>{}) }
  s.recipes=s.recipes.filter(x=>x.id!==id); setStore(s); renderList(); pushNow();
}
function saveRecipe(){
  if(uploadsInProgress>0){ alert('Wait for image upload to finish.'); return }
  const s=getStore(); const prev=s.recipes.find(x=>x.id===editId)||{images:[]};
  const r={ id:editId||uid(), title:fields.title.value.trim(), category:fields.category.value, prep:fields.prep.value.trim(),
    ingredients:fields.ingredients.value.trim(), steps:fields.steps.value.trim(), notes:fields.notes.value.trim(),
    photo:fields.photo.value.trim(), images:prev.images||[], updated:Date.now() };
  const i=s.recipes.findIndex(x=>x.id===r.id); if(i>=0) s.recipes[i]=r; else s.recipes.unshift(r);
  setStore(s); clearForm(); closeEditor(); renderList(); pushNow();
}
function exportBackup(){ const blob=new Blob([localStorage.getItem(STORE_KEY)||'{}'],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='recipes-backup.json'; a.click(); URL.revokeObjectURL(a.href) }
function importBackup(file){ const r=new FileReader(); r.onload=e=>{ try{ const obj=JSON.parse(e.target.result); if(!obj.recipes||!obj.categories) throw new Error('Invalid backup'); const cur=getStore(); obj.meta=cur.meta; setStore(obj); renderCatBar(); renderCategorySelect(); renderList(); pushNow(); }catch(err){ alert('Import failed: '+err.message) } }; r.readAsText(file) }
async function connectAndSync(){
  try{
    setStatus('Connecting…'); const s=getStore(); s.meta.clientId=els.clientId.value.trim()||s.meta.clientId; s.meta.apiKey=els.apiKey.value.trim()||s.meta.apiKey; setStore(s);
    auth=await gapiInit(s.meta.clientId, s.meta.apiKey); await ensureRoots(auth,s);
    const merged=await pullMerge(getStore()); setStore(merged);
    els.driveSetupCard.classList.add('hidden'); setStatus('Online'); renderCatBar(); renderCategorySelect(); renderList();
  }catch(err){ els.driveMsg.textContent='Connect error: '+(err.message||err); setStatus('Offline') }
}
async function pushNow(){ try{ const s=getStore(); if(!s.meta?.drive?.fileId) return; setStatus('Syncing…'); await push(getStore()); setStatus('Synced') }catch(_){ setStatus('Online') } }

// Category manager
function refreshCatList(){ const cats=getCategories(); const usage=countUsage(); els.catList.innerHTML=cats.map((c,i)=>{ const used=usage[c]>0; const dis=used?'disabled':''; const hint=used?` title="Used by ${usage[c]} recipe(s)"`:'';
  return `<div class="wrap"><div class="grow">${esc(c)}</div>
    <button class="btn" ${dis} ${hint} onclick="renameCat(${i})">Rename</button>
    <button class="btn warn" ${dis} ${hint} onclick="deleteCat(${i})">Delete</button></div>`; }).join('');
}
function countUsage(){ const u={}; getCategories().forEach(c=>u[c]=0); getRecipes().forEach(r=>{ if(r.category&&u[r.category]!=null) u[r.category]++ }); return u }
window.renameCat=i=>{ const cats=getCategories(); if(countUsage()[cats[i]]>0) return alert('In use'); const name=prompt('New name:',cats[i]); if(!name) return; if(cats.includes(name)) return alert('Already exists'); cats[i]=name.trim(); setCategories(cats); refreshCatList() }
window.deleteCat=i=>{ const cats=getCategories(); if(countUsage()[cats[i]]>0) return alert('In use'); if(!confirm('Delete category?')) return; cats.splice(i,1); setCategories(cats); refreshCatList() }

// ===== Init & events =====
function init(){
  loadTheme();
  const s=getStore();
  if(s.meta?.clientId) els.clientId.value=s.meta.clientId;
  if(s.meta?.apiKey) els.apiKey.value=s.meta.apiKey;
  renderCatBar(); renderCategorySelect(); renderList();

  // Lock: show on first load; improve UX text if not set
  if(!hasLocalPassword()){
    document.getElementById('lockTitle').textContent = 'Set a password for this device';
    document.getElementById('lockInput').placeholder = 'Create a new password';
  }
  showLock(true);

  setStatus(navigator.onLine?'Online':'Offline');
  window.addEventListener('online',()=>setStatus('Online'));
  window.addEventListener('offline',()=>setStatus('Offline'));

  els.themeToggle.addEventListener('change',saveTheme);
  $('addBtn').onclick=()=>{ clearForm(); openEditor() }
  $('saveBtn').onclick=saveRecipe;
  $('cancelBtn').onclick=()=>{ clearForm(); closeEditor() }
  Object.values(fields).forEach(el=>el.addEventListener('input',updatePreview));
  $('q').addEventListener('input',renderList);
  $('exportBtn').onclick=exportBackup;
  $('importFile').addEventListener('change',e=>{ if(e.target.files?.[0]) importBackup(e.target.files[0]); e.target.value='' });
  $('manageCatsBtn').onclick=()=>{ refreshCatList(); els.catDlg.showModal() }
  $('closeCatDlg').onclick=()=>els.catDlg.close();
  $('addCatBtn').onclick=()=>{ const name=els.newCatName.value.trim(); if(!name) return; const cats=getCategories(); if(cats.includes(name)) return alert('Already exists'); setCategories([...cats,name]); els.newCatName.value=''; refreshCatList() }
  $('settingsBtn').onclick=()=>els.settingsDlg.showModal();
  $('closeSettings').onclick=()=>els.settingsDlg.close();
  $('savePassBtn').onclick=async()=>{ const pass=els.newPass.value.trim(); await setLocalPassword(pass); els.settingsMsg.textContent='Password saved (this device only).'; els.newPass.value='' };

  $('connectBtn').onclick=connectAndSync;
  $('signOutBtn').onclick=async()=>{ try{ const a=gapi.auth2.getAuthInstance(); if(a) await a.signOut(); setStatus('Offline'); els.driveSetupCard.classList.remove('hidden') }catch(_){} }

  els.uploadImgBtn.onclick=()=>{ const s=getStore(); if(!s.meta?.drive?.fileId){ alert('Connect Google Drive first.'); return } els.imgInput.click() }
  els.imgInput.addEventListener('change', async e=>{
    const file=e.target.files?.[0]; if(!file) return; uploadsInProgress++; els.uploadStatus.textContent='Uploading…';
    try{
      await ensureRoots(auth, getStore());
      const info=await uploadImage(file, getStore());
      const s=getStore(); const id=editId||uid(); let r=s.recipes.find(x=>x.id===id);
      if(!r){ r={id, title:fields.title.value||'', category:fields.category.value||getCategories()[0]||'', images:[], updated:Date.now()}; s.recipes.unshift(r); editId=id }
      (r.images||(r.images=[])).push(info);
      setStore(s); updatePreview(); renderList(); await pushNow();
    }catch(err){ alert('Upload failed: '+(err.message||err)) }
    finally{ uploadsInProgress=Math.max(0,uploadsInProgress-1); els.uploadStatus.textContent=''; e.target.value='' }
  });

  // Lock controls
  $('unlockBtn').onclick=async()=>{
    const ok=await tryUnlock($('lockInput').value);
    if(ok){ showLock(false); $('lockInput').value=''; $('lockMsg').textContent=''; }
    else { $('lockMsg').textContent='Wrong password.'; }
  };
  $('setPassBtn').onclick=async()=>{
    const val=$('lockInput').value.trim();
    if(!val){ $('lockMsg').textContent='Enter a new password first.'; return }
    await setLocalPassword(val);
    $('lockMsg').textContent='Password set. Use Unlock.';
  };
}
init();
