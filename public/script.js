(() => {
  "use strict";

  const apiRoot = "/api";
  const speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeWebsiteUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return String(value || "");
  }

  function phoneHref(value) {
    const normalized = String(value || "").replace(/[^\d+]/g, "");
    return normalized ? normalized : null;
  }

  function formatDate(value) {
    if (!value) return "Not provided";
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.valueOf())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function locationLabel(location) {
    return [location?.city, location?.region, location?.country].filter(Boolean).join(", ");
  }

  async function api(path, { signal } = {}) {
    const response = await fetch(`${apiRoot}${path}`, {
      headers: { Accept: "application/json" },
      signal
    });
    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok) {
      throw new Error(body.error || "The directory could not complete this request.");
    }
    return body;
  }

  function contactActionLinks(business, { includeLabels = false } = {}) {
    const links = [];
    const contact = business.contact || {};
    const name = business.name || "this business";
    const phone = phoneHref(contact.phone);
    const text = phoneHref(contact.text);
    const website = safeWebsiteUrl(contact.website);

    if (phone) {
      links.push(`<a class="btn btn-primary" href="tel:${escapeHtml(phone)}" aria-label="Call ${escapeHtml(name)}">${includeLabels ? `Call: ${escapeHtml(formatPhone(contact.phone))}` : "Call"}</a>`);
    }
    if (text) {
      links.push(`<a class="btn" href="sms:${escapeHtml(text)}" aria-label="Text ${escapeHtml(name)}">${includeLabels ? `Text: ${escapeHtml(formatPhone(contact.text))}` : "Text"}</a>`);
    }
    if (contact.email) {
      links.push(`<a class="btn" href="mailto:${escapeHtml(contact.email)}" aria-label="Email ${escapeHtml(name)}">${includeLabels ? `Email: ${escapeHtml(contact.email)}` : "Email"}</a>`);
    }
    if (website) {
      links.push(`<a class="btn" href="${escapeHtml(website)}" aria-label="Visit the ${escapeHtml(name)} website">${includeLabels ? "Visit website" : "Website"}</a>`);
    }
    return links.join("");
  }

  function statusMessage(node, message, isError = false) {
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("error-text", isError);
  }

  function startSpeech(text, label, statusNode, stopButton) {
    if (!speechSupported) {
      statusMessage(statusNode, "Spoken playback is not supported by this browser.", true);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {
      statusMessage(statusNode, `Speaking ${label}.`);
      if (stopButton) stopButton.hidden = false;
    };
    const finish = () => {
      statusMessage(statusNode, "");
      if (stopButton) stopButton.hidden = true;
    };
    utterance.onend = finish;
    utterance.onerror = () => {
      statusMessage(statusNode, "Spoken playback stopped before the listing finished.", true);
      if (stopButton) stopButton.hidden = true;
    };
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech(statusNode, stopButton) {
    if (speechSupported) window.speechSynthesis.cancel();
    statusMessage(statusNode, "Spoken playback stopped.");
    if (stopButton) stopButton.hidden = true;
  }

  function listingCard(business) {
    const categories = business.categories.map((item) => `<span class="badge">${escapeHtml(item)}</span>`).join("");
    const featured = business.featured?.enabled ? '<span class="badge featured-badge">Featured</span>' : "";
    const remote = business.location?.remoteAvailable ? '<span class="badge">Remote available</span>' : "";
    const services = (business.services || []).slice(0, 5)
      .map((service) => `<li>${escapeHtml(service)}</li>`)
      .join("");
    const speakButton = speechSupported
      ? `<button class="btn" type="button" data-speak-business="${escapeHtml(business.id)}" aria-label="Hear the listing for ${escapeHtml(business.name)}">Hear this listing</button>`
      : "";
    const place = locationLabel(business.location) || "Location not specified";

    return `
      <article class="card listing-card" aria-labelledby="business-${escapeHtml(business.id)}">
        <div class="badge-row">${featured}${categories}${remote}</div>
        <h3 id="business-${escapeHtml(business.id)}">${escapeHtml(business.name)}</h3>
        <p class="meta">${escapeHtml(business.listingType)}</p>
        <p>${escapeHtml(business.summary)}</p>
        <dl class="card-facts">
          <div><dt>Location</dt><dd>${escapeHtml(place)}</dd></div>
          <div><dt>Service area</dt><dd>${escapeHtml(business.location?.serviceArea || "Not specified")}</dd></div>
          <div><dt>Preferred contact</dt><dd>${escapeHtml(business.contact?.preferredMethod || "Not specified")}</dd></div>
        </dl>
        <div>
          <h4>Services</h4>
          <ul class="service-list">${services}</ul>
        </div>
        <div class="card-actions">
          <a class="btn btn-primary" href="business-profile.html?business=${encodeURIComponent(business.id)}">View full profile</a>
          ${speakButton}
          ${contactActionLinks(business)}
        </div>
        <p class="verification-note">Information verified ${escapeHtml(formatDate(business.lastVerified))}.</p>
      </article>
    `;
  }

  function populateSelect(select, values, labelForValue = (value) => value) {
    if (!select) return;
    const selected = select.value;
    for (const value of values) {
      const optionValue = typeof value === "string" ? value : value.value;
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = labelForValue(value);
      select.append(option);
    }
    select.value = selected;
  }

  function initializeDirectory() {
    const root = document.querySelector("[data-directory-app]");
    if (!root) return;

    const form = document.getElementById("directorySearchForm");
    const queryField = document.getElementById("search");
    const categoryField = document.getElementById("filter-category");
    const typeField = document.getElementById("filter-type");
    const locationField = document.getElementById("filter-location");
    const contactField = document.getElementById("filter-contact");
    const resetButton = document.getElementById("resetFilters");
    const results = document.getElementById("directoryResults");
    const resultCount = document.getElementById("resultCount");
    const catalogSummary = document.getElementById("catalogSummary");
    const pagination = document.getElementById("paginationNav");
    const paginationStatus = document.getElementById("paginationStatus");
    const previousButton = document.getElementById("previousPage");
    const nextButton = document.getElementById("nextPage");
    const speechStatus = document.getElementById("directorySpeechStatus");
    const stopSpeechButton = document.getElementById("stopDirectorySpeech");
    const spokenListings = new Map();
    let currentPage = 1;
    let searchController;

    const initialParameters = new URLSearchParams(window.location.search);
    queryField.value = initialParameters.get("q") || "";
    categoryField.dataset.initialValue = initialParameters.get("category") || "";
    typeField.dataset.initialValue = initialParameters.get("listingType") || "";
    locationField.value = initialParameters.get("location") || "";
    contactField.dataset.initialValue = initialParameters.get("contactMethod") || "";
    currentPage = Math.max(1, Number.parseInt(initialParameters.get("page") || "1", 10) || 1);

    function updateAddressBar() {
      const parameters = new URLSearchParams();
      if (queryField.value.trim()) parameters.set("q", queryField.value.trim());
      if (categoryField.value) parameters.set("category", categoryField.value);
      if (typeField.value) parameters.set("listingType", typeField.value);
      if (locationField.value.trim()) parameters.set("location", locationField.value.trim());
      if (contactField.value) parameters.set("contactMethod", contactField.value);
      if (currentPage > 1) parameters.set("page", String(currentPage));
      const search = parameters.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }

    async function loadResults({ focusStatus = false } = {}) {
      if (searchController) searchController.abort();
      const controller = new AbortController();
      searchController = controller;
      results.setAttribute("aria-busy", "true");
      results.innerHTML = '<div class="panel empty-state"><p>Searching verified businesses.</p></div>';
      statusMessage(resultCount, "Searching verified businesses.");

      const parameters = new URLSearchParams({
        page: String(currentPage),
        pageSize: "24"
      });
      if (queryField.value.trim()) parameters.set("q", queryField.value.trim());
      if (categoryField.value) parameters.set("category", categoryField.value);
      if (typeField.value) parameters.set("listingType", typeField.value);
      if (locationField.value.trim()) parameters.set("location", locationField.value.trim());
      if (contactField.value) parameters.set("contactMethod", contactField.value);

      try {
        const output = await api(`/listings?${parameters.toString()}`, { signal: controller.signal });
        const listings = output.listings || [];
        currentPage = output.pagination.page;
        spokenListings.clear();
        listings.forEach((business) => spokenListings.set(business.id, business));
        results.innerHTML = listings.length
          ? listings.map(listingCard).join("")
          : `
            <div class="panel empty-state">
              <h3>No businesses matched this search</h3>
              <p>Try fewer words, a broader location, or clear the optional filters.</p>
            </div>
          `;
        const total = output.pagination.total;
        statusMessage(resultCount, `${total} verified business${total === 1 ? "" : "es"} found.`);
        pagination.hidden = output.pagination.totalPages <= 1;
        paginationStatus.textContent = `Page ${output.pagination.page} of ${output.pagination.totalPages}`;
        previousButton.disabled = output.pagination.page <= 1;
        nextButton.disabled = output.pagination.page >= output.pagination.totalPages;
        updateAddressBar();
        if (focusStatus) resultCount.focus();
      } catch (error) {
        if (error.name === "AbortError") return;
        results.innerHTML = `
          <div class="panel empty-state">
            <h3>The directory could not load</h3>
            <p>Please try again. If the problem continues, contact ETIB.</p>
          </div>
        `;
        statusMessage(resultCount, error.message, true);
        pagination.hidden = true;
      } finally {
        if (searchController === controller) {
          results.setAttribute("aria-busy", "false");
        }
      }
    }

    async function loadOptions() {
      try {
        const options = await api("/directory-options");
        populateSelect(categoryField, options.categories || []);
        populateSelect(typeField, options.listingTypes || []);
        populateSelect(contactField, options.contactMethods || [], (item) => item.label);
        categoryField.value = categoryField.dataset.initialValue || "";
        typeField.value = typeField.dataset.initialValue || "";
        contactField.value = contactField.dataset.initialValue || "";
        const count = options.businessCount || 0;
        catalogSummary.textContent = `${count} verified business${count === 1 ? "" : "es"} available. Catalog updated ${formatDate(options.catalogUpdated)}.`;
      } catch {
        catalogSummary.textContent = "Search the verified ETIB business catalog.";
      }
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      currentPage = 1;
      loadResults({ focusStatus: true });
    });

    resetButton.addEventListener("click", () => {
      form.reset();
      currentPage = 1;
      loadResults({ focusStatus: true });
      queryField.focus();
    });

    previousButton.addEventListener("click", () => {
      if (currentPage <= 1) return;
      currentPage -= 1;
      loadResults({ focusStatus: true });
    });

    nextButton.addEventListener("click", () => {
      currentPage += 1;
      loadResults({ focusStatus: true });
    });

    results.addEventListener("click", (event) => {
      const button = event.target.closest("[data-speak-business]");
      if (!button) return;
      const business = spokenListings.get(button.dataset.speakBusiness);
      if (!business) return;
      startSpeech(
        business.spokenSummary || business.summary,
        business.name,
        speechStatus,
        stopSpeechButton
      );
    });

    stopSpeechButton.addEventListener("click", () => {
      stopSpeech(speechStatus, stopSpeechButton);
    });

    loadOptions().then(() => loadResults());
  }

  function definitionItem(term, description) {
    if (!description) return "";
    return `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description)}</dd></div>`;
  }

  function initializeBusinessProfile() {
    const title = document.getElementById("profileTitle");
    if (!title) return;

    const parameters = new URLSearchParams(window.location.search);
    const identifier = parameters.get("business") || parameters.get("id");
    const tagline = document.getElementById("profileTagline");
    const badges = document.getElementById("profileBadges");
    const status = document.getElementById("profileStatus");
    const details = document.getElementById("profileDetails");
    const contactPanel = document.getElementById("profileContact");
    const verification = document.getElementById("verificationText");
    const correctionLink = document.getElementById("correctionLink");
    const listenButton = document.getElementById("listenProfile");
    const stopButton = document.getElementById("stopProfileSpeech");
    const speechStatus = document.getElementById("speechStatus");
    let business;

    if (!identifier) {
      title.textContent = "Business not selected";
      tagline.textContent = "Return to the directory and choose a business.";
      statusMessage(status, "No business identifier was provided.", true);
      details.innerHTML = '<h2>Business unavailable</h2><p><a href="index.html">Return to directory search</a>.</p>';
      contactPanel.innerHTML = "<h2>Contact the business</h2><p>No business was selected.</p>";
      return;
    }

    listenButton.hidden = !speechSupported;
    listenButton.addEventListener("click", () => {
      if (!business) return;
      const fullSpeech = [
        business.spokenSummary,
        business.blindCommunitySupport,
        `Accessibility: ${business.accessibility}`,
        `Preferred contact method: ${business.contact.preferredMethod}.`
      ].filter(Boolean).join(" ");
      startSpeech(fullSpeech, business.name, speechStatus, stopButton);
    });
    stopButton.addEventListener("click", () => stopSpeech(speechStatus, stopButton));

    api(`/listings/${encodeURIComponent(identifier)}`)
      .then((output) => {
        business = output.business;
        document.title = `${business.name} | ETIB Community Connect`;
        const descriptionMeta = document.querySelector('meta[name="description"]');
        if (descriptionMeta) descriptionMeta.content = business.summary;
        title.textContent = business.name;
        tagline.textContent = business.summary;
        badges.innerHTML = [
          business.featured?.enabled ? '<span class="badge featured-badge">Featured</span>' : "",
          `<span class="badge">${escapeHtml(business.listingType)}</span>`,
          ...business.categories.map((category) => `<span class="badge">${escapeHtml(category)}</span>`),
          business.location.remoteAvailable ? '<span class="badge">Remote available</span>' : ""
        ].join("");
        listenButton.disabled = false;
        statusMessage(status, "Verified business profile loaded.");

        const serviceItems = business.services.map((service) => `<li>${escapeHtml(service)}</li>`).join("");
        const remoteSection = business.location.remoteDetails
          ? `<h2>Remote service details</h2><p>${escapeHtml(business.location.remoteDetails)}</p>`
          : "";
        const inPersonSection = business.location.inPersonNotes
          ? `<h2>In-person information</h2><p>${escapeHtml(business.location.inPersonNotes)}</p>`
          : "";
        const certificationSection = business.certifications.length
          ? `<h2>Certifications</h2><ul>${business.certifications.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : "";
        const testimonialSection = business.testimonial
          ? `<h2>Published testimonial</h2><blockquote>${escapeHtml(business.testimonial)}</blockquote>`
          : "";

        details.innerHTML = `
          <h2>About this business</h2>
          <p>${escapeHtml(business.description)}</p>
          <h2>Services</h2>
          <ul>${serviceItems}</ul>
          <h2>How this business supports the blind and visually impaired community</h2>
          <p>${escapeHtml(business.blindCommunitySupport)}</p>
          <h2>Accessibility details</h2>
          <p>${escapeHtml(business.accessibility)}</p>
          ${remoteSection}
          ${inPersonSection}
          ${certificationSection}
          ${testimonialSection}
        `;

        const socialLinks = business.contact.socialLinks
          .map((item) => {
            const url = safeWebsiteUrl(item.url);
            return url ? `<li><a href="${escapeHtml(url)}">${escapeHtml(item.label)}</a></li>` : "";
          })
          .join("");
        const socialSection = socialLinks ? `<h3>Social links</h3><ul>${socialLinks}</ul>` : "";
        contactPanel.innerHTML = `
          <h2>Contact the business</h2>
          <p><strong>Preferred method:</strong> ${escapeHtml(business.contact.preferredMethod)}</p>
          ${business.contact.name ? `<p><strong>Public contact:</strong> ${escapeHtml(business.contact.name)}</p>` : ""}
          <div class="contact-actions">${contactActionLinks(business, { includeLabels: true })}</div>
          <h3>Location and availability</h3>
          <dl class="profile-facts">
            ${definitionItem("Location", locationLabel(business.location))}
            ${definitionItem("Service area", business.location.serviceArea)}
            ${definitionItem("Remote service", business.location.remoteAvailable ? "Available" : "Not listed as available")}
            ${definitionItem("Hours", business.hours)}
            ${definitionItem("Languages", business.languages.join(", "))}
          </dl>
          ${socialSection}
        `;

        verification.textContent = `ETIB last verified this listing on ${formatDate(business.lastVerified)}.`;
        const correctionSubject = `ETIB directory correction: ${business.name}`;
        const correctionBody = `Business: ${business.name}\nProfile: ${window.location.href}\n\nPlease describe the information that should be reviewed:\n`;
        correctionLink.href = `mailto:etib@eventhoughimblind.com?subject=${encodeURIComponent(correctionSubject)}&body=${encodeURIComponent(correctionBody)}`;
      })
      .catch((error) => {
        title.textContent = "Business not found";
        tagline.textContent = "This listing is unavailable or no longer active.";
        statusMessage(status, error.message, true);
        details.innerHTML = '<h2>Business unavailable</h2><p><a href="index.html">Return to directory search</a>.</p>';
        contactPanel.innerHTML = "<h2>Contact the business</h2><p>No public contact details are available.</p>";
        verification.textContent = "Contact ETIB if you believe this listing should be available.";
      });
  }

  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  initializeDirectory();
  initializeBusinessProfile();
})();
