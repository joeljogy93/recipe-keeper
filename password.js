const PASS_KEY = 'rk_local_pass_hash_v1';

async function sha256(text){
  const enc = new TextEncoder().encode(text||'');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function hasLocalPassword(){
  return !!localStorage.getItem(PASS_KEY);
}

export function showLock(on){
  document.getElementById('lock').classList.toggle('hidden', !on);
}

export async function tryUnlock(pass){
  const saved = localStorage.getItem(PASS_KEY);
  if(!saved) return true; // no password set
  const test = await sha256(pass);
  return saved === test;
}

export async function setLocalPassword(pass){
  if(!pass){ localStorage.removeItem(PASS_KEY); return true; }
  const hash = await sha256(pass);
  localStorage.setItem(PASS_KEY, hash);
  return true;
}

export function prepareLockUI(){
  const lockInput = document.getElementById('lockInput');
  const unlockBtn = document.getElementById('unlockBtn');
  const setPassBtn = document.getElementById('setPassBtn');
  const lockMsg = document.getElementById('lockMsg');
  const lockTitle = document.getElementById('lockTitle');

  if(!hasLocalPassword()){
    lockTitle.textContent = 'Set a password for this device';
    lockInput.placeholder = 'Create a new password';
  }

  unlockBtn.onclick = async () => {
    const ok = await tryUnlock(lockInput.value);
    if(ok){ showLock(false); lockInput.value=''; lockMsg.textContent=''; }
    else { lockMsg.textContent='Wrong password.'; }
  };

  setPassBtn.onclick = async () => {
    const val = lockInput.value.trim();
    if(!val){ lockMsg.textContent='Enter a new password first.'; return; }
    await setLocalPassword(val);
    lockMsg.textContent = 'Password set. Use Unlock.';
  };
}
