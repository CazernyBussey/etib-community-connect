// ETIB Community Connect client logic
(function () {
  const TOKEN_KEY = "etib_token";
  const USER_KEY = "etib_user";

  const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
  const setAuth = (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  };
  const clearAuth = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };
  const getUser = () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "{}"); } catch { return {}; }
  };

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function announce(form, text, isError = false) {
    let node = form.querySelector("[data-status]");
    if (!node) {
      node = document.createElement("p");
      node.setAttribute("data-status", "1");
      node.setAttribute("role", "status");
      node.style.marginTop = "10px";
      form.appendChild(node);
    }
    node.textContent = text;
    node.style.color = isError ? "#b42318" : "#0f5132";
  }

  // Signup
  const signupForm = document.querySelector("form") && document.getElementById("signup-email") ? document.querySelector("form") : null;
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullName = document.getElementById("signup-name")?.value?.trim();
      const email = document.getElementById("signup-email")?.value?.trim();
      const password = document.getElementById("signup-password")?.value || "";
      const confirm = document.getElementById("signup-confirm")?.value || "";
      const phone = document.getElementById("signup-phone")?.value?.trim();
      if (password !== confirm) return announce(signupForm, "Passwords do not match.", true);
      try {
        const out = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName, email, phone, password }) });
        setAuth(out.token, out.user);
        announce(signupForm, "Account created. Redirecting to dashboard...");
        setTimeout(() => { window.location.href = out.user?.role === "admin" ? "admin-dashboard.html" : "owner-dashboard.html"; }, 600);
      } catch (err) { announce(signupForm, err.message, true); }
    });
  }

  // Login
  const loginForm = document.querySelector("form") && document.getElementById("login-email") ? document.querySelector("form") : null;
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email")?.value?.trim();
      const password = document.getElementById("login-password")?.value || "";
      try {
        const out = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setAuth(out.token, out.user);
        announce(loginForm, "Signed in. Redirecting...");
        setTimeout(() => { window.location.href = out.user?.role === "admin" ? "admin-dashboard.html" : "owner-dashboard.html"; }, 600);
      } catch (err) { announce(loginForm, err.message, true); }
    });
  }

  // Add business
  const addForm = document.querySelector("form") && document.getElementById("biz-name") ? document.querySelector("form") : null;
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        businessName: document.getElementById("biz-name")?.value?.trim(),
        ownerContactName: document.getElementById("owner-name")?.value?.trim(),
        businessEmail: document.getElementById("biz-email")?.value?.trim(),
        phone: document.getElementById("biz-phone")?.value?.trim(),
        listingType: document.getElementById("listing-type")?.value,
        category: document.getElementById("biz-category")?.value,
        shortSummary: (document.getElementById("support-blind")?.value || "").trim().slice(0, 170),
        fullDescription: document.getElementById("support-blind")?.value?.trim(),
        supportsBvi: document.getElementById("support-blind")?.value?.trim(),
        accessibilityDetails: document.getElementById("accessibility-details")?.value?.trim(),
        primaryContactMethod: document.getElementById("primary-contact")?.value,
        city: document.getElementById("city")?.value?.trim(),
        state: document.getElementById("state")?.value?.trim(),
        serviceAreaType: "Local",
        hours: "By appointment",
        websiteUrl: document.getElementById("website")?.value?.trim() || null
      };
      try {
        await api("/api/listings", { method: "POST", body: JSON.stringify(payload) });
        announce(addForm, "Listing submitted for review.");
        addForm.reset();
      } catch (err) {
        if (/Missing token|Invalid token/i.test(err.message)) {
          announce(addForm, "Please sign in first, then submit your listing.", true);
        } else announce(addForm, err.message, true);
      }
    });
  }

  // Directory page
  const directoryApp = document.querySelector("[data-directory-app]");
  if (directoryApp) {
    const searchInput = document.getElementById("search");
    const categorySelect = document.getElementById("filter-category");
    const typeSelect = document.getElementById("filter-type");
    const locationInput = document.getElementById("filter-location");
    const contactSelect = document.getElementById("filter-contact");
    const resetBtn = document.getElementById("resetFilters");
    const resultsWrap = document.getElementById("directoryResults");
    const resultCount = document.getElementById("resultCount");

    function renderCard(item) {
      const badges = [item.listing_type].filter(Boolean).map((t) => {
        const cls = t.includes("Community") ? "blue" : "gold";
        return `<span class="badge ${cls}">${t}</span>`;
      }).join("");
      const place = `${item.city || ""}${item.state ? ", " + item.state : ""}` || "Remote";
      return `
        <article class="card" aria-labelledby="listing-${item.id}">
          <div class="badge-row">${badges}</div>
          <h3 id="listing-${item.id}">${item.business_name}</h3>
          <p class="meta">${item.category || "Other"} • ${place}</p>
          <p class="summary">${item.short_summary || ""}</p>
          <div class="listing-footer">
            <a class="btn btn-ghost" href="business-profile.html?id=${item.id}">View Full Profile</a>
          </div>
        </article>
      `;
    }

    async function applyFilters() {
      const q = encodeURIComponent(searchInput?.value?.trim() || "");
      const category = encodeURIComponent(categorySelect?.value || "");
      const listingType = encodeURIComponent(typeSelect?.value || "");
      const location = encodeURIComponent(locationInput?.value?.trim() || "");
      const contact = encodeURIComponent((contactSelect?.value || "").toLowerCase());
      const url = `/api/listings?q=${q}&category=${category}&listingType=${listingType}&location=${location}&contact=${contact}`;
      try {
        const out = await api(url, { method: "GET", headers: {} });
        const rows = out.listings || [];
        resultsWrap.innerHTML = rows.length ? rows.map(renderCard).join("") : `<div class="panel" style="padding:14px"><p role="status">No listings match your filters yet.</p></div>`;
        if (resultCount) resultCount.textContent = `${rows.length} listing${rows.length === 1 ? "" : "s"} found`;
      } catch {
        resultsWrap.innerHTML = `<div class="panel" style="padding:14px"><p role="status">Could not load listings right now.</p></div>`;
      }
    }

    [searchInput, categorySelect, typeSelect, locationInput, contactSelect].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", applyFilters);
      el.addEventListener("change", applyFilters);
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (categorySelect) categorySelect.value = "";
        if (typeSelect) typeSelect.value = "";
        if (locationInput) locationInput.value = "";
        if (contactSelect) contactSelect.value = "";
        applyFilters();
      });
    }
    applyFilters();
  }

  // Business profile page
  if (window.location.pathname.endsWith("business-profile.html")) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      api(`/api/listings/${id}`).then((out) => {
        const l = out.listing;
        if (!l) return;
        const h1 = document.querySelector("h1");
        if (h1) h1.textContent = l.business_name;

        const main = document.querySelector("main");
        if (main) {
          const aside = main.querySelector("aside");
          if (aside) {
            aside.innerHTML = `
              <h2>Direct contact</h2>
              <p class="small">Contact this provider directly using your preferred method.</p>
              <p><strong>Phone:</strong> ${l.phone || "Not provided"}</p>
              <p><strong>Text:</strong> ${l.text_number || "Not provided"}</p>
              <p><strong>Email:</strong> ${l.business_email || "Not provided"}</p>
              <p><strong>Website:</strong> ${l.website_url ? `<a href="${l.website_url}" target="_blank" rel="noopener">Visit website</a>` : "Not provided"}</p>
            `;
          }
        }
      }).catch(() => {});
    }
  }

  // Owner dashboard
  if (window.location.pathname.endsWith("owner-dashboard.html")) {
    const token = getToken();
    if (!token) return void (window.location.href = "login.html");

    api("/api/owner/listings").then((out) => {
      const section = document.querySelector("main .container");
      if (!section) return;
      const items = (out.listings || []).map((l) => `
        <tr>
          <td>${l.business_name}</td>
          <td>${l.category || ""}</td>
          <td>${l.listing_type || ""}</td>
          <td>${l.status}</td>
          <td>${l.admin_note || "—"}</td>
          <td>${l.last_updated || ""}</td>
        </tr>
      `).join("");

      const card = document.createElement("section");
      card.className = "panel";
      card.style.padding = "14px";
      card.style.marginTop = "12px";
      card.innerHTML = `
        <h2>Your submitted listings</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Business</th><th>Category</th><th>Type</th><th>Status</th><th>Admin Note</th><th>Updated</th></tr>
            </thead>
            <tbody>${items || '<tr><td colspan="6">No listings yet.</td></tr>'}</tbody>
          </table>
        </div>
      `;
      section.appendChild(card);
    }).catch(() => {});
  }

  // Admin dashboard
  if (window.location.pathname.endsWith("admin-dashboard.html")) {
    const token = getToken();
    const user = getUser();
    if (!token) return void (window.location.href = "login.html");
    if (user.role !== "admin") return void (window.location.href = "owner-dashboard.html");

    const search = document.getElementById("admin-search");
    const statusSel = document.getElementById("admin-status");

    async function loadAdmin() {
      const q = encodeURIComponent((search?.value || "").trim());
      const statusRaw = statusSel?.value || "";
      const statusMap = {
        "All statuses": "",
        "Pending": "pending",
        "Approved": "approved",
        "Needs changes": "needs_changes",
        "Rejected": "rejected"
      };
      const status = encodeURIComponent(statusMap[statusRaw] || "");
      const out = await api(`/api/admin/listings?status=${status}&q=${q}`);
      const tbody = document.querySelector("tbody");
      if (!tbody) return;
      tbody.innerHTML = (out.listings || []).map((l) => `
        <tr>
          <td>${l.business_name}<br><small>${l.owner_email || ""}</small></td>
          <td>${l.listing_type}</td>
          <td>${l.category}</td>
          <td><span class="status">${l.status}</span></td>
          <td>${l.last_updated || ""}</td>
          <td>
            <button class="btn btn-primary" data-action="approved" data-id="${l.id}">Approve</button>
            <button class="btn" data-action="needs_changes" data-id="${l.id}">Needs Changes</button>
            <button class="btn btn-danger" data-action="rejected" data-id="${l.id}">Reject</button>
          </td>
        </tr>
      `).join("") || '<tr><td colspan="6">No matching submissions.</td></tr>';
    }

    document.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      const adminNote = prompt("Optional admin note (sent to owner):") || "";
      try {
        await api(`/api/admin/listings/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: action, adminNote })
        });
        await loadAdmin();
      } catch (err) {
        alert(err.message || "Update failed");
      }
    });

    [search, statusSel].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", loadAdmin);
      el.addEventListener("change", loadAdmin);
    });

    loadAdmin().catch(() => {});
  }

  window.ETIBAuth = { getUser, clearAuth };
})();