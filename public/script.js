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
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "{}");
    } catch {
      return {};
    }
  };

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "";
    if (!redirect) return "";
    if (redirect.includes("://")) return "";
    if (redirect.startsWith("/")) return redirect.replace(/^\//, "");
    return redirect;
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

  function announce(form, text, isError = false) {
    let node = form.querySelector("[data-status]");
    if (!node) {
      node = document.createElement("p");
      node.setAttribute("data-status", "1");
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      node.style.marginTop = "10px";
      form.appendChild(node);
    }
    node.textContent = text;
    node.style.color = isError ? "#ffb4b4" : "#9ee3b5";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function syncNav() {
    const token = getToken();
    const user = getUser();
    const nav = document.getElementById("siteNavList");
    if (!nav) return;

    const links = Array.from(nav.querySelectorAll("a"));

    links.forEach((link) => {
      const href = link.getAttribute("href") || "";
      if (href === "add-business.html" || href === "login.html?redirect=add-business.html") {
        link.setAttribute("href", token ? "add-business.html" : "login.html?redirect=add-business.html");
      }
      if (href === "owner-dashboard.html") {
        link.parentElement.style.display = token && user.role !== "admin" ? "" : "none";
      }
      if (href === "admin-dashboard.html") {
        link.parentElement.style.display = token && user.role === "admin" ? "" : "none";
      }
      if (href === "signup.html") {
        link.parentElement.style.display = token ? "none" : "";
      }
      if (href === "login.html") {
        if (token) {
          link.textContent = "Log Out";
          link.setAttribute("href", "#logout");
          link.addEventListener("click", (e) => {
            e.preventDefault();
            clearAuth();
            window.location.href = "index.html";
          }, { once: true });
        } else {
          link.textContent = "Sign In";
          link.setAttribute("href", "login.html");
        }
      }
    });
  }

  syncNav();

  if (window.location.pathname.endsWith("add-business.html")) {
    const token = getToken();
    if (!token) {
      window.location.href = "login.html?redirect=add-business.html";
    }
  }

  const signupForm = document.querySelector("form") && document.getElementById("signup-email") ? document.querySelector("form") : null;
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const firstName = document.getElementById("signup-first-name")?.value?.trim() || "";
      const lastName = document.getElementById("signup-last-name")?.value?.trim() || "";
      const email = document.getElementById("signup-email")?.value?.trim();
      const password = document.getElementById("signup-password")?.value || "";

      let fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) {
        if (email && email.includes("@")) {
          fullName = email.split("@")[0] || "New User";
        } else {
          fullName = "New User";
        }
      }
      const phoneFallback = "0000000000";

      try {
        const out = await api("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({ fullName: fullName, email, phone: phoneFallback, password })
        });
        setAuth(out.token, out.user);
        announce(signupForm, "Account created. Redirecting...");
        setTimeout(() => {
          window.location.href = out.user?.role === "admin" ? "admin-dashboard.html" : "owner-dashboard.html";
        }, 600);
      } catch (err) {
        announce(signupForm, err.message, true);
      }
    });
  }

  const loginForm = document.querySelector("form") && document.getElementById("login-email") ? document.querySelector("form") : null;
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email")?.value?.trim();
      const password = document.getElementById("login-password")?.value || "";
      try {
        const out = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        setAuth(out.token, out.user);
        announce(loginForm, "Signed in. Redirecting...");
        const redirectTarget = getRedirectTarget();
        setTimeout(() => {
          window.location.href = redirectTarget || (out.user?.role === "admin" ? "admin-dashboard.html" : "owner-dashboard.html");
        }, 600);
      } catch (err) {
        announce(loginForm, err.message, true);
      }
    });
  }

  const addForm = document.querySelector("form") && document.getElementById("biz-name") ? document.querySelector("form") : null;
  if (addForm) {
    function validateAddBusinessForm() {
      const requiredIds = [
        "biz-name", "owner-name", "biz-email", "biz-phone", "listing-type",
        "biz-category", "support-blind", "accessibility-details", "primary-contact", "city", "state"
      ];

      for (const id of requiredIds) {
        const el = document.getElementById(id);
        if (!el || !String(el.value || "").trim()) {
          el?.focus();
          return `Please complete: ${id.replace(/-/g, " ")}`;
        }
      }

      const supportText = document.getElementById("support-blind")?.value?.trim() || "";
      if (supportText.length < 20) return "Please explain support details in at least 20 characters.";
      if (!document.getElementById("a11y-commit")?.checked) return "Please confirm mission-alignment checkbox.";
      if (!document.getElementById("terms-commit")?.checked) return "Please accept Terms and Privacy checkbox.";
      return "";
    }

    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const validationError = validateAddBusinessForm();
      if (validationError) return announce(addForm, validationError, true);

      const supportText = document.getElementById("support-blind")?.value?.trim() || "";
      const payload = {
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

      try {
        await api("/api/listings", { method: "POST", body: JSON.stringify(payload) });
        announce(addForm, "Listing submitted for review.");
        addForm.reset();
      } catch (err) {
        if (/Missing token|Invalid token/i.test(err.message)) {
          announce(addForm, "Please sign in first, then submit your listing.", true);
        } else {
          announce(addForm, err.message, true);
        }
      }
    });
  }

  function getCardSpeechText(item) {
    const parts = [
      item.business_name ? `Business name: ${item.business_name}.` : "",
      item.category ? `Category: ${item.category}.` : "",
      item.short_summary ? `Summary: ${item.short_summary}.` : ""
    ];
    return parts.filter(Boolean).join(" ");
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices() || [];
    const englishVoice =
      voices.find((v) => /en-US/i.test(v.lang)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0];

    if (englishVoice) utterance.voice = englishVoice;
    window.speechSynthesis.speak(utterance);
  }

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

    let searchDebounceTimer = null;
    let currentListingsController = null;
    let latestListingsRequestId = 0;

    function setResultsStatus(text, isError = false) {
      if (!resultCount) return;
      resultCount.textContent = text;
      resultCount.setAttribute("role", "status");
      resultCount.setAttribute("aria-live", "polite");
      resultCount.style.color = isError ? "#ffb4b4" : "";
    }

    function setLoadingState() {
      if (resultsWrap) {
        resultsWrap.innerHTML = `<div class="panel" style="padding:14px"><p role="status">Searching businesses now…</p></div>`;
      }
      setResultsStatus("Searching businesses now…");
    }

    function applyFiltersFromUrl() {
      const params = new URLSearchParams(window.location.search);
      if (searchInput) searchInput.value = params.get("q") || "";
      if (categorySelect) categorySelect.value = params.get("category") || "";
      if (typeSelect) typeSelect.value = params.get("listingType") || "";
      if (locationInput) locationInput.value = params.get("location") || "";
      if (contactSelect) contactSelect.value = params.get("contact") || "";
    }

    function syncFiltersToUrl() {
      const params = new URLSearchParams();
      if (searchInput?.value?.trim()) params.set("q", searchInput.value.trim());
      if (categorySelect?.value) params.set("category", categorySelect.value);
      if (typeSelect?.value) params.set("listingType", typeSelect.value);
      if (locationInput?.value?.trim()) params.set("location", locationInput.value.trim());
      if (contactSelect?.value) params.set("contact", contactSelect.value.toLowerCase());
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    }

    function renderQuickActions(item) {
      const actions = [];
      if (item.phone) actions.push(`<a href="tel:${escapeHtml(item.phone)}">Call</a>`);
      if (item.text_number) actions.push(`<a href="sms:${escapeHtml(item.text_number)}">Text</a>`);
      if (item.business_email) actions.push(`<a href="mailto:${escapeHtml(item.business_email)}">Email</a>`);
      if (item.website_url) actions.push(`<a href="${escapeHtml(item.website_url)}" target="_blank" rel="noopener">Website</a>`);
      const speechText = escapeHtml(getCardSpeechText(item));
      actions.push(`<button type="button" class="speak-summary-btn" data-speech="${speechText}">Hear Summary</button>`);
      return actions.length ? `<div class="quick-actions">${actions.join("")}</div>` : "";
    }

    function renderCard(item) {
      const badges = [item.listing_type].filter(Boolean).map((t) => {
        const cls = t.includes("Community") ? "blue" : "gold";
        return `<span class="badge ${cls}">${escapeHtml(t)}</span>`;
      }).join("");

      const place = `${item.city || ""}${item.state ? ", " + item.state : ""}` || "Remote";
      const ratingMeta = item.average_rating
        ? `<p class="meta">${escapeHtml(item.category || "Other")} • ${escapeHtml(place)} • ${escapeHtml(item.average_rating)} stars from ${escapeHtml(item.review_count || 0)} reviews</p>`
        : `<p class="meta">${escapeHtml(item.category || "Other")} • ${escapeHtml(place)}</p>`;

      return `
        <article class="card" aria-labelledby="listing-${item.id}">
          <div class="badge-row">${badges}${item.is_featured ? `<span class="badge green">Featured</span>` : ""}</div>
          <h3 id="listing-${item.id}">${escapeHtml(item.business_name)}</h3>
          ${ratingMeta}
          <p class="summary">${escapeHtml(item.short_summary || "")}</p>
          ${renderQuickActions(item)}
          <div class="listing-footer">
            <a class="btn btn-ghost" href="business-profile.html?id=${item.id}">View Full Profile</a>
          </div>
        </article>
      `;
    }

    function renderFeaturedCard(item) {
      const badges = [item.listing_type].filter(Boolean).map((t) => {
        const cls = t.includes("Community") ? "blue" : "gold";
        return `<span class="badge ${cls}">${escapeHtml(t)}</span>`;
      }).join("");

      const place = `${item.city || ""}${item.state ? ", " + item.state : ""}` || "Remote";
      return `
        <article class="card" aria-labelledby="featured-${item.id}">
          <div class="badge-row">
            <span class="badge green">Featured #${escapeHtml(item.featured_rank)}</span>
            ${badges}
          </div>
          <h3 id="featured-${item.id}">${escapeHtml(item.business_name)}</h3>
          <p class="meta">${escapeHtml(item.category || "Other")} • ${escapeHtml(place)}</p>
          <p class="summary">${escapeHtml(item.short_summary || "")}</p>
          ${renderQuickActions(item)}
          <div class="listing-footer">
            <a class="btn btn-ghost" href="business-profile.html?id=${item.id}">View Full Profile</a>
          </div>
        </article>
      `;
    }

    async function loadFeaturedListings() {
      const featuredWrap = document.getElementById("featuredListings");
      if (!featuredWrap) return;

      try {
        const out = await api("/api/featured-listings", { method: "GET", headers: {} });
        const rows = out.listings || [];
        featuredWrap.innerHTML = rows.length
          ? rows.map(renderFeaturedCard).join("")
          : `<div class="panel" style="padding:14px;"><p role="status">No featured businesses selected right now.</p></div>`;
      } catch {
        featuredWrap.innerHTML = `<div class="panel" style="padding:14px;"><p role="status">Could not load featured businesses right now.</p></div>`;
      }
    }

    async function applyFilters() {
      syncFiltersToUrl();
      latestListingsRequestId += 1;
      const requestId = latestListingsRequestId;

      if (currentListingsController) {
        currentListingsController.abort();
      }
      currentListingsController = new AbortController();

      setLoadingState();

      const q = encodeURIComponent(searchInput?.value?.trim() || "");
      const category = encodeURIComponent(categorySelect?.value || "");
      const listingType = encodeURIComponent(typeSelect?.value || "");
      const location = encodeURIComponent(locationInput?.value?.trim() || "");
      const contact = encodeURIComponent((contactSelect?.value || "").toLowerCase());
      const url = `/api/listings?q=${q}&category=${category}&listingType=${listingType}&location=${location}&contact=${contact}`;

      try {
        const out = await api(url, {
          method: "GET",
          headers: {},
          signal: currentListingsController.signal
        });
        if (requestId !== latestListingsRequestId) return;

        const rows = out.listings || [];
        resultsWrap.innerHTML = rows.length
          ? rows.map(renderCard).join("")
          : `<div class="panel" style="padding:14px"><p role="status">No listings match your filters yet.</p></div>`;

        setResultsStatus(`${rows.length} listing${rows.length === 1 ? "" : "s"} found`);
      } catch (err) {
        if (err.name === "AbortError") return;
        if (requestId !== latestListingsRequestId) return;
        resultsWrap.innerHTML = `<div class="panel" style="padding:14px"><p role="status">Could not load listings right now.</p></div>`;
        setResultsStatus("Could not load listings right now.", true);
      }
    }

    function scheduleApplyFilters() {
      window.clearTimeout(searchDebounceTimer);
      searchDebounceTimer = window.setTimeout(() => {
        applyFilters();
      }, 300);
    }

    [categorySelect, typeSelect, contactSelect].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", applyFilters);
    });

    [searchInput, locationInput].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", scheduleApplyFilters);
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

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".speak-summary-btn");
      if (!btn) return;
      const text = btn.getAttribute("data-speech") || "";
      if (text) speakText(text);
    });

    applyFiltersFromUrl();
    applyFilters();
    loadFeaturedListings();
  }

  if (window.location.pathname.endsWith("business-profile.html")) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    let currentListing = null;

    function stopSpeech() {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      const status = document.getElementById("speechStatus");
      if (status) status.textContent = "Audio stopped.";
    }

    function getListingSpeechText(listing) {
      if (!listing) return "";
      if (listing.listen_summary && String(listing.listen_summary).trim()) {
        return String(listing.listen_summary).trim();
      }

      const location = [listing.city, listing.state].filter(Boolean).join(", ");
      const parts = [
        listing.business_name ? `Business name: ${listing.business_name}.` : "",
        listing.category ? `Category: ${listing.category}.` : "",
        listing.listing_type ? `Listing type: ${listing.listing_type}.` : "",
        location ? `Location: ${location}.` : "",
        listing.short_summary ? `Summary: ${listing.short_summary}.` : "",
        listing.supports_bvi ? `Support for blind and visually impaired users: ${listing.supports_bvi}.` : "",
        listing.accessibility_details ? `Accessibility details: ${listing.accessibility_details}.` : "",
        listing.primary_contact_method ? `Preferred contact method: ${listing.primary_contact_method}.` : "",
        listing.phone ? `Phone: ${listing.phone}.` : "",
        listing.business_email ? `Email: ${listing.business_email}.` : "",
        listing.website_url ? "Website available." : ""
      ];

      return parts.filter(Boolean).join(" ");
    }

    function speakListing(listing) {
      if (!("speechSynthesis" in window)) {
        const status = document.getElementById("speechStatus");
        if (status) status.textContent = "This browser does not support built-in speech playback.";
        return;
      }

      stopSpeech();
      const text = getListingSpeechText(listing);
      if (!text) {
        const status = document.getElementById("speechStatus");
        if (status) status.textContent = "No listening summary is available for this listing.";
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices() || [];
      const englishVoice =
        voices.find((v) => /en-US/i.test(v.lang)) ||
        voices.find((v) => /^en/i.test(v.lang)) ||
        voices[0];

      if (englishVoice) utterance.voice = englishVoice;

      utterance.onstart = () => {
        const status = document.getElementById("speechStatus");
        if (status) status.textContent = "Reading listing aloud.";
      };
      utterance.onend = () => {
        const status = document.getElementById("speechStatus");
        if (status) status.textContent = "Finished reading listing.";
      };
      utterance.onerror = () => {
        const status = document.getElementById("speechStatus");
        if (status) status.textContent = "Could not play listing audio.";
      };

      window.speechSynthesis.speak(utterance);
    }

    async function loadReviews(listingId) {
      const reviewsList = document.getElementById("reviewsList");
      const summaryText = document.getElementById("reviewsSummaryText");
      if (!reviewsList || !summaryText) return;

      try {
        const out = await api(`/api/listings/${listingId}/reviews`, { method: "GET", headers: {} });
        const rows = out.reviews || [];
        const reviewCount = out.summary?.reviewCount || 0;
        const averageRating = out.summary?.averageRating;

        summaryText.textContent = reviewCount
          ? `${averageRating} out of 5 stars from ${reviewCount} review${reviewCount === 1 ? "" : "s"}.`
          : "No reviews yet.";

        reviewsList.innerHTML = rows.length
          ? rows.map((r) => `
              <article class="card" aria-label="Review by ${escapeHtml(r.reviewer_name)}">
                <h3>${escapeHtml(r.reviewer_name)}</h3>
                <p class="meta">${escapeHtml(r.rating)} out of 5 stars</p>
                <p>${escapeHtml(r.review_text)}</p>
                <p class="small">Posted ${escapeHtml(r.created_at || "")}</p>
              </article>
            `).join("")
          : `<p class="small">No approved reviews yet.</p>`;
      } catch {
        reviewsList.innerHTML = `<p class="small">Could not load reviews right now.</p>`;
      }
    }

    if (id) {
      api(`/api/listings/${id}`).then((out) => {
        const l = out.listing;
        if (!l) return;
        currentListing = l;

        const h1 = document.getElementById("profileTitle");
        if (h1) h1.textContent = l.business_name;

        const tagline = document.getElementById("profileTagline");
        if (tagline) tagline.textContent = l.short_summary || "Trusted business listing";

        const badgesWrap = document.getElementById("profileBadges");
        if (badgesWrap) {
          badgesWrap.innerHTML = `
            <span class="badge ${String(l.listing_type).includes("Community") ? "blue" : "gold"}">${escapeHtml(l.listing_type || "Listing")}</span>
            ${l.is_featured ? `<span class="badge green">Featured #${escapeHtml(l.featured_rank)}</span>` : ""}
            ${out.reviewsSummary?.averageRating ? `<span class="badge green">${escapeHtml(out.reviewsSummary.averageRating)} stars</span>` : ""}
          `;
        }

        const article = document.getElementById("profileArticle");
        if (article) {
          article.innerHTML = `
            <h2>Business profile</h2>
            <div class="cta-row" style="margin-bottom:12px;">
              <button class="btn btn-primary" type="button" id="speakListingBtn">Hear this listing</button>
              <button class="btn" type="button" id="stopListingBtn">Stop audio</button>
            </div>
            <p id="speechStatus" class="small" role="status" aria-live="polite"></p>

            <p><strong>Mission fit:</strong> This listing qualifies as a ${escapeHtml(l.listing_type || "community listing")} because it provides support relevant to blind and visually impaired users.</p>

            <h3>How this business supports the blind and visually impaired community</h3>
            <p>${escapeHtml(l.supports_bvi || "Not provided.")}</p>

            <h3>Accessibility support details</h3>
            <p>${escapeHtml(l.accessibility_details || "Not provided.")}</p>

            ${l.listen_summary ? `
              <h3>Spoken summary</h3>
              <p>${escapeHtml(l.listen_summary)}</p>
            ` : ""}
          `;
        }

        const aside = document.getElementById("profileAside");
        if (aside) {
          aside.innerHTML = `
            <h2>Direct contact</h2>
            <p class="small">Contact this provider directly using your preferred method.</p>
            <p><strong>Phone:</strong> ${l.phone ? `<a href="tel:${escapeHtml(l.phone)}">${escapeHtml(l.phone)}</a>` : "Not provided"}</p>
            <p><strong>Text:</strong> ${l.text_number ? `<a href="sms:${escapeHtml(l.text_number)}">${escapeHtml(l.text_number)}</a>` : "Not provided"}</p>
            <p><strong>Email:</strong> ${l.business_email ? `<a href="mailto:${escapeHtml(l.business_email)}">${escapeHtml(l.business_email)}</a>` : "Not provided"}</p>
            <p><strong>Website:</strong> ${l.website_url ? `<a href="${escapeHtml(l.website_url)}" target="_blank" rel="noopener">Visit website</a>` : "Not provided"}</p>
          `;
        }

        const summaryText = document.getElementById("reviewsSummaryText");
        if (summaryText) {
          const count = out.reviewsSummary?.reviewCount || 0;
          const avg = out.reviewsSummary?.averageRating;
          summaryText.textContent = count
            ? `${avg} out of 5 stars from ${count} review${count === 1 ? "" : "s"}.`
            : "No reviews yet.";
        }

        loadReviews(id);

        setTimeout(() => {
          const speakBtn = document.getElementById("speakListingBtn");
          const stopBtn = document.getElementById("stopListingBtn");

          if (speakBtn) speakBtn.addEventListener("click", () => speakListing(currentListing));
          if (stopBtn) stopBtn.addEventListener("click", stopSpeech);
        }, 0);

        const reviewForm = document.getElementById("reviewForm");
        if (reviewForm) {
          reviewForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const reviewerName = document.getElementById("reviewer-name")?.value?.trim();
            const reviewerEmail = document.getElementById("reviewer-email")?.value?.trim() || "";
            const rating = document.getElementById("review-rating")?.value;
            const reviewText = document.getElementById("review-text")?.value?.trim();
            const statusNode = document.getElementById("reviewFormStatus");

            if (!reviewerName || reviewerName.length < 2) {
              if (statusNode) statusNode.textContent = "Please enter your name.";
              return;
            }
            if (!rating) {
              if (statusNode) statusNode.textContent = "Please choose a rating.";
              return;
            }
            if (!reviewText || reviewText.length < 20) {
              if (statusNode) statusNode.textContent = "Please enter at least 20 characters for your review.";
              return;
            }

            try {
              await api(`/api/listings/${id}/reviews`, {
                method: "POST",
                body: JSON.stringify({
                  reviewerName,
                  reviewerEmail,
                  rating: Number(rating),
                  reviewText
                })
              });

              reviewForm.reset();
              if (statusNode) {
                statusNode.textContent = "Your review was submitted and is pending moderation.";
              }
            } catch (err) {
              if (statusNode) statusNode.textContent = err.message || "Could not submit review.";
            }
          });
        }
      }).catch(() => {});
    }

    window.addEventListener("beforeunload", () => {
      stopSpeech();
    });
  }

  if (window.location.pathname.endsWith("owner-dashboard.html")) {
    const token = getToken();
    if (!token) return void (window.location.href = "login.html");
    const user = getUser();
    if (user.role === "admin") return;

    api("/api/owner/listings").then((out) => {
      const tbody = document.getElementById("owner-listings-body");
      if (!tbody) return;
      tbody.innerHTML = (out.listings || []).map((l) => `
        <tr>
          <td>${escapeHtml(l.business_name)}</td>
          <td>${escapeHtml(l.category || "")}</td>
          <td>${escapeHtml(l.listing_type || "")}</td>
          <td><span class="status ${escapeHtml(l.status)}">${escapeHtml(l.status)}</span></td>
          <td>${l.is_featured ? `Featured #${escapeHtml(l.featured_rank || "")}` : "Not featured"}</td>
          <td>${escapeHtml(l.admin_note || "—")}</td>
          <td>${escapeHtml(l.last_updated || "")}</td>
        </tr>
      `).join("") || '<tr><td colspan="7">No listings yet.</td></tr>';
    }).catch(() => {});
  }

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
        Pending: "pending",
        Approved: "approved",
        "Needs changes": "needs_changes",
        Rejected: "rejected"
      };
      const status = encodeURIComponent(statusMap[statusRaw] || "");

      const [listingsOut, usersOut, reviewsOut] = await Promise.all([
        api(`/api/admin/listings?status=${status}&q=${q}`),
        api("/api/admin/users"),
        api("/api/admin/reviews")
      ]);

      const listingsBody = document.getElementById("admin-listings-body");
      if (listingsBody) {
        listingsBody.innerHTML = (listingsOut.listings || []).map((l) => `
          <tr>
            <td>${escapeHtml(l.business_name)}<br><small>${escapeHtml(l.owner_email || "")}</small></td>
            <td>${escapeHtml(l.listing_type || "")}</td>
            <td>${escapeHtml(l.category || "")}</td>
            <td><span class="status ${escapeHtml(l.status)}">${escapeHtml(l.status)}</span></td>
            <td>${l.is_featured ? `Featured #${escapeHtml(l.featured_rank || "—")}` : "Not featured"}</td>
            <td>${l.average_rating ? `${escapeHtml(l.average_rating)} stars (${escapeHtml(l.review_count || 0)})` : "No reviews"}</td>
            <td>${escapeHtml(l.last_updated || "")}</td>
            <td>
              <div class="quick-actions">
                <button class="btn btn-primary" data-action="approved" data-id="${l.id}">Approve</button>
                <button class="btn" data-action="needs_changes" data-id="${l.id}">Needs Changes</button>
                <button class="btn btn-danger" data-action="rejected" data-id="${l.id}">Reject</button>
                ${l.status === "approved" ? `
                  <button class="btn" data-feature-toggle="1" data-id="${l.id}">Feature</button>
                  <button class="btn" data-feature-remove="1" data-id="${l.id}">Remove Feature</button>
                ` : ""}
              </div>
            </td>
          </tr>
        `).join("") || '<tr><td colspan="8">No matching submissions.</td></tr>';
      }

      const usersBody = document.getElementById("admin-users-body");
      if (usersBody) {
        usersBody.innerHTML = (usersOut.users || []).map((u) => `
          <tr>
            <td>${escapeHtml(u.full_name || "")}</td>
            <td>${escapeHtml(u.email || "")}</td>
            <td>${escapeHtml(u.phone || "")}</td>
            <td>${escapeHtml(u.role || "owner")}</td>
            <td>${escapeHtml(u.created_at || "")}</td>
          </tr>
        `).join("") || '<tr><td colspan="5">No users found.</td></tr>';
      }

      const reviewsBody = document.getElementById("admin-reviews-body");
      if (reviewsBody) {
        reviewsBody.innerHTML = (reviewsOut.reviews || []).map((r) => `
          <tr>
            <td>${escapeHtml(r.business_name || "")}</td>
            <td>${escapeHtml(r.reviewer_name || "")}<br><small>${escapeHtml(r.reviewer_email || "")}</small></td>
            <td>${escapeHtml(r.rating)} / 5</td>
            <td>${escapeHtml(r.review_text || "")}</td>
            <td>${escapeHtml(r.status)}</td>
            <td>${escapeHtml(r.created_at || "")}</td>
            <td>
              <div class="quick-actions">
                <button class="btn btn-primary" data-review-action="approved" data-review-id="${r.id}">Approve</button>
                <button class="btn btn-danger" data-review-action="rejected" data-review-id="${r.id}">Reject</button>
              </div>
            </td>
          </tr>
        `).join("") || '<tr><td colspan="7">No reviews found.</td></tr>';
      }
    }

    document.addEventListener("click", async (e) => {
      const featureBtn = e.target.closest("button[data-feature-toggle]");
      if (featureBtn) {
        const id = featureBtn.getAttribute("data-id");
        const rankInput = prompt("Enter featured rank from 1 to 5:");
        const rank = Number(rankInput);
        if (!Number.isInteger(rank) || rank < 1 || rank > 5) {
          alert("Featured rank must be a number from 1 to 5.");
          return;
        }

        try {
          await api(`/api/admin/listings/${id}/feature`, {
            method: "PATCH",
            body: JSON.stringify({ isFeatured: 1, featuredRank: rank })
          });
          await loadAdmin();
        } catch (err) {
          alert(err.message || "Could not set featured placement");
        }
        return;
      }

      const removeFeatureBtn = e.target.closest("button[data-feature-remove]");
      if (removeFeatureBtn) {
        const id = removeFeatureBtn.getAttribute("data-id");
        try {
          await api(`/api/admin/listings/${id}/feature`, {
            method: "PATCH",
            body: JSON.stringify({ isFeatured: 0 })
          });
          await loadAdmin();
        } catch (err) {
          alert(err.message || "Could not remove featured placement");
        }
        return;
      }

      const reviewBtn = e.target.closest("button[data-review-action]");
      if (reviewBtn) {
        const id = reviewBtn.getAttribute("data-review-id");
        const action = reviewBtn.getAttribute("data-review-action");
        const adminNote = prompt("Optional admin note:") || "";

        try {
          await api(`/api/admin/reviews/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: action, adminNote })
          });
          await loadAdmin();
        } catch (err) {
          alert(err.message || "Review update failed");
        }
        return;
      }

      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      const adminNote = prompt("Optional admin note (sent to owner):") || "";

      try {
        const out = await api(`/api/admin/listings/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: action, adminNote })
        });

        if (out && out.emailSent === false && action === "approved") {
          alert("The business was approved, but the approval email did not send. Check SMTP settings.");
        }

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
