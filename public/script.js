(function () {
  "use strict";

  const TOKEN_KEY = "etib_token";
  const USER_KEY = "etib_user";
  const STATUS_VALUES = ["pending", "approved", "needs_changes", "rejected"];

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function setAuth(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, String(token || ""));
      localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    } catch {}
  }

  function clearAuth() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeWebsiteUrl(value) {
    try {
      const parsed = new URL(String(value || "").trim());
      if (!["http:", "https:"].includes(parsed.protocol)) return "";
      if (parsed.username || parsed.password) return "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function safeRedirectTarget() {
    const value = new URLSearchParams(window.location.search).get("redirect") || "";
    if (!value || value.includes("\\") || value.includes("..")) return "";
    try {
      const target = new URL(value, window.location.href);
      if (target.origin !== window.location.origin) return "";
      const file = target.pathname.split("/").filter(Boolean).pop() || "";
      if (!/^[a-z0-9][a-z0-9._-]*\.html$/i.test(file)) return "";
      return `${file}${target.search}${target.hash}`;
    } catch {
      return "";
    }
  }

  function formatDate(value) {
    if (!value) return "Not available";
    const raw = String(value);
    const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function statusClass(value) {
    return STATUS_VALUES.includes(String(value)) ? String(value) : "pending";
  }

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function getStatusNode(target) {
    if (!target) return null;
    if (target.matches?.("[data-status]")) return target;
    return target.querySelector?.("[data-status]") || null;
  }

  function announce(target, text, isError = false) {
    let node = getStatusNode(target);
    if (!node && target?.appendChild) {
      node = document.createElement("p");
      node.setAttribute("data-status", "true");
      target.appendChild(node);
    }
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("status-error", isError);
    node.classList.toggle("status-success", !isError && Boolean(text));
    node.setAttribute("role", isError ? "alert" : "status");
    node.setAttribute("aria-live", isError ? "assertive" : "polite");
    node.setAttribute("aria-atomic", "true");
  }

  function setFormBusy(form, busy) {
    if (!form) return;
    form.setAttribute("aria-busy", String(Boolean(busy)));
    form.querySelectorAll("button, input, select, textarea").forEach((control) => {
      if (control.dataset.keepEnabled === "true") return;
      control.disabled = Boolean(busy);
    });
  }

  function validateNativeForm(form, message = "Please correct the highlighted field and try again.") {
    form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
    if (form.checkValidity()) return true;
    const invalid = form.querySelector(":invalid");
    invalid?.setAttribute("aria-invalid", "true");
    announce(form, message, true);
    form.reportValidity();
    invalid?.focus();
    return false;
  }

  function syncNavigation() {
    const token = getToken();
    const user = getUser();

    document.querySelectorAll(".site-nav a").forEach((link) => {
      const item = link.closest("li");
      const href = link.getAttribute("href") || "";
      const page = href.split("?")[0].split("#")[0];

      if (page === "add-business.html") {
        link.setAttribute("href", token ? "add-business.html" : "login.html?redirect=add-business.html");
      }
      if (page === "owner-dashboard.html" && item) {
        item.hidden = !(token && user.role !== "admin");
      }
      if (page === "admin-dashboard.html" && item) {
        item.hidden = !(token && user.role === "admin");
      }
      if (page === "signup.html" && item) {
        item.hidden = Boolean(token);
      }
      if (page === "login.html") {
        if (token) {
          link.textContent = "Sign Out";
          link.setAttribute("href", "#sign-out");
          if (link.dataset.logoutWired !== "true") {
            link.dataset.logoutWired = "true";
            link.addEventListener("click", (event) => {
              event.preventDefault();
              clearAuth();
              window.location.assign("index.html");
            });
          }
        } else {
          link.textContent = "Sign In";
          link.setAttribute("href", "login.html");
        }
      }
    });
  }

  function syncCurrentYear() {
    document.querySelectorAll("[data-current-year]").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function protectCurrentPage() {
    const page = window.location.pathname.split("/").pop();
    const token = getToken();
    const user = getUser();

    if (page === "add-business.html" && !token) {
      window.location.replace(`login.html?redirect=${encodeURIComponent(`add-business.html${window.location.search}`)}`);
      return false;
    }
    if (page === "owner-dashboard.html") {
      if (!token) {
        window.location.replace("login.html?redirect=owner-dashboard.html");
        return false;
      }
      if (user.role === "admin") {
        window.location.replace("admin-dashboard.html");
        return false;
      }
    }
    if (page === "admin-dashboard.html") {
      if (!token) {
        window.location.replace("login.html?redirect=admin-dashboard.html");
        return false;
      }
      if (user.role !== "admin") {
        window.location.replace("owner-dashboard.html");
        return false;
      }
    }
    return true;
  }

  function handleProtectedError(error, statusTarget) {
    if (error?.status === 401) {
      clearAuth();
      window.location.replace("login.html");
      return;
    }
    announce(statusTarget, error?.message || "This information could not be loaded.", true);
  }

  function wirePasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.getAttribute("aria-controls") || "");
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide password" : "Show password";
        button.setAttribute("aria-pressed", String(show));
      });
    });
  }

  function wireSignup() {
    const form = document.getElementById("signup-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateNativeForm(form)) return;

      const firstName = document.getElementById("signup-first-name").value.trim();
      const lastName = document.getElementById("signup-last-name").value.trim();
      const phone = document.getElementById("signup-phone").value.trim();
      const email = document.getElementById("signup-email").value.trim();
      const password = document.getElementById("signup-password").value;

      setFormBusy(form, true);
      announce(form, "Creating your account.");
      try {
        const out = await api("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            fullName: `${firstName} ${lastName}`.trim(),
            email,
            phone,
            password
          })
        });
        setAuth(out.token, out.user);
        announce(form, "Account created successfully. Redirecting now.");
        const redirect = safeRedirectTarget();
        window.setTimeout(() => {
          window.location.assign(redirect || (out.user?.role === "admin" ? "admin-dashboard.html" : "owner-dashboard.html"));
        }, 600);
      } catch (error) {
        announce(form, error.message || "Account creation failed.", true);
        setFormBusy(form, false);
      }
    });
  }

  function wireLogin() {
    const form = document.getElementById("login-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateNativeForm(form, "Please enter both your email and password.")) return;

      setFormBusy(form, true);
      announce(form, "Signing you in.");
      try {
        const out = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("login-email").value.trim(),
            password: document.getElementById("login-password").value
          })
        });
        setAuth(out.token, out.user);
        announce(form, "Signed in successfully. Redirecting now.");
        const redirect = safeRedirectTarget();
        window.setTimeout(() => {
          window.location.assign(redirect || (out.user?.role === "admin" ? "admin-dashboard.html" : "owner-dashboard.html"));
        }, 500);
      } catch (error) {
        announce(form, error.message || "Sign in failed.", true);
        setFormBusy(form, false);
        document.getElementById("login-password")?.focus();
      }
    });
  }

  function wireForgotPassword() {
    const form = document.getElementById("forgot-password-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateNativeForm(form, "Please enter a valid account email.")) return;
      setFormBusy(form, true);
      announce(form, "Requesting a secure password reset link.");
      try {
        const out = await api("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: document.getElementById("forgot-email").value.trim() })
        });
        announce(form, out.message || "If that account exists, a reset link has been sent.");
        form.reset();
      } catch (error) {
        announce(form, error.message || "The reset request could not be completed.", true);
      } finally {
        setFormBusy(form, false);
      }
    });
  }

  function wireResetPassword() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) announce(form, "This reset link is missing or invalid. Request a new reset email.", true);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateNativeForm(form)) return;
      const password = document.getElementById("reset-password").value;
      const confirmation = document.getElementById("reset-password-confirm").value;
      if (password !== confirmation) {
        const field = document.getElementById("reset-password-confirm");
        field.setAttribute("aria-invalid", "true");
        announce(form, "The password confirmation does not match.", true);
        field.focus();
        return;
      }
      if (!token) {
        announce(form, "This reset link is missing or invalid. Request a new reset email.", true);
        return;
      }

      setFormBusy(form, true);
      announce(form, "Updating your password.");
      try {
        const out = await api("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password })
        });
        announce(form, out.message || "Your password was updated. Redirecting to sign in.");
        window.setTimeout(() => window.location.assign("login.html"), 900);
      } catch (error) {
        announce(form, error.message || "Your password could not be updated.", true);
        setFormBusy(form, false);
      }
    });
  }

  function listingPayloadFromForm() {
    const value = (id) => document.getElementById(id)?.value?.trim() || "";
    return {
      businessName: value("biz-name"),
      ownerContactName: value("owner-name"),
      businessEmail: value("biz-email"),
      phone: value("biz-phone"),
      textNumber: value("text-number") || null,
      websiteUrl: value("website") || null,
      listingType: value("listing-type"),
      category: value("biz-category"),
      shortSummary: value("short-summary"),
      fullDescription: value("full-description"),
      listenSummary: value("listen-summary") || null,
      supportsBvi: value("support-blind"),
      accessibilityDetails: value("accessibility-details"),
      primaryContactMethod: value("primary-contact"),
      city: value("city"),
      state: value("state"),
      serviceAreaType: value("service-area-type"),
      hours: value("hours"),
      languages: value("languages") || null,
      remoteDetails: value("remote-details") || null,
      inpersonNotes: value("inperson-notes") || null,
      socialLinks: value("social-links") || null,
      certifications: value("certifications") || null,
      testimonial: value("testimonial") || null
    };
  }

  function fillListingForm(listing) {
    const pairs = {
      "biz-name": listing.business_name,
      "owner-name": listing.owner_contact_name,
      "biz-email": listing.business_email,
      "biz-phone": listing.phone,
      "text-number": listing.text_number,
      website: listing.website_url,
      "listing-type": listing.listing_type,
      "biz-category": listing.category,
      "short-summary": listing.short_summary,
      "full-description": listing.full_description,
      "listen-summary": listing.listen_summary,
      "support-blind": listing.supports_bvi,
      "accessibility-details": listing.accessibility_details,
      "primary-contact": listing.primary_contact_method,
      city: listing.city,
      state: listing.state,
      "service-area-type": listing.service_area_type,
      hours: listing.hours,
      languages: listing.languages,
      "remote-details": listing.remote_details,
      "inperson-notes": listing.inperson_notes,
      "social-links": listing.social_links,
      certifications: listing.certifications,
      testimonial: listing.testimonial
    };
    Object.entries(pairs).forEach(([id, value]) => {
      const control = document.getElementById(id);
      if (control) control.value = value || "";
    });
    document.getElementById("a11y-commit").checked = true;
    document.getElementById("terms-commit").checked = true;
  }

  function validateBusinessForm(form) {
    if (!validateNativeForm(form)) return false;
    const payload = listingPayloadFromForm();
    const checks = [
      ["short-summary", payload.shortSummary.length >= 20, "Please write a short summary of at least 20 characters."],
      ["full-description", payload.fullDescription.length >= 40, "Please write a full description of at least 40 characters."],
      ["support-blind", payload.supportsBvi.length >= 20, "Please explain the mission fit in at least 20 characters."],
      ["accessibility-details", payload.accessibilityDetails.length >= 20, "Please provide at least 20 characters about accessibility support."]
    ];
    if (payload.primaryContactMethod === "Text" && !payload.textNumber) {
      checks.push(["text-number", false, "Add a text number or choose a different primary contact method."]);
    }
    if (payload.primaryContactMethod === "Website" && !payload.websiteUrl) {
      checks.push(["website", false, "Add a website or choose a different primary contact method."]);
    }
    const failed = checks.find((entry) => !entry[1]);
    if (!failed) return true;
    const control = document.getElementById(failed[0]);
    control?.setAttribute("aria-invalid", "true");
    announce(form, failed[2], true);
    control?.focus();
    return false;
  }

  async function wireBusinessForm() {
    const form = document.getElementById("business-form");
    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    const listingId = Number(params.get("edit") || 0);
    const user = getUser();
    const isEditing = Number.isInteger(listingId) && listingId > 0;
    const isAdminEdit = isEditing && params.get("mode") === "admin" && user.role === "admin";

    if (params.has("edit") && !isEditing) {
      announce(form, "The listing edit link is invalid.", true);
      return;
    }

    if (isEditing) {
      const heading = document.getElementById("business-form-heading");
      const intro = document.getElementById("business-form-intro");
      const submit = document.getElementById("business-submit");
      if (heading) heading.textContent = isAdminEdit ? "Edit business listing as administrator" : "Edit your business listing";
      if (intro) {
        intro.textContent = isAdminEdit
          ? "Review and update the listing details below. Administrative edits preserve the current moderation status."
          : "Update the details below. Owner changes return the listing to ETIB for review before they appear publicly.";
      }
      if (submit) submit.textContent = isAdminEdit ? "Save Administrative Changes" : "Save Changes for Review";

      setFormBusy(form, true);
      announce(form, "Loading the listing for editing.");
      try {
        const out = await api(isAdminEdit ? `/api/admin/listings/${listingId}` : `/api/owner/listings/${listingId}`);
        fillListingForm(out.listing);
        announce(form, "Listing loaded. You can now make changes.");
      } catch (error) {
        handleProtectedError(error, form);
        return;
      } finally {
        setFormBusy(form, false);
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateBusinessForm(form)) return;
      setFormBusy(form, true);
      announce(form, isEditing ? "Saving your changes." : "Submitting your listing for ETIB review.");

      try {
        const url = isEditing
          ? (isAdminEdit ? `/api/admin/listings/${listingId}/edit` : `/api/owner/listings/${listingId}`)
          : "/api/listings";
        await api(url, {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify(listingPayloadFromForm())
        });
        announce(
          form,
          isAdminEdit
            ? "Listing updated successfully. Returning to the admin dashboard."
            : "Your listing was saved and sent to ETIB for review."
        );
        if (!isEditing) form.reset();
        window.setTimeout(() => {
          window.location.assign(isAdminEdit ? "admin-dashboard.html" : "owner-dashboard.html");
        }, 900);
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
          handleProtectedError(error, form);
          return;
        }
        announce(form, error.message || "The listing could not be saved.", true);
        setFormBusy(form, false);
      }
    });
  }

  function getCardSpeechText(item) {
    return [
      item.business_name ? `Business name: ${item.business_name}.` : "",
      item.category ? `Category: ${item.category}.` : "",
      item.short_summary ? `Summary: ${item.short_summary}.` : ""
    ].filter(Boolean).join(" ");
  }

  function phoneHref(value) {
    return String(value || "").replace(/[^\d+*#,;]/g, "");
  }

  function renderListingActions(item) {
    const name = String(item.business_name || "this business");
    const actions = [];
    if (item.phone) {
      actions.push(`<a href="tel:${escapeHtml(phoneHref(item.phone))}" aria-label="Call ${escapeHtml(name)}">Call</a>`);
    }
    if (item.text_number) {
      actions.push(`<a href="sms:${escapeHtml(phoneHref(item.text_number))}" aria-label="Text ${escapeHtml(name)}">Text</a>`);
    }
    if (item.business_email) {
      actions.push(`<a href="mailto:${escapeHtml(item.business_email)}" aria-label="Email ${escapeHtml(name)}">Email</a>`);
    }
    const website = safeWebsiteUrl(item.website_url);
    if (website) {
      actions.push(`<a href="${escapeHtml(website)}" aria-label="Visit the website for ${escapeHtml(name)}">Website</a>`);
    }
    actions.push(
      `<button type="button" class="speak-summary-btn" data-speech="${escapeHtml(getCardSpeechText(item))}" aria-label="Hear a spoken summary for ${escapeHtml(name)}">Hear Summary</button>`
    );
    return `<div class="quick-actions" aria-label="Contact and listening options for ${escapeHtml(name)}">${actions.join("")}</div>`;
  }

  function renderListingCard(item, featured = false) {
    const id = Number(item.id);
    const name = String(item.business_name || "Business");
    const listingType = String(item.listing_type || "Community listing");
    const badgeClass = listingType.includes("Community") ? "blue" : "gold";
    const place = [item.city, item.state].filter(Boolean).join(", ") || "Remote";
    const rating = item.average_rating
      ? ` • ${escapeHtml(item.average_rating)} stars from ${escapeHtml(item.review_count || 0)} review${Number(item.review_count) === 1 ? "" : "s"}`
      : "";
    const headingId = `${featured ? "featured" : "listing"}-${id}`;

    return `
      <article class="card" aria-labelledby="${headingId}">
        <div class="badge-row">
          ${featured ? `<span class="badge green">Featured placement ${escapeHtml(item.featured_rank)}</span>` : ""}
          ${!featured && item.is_featured ? `<span class="badge green">Featured</span>` : ""}
          <span class="badge ${badgeClass}">${escapeHtml(listingType)}</span>
        </div>
        <h3 id="${headingId}">${escapeHtml(name)}</h3>
        <p class="meta">${escapeHtml(item.category || "Other")} • ${escapeHtml(place)}${rating}</p>
        <p class="summary">${escapeHtml(item.short_summary || "")}</p>
        ${renderListingActions(item)}
        <div class="listing-footer">
          <a class="btn btn-ghost" href="business-profile.html?id=${id}" aria-label="View the full profile for ${escapeHtml(name)}">View Full Profile</a>
        </div>
      </article>
    `;
  }

  function speakText(text, statusNode) {
    if (!("speechSynthesis" in window)) {
      announce(statusNode, "This browser does not support built-in speech playback.", true);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices() || [];
    utterance.voice =
      voices.find((voice) => /en-US/i.test(voice.lang)) ||
      voices.find((voice) => /^en/i.test(voice.lang)) ||
      voices[0] ||
      null;
    utterance.onstart = () => announce(statusNode, "Reading the business summary aloud.");
    utterance.onend = () => announce(statusNode, "Finished reading the business summary.");
    utterance.onerror = () => announce(statusNode, "The spoken summary could not be played.", true);
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech(statusNode) {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    announce(statusNode, "Spoken audio stopped.");
  }

  function wireDirectory() {
    const app = document.querySelector("[data-directory-app]");
    if (!app) return;

    const search = document.getElementById("search");
    const category = document.getElementById("filter-category");
    const listingType = document.getElementById("filter-type");
    const location = document.getElementById("filter-location");
    const contact = document.getElementById("filter-contact");
    const reset = document.getElementById("resetFilters");
    const results = document.getElementById("directoryResults");
    const resultCount = document.getElementById("resultCount");
    const featured = document.getElementById("featuredListings");
    const pagination = document.getElementById("paginationNav");
    const previous = document.getElementById("previousPage");
    const next = document.getElementById("nextPage");
    const pageStatus = document.getElementById("paginationStatus");
    const speechStatus = document.getElementById("directorySpeechStatus");
    const stopAudio = document.getElementById("stopDirectorySpeech");

    let page = 1;
    let totalPages = 1;
    let timer = null;
    let controller = null;
    let requestId = 0;
    let focusCountAfterLoad = false;

    function readFiltersFromUrl() {
      const params = new URLSearchParams(window.location.search);
      search.value = params.get("q") || "";
      category.value = params.get("category") || "";
      listingType.value = params.get("listingType") || "";
      location.value = params.get("location") || "";
      contact.value = params.get("contact") || "";
      page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    }

    function writeFiltersToUrl() {
      const params = new URLSearchParams();
      if (search.value.trim()) params.set("q", search.value.trim());
      if (category.value) params.set("category", category.value);
      if (listingType.value) params.set("listingType", listingType.value);
      if (location.value.trim()) params.set("location", location.value.trim());
      if (contact.value) params.set("contact", contact.value);
      if (page > 1) params.set("page", String(page));
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    }

    function updatePagination() {
      pagination.hidden = totalPages <= 1;
      previous.disabled = page <= 1;
      next.disabled = page >= totalPages;
      pageStatus.textContent = `Page ${page} of ${totalPages}`;
    }

    async function loadListings() {
      writeFiltersToUrl();
      requestId += 1;
      const activeRequest = requestId;
      controller?.abort();
      controller = new AbortController();
      results.setAttribute("aria-busy", "true");
      results.innerHTML = '<div class="panel empty-state"><p>Searching businesses now…</p></div>';
      announce(resultCount, "Searching businesses now.");

      const params = new URLSearchParams({
        q: search.value.trim(),
        category: category.value,
        listingType: listingType.value,
        location: location.value.trim(),
        contact: contact.value,
        page: String(page)
      });

      try {
        const out = await api(`/api/listings?${params}`, {
          method: "GET",
          signal: controller.signal
        });
        if (activeRequest !== requestId) return;
        const rows = out.listings || [];
        const meta = out.pagination || { page: 1, totalPages: 1, total: rows.length, pageSize: 24 };
        page = meta.page;
        totalPages = meta.totalPages;
        results.innerHTML = rows.length
          ? rows.map((item) => renderListingCard(item)).join("")
          : '<div class="panel empty-state"><p>No approved listings match your filters.</p><p>Try clearing one or more filters.</p></div>';
        const start = meta.total ? ((page - 1) * meta.pageSize) + 1 : 0;
        const end = meta.total ? Math.min(page * meta.pageSize, meta.total) : 0;
        announce(
          resultCount,
          meta.total
            ? `Showing listings ${start} through ${end} of ${meta.total}.`
            : "No listings found."
        );
        updatePagination();
        writeFiltersToUrl();
        if (focusCountAfterLoad) {
          resultCount.focus();
          focusCountAfterLoad = false;
        }
      } catch (error) {
        if (error.name === "AbortError" || activeRequest !== requestId) return;
        results.innerHTML = '<div class="panel empty-state"><p>Listings could not be loaded right now.</p><p>Please try again shortly.</p></div>';
        announce(resultCount, "Listings could not be loaded right now.", true);
        pagination.hidden = true;
      } finally {
        if (activeRequest === requestId) results.setAttribute("aria-busy", "false");
      }
    }

    async function loadFeatured() {
      featured.setAttribute("aria-busy", "true");
      try {
        const out = await api("/api/featured-listings");
        const rows = out.listings || [];
        featured.innerHTML = rows.length
          ? rows.map((item) => renderListingCard(item, true)).join("")
          : '<div class="panel empty-state"><p>No featured businesses are selected right now.</p></div>';
      } catch {
        featured.innerHTML = '<div class="panel empty-state"><p>Featured businesses could not be loaded right now.</p></div>';
      } finally {
        featured.setAttribute("aria-busy", "false");
      }
    }

    function scheduleLoad() {
      window.clearTimeout(timer);
      page = 1;
      timer = window.setTimeout(loadListings, 300);
    }

    [search, location].forEach((control) => {
      control.addEventListener("input", scheduleLoad);
      control.addEventListener("change", scheduleLoad);
    });
    [category, listingType, contact].forEach((control) => {
      control.addEventListener("change", () => {
        page = 1;
        loadListings();
      });
    });
    reset.addEventListener("click", () => {
      [search, location].forEach((control) => { control.value = ""; });
      [category, listingType, contact].forEach((control) => { control.value = ""; });
      page = 1;
      loadListings();
      search.focus();
    });
    previous.addEventListener("click", () => {
      if (page <= 1) return;
      page -= 1;
      focusCountAfterLoad = true;
      loadListings();
    });
    next.addEventListener("click", () => {
      if (page >= totalPages) return;
      page += 1;
      focusCountAfterLoad = true;
      loadListings();
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest(".speak-summary-btn");
      if (!button) return;
      speakText(button.dataset.speech || "", speechStatus);
    });
    stopAudio?.addEventListener("click", () => stopSpeech(speechStatus));

    readFiltersFromUrl();
    loadListings();
    loadFeatured();
  }

  function getListingSpeechText(listing) {
    if (listing.listen_summary?.trim()) return listing.listen_summary.trim();
    return [
      listing.business_name ? `Business name: ${listing.business_name}.` : "",
      listing.category ? `Category: ${listing.category}.` : "",
      listing.listing_type ? `Listing type: ${listing.listing_type}.` : "",
      [listing.city, listing.state].filter(Boolean).length ? `Location: ${[listing.city, listing.state].filter(Boolean).join(", ")}.` : "",
      listing.short_summary ? `Summary: ${listing.short_summary}.` : "",
      listing.supports_bvi ? `Support for blind and visually impaired users: ${listing.supports_bvi}.` : "",
      listing.accessibility_details ? `Accessibility details: ${listing.accessibility_details}.` : "",
      listing.primary_contact_method ? `Preferred contact method: ${listing.primary_contact_method}.` : ""
    ].filter(Boolean).join(" ");
  }

  function showProfileError(message) {
    document.title = "Business Not Found | ETIB Directory";
    document.getElementById("profileTitle").textContent = "Business profile unavailable";
    document.getElementById("profileTagline").textContent = message;
    const status = document.getElementById("profileStatus");
    announce(status, message, true);
    document.getElementById("profileArticle").innerHTML =
      `<h2>Business profile unavailable</h2><p>${escapeHtml(message)}</p><p><a class="btn" href="index.html#browse">Return to the directory</a></p>`;
    document.getElementById("profileAside").innerHTML =
      '<h2>Need help?</h2><p><a href="mailto:etib@eventhoughimblind.com">Email ETIB support</a></p>';
  }

  function wireBusinessProfile() {
    if (!window.location.pathname.endsWith("business-profile.html")) return;
    const id = Number(new URLSearchParams(window.location.search).get("id") || 0);
    if (!Number.isInteger(id) || id <= 0) {
      showProfileError("The business link is missing or invalid.");
      return;
    }

    const speechStatus = document.getElementById("speechStatus");
    const reviewForm = document.getElementById("reviewForm");
    let currentListing = null;

    async function loadReviews() {
      const list = document.getElementById("reviewsList");
      const summary = document.getElementById("reviewsSummaryText");
      try {
        const out = await api(`/api/listings/${id}/reviews`);
        const rows = out.reviews || [];
        const count = out.summary?.reviewCount || 0;
        const average = out.summary?.averageRating;
        summary.textContent = count
          ? `${average} out of 5 stars from ${count} review${count === 1 ? "" : "s"}.`
          : "No approved reviews yet.";
        list.innerHTML = rows.length
          ? rows.map((review) => `
              <article class="card" aria-labelledby="review-${Number(review.id)}">
                <h3 id="review-${Number(review.id)}">Review by ${escapeHtml(review.reviewer_name)}</h3>
                <p class="meta">${escapeHtml(review.rating)} out of 5 stars</p>
                <p>${escapeHtml(review.review_text)}</p>
                <p class="small">Posted ${escapeHtml(formatDate(review.created_at))}</p>
              </article>
            `).join("")
          : '<p>No approved reviews yet.</p>';
      } catch {
        list.innerHTML = '<p>Reviews could not be loaded right now.</p>';
        summary.textContent = "Review information is temporarily unavailable.";
      }
    }

    reviewForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateNativeForm(reviewForm)) return;
      const reviewText = document.getElementById("review-text").value.trim();
      if (reviewText.length < 20) {
        const field = document.getElementById("review-text");
        field.setAttribute("aria-invalid", "true");
        announce(reviewForm, "Please write at least 20 characters for your review.", true);
        field.focus();
        return;
      }
      setFormBusy(reviewForm, true);
      announce(reviewForm, "Submitting your review for moderation.");
      try {
        await api(`/api/listings/${id}/reviews`, {
          method: "POST",
          body: JSON.stringify({
            reviewerName: document.getElementById("reviewer-name").value.trim(),
            reviewerEmail: document.getElementById("reviewer-email").value.trim(),
            rating: Number(document.getElementById("review-rating").value),
            reviewText
          })
        });
        reviewForm.reset();
        announce(reviewForm, "Your review was submitted and is pending moderation.");
      } catch (error) {
        announce(reviewForm, error.message || "Your review could not be submitted.", true);
      } finally {
        setFormBusy(reviewForm, false);
      }
    });

    api(`/api/listings/${id}`).then((out) => {
      const listing = out.listing;
      if (!listing) throw new Error("This approved business listing was not found.");
      currentListing = listing;
      document.title = `${listing.business_name} | ETIB Directory`;
      document.getElementById("profileTitle").textContent = listing.business_name;
      document.getElementById("profileTagline").textContent = listing.short_summary || "Trusted business listing";
      announce(document.getElementById("profileStatus"), "Business profile loaded.");

      const listingType = String(listing.listing_type || "Community listing");
      document.getElementById("profileBadges").innerHTML = `
        <span class="badge ${listingType.includes("Community") ? "blue" : "gold"}">${escapeHtml(listingType)}</span>
        ${listing.is_featured ? `<span class="badge green">Featured placement ${escapeHtml(listing.featured_rank)}</span>` : ""}
        ${out.reviewsSummary?.averageRating ? `<span class="badge green">${escapeHtml(out.reviewsSummary.averageRating)} stars</span>` : ""}
      `;

      const detailRows = [
        ["Full description", listing.full_description],
        ["How this business supports blind and visually impaired people", listing.supports_bvi],
        ["Accessibility support details", listing.accessibility_details],
        ["Service area", listing.service_area_type],
        ["Business hours", listing.hours],
        ["Languages", listing.languages],
        ["Remote service details", listing.remote_details],
        ["In-person accessibility notes", listing.inperson_notes],
        ["Certifications", listing.certifications],
        ["Testimonial", listing.testimonial]
      ].filter((entry) => entry[1]);

      document.getElementById("profileArticle").innerHTML = `
        <h2>Business profile</h2>
        <div class="cta-row">
          <button class="btn btn-primary" type="button" id="speakListingBtn">Hear This Listing</button>
          <button class="btn" type="button" id="stopListingBtn">Stop Audio</button>
        </div>
        ${detailRows.map(([heading, value]) => `<h3>${escapeHtml(heading)}</h3><p>${escapeHtml(value)}</p>`).join("")}
      `;

      const website = safeWebsiteUrl(listing.website_url);
      document.getElementById("profileAside").innerHTML = `
        <h2>Direct contact</h2>
        <p>Contact this provider directly using your preferred method.</p>
        <dl class="contact-list">
          <div><dt>Location</dt><dd>${escapeHtml([listing.city, listing.state].filter(Boolean).join(", ") || "Remote")}</dd></div>
          <div><dt>Preferred method</dt><dd>${escapeHtml(listing.primary_contact_method || "Not provided")}</dd></div>
          <div><dt>Phone</dt><dd>${listing.phone ? `<a href="tel:${escapeHtml(phoneHref(listing.phone))}">${escapeHtml(listing.phone)}</a>` : "Not provided"}</dd></div>
          <div><dt>Text</dt><dd>${listing.text_number ? `<a href="sms:${escapeHtml(phoneHref(listing.text_number))}">${escapeHtml(listing.text_number)}</a>` : "Not provided"}</dd></div>
          <div><dt>Email</dt><dd>${listing.business_email ? `<a href="mailto:${escapeHtml(listing.business_email)}">${escapeHtml(listing.business_email)}</a>` : "Not provided"}</dd></div>
          <div><dt>Website</dt><dd>${website ? `<a href="${escapeHtml(website)}">Visit business website</a>` : "Not provided"}</dd></div>
        </dl>
      `;

      document.getElementById("speakListingBtn")?.addEventListener("click", () => {
        speakText(getListingSpeechText(currentListing), speechStatus);
      });
      document.getElementById("stopListingBtn")?.addEventListener("click", () => stopSpeech(speechStatus));
      loadReviews();
    }).catch((error) => {
      showProfileError(error.message || "This approved business listing could not be loaded.");
    });

    window.addEventListener("beforeunload", () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    });
  }

  function wireOwnerDashboard() {
    if (!window.location.pathname.endsWith("owner-dashboard.html")) return;
    const status = document.getElementById("member-dashboard-status");
    const summary = document.getElementById("member-account-summary");
    const body = document.getElementById("owner-listings-body");

    api("/api/owner/listings").then((out) => {
      const owner = out.owner || getUser();
      setAuth(getToken(), owner);
      syncNavigation();
      announce(status, `Welcome ${owner.full_name || "member"}. Your account status is ${owner.status || "pending"}.`);
      summary.innerHTML = `
        <dl class="summary-list">
          <div><dt>Name</dt><dd>${escapeHtml(owner.full_name || "Not available")}</dd></div>
          <div><dt>Email</dt><dd>${escapeHtml(owner.email || "Not available")}</dd></div>
          <div><dt>Account status</dt><dd>${escapeHtml(owner.status || "pending")}</dd></div>
          <div><dt>Listings submitted</dt><dd>${escapeHtml((out.listings || []).length)}</dd></div>
        </dl>
      `;
      body.innerHTML = (out.listings || []).map((listing) => `
        <tr>
          <td>${escapeHtml(listing.business_name)}</td>
          <td>${escapeHtml(listing.category || "")}</td>
          <td>${escapeHtml(listing.listing_type || "")}</td>
          <td><span class="status ${statusClass(listing.status)}">${escapeHtml(String(listing.status || "").replace("_", " "))}</span></td>
          <td>${listing.is_featured ? `Featured placement ${escapeHtml(listing.featured_rank || "")}` : "Not featured"}</td>
          <td>${escapeHtml(listing.admin_note || "No note")}</td>
          <td>${escapeHtml(formatDate(listing.last_updated))}</td>
          <td><a class="btn" href="add-business.html?edit=${Number(listing.id)}" aria-label="Edit ${escapeHtml(listing.business_name)}">Edit</a></td>
        </tr>
      `).join("") || '<tr><td colspan="8">You have not submitted a business listing yet.</td></tr>';
    }).catch((error) => handleProtectedError(error, status));
  }

  function wireAdminDashboard() {
    if (!window.location.pathname.endsWith("admin-dashboard.html")) return;
    const search = document.getElementById("admin-search");
    const statusSelect = document.getElementById("admin-status");
    const dashboardStatus = document.getElementById("admin-dashboard-status");
    const listingsBody = document.getElementById("admin-listings-body");
    const usersBody = document.getElementById("admin-users-body");
    const reviewsBody = document.getElementById("admin-reviews-body");
    const includeHidden = document.getElementById("admin-include-hidden");
    const userSummary = document.getElementById("admin-user-summary");
    const dialog = document.getElementById("adminActionDialog");
    const dialogForm = document.getElementById("adminActionForm");
    const dialogHeading = document.getElementById("adminActionHeading");
    const dialogDescription = document.getElementById("adminActionDescription");
    const noteField = document.getElementById("admin-note-field");
    const note = document.getElementById("admin-action-note");
    const rankField = document.getElementById("admin-rank-field");
    const rank = document.getElementById("admin-feature-rank");
    const hideField = document.getElementById("admin-hide-field");
    const hideAfterReject = document.getElementById("admin-hide-after-reject");
    const confirm = document.getElementById("adminConfirmButton");
    const cancel = document.getElementById("adminCancelButton");
    let pendingAction = null;
    let searchTimer = null;
    let adminController = null;
    let adminRequestId = 0;

    function moderationLabel(value) {
      return String(value || "").replaceAll("_", " ");
    }

    async function loadAdmin() {
      adminRequestId += 1;
      const activeRequest = adminRequestId;
      adminController?.abort();
      adminController = new AbortController();
      const statusMap = {
        "": "",
        pending: "pending",
        approved: "approved",
        needs_changes: "needs_changes",
        rejected: "rejected"
      };
      const query = new URLSearchParams({
        q: search.value.trim(),
        status: statusMap[statusSelect.value] || ""
      });
      announce(dashboardStatus, "Loading the administration dashboard.");
      [listingsBody, usersBody, reviewsBody].forEach((node) => node.closest("table")?.setAttribute("aria-busy", "true"));
      try {
        const [listingsOut, usersOut, reviewsOut] = await Promise.all([
          api(`/api/admin/listings?${query}`, { signal: adminController.signal }),
          api(`/api/admin/users?includeHidden=${includeHidden.checked ? "1" : "0"}`, { signal: adminController.signal }),
          api("/api/admin/reviews", { signal: adminController.signal })
        ]);
        if (activeRequest !== adminRequestId) return;

        listingsBody.innerHTML = (listingsOut.listings || []).map((listing) => `
          <tr>
            <td>${escapeHtml(listing.business_name)}<br><span class="small">${escapeHtml(listing.owner_email || "")}</span></td>
            <td>${escapeHtml(listing.listing_type || "")}</td>
            <td>${escapeHtml(listing.category || "")}</td>
            <td><span class="status ${statusClass(listing.status)}">${escapeHtml(moderationLabel(listing.status))}</span></td>
            <td>${listing.is_featured ? `Placement ${escapeHtml(listing.featured_rank || "")}` : "No"}</td>
            <td>${listing.average_rating ? `${escapeHtml(listing.average_rating)} stars (${escapeHtml(listing.review_count || 0)})` : "No reviews"}</td>
            <td>${escapeHtml(formatDate(listing.last_updated))}</td>
            <td>
              <div class="quick-actions" aria-label="Actions for ${escapeHtml(listing.business_name)}">
                <a class="btn" href="add-business.html?edit=${Number(listing.id)}&amp;mode=admin" aria-label="Edit ${escapeHtml(listing.business_name)}">Edit</a>
                <button class="btn btn-primary" type="button" data-admin-kind="listing-status" data-id="${Number(listing.id)}" data-action="approved" data-label="${escapeHtml(listing.business_name)}" aria-label="Approve ${escapeHtml(listing.business_name)}">Approve</button>
                <button class="btn" type="button" data-admin-kind="listing-status" data-id="${Number(listing.id)}" data-action="needs_changes" data-label="${escapeHtml(listing.business_name)}" aria-label="Request changes for ${escapeHtml(listing.business_name)}">Needs Changes</button>
                <button class="btn btn-danger" type="button" data-admin-kind="listing-status" data-id="${Number(listing.id)}" data-action="rejected" data-label="${escapeHtml(listing.business_name)}" aria-label="Reject ${escapeHtml(listing.business_name)}">Reject</button>
                ${listing.status === "approved" ? `
                  <button class="btn" type="button" data-admin-kind="feature" data-id="${Number(listing.id)}" data-action="set" data-label="${escapeHtml(listing.business_name)}" aria-label="Set featured placement for ${escapeHtml(listing.business_name)}">Set Featured Placement</button>
                  ${listing.is_featured ? `<button class="btn" type="button" data-admin-kind="feature" data-id="${Number(listing.id)}" data-action="remove" data-label="${escapeHtml(listing.business_name)}" aria-label="Remove featured placement for ${escapeHtml(listing.business_name)}">Remove Featured Placement</button>` : ""}
                ` : ""}
              </div>
            </td>
          </tr>
        `).join("") || '<tr><td colspan="8">No matching listing submissions.</td></tr>';

        const summary = usersOut.summary || {};
        userSummary.textContent = `${summary.pending_users || 0} pending, ${summary.approved_users || 0} approved, ${summary.rejected_users || 0} rejected, and ${summary.hidden_users || 0} hidden users.`;
        usersBody.innerHTML = (usersOut.users || []).map((user) => `
          <tr>
            <td>${escapeHtml(user.full_name || "")}</td>
            <td><a href="mailto:${escapeHtml(user.email || "")}">${escapeHtml(user.email || "")}</a></td>
            <td>${escapeHtml(user.phone || "")}</td>
            <td>${escapeHtml(user.role || "owner")}</td>
            <td><span class="status ${statusClass(user.status)}">${escapeHtml(user.status || "")}</span></td>
            <td>${escapeHtml(formatDate(user.created_at))}</td>
            <td>
              ${user.role === "admin" ? "Administrator" : `
                <div class="quick-actions" aria-label="Actions for ${escapeHtml(user.full_name || user.email)}">
                  <button class="btn btn-primary" type="button" data-admin-kind="user-status" data-id="${Number(user.id)}" data-action="approved" data-label="${escapeHtml(user.full_name || user.email)}" aria-label="Approve ${escapeHtml(user.full_name || user.email)}">Approve</button>
                  <button class="btn btn-danger" type="button" data-admin-kind="user-status" data-id="${Number(user.id)}" data-action="rejected" data-label="${escapeHtml(user.full_name || user.email)}" aria-label="Reject ${escapeHtml(user.full_name || user.email)}">Reject</button>
                </div>
              `}
            </td>
          </tr>
        `).join("") || '<tr><td colspan="7">No registered users found.</td></tr>';

        reviewsBody.innerHTML = (reviewsOut.reviews || []).map((review) => `
          <tr>
            <td>${escapeHtml(review.business_name || "")}</td>
            <td>${escapeHtml(review.reviewer_name || "")}<br><span class="small">${escapeHtml(review.reviewer_email || "No email")}</span></td>
            <td>${escapeHtml(review.rating)} out of 5</td>
            <td>${escapeHtml(review.review_text || "")}</td>
            <td><span class="status ${statusClass(review.status)}">${escapeHtml(review.status || "")}</span></td>
            <td>${escapeHtml(formatDate(review.created_at))}</td>
            <td>
              <div class="quick-actions" aria-label="Actions for review by ${escapeHtml(review.reviewer_name || "")}">
                <button class="btn btn-primary" type="button" data-admin-kind="review-status" data-id="${Number(review.id)}" data-action="approved" data-label="review by ${escapeHtml(review.reviewer_name || "")}" aria-label="Approve review by ${escapeHtml(review.reviewer_name || "")}">Approve</button>
                <button class="btn btn-danger" type="button" data-admin-kind="review-status" data-id="${Number(review.id)}" data-action="rejected" data-label="review by ${escapeHtml(review.reviewer_name || "")}" aria-label="Reject review by ${escapeHtml(review.reviewer_name || "")}">Reject</button>
              </div>
            </td>
          </tr>
        `).join("") || '<tr><td colspan="7">No submitted reviews found.</td></tr>';
        announce(dashboardStatus, "Administration dashboard loaded.");
      } catch (error) {
        if (error.name === "AbortError" || activeRequest !== adminRequestId) return;
        handleProtectedError(error, dashboardStatus);
      } finally {
        if (activeRequest === adminRequestId) {
          [listingsBody, usersBody, reviewsBody].forEach((node) => node.closest("table")?.setAttribute("aria-busy", "false"));
        }
      }
    }

    function openActionDialog(button) {
      pendingAction = {
        kind: button.dataset.adminKind,
        id: Number(button.dataset.id),
        action: button.dataset.action,
        label: button.dataset.label || "this record"
      };
      if (!Number.isInteger(pendingAction.id) || pendingAction.id <= 0) return;

      const actionLabel = moderationLabel(pendingAction.action);
      dialogHeading.textContent = "Confirm administrative action";
      dialogDescription.textContent = `You are about to ${actionLabel} ${pendingAction.label}. Review the options below, then confirm or cancel.`;
      note.value = "";
      rank.value = "1";
      hideAfterReject.checked = true;
      noteField.hidden = !["listing-status", "review-status"].includes(pendingAction.kind);
      rankField.hidden = !(pendingAction.kind === "feature" && pendingAction.action === "set");
      hideField.hidden = !(pendingAction.kind === "user-status" && pendingAction.action === "rejected");
      confirm.textContent = `Confirm ${actionLabel}`;
      announce(dialogForm, "");

      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      window.setTimeout(() => dialogHeading.focus(), 0);
    }

    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-admin-kind]");
      if (button) openActionDialog(button);
    });

    cancel.addEventListener("click", () => {
      pendingAction = null;
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });

    dialogForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!pendingAction) return;
      setFormBusy(dialogForm, true);
      announce(dialogForm, "Applying the administrative action.");

      try {
        if (pendingAction.kind === "listing-status") {
          await api(`/api/admin/listings/${pendingAction.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: pendingAction.action, adminNote: note.value.trim() })
          });
        } else if (pendingAction.kind === "review-status") {
          await api(`/api/admin/reviews/${pendingAction.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: pendingAction.action, adminNote: note.value.trim() })
          });
        } else if (pendingAction.kind === "user-status") {
          await api(`/api/admin/users/${pendingAction.id}/status`, {
            method: "PATCH",
            body: JSON.stringify({
              status: pendingAction.action,
              hideAfterReject: pendingAction.action === "rejected" && hideAfterReject.checked ? 1 : 0
            })
          });
        } else if (pendingAction.kind === "feature") {
          await api(`/api/admin/listings/${pendingAction.id}/feature`, {
            method: "PATCH",
            body: JSON.stringify(
              pendingAction.action === "set"
                ? { isFeatured: 1, featuredRank: Number(rank.value) }
                : { isFeatured: 0 }
            )
          });
        }
        const completion = `${pendingAction.label} was updated successfully.`;
        pendingAction = null;
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
        announce(dashboardStatus, completion);
        await loadAdmin();
      } catch (error) {
        announce(dialogForm, error.message || "The administrative action failed.", true);
      } finally {
        setFormBusy(dialogForm, false);
      }
    });

    search.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(loadAdmin, 300);
    });
    statusSelect.addEventListener("change", loadAdmin);
    includeHidden.addEventListener("change", loadAdmin);
    loadAdmin();
  }

  syncCurrentYear();
  syncNavigation();
  if (!protectCurrentPage()) return;
  wirePasswordToggles();
  wireSignup();
  wireLogin();
  wireForgotPassword();
  wireResetPassword();
  wireBusinessForm();
  wireDirectory();
  wireBusinessProfile();
  wireOwnerDashboard();
  wireAdminDashboard();

  window.ETIBAuth = { getUser, clearAuth };
})();
