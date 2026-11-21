/* CEFR BOOST — kirish kodi: faqat test (Writing/Speaking/Reading/Listening) boshlanganda so'raladi.
   index.html ichida </body> dan oldin ulanadi: <script src="access-gate.js"></script> */
(function () {
  const ADMIN_EMAIL = "jumayevsurat111@gmail.com";
  let activated = false;
  let pending = null; // kod kutayotgan va'da (resolver)

  const overlay = document.createElement("div");
  overlay.id = "accessGate";
  overlay.style.cssText =
    "display:none;position:fixed;inset:0;z-index:10000;background:rgba(15,17,23,.88);" +
    "backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:20px;";
  overlay.innerHTML = `
    <div style="background:#fff;color:#1a1d29;padding:34px 30px;border-radius:20px;width:380px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center;font-family:'Inter',Arial,sans-serif;">
      <div style="font-size:42px;margin-bottom:8px;">🔑</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:6px;">Testni boshlash uchun kod kerak</div>
      <div style="font-size:13.5px;color:#6b7280;line-height:1.5;margin-bottom:18px;">
        Mock testlar faqat o'quvchilar uchun. Ustozingiz bergan kodni kiriting.
      </div>
      <input id="agCode" type="text" placeholder="Masalan: A3F9C21B" autocomplete="off"
        style="width:100%;padding:13px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:16px;font-weight:700;text-align:center;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">
      <div id="agError" style="color:#dc2626;font-size:13px;min-height:18px;margin-bottom:8px;"></div>
      <button id="agSubmit" style="width:100%;padding:13px;background:linear-gradient(135deg,#4338ca,#7c3aed);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">Faollashtirish</button>
      <div style="margin-top:14px;font-size:13px;">
        <a href="#" id="agCancel" style="color:#6b7280;text-decoration:none;font-weight:600;">Bekor qilish</a>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (id) => document.getElementById(id);
  const input = $("agCode");
  const errEl = $("agError");
  const btn = $("agSubmit");

  function show(msg) { overlay.style.display = "flex"; errEl.textContent = msg || ""; setTimeout(() => input.focus(), 50); }
  function hide() { overlay.style.display = "none"; errEl.textContent = ""; }
  function settle(ok) { if (pending) { const r = pending; pending = null; r(ok); } }

  // true qaytarsa — testni boshlash mumkin
  async function ensureAccess() {
    if (activated) return true;
    const { data } = await supabaseClient.auth.getSession();
    const session = data.session;
    if (!session) return true; // kirmagan bo'lsa, login oynasi o'zi turibdi
    if (session.user.email === ADMIN_EMAIL) { activated = true; return true; }
    const { data: rows, error } = await supabaseClient
      .from("access_codes").select("id").eq("used_by", session.user.id).limit(1);
    if (!error && rows && rows.length) { activated = true; return true; }
    settle(false);
    return new Promise((resolve) => {
      pending = resolve;
      show(error ? "Tekshirib bo'lmadi: " + error.message : "");
    });
  }

  btn.addEventListener("click", async () => {
    const code = input.value.trim();
    if (!code) { errEl.textContent = "Kodni kiriting."; return; }
    btn.disabled = true; btn.style.opacity = ".7";
    const { data, error } = await supabaseClient.rpc("redeem_code", { p_code: code });
    btn.disabled = false; btn.style.opacity = "1";
    if (error) { errEl.textContent = "Xato: " + error.message; return; }
    if (data === true) { activated = true; input.value = ""; hide(); settle(true); }
    else errEl.textContent = "Kod noto'g'ri yoki allaqachon ishlatilgan.";
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
  $("agCancel").addEventListener("click", (e) => { e.preventDefault(); hide(); settle(false); });

  supabaseClient.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") activated = false; });

  // Writing: mock "Start/Continue" tugmalari va "Davom eting" kartasi
  document.addEventListener("click", async (e) => {
    const el = e.target.closest(".writing-start-btn, #continueCard");
    if (!el || activated || el.dataset.agOk) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (await ensureAccess()) {
      el.dataset.agOk = "1";
      el.click();
      delete el.dataset.agOk;
    }
  }, true);

  // Speaking: mockni boshlash
  const origStartSpeaking = window.startSpeakingMock;
  if (typeof origStartSpeaking === "function") {
    window.startSpeakingMock = async function () {
      if (await ensureAccess()) return origStartSpeaking.apply(this, arguments);
    };
  }

  // Reading / Listening qo'shilganda ham ishlatish uchun: await window.ensureAccess()
  window.ensureAccess = ensureAccess;
})();
