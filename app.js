// =============================
// Recipe Keeper - App Logic
// =============================

// Local password key
const PASS_KEY = "rk_pass";
let recipes = [];
let filtered = [];
let categories = [];

// UI elements
const lockScreen = document.getElementById("lock");
const lockInput = document.getElementById("lockInput");
const unlockBtn = document.getElementById("unlockBtn");
const setPassBtn = document.getElementById("setPassBtn");
const lockMsg = document.getElementById("lockMsg");

const settingsDlg = document.getElementById("settingsDlg");
const newPassInput = document.getElementById("newPass");
const savePassBtn = document.getElementById("savePassBtn");
const closeSettingsBtn = document.getElementById("closeSettings");
const settingsMsg = document.getElementById("settingsMsg");

const newBtn = document.getElementById("newBtn");
const searchInput = document.getElementById("search");
const recipeList = document.getElementById("recipeList");

// =============================
// PASSWORD LOGIC
// =============================

function tryUnlock(pass) {
  const saved = localStorage.getItem(PASS_KEY);

  if (!saved) {
    return true; // No password stored = unlock
  }

  if (!pass) {
    return false; // Empty input = fail
  }

  return saved.trim() === pass.trim();
}

function unlockUI() {
  lockScreen.classList.add("hidden");
  document.body.classList.remove("locked");
}

unlockBtn.addEventListener("click", () => {
  const pass = lockInput.value.trim();
  if (tryUnlock(pass)) {
    unlockUI();
  } else {
    lockMsg.innerText = "Wrong password. Try again.";
  }
});

setPassBtn.addEventListener("click", () => {
  settingsDlg.showModal();
});

savePassBtn.addEventListener("click", () => {
  const np = newPassInput.value.trim();
  if (!np) {
    settingsMsg.innerText = "Password cannot be empty.";
    return;
  }
  localStorage.setItem(PASS_KEY, np);
  settingsMsg.innerText = "Password saved!";
  newPassInput.value = "";
  lockMsg.innerText = "Password set. Use Unlock.";
});

closeSettingsBtn.addEventListener("click", () => {
  settingsDlg.close();
});

// =============================
// RECIPE LOGIC (dummy placeholders for now)
// =============================

function loadRecipes() {
  recipeList.innerHTML = "<p style='opacity:0.6'>No recipes yet</p>";
}

newBtn.addEventListener("click", () => {
  alert("Add recipe popup coming soon...");
});

searchInput.addEventListener("input", () => {
  alert("Search coming soon...");
});

// Initial UI state
document.body.classList.add("locked");
