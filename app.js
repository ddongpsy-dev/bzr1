// ═══════════════════════════════════════════════════════════════
// BZR app.js — Firebase Auth + Webhook + UID 관리
// ═══════════════════════════════════════════════════════════════

import { initializeApp }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth,
         GoogleAuthProvider,
         signInWithPopup,
         onAuthStateChanged,
         signOut }              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ── 설정 ────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBl_yRpX6zQMdv-JABokRfIgUu35bGZsoI",
  authDomain:        "bzr-proj.firebaseapp.com",
  projectId:         "bzr-proj",
  storageBucket:     "bzr-proj.firebasestorage.app",
  messagingSenderId: "130300251259",
  appId:             "1:130300251259:web:0573bafb670f33bbfce6de",
  measurementId:     "G-63DDX63KW4",
};

const WEBHOOK_URL = 'https://hook.us2.make.com/nguw8u44w84j30qgabcxe7pe2vkaquae';

// ── Firebase 초기화 ──────────────────────────────────────────────
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

// ── DOM ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const screenLogin     = $('screen-login');
const screenDashboard = $('screen-dashboard');
const btnLogin        = $('btnLogin');
const btnLoginText    = $('btnLoginText');
const btnLogout       = $('btnLogout');
const consentCheck    = $('consentCheck');

// 대시보드 요소
const userAvatar      = $('userAvatar');
const userName        = $('userName');
const userEmail       = $('userEmail');
const displayBzrUid   = $('displayBzrUid');
const creditNum       = $('creditNum');
const creditBar       = $('creditBar');
const creditBadge     = $('creditBadge');
const sysMarketing    = $('sysMarketing');
const sysGoogleUid    = $('sysGoogleUid');

// ═══════════════════════════════════════════════════════════════
// 1. BZR UID 생성 / 조회
// ═══════════════════════════════════════════════════════════════
function generateBzrUid() {
  const now    = new Date();
  const yy     = String(now.getFullYear()).slice(2);
  const mm     = String(now.getMonth() + 1).padStart(2, '0');
  const dd     = String(now.getDate()).padStart(2, '0');
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand   = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `BZR${yy}${mm}${dd}_${rand}`;
}

function getOrCreateBzrUid() {
  let uid = localStorage.getItem('bzr_uid');
  if (!uid) {
    uid = generateBzrUid();
    localStorage.setItem('bzr_uid', uid);
  }
  return uid;
}

// ═══════════════════════════════════════════════════════════════
// 2. 웹훅 전송
// ═══════════════════════════════════════════════════════════════
async function sendToWebhook(user) {
  const bzrUid          = getOrCreateBzrUid();
  const marketingConsent = localStorage.getItem('bzr_marketing') === 'true';

  const payload = {
    bzr_uid:            bzrUid,
    google_uid:         user.uid,
    email:              user.email,
    display_name:       user.displayName,
    marketing_consent:  marketingConsent,
  };

  console.log('[BZR] → Webhook payload:', payload);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // 응답 파싱 (JSON 또는 plain text 대응)
    const ct   = res.headers.get('content-type') || '';
    let data   = {};
    if (ct.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      try { data = JSON.parse(text); } catch { data = {}; }
    }

    console.log('[BZR] ← Webhook response:', data);

    // 서버에서 확정된 bzr_uid 가 오면 덮어씌움
    if (data.bzr_uid) {
      localStorage.setItem('bzr_uid', data.bzr_uid);
    }

    // 크레딧 저장
    if (data.current_credit !== undefined) {
      localStorage.setItem('bzr_credit', String(data.current_credit));
    }

    return data;

  } catch (err) {
    console.error('[BZR] Webhook error:', err);
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. 대시보드 UI 업데이트
// ═══════════════════════════════════════════════════════════════
function updateDashboard(user) {
  const bzrUid = localStorage.getItem('bzr_uid') || '—';
  const credit = localStorage.getItem('bzr_credit');
  const mkt    = localStorage.getItem('bzr_marketing') === 'true' ? '동의' : '미동의';

  // 유저 정보
  userAvatar.src     = user.photoURL || '';
  userAvatar.onerror = () => {
    userAvatar.style.background = 'var(--bg-3)';
    userAvatar.src = '';
  };
  userName.textContent    = user.displayName || '사용자';
  userEmail.textContent   = user.email || '—';
  displayBzrUid.textContent = bzrUid;

  // 시스템 정보
  sysMarketing.textContent = mkt;
  sysGoogleUid.textContent = user.uid;

  // 크레딧
  const creditVal = credit !== null ? parseInt(credit, 10) : null;
  if (creditVal !== null) {
    creditNum.textContent    = creditVal.toLocaleString();
    creditBadge.textContent  = creditVal > 0 ? 'AVAILABLE' : 'EMPTY';
    // 최대 10크레딧 기준 바 표시
    const pct = Math.min(creditVal / 10 * 100, 100);
    creditBar.style.width = pct + '%';
  } else {
    creditNum.textContent   = '—';
    creditBadge.textContent = 'LOADING';
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. 화면 전환
// ═══════════════════════════════════════════════════════════════
function showScreen(name) {
  screenLogin.classList.remove('active');
  screenDashboard.classList.remove('active');

  if (name === 'login') {
    screenLogin.classList.add('active');
  } else {
    screenDashboard.classList.add('active');
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. 로그인 버튼 이벤트
// ═══════════════════════════════════════════════════════════════
btnLogin.addEventListener('click', async () => {
  if (btnLogin.disabled) return;

  // 로딩 상태
  btnLogin.disabled       = true;
  btnLoginText.textContent = '처리 중...';

  try {
    const result = await signInWithPopup(auth, provider);
    // onAuthStateChanged 가 이후 처리를 담당
  } catch (err) {
    console.error('[BZR] Login error:', err);
    btnLogin.disabled        = false;
    btnLoginText.textContent = 'Google로 시작하기';
  }
});

// ═══════════════════════════════════════════════════════════════
// 6. 마케팅 동의 체크박스 → 버튼 활성화 제어
// ═══════════════════════════════════════════════════════════════
consentCheck.addEventListener('change', () => {
  btnLogin.disabled = !consentCheck.checked;
  localStorage.setItem('bzr_marketing', consentCheck.checked ? 'true' : 'false');
});

// ═══════════════════════════════════════════════════════════════
// 7. 로그아웃
// ═══════════════════════════════════════════════════════════════
btnLogout.addEventListener('click', async () => {
  try {
    await signOut(auth);
    localStorage.clear();           // 브라우저 데이터 전부 파기
    showScreen('login');
    // 체크박스 / 버튼 초기화
    consentCheck.checked     = false;
    btnLogin.disabled        = true;
    btnLoginText.textContent = 'Google로 시작하기';
  } catch (err) {
    console.error('[BZR] Logout error:', err);
  }
});

// ═══════════════════════════════════════════════════════════════
// 8. 인증 상태 감지 (앱 시작 시 자동 실행)
// ═══════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ─ 로그인 상태 ─
    showScreen('dashboard');
    updateDashboard(user);       // 로컬 데이터로 먼저 즉시 렌더

    // 웹훅 전송 후 서버 데이터로 갱신
    const data = await sendToWebhook(user);
    updateDashboard(user);       // 서버 응답 반영 후 재렌더

  } else {
    // ─ 비로그인 상태 ─
    showScreen('login');
  }
});

// ═══════════════════════════════════════════════════════════════
// 9. 배경 파티클 캔버스 (장식)
// ═══════════════════════════════════════════════════════════════
(function initCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');

  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles(n) {
    return Array.from({ length: n }, () => ({
      x:   Math.random() * W,
      y:   Math.random() * H,
      r:   Math.random() * 1.2 + 0.2,
      vx:  (Math.random() - 0.5) * 0.25,
      vy:  (Math.random() - 0.5) * 0.25,
      op:  Math.random() * 0.4 + 0.1,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56,189,248,${p.op})`;
      ctx.fill();

      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    });

    // 가까운 파티클 연결선
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 100) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(56,189,248,${0.06 * (1 - d / 100)})`;
          ctx.lineWidth   = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  resize();
  particles = createParticles(60);
  draw();
  window.addEventListener('resize', () => {
    resize();
    particles = createParticles(60);
  });
})();
