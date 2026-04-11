(function () {
  function getToken() {
    return localStorage.getItem("etib_token") || "";
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("etib_user") || "{}");
    } catch {
      return {};
    }
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function setStatus(form, text, isError) {
    let node = form.querySelector("[data-edit-status]");
    if (!node) {
      node = document.createElement("p");
      node.setAttribute("data-edit-status", "1");
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      node.style.marginTop = "10px";
      form.appendChild(node);
    }
    node.textContent = text;
    node.style.color = isError ? "#ffb4b4" : "#9ee3b5";
  }

  function listingPayloadFromForm() {
    const supportText = document.getElementById("support-blind")?.value?.trim() || "";
    return {
      businessName: document.getElementById("biz-name")?.value?.trim(),
      ownerContactName: document.getElementById("owner-name")?.value?.trim(),
      businessEmail: document.getElementById("biz-email")?.value?.trim(),
      phone: document.getElementById("biz-phone")?.value?.trim(),
      listingType: document.getElementById("listing-type")?.value,
      category: document.getElementById("biz-category")?.value,
      shortSummary: supportText.slice(0, 170),
      fullDescription: supportText,
      listenSummary: document.getElementById("listen-summary")?.value?.trim() || null,
      supportsBvi: supportText,
      accessibilityDetails: document.getElementById("accessibility-details")?.value?.trim(),
      primaryContactMethod: document.getElementById("primary-contact")?.value,
      city: document.getElementById("city")?.value?.trim(),
      state: document.getElementById("state")?.value?.trim(),
      serviceAreaType: "Local",
      hours: "By appointment",
      websiteUrl: document.getElementById("website")?.value?.trim() || null
    };
  }

  function fillForm(listing) {
    if (!listing) return;
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || "";
    };
    setValue("biz-name", listing.business_name);
    setValue("owner-name", listing.owner_contact_name);
    setValue("biz-email", listing.business_email);
    setValue("biz-phone", listing.phone);
    setValue("listing-type", listing.listing_type);
    setValue("biz-category", listing.category);
    setValue("support-blind", listing.supports_bvi || listing.full_description);
    setValue("accessibility-details", listing.accessibility_details);
    setValue("listen-summary", listing.listen_summary);
    setValue("primary-contact", listing.primary_contact_method);
    setValue("website", listing.website_url);
    setValue("city", listing.city);
    setValue("state", listing.state);
    const a11y = document.getElementById("a11y-commit");
    const terms = document.getElementById("terms-commit");
    if (a11y) a11y.checked = true;
    if (terms) terms.checked = true;
  }

  function updateAddBusinessCopy(isAdmin) {
    const heading = document.querySelector("h1");
    const intro = heading?.nextElementSibling;
    const submitBtn = document.querySelector("button[type='submit']");
    if (heading) heading.textContent = isAdmin ? "Edit business listing as admin" : "Edit your business";
    if (intro) intro.textContent = isAdmin
      ? "Update any listing details below. Your admin edits will save directly to the business record."
      : "Update your business information below. Your changes will be saved and sent back for review.";
    if (submitBtn) submitBtn.textContent = isAdmin ? "Save Admin Changes" : "Save Changes";
  }

  async function wireEditForm() {
    if (!window.location.pathname.endsWith("add-business.html")) return;
    const params = new URLSearchParams(window.location.search);
    const listingId = params.get("edit");
    if (!listingId) return;

    const form = document.querySelector("form");
    const user = getUser();
    const isAdmin = user.role === "admin" && params.get("mode") === "admin";
    if (!form) return;

    updateAddBusinessCopy(isAdmin);

    try {
      const out = await api(isAdmin ? `/api/admin/listings/${listingId}` : `/api/owner/listings/${listingId}`);
      fillForm(out.listing);
    } catch (err) {
      setStatus(form, err.message || "Could not load this listing for editing.", true);
      return;
    }

    const replacement = form.cloneNode(true);
    form.parentNode.replaceChild(replacement, form);
    const activeForm = document.querySelector("form");
    fillForm((await api(isAdmin ? `/api/admin/listings/${listingId}` : `/api/owner/listings/${listingId}`)).listing);

    activeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const payload = listingPayloadFromForm();
        await api(isAdmin ? `/api/admin/listings/${listingId}/edit` : `/api/owner/listings/${listingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setStatus(activeForm, isAdmin ? "Listing updated successfully." : "Your listing was updated and sent back for review.", false);
        setTimeout(() => {
          window.location.href = isAdmin ? "admin-dashboard.html" : "owner-dashboard.html";
        }, 800);
      } catch (err) {
        setStatus(activeForm, err.message || "Could not save your changes.", true);
      }
    });
  }

  function enhanceOwnerDashboard() {
    if (!window.location.pathname.endsWith("owner-dashboard.html")) return;
    const user = getUser();
    if (!getToken() || user.role === "admin") return;

    const headerRow = document.querySelector("#owner-listings-body")?.closest("table")?.querySelector("thead tr");
    if (headerRow && !headerRow.querySelector("[data-owner-actions-head]")) {
      const th = document.createElement("th");
      th.textContent = "Actions";
      th.setAttribute("data-owner-actions-head", "1");
      headerRow.appendChild(th);
    }

    api("/api/owner/listings").then((out) => {
      const tbody = document.getElementById("owner-listings-body");
      if (!tbody) return;
      tbody.innerHTML = (out.listings || []).map((l) => `
        <tr>
          <td>${l.business_name || ""}</td>
          <td>${l.category || ""}</td>
          <td>${l.listing_type || ""}</td>
          <td>${l.status || ""}</td>
          <td>${l.is_featured ? `Featured #${l.featured_rank || ""}` : "Not featured"}</td>
          <td>${l.admin_note || "—"}</td>
          <td>${l.last_updated || ""}</td>
          <td><a class="btn" href="add-business.html?edit=${l.id}">Edit</a></td>
        </tr>
      `).join("") || '<tr><td colspan="8">No listings yet.</td></tr>';
    }).catch(() => {});
  }

  function enhanceAdminDashboard() {
    if (!window.location.pathname.endsWith("admin-dashboard.html")) return;
    const observer = new MutationObserver(() => {
      document.querySelectorAll("#admin-listings-body button[data-action]").forEach((btn) => {
        const wrap = btn.closest(".quick-actions");
        const id = btn.getAttribute("data-id");
        if (!wrap || !id || wrap.querySelector(`[data-admin-edit='${id}']`)) return;
        const link = document.createElement("a");
        link.className = "btn";
        link.href = `add-business.html?edit=${id}&mode=admin`;
        link.textContent = "Edit";
        link.setAttribute("data-admin-edit", id);
        wrap.appendChild(link);
      });
    });
    const tbody = document.getElementById("admin-listings-body");
    if (tbody) observer.observe(tbody, { childList: true, subtree: true });
  }

  wireEditForm();
  enhanceOwnerDashboard();
  enhanceAdminDashboard();
})();
