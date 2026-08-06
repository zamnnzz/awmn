import {
  initializeApp,
  getApp,
  getApps
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  get,
  update
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyACS3IRZjIEkBk38y5C3uXOTa8N2ju8jwA",
  authDomain: "picture-game-8946e.firebaseapp.com",
  databaseURL: "https://picture-game-8946e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "picture-game-8946e",
  storageBucket: "picture-game-8946e.firebasestorage.app",
  messagingSenderId: "246477951240",
  appId: "1:246477951240:web:e0e2666fddb83f4ada5cbd",
  measurementId: "G-00NCKBL9Q8"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let activeUser = null;
let ready = false;
let applyingRemote = false;
let lastSavedState = "";
let saveTimer = null;

function getBridge(){
  return window.gameProgressBridge || null;
}

function setAccountStatus(text){
  const subtitle = document.getElementById("levelsAccountSubtitle");
  if(subtitle && activeUser){
    subtitle.textContent = text;
  }
}

function normalizeState(state){
  return {
    unlockedLevel: Math.max(1, Number(state?.unlockedLevel) || 1),
    hintBalances: state?.hintBalances || {},
    hintCooldowns: state?.hintCooldowns || {},
    fastAnswerProgress: Math.max(
      0,
      Number(state?.fastAnswerProgress) || 0
    ),
    fastAnswerTarget: Math.max(
      1,
      Number(state?.fastAnswerTarget) || 3
    )
  };
}

function serializeState(state){
  return JSON.stringify(normalizeState(state));
}

async function saveProgress(force = false){
  if(!ready || applyingRemote || !activeUser || activeUser.isAnonymous){
    return false;
  }

  const bridge = getBridge();
  if(!bridge?.getState) return false;

  const progress = normalizeState(bridge.getState());
  const serialized = serializeState(progress);

  if(!force && serialized === lastSavedState){
    return true;
  }

  try{
    await update(ref(db, `users/${activeUser.uid}`), {
      profile: {
        name: activeUser.displayName || "",
        email: activeUser.email || "",
        photoURL: activeUser.photoURL || ""
      },
      progress: {
        ...progress,
        updatedAt: Date.now()
      }
    });

    lastSavedState = serialized;
    setAccountStatus("تم تسجيل الدخول — تقدمك محفوظ");
    return true;
  }catch(error){
    console.error("Progress save failed:", error);
    setAccountStatus("تعذر الحفظ السحابي — التقدم محفوظ على هذا الجهاز");
    return false;
  }
}

async function loadProgress(user){
  const bridge = getBridge();
  if(!bridge?.getState || !bridge?.applyState){
    throw new Error("Game progress bridge is unavailable");
  }

  const snapshot = await get(ref(db, `users/${user.uid}/progress`));

  if(snapshot.exists()){
    applyingRemote = true;
    try{
      bridge.applyState(normalizeState(snapshot.val()));
    }finally{
      applyingRemote = false;
    }

    lastSavedState = serializeState(bridge.getState());
    setAccountStatus("تم تسجيل الدخول — تمت استعادة تقدمك");
  }else{
    lastSavedState = "";
    ready = true;
    await saveProgress(true);
  }
}

function startWatching(){
  clearInterval(saveTimer);

  saveTimer = setInterval(() => {
    saveProgress(false).catch(() => {});
  }, 1500);
}

onAuthStateChanged(auth, async user => {
  activeUser = user && !user.isAnonymous ? user : null;
  ready = false;
  clearInterval(saveTimer);

  if(!activeUser){
    lastSavedState = "";
    return;
  }

  try{
    await loadProgress(activeUser);
  }catch(error){
    console.error("Progress load failed:", error);
    setAccountStatus("تعذر استعادة التقدم — سيستمر الحفظ المحلي");
  }finally{
    ready = true;
    startWatching();
  }
});

window.addEventListener("pagehide", () => {
  saveProgress(true).catch(() => {});
});

window.addEventListener("online", () => {
  saveProgress(true).catch(() => {});
});

window.gameCloudProgress = {
  saveNow: () => saveProgress(true)
};
