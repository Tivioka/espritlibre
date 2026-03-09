/**
 * MindFree — Module Finances v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Ajoute un onglet "Finances" à l'app MindFree avec :
 *   • Abonnements (catégorie séparée)
 *   • Factures & Échéances
 *   • Résumé mensuel / annuel
 *   • Prochains prélèvements (J-7, J-3, J-1, J)
 *   • Notifications de rappel
 *
 * Installation : ajouter dans index.html, juste avant </body> :
 *   <script src="finance-module.js"></script>
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════════
     CONSTANTES
  ═══════════════════════════════════════════════════════════════════════════ */

  const STORAGE_KEY   = 'mf_finance_v1';
  const NOTIF_CHK_KEY = 'mf_fin_checked';

  const FREQUENCIES = [
    { id: 'weekly',    label: 'Hebdomadaire',    days: 7,   perMonth: 52 / 12 },
    { id: 'biweekly',  label: '2 fois / mois',   days: 14,  perMonth: 26 / 12 },
    { id: 'monthly',   label: 'Mensuel',          days: 30,  perMonth: 1       },
    { id: 'quarterly', label: 'Trimestriel',      days: 91,  perMonth: 1 / 3   },
    { id: 'biannual',  label: 'Semestriel',       days: 182, perMonth: 1 / 6   },
    { id: 'yearly',    label: 'Annuel',           days: 365, perMonth: 1 / 12  },
    { id: 'once',      label: 'Une seule fois',   days: null, perMonth: 0      },
  ];

  const CATEGORIES = {
    subscription: { label: 'Abonnement',   icon: '🔄', color: '#7B61FF' },
    bill:         { label: 'Facture',      icon: '🧾', color: '#E05252' },
    deadline:     { label: 'Échéance',     icon: '📅', color: '#F59E0B' },
    insurance:    { label: 'Assurance',    icon: '🛡️', color: '#3BAF6A' },
    rent:         { label: 'Loyer',        icon: '🏠', color: '#5ABFEC' },
    tax:          { label: 'Impôt / Taxe', icon: '🏦', color: '#64748b' },
    other:        { label: 'Autre',        icon: '💳', color: '#5a7080' },
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     STOCKAGE
  ═══════════════════════════════════════════════════════════════════════════ */

  function loadData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { items: [] }; }
    catch { return { items: [] }; }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     HELPERS DATE & MONTANT
  ═══════════════════════════════════════════════════════════════════════════ */

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function parseLocal(str) {
    if (!str) return null;
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(str) {
    const d = parseLocal(str);
    if (!d) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** Calcule la prochaine date réelle (en tenant compte des récurrences passées) */
  function nextPaymentISO(item) {
    let d = parseLocal(item.nextDate);
    if (!d) return null;

    const today = parseLocal(todayISO());
    if (d >= today) return item.nextDate;

    const freq = FREQUENCIES.find(f => f.id === item.frequency);
    if (!freq || !freq.days) return item.nextDate; // once → date passée conservée

    while (d < today) d.setDate(d.getDate() + freq.days);
    return d.toISOString().split('T')[0];
  }

  function daysUntil(item) {
    const next = nextPaymentISO(item);
    if (!next) return null;
    const diff = parseLocal(next) - parseLocal(todayISO());
    return Math.round(diff / 86_400_000);
  }

  function monthlyAmt(item) {
    const freq = FREQUENCIES.find(f => f.id === item.frequency);
    return parseFloat(item.amount || 0) * (freq ? freq.perMonth : 0);
  }

  function fmt€(n) { return parseFloat(n).toFixed(2) + ' €'; }

  /* ═══════════════════════════════════════════════════════════════════════════
     NOTIFICATIONS
  ═══════════════════════════════════════════════════════════════════════════ */

  async function askNotifPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  }

  function pushNotif(title, body) {
    if (Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: 'icon-192.png' }); }
    catch (e) {
      // iOS 16.4+ nécessite un service worker
      navigator.serviceWorker?.controller?.postMessage({ type: 'NOTIF', title, body });
    }
  }

  function checkUpcoming() {
    const today = todayISO();
    if (localStorage.getItem(NOTIF_CHK_KEY) === today) return;
    localStorage.setItem(NOTIF_CHK_KEY, today);
    if (Notification.permission !== 'granted') return;

    loadData().items.forEach(item => {
      const days = daysUntil(item);
      if (days === null) return;
      const a = fmt€(item.amount);
      if (days === 0) pushNotif(`💳 Prélèvement aujourd'hui`,   `${item.name} — ${a}`);
      if (days === 1) pushNotif(`⚠️ Prélèvement demain`,        `${item.name} — ${a}`);
      if (days === 3) pushNotif(`📅 Prélèvement dans 3 jours`,  `${item.name} — ${a}`);
      if (days === 7) pushNotif(`🗓️ Prélèvement dans 7 jours`,  `${item.name} — ${a}`);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CSS INJECTÉ
  ═══════════════════════════════════════════════════════════════════════════ */

  function injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      /* ── Finance cards ── */
      .fin-card { cursor:pointer; transition:opacity .15s ease; }
      .fin-card:active { opacity:.7; }

      /* ── Stat boxes ── */
      .fin-stats {
        display:grid; grid-template-columns:1fr 1fr 1fr;
        gap:8px; margin:4px 0 2px;
      }
      .fin-stat {
        background:var(--card); border-radius:var(--r);
        padding:12px 10px; box-shadow:var(--shadow);
        display:flex; flex-direction:column; gap:3px; text-align:center;
      }
      .fin-stat-val { font-size:16px; font-weight:700; color:var(--primary); }
      .fin-stat-lbl { font-size:10px; color:var(--subtext); letter-spacing:.3px; }

      /* ── Upcoming badge ── */
      .fin-badge-alert {
        display:inline-flex; align-items:center; gap:4px;
        padding:3px 9px; border-radius:20px; font-size:11px; font-weight:700;
        background:rgba(224,82,82,.15); color:var(--danger);
      }

      /* ── Cat icon ── */
      .fin-ico {
        width:38px; height:38px; border-radius:10px; flex-shrink:0;
        display:flex; align-items:center; justify-content:center; font-size:19px;
      }

      /* ── Empty state ── */
      .fin-empty {
        background:var(--card); border-radius:var(--r); box-shadow:var(--shadow);
        padding:24px; text-align:center; color:var(--subtext);
        font-size:14px; margin:4px 0;
      }
      .fin-empty-ico { font-size:30px; margin-bottom:6px; }

      /* ── Upcoming card accent ── */
      .fin-accent { border-left:3px solid; }
    `;
    document.head.appendChild(style);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SÉCURITÉ HTML
  ═══════════════════════════════════════════════════════════════════════════ */

  const ESC = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' };
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ESC[c]);

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDU ÉCRAN
  ═══════════════════════════════════════════════════════════════════════════ */

  function urgencyColor(days) {
    if (days === 0) return 'var(--danger)';
    if (days === 1) return '#ef4444';
    if (days <= 3)  return '#f97316';
    if (days <= 7)  return '#eab308';
    return 'var(--subtext)';
  }

  function renderScreen() {
    const { items } = loadData();
    const subs   = items.filter(i => i.category === 'subscription');
    const others = items.filter(i => i.category !== 'subscription');

    // Stats globales
    const totalMonth = items.reduce((s, i) => s + monthlyAmt(i), 0);
    const totalYear  = totalMonth * 12;
    const nbItems    = items.length;

    // Prochains ≤ 30 jours
    const upcoming = items
      .map(i => ({ ...i, _days: daysUntil(i), _next: nextPaymentISO(i) }))
      .filter(i => i._days !== null && i._days >= 0 && i._days <= 30)
      .sort((a, b) => a._days - b._days);

    const alertCount = items.filter(i => { const d = daysUntil(i); return d !== null && d <= 7; }).length;

    document.getElementById('sc').innerHTML = `
      <div class="nav-hdr">
        <h1>Finances</h1>
        ${alertCount > 0
          ? `<span class="fin-badge-alert">⚡ ${alertCount} à venir</span>`
          : `<span style="font-size:12px;color:rgba(255,255,255,.75)">${nbItems} entrée${nbItems > 1 ? 's' : ''}</span>`
        }
      </div>

      <div class="scroll pad" id="fin-scroll">

        <!-- ── Résumé ── -->
        <div class="fin-stats">
          <div class="fin-stat">
            <span class="fin-stat-val">${totalMonth.toFixed(2)} €</span>
            <span class="fin-stat-lbl">/ mois</span>
          </div>
          <div class="fin-stat">
            <span class="fin-stat-val">${totalYear.toFixed(0)} €</span>
            <span class="fin-stat-lbl">/ an</span>
          </div>
          <div class="fin-stat">
            <span class="fin-stat-val">${subs.length}</span>
            <span class="fin-stat-lbl">abonnement${subs.length > 1 ? 's' : ''}</span>
          </div>
        </div>

        <!-- ── Prochains prélèvements ── -->
        ${upcoming.length > 0 ? `
          <div class="sec">PROCHAINS PRÉLÈVEMENTS</div>
          ${upcoming.map(cardUpcoming).join('')}
        ` : ''}

        <!-- ── Abonnements ── -->
        <div class="sec">ABONNEMENTS</div>
        ${subs.length === 0
          ? `<div class="fin-empty"><div class="fin-empty-ico">🔄</div>Aucun abonnement<br><span style="font-size:12px">Appuie sur + pour en ajouter</span></div>`
          : subs.map(cardItem).join('')
        }

        <!-- ── Factures & Échéances ── -->
        <div class="sec">FACTURES & ÉCHÉANCES</div>
        ${others.length === 0
          ? `<div class="fin-empty"><div class="fin-empty-ico">🧾</div>Aucune facture<br><span style="font-size:12px">Appuie sur + pour en ajouter</span></div>`
          : others.map(cardItem).join('')
        }

        <div style="height:28px"></div>
      </div>
    `;
  }

  function cardUpcoming(item) {
    const cat  = CATEGORIES[item.category] || CATEGORIES.other;
    const days = item._days;
    const col  = urgencyColor(days);
    const lbl  = days === 0 ? "Aujourd'hui !" : days === 1 ? 'Demain' : `Dans ${days} j`;

    return `
      <div class="card card-sm fin-card fin-accent" style="border-color:${col};margin-bottom:6px"
           onclick="window._finEdit('${esc(item.id)}')">
        <div class="ev-row">
          <div class="fin-ico" style="background:${cat.color}20">${cat.icon}</div>
          <div class="ev-body" style="margin-left:10px">
            <div class="ev-title">${esc(item.name)}</div>
            <div class="ev-sub" style="color:var(--subtext)">${fmtDate(item._next)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-weight:700;font-size:16px;color:${col}">${fmt€(item.amount)}</div>
            <div style="font-size:11px;color:${col};font-weight:700;margin-top:2px">${lbl}</div>
          </div>
        </div>
      </div>`;
  }

  function cardItem(item) {
    const cat   = CATEGORIES[item.category] || CATEGORIES.other;
    const freq  = FREQUENCIES.find(f => f.id === item.frequency);
    const days  = daysUntil(item);
    const next  = nextPaymentISO(item);
    const col   = (days !== null && days <= 7) ? urgencyColor(days) : 'var(--subtext)';
    const bold  = days !== null && days <= 7;
    const mAmt  = monthlyAmt(item);

    return `
      <div class="card card-sm fin-card" style="margin-bottom:6px"
           onclick="window._finEdit('${esc(item.id)}')">
        <div class="ev-row">
          <div class="fin-ico" style="background:${cat.color}20">${cat.icon}</div>
          <div class="ev-body" style="margin-left:10px">
            <div class="ev-title">${esc(item.name)}</div>
            <div class="ev-sub" style="color:var(--subtext)">
              ${freq ? esc(freq.label) : ''}${item.notes ? ' · ' + esc(item.notes) : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
            <span style="font-weight:700;font-size:15px">${fmt€(item.amount)}</span>
            ${mAmt > 0 && item.frequency !== 'monthly' && item.frequency !== 'once'
              ? `<span style="font-size:10px;color:var(--subtext)">${mAmt.toFixed(2)} €/mois</span>`
              : ''}
            ${next
              ? `<span style="font-size:11px;color:${col};font-weight:${bold ? 700 : 400}">${fmtDate(next)}</span>`
              : ''}
          </div>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MODAL AJOUT / ÉDITION
  ═══════════════════════════════════════════════════════════════════════════ */

  function buildModal(item) {
    const isEdit   = !!item;
    const today    = todayISO();

    const catOpts = Object.entries(CATEGORIES).map(([k, v]) =>
      `<option value="${k}" ${(item?.category ?? 'subscription') === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
    ).join('');

    const freqOpts = FREQUENCIES.map(f =>
      `<option value="${f.id}" ${(item?.frequency ?? 'monthly') === f.id ? 'selected' : ''}>${f.label}</option>`
    ).join('');

    return `
      <div class="modal-title">${isEdit ? 'Modifier' : 'Ajouter'} une entrée</div>

      <div class="ff">
        <label>Catégorie</label>
        <select class="fi" id="fc-cat" onchange="window._finFreqToggle()">${catOpts}</select>
      </div>

      <div class="ff">
        <label>Nom</label>
        <input class="fi" id="fc-name" type="text"
               placeholder="Netflix, EDF, Loyer…"
               value="${esc(item?.name ?? '')}">
      </div>

      <div class="ff">
        <label>Montant (€)</label>
        <input class="fi" id="fc-amount" type="number" step="0.01" min="0"
               placeholder="0.00" value="${esc(item?.amount ?? '')}">
      </div>

      <div class="ff" id="fc-freq-wrap">
        <label>Fréquence du prélèvement</label>
        <select class="fi" id="fc-freq">${freqOpts}</select>
      </div>

      <div class="ff">
        <label>Prochaine date de prélèvement</label>
        <input class="fi" id="fc-date" type="date"
               value="${esc(item?.nextDate ?? today)}">
      </div>

      <div class="ff">
        <label>Notes <span style="color:var(--subtext);font-weight:400">(optionnel)</span></label>
        <input class="fi" id="fc-notes" type="text"
               placeholder="Ex : Plan famille, contrat n°…"
               value="${esc(item?.notes ?? '')}">
      </div>

      <div class="sw-row">
        <span class="sw-lbl">🔔 Notifications de rappel</span>
        <label class="sw">
          <input type="checkbox" id="fc-notif" ${(item?.notif ?? true) ? 'checked' : ''}>
          <span class="sl"></span>
        </label>
      </div>

      <div class="mact">
        ${isEdit
          ? `<button class="btn btn-g" style="color:var(--danger)"
                     onclick="window._finDel('${esc(item.id)}')">Supprimer</button>`
          : `<button class="btn btn-g" onclick="window._finCloseModal()">Annuler</button>`}
        <button class="btn btn-p"
                onclick="window._finSave(${isEdit ? `'${esc(item.id)}'` : 'null'})">
          ${isEdit ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>`;
  }

  function openFinModal(item) {
    document.getElementById('modal').innerHTML = buildModal(item);
    document.getElementById('ov').classList.add('open');
    window._finFreqToggle();
    setTimeout(() => document.getElementById('fc-name')?.focus(), 300);
  }

  /* ─── Fonctions globales appelées depuis le HTML ─────────────────────────── */

  window._finFreqToggle = function () {
    const cat  = document.getElementById('fc-cat')?.value;
    const wrap = document.getElementById('fc-freq-wrap');
    if (!wrap) return;
    if (cat === 'deadline') {
      wrap.style.display = 'none';
      if (document.getElementById('fc-freq'))
        document.getElementById('fc-freq').value = 'once';
    } else {
      wrap.style.display = 'block';
    }
  };

  window._finCloseModal = function () {
    document.getElementById('ov')?.classList.remove('open');
  };

  window._finSave = function (id) {
    const nameEl   = document.getElementById('fc-name');
    const amountEl = document.getElementById('fc-amount');
    const name     = nameEl.value.trim();
    const amount   = parseFloat(amountEl.value);

    nameEl.classList.remove('err');
    amountEl.classList.remove('err');

    if (!name)                    { nameEl.classList.add('err');   return; }
    if (isNaN(amount) || amount < 0) { amountEl.classList.add('err'); return; }

    const entry = {
      name,
      amount:    amount.toFixed(2),
      category:  document.getElementById('fc-cat').value,
      frequency: document.getElementById('fc-freq').value,
      nextDate:  document.getElementById('fc-date').value,
      notes:     document.getElementById('fc-notes').value.trim(),
      notif:     document.getElementById('fc-notif').checked,
    };

    const data = loadData();
    if (id) {
      const idx = data.items.findIndex(i => i.id === id);
      if (idx > -1) data.items[idx] = { ...data.items[idx], ...entry };
    } else {
      data.items.push({ id: Date.now().toString(), createdAt: new Date().toISOString(), ...entry });
    }
    saveData(data);

    if (entry.notif) {
      askNotifPermission().then(ok => {
        if (!ok) _finToast('Active les notifications dans les réglages du navigateur');
      });
    }

    window._finCloseModal();
    renderScreen();
    _finToast(id ? '✅ Modifié' : '✅ Ajouté');
  };

  window._finEdit = function (id) {
    const item = loadData().items.find(i => i.id === id);
    if (item) openFinModal(item);
  };

  window._finDel = function (id) {
    const data = loadData();
    data.items = data.items.filter(i => i.id !== id);
    saveData(data);
    window._finCloseModal();
    renderScreen();
    _finToast('🗑️ Supprimé');
  };

  function _finToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     INTÉGRATION NAVIGATION
  ═══════════════════════════════════════════════════════════════════════════ */

  let onFinScreen = false;

  /** Ajoute l'onglet Finances dans la barre de navigation */
  function addNavTab() {
    const bnav = document.querySelector('.bnav');
    if (!bnav) return;

    const btn = document.createElement('button');
    btn.className = 'ni';
    btn.id = 'n-fin';
    btn.setAttribute('onclick', 'window._finGo()');
    btn.innerHTML = `
      <svg class="ni-icon" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8"/>
        <line x1="12" y1="6" x2="12" y2="8"/>
        <line x1="12" y1="16" x2="12" y2="18"/>
      </svg>
      <span class="ni-lbl">Finances</span>`;
    bnav.appendChild(btn);
  }

  /** Patch du bouton + pour ouvrir la bonne modal selon l'écran actif */
  function patchPlusBtn() {
    const btn = document.querySelector('.ni.add');
    if (!btn) return;
    const orig = btn.onclick;
    btn.onclick = function () {
      if (onFinScreen) { openFinModal(null); }
      else if (typeof orig === 'function') { orig.call(this); }
      else if (typeof navigate === 'function') { navigate(2); }
    };
  }

  /** Patch de navigate() pour désactiver le flag Finance quand on quitte l'écran */
  function patchNavigate() {
    if (typeof navigate !== 'function') return;
    const orig = navigate;
    window.navigate = function (n) {
      onFinScreen = false;
      document.querySelectorAll('.ni').forEach(el => el.classList.remove('active'));
      orig(n);
    };
  }

  window._finGo = function () {
    onFinScreen = true;
    document.querySelectorAll('.ni').forEach(el => el.classList.remove('active'));
    document.getElementById('n-fin')?.classList.add('active');
    renderScreen();
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     INITIALISATION
  ═══════════════════════════════════════════════════════════════════════════ */

  function init() {
    injectCSS();
    addNavTab();
    patchPlusBtn();
    patchNavigate();
    checkUpcoming();
    setInterval(checkUpcoming, 60 * 60 * 1000); // re-vérifie chaque heure
    console.log('[MindFree Finance] Module chargé ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 150); // laisse le temps aux scripts existants de s'exécuter
  }

})();
