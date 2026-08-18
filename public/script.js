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

  function quickContactActionLinks(business) {
    const links = [];
    const contact = business.contact || {};
    const name = business.name || "this business";
    const phone = phoneHref(contact.phone);
    const text = phoneHref(contact.text);

    if (phone) {
      links.push(`<a class="btn btn-primary" href="tel:${escapeHtml(phone)}" aria-label="Call ${escapeHtml(name)}">Call</a>`);
    }
    if (contact.email) {
      links.push(`<a class="btn" href="mailto:${escapeHtml(contact.email)}" aria-label="Email ${escapeHtml(name)}">Email</a>`);
    }
    if (text) {
      links.push(`<a class="btn" href="sms:${escapeHtml(text)}" aria-label="Text ${escapeHtml(name)}">Text</a>`);
    }
    links.push(`<a class="btn" href="business-profile.html?business=${encodeURIComponent(business.id)}" aria-label="More information about ${escapeHtml(name)}">More information</a>`);
    return links.join("");
  }

  function listingSpotlight(business) {
    const categories = (business.categories || [])
      .slice(0, 2)
      .map((item) => `<span class="badge">${escapeHtml(item)}</span>`)
      .join("");
    const featured = business.featured?.enabled ? '<span class="badge featured-badge">Featured</span>' : "";
    const remote = business.location?.remoteAvailable ? '<span class="badge">Remote available</span>' : "";
    const services = (business.services || []).slice(0, 3);
    const extraServices = Math.max(0, (business.services || []).length - services.length);
    const serviceText = services.map(escapeHtml).join(", ");
    const serviceSuffix = extraServices ? `, and ${extraServices} more` : "";
    const place = locationLabel(business.location) || business.location?.serviceArea || "Location not specified";

    return `
      <article class="panel spotlight-card" aria-labelledby="business-${escapeHtml(business.id)}">
        <div class="badge-row">${featured}<span class="badge">${escapeHtml(business.listingType)}</span>${categories}${remote}</div>
        <h3 id="business-${escapeHtml(business.id)}" tabindex="-1">${escapeHtml(business.name)}</h3>
        <p class="business-location">${escapeHtml(place)}</p>
        <p class="listing-summary">${escapeHtml(business.summary)}</p>
        <p class="service-preview"><strong>Services:</strong> ${serviceText}${serviceSuffix}</p>
        <div class="quick-contact-actions" aria-label="Contact and information options for ${escapeHtml(business.name)}">
          ${quickContactActionLinks(business)}
        </div>
        <p class="verification-note">Verified by ETIB on ${escapeHtml(formatDate(business.lastVerified))}.</p>
      </article>
    `;
  }

  function initializeDirectory() {
    const root = document.querySelector("[data-directory-app]");
    if (!root) return;

    const form = document.getElementById("directorySearchForm");
    const queryField = document.getElementById("search");
    const resetButton = document.getElementById("resetFilters");
    const directoryTabs = [...document.querySelectorAll("[data-directory-group]")];
    const results = document.getElementById("directoryResults");
    const resultCount = document.getElementById("resultCount");
    const catalogSummary = document.getElementById("catalogSummary");
    const previousButton = document.getElementById("previousBusiness");
    const previewButton = document.getElementById("previewListing");
    const nextButton = document.getElementById("nextBusiness");
    const speechStatus = document.getElementById("directorySpeechStatus");
    const pageSize = 24;
    let listings = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalListings = 0;
    let currentIndex = 0;
    let currentBusiness = null;
    let searchController;
    let directorySpeechToken = 0;
    let directoryGroup = initialParameters.get("group") === "media" ? "media" : "business";

    const initialParameters = new URLSearchParams(window.location.search);
    queryField.value = initialParameters.get("q") || "";

    function updateAddressBar() {
      const parameters = new URLSearchParams();
      if (queryField.value.trim()) parameters.set("q", queryField.value.trim());
      if (directoryGroup === "media") parameters.set("group", "media");
      const search = parameters.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }

    function resetPreviewButton() {
      previewButton.dataset.speaking = "false";
      previewButton.textContent = "Hear preview";
      previewButton.setAttribute(
        "aria-label",
        currentBusiness ? `Hear preview for ${currentBusiness.name}` : "Hear business preview"
      );
    }

    function stopDirectoryPreview(message = "") {
      directorySpeechToken += 1;
      if (speechSupported) window.speechSynthesis.cancel();
      resetPreviewButton();
      statusMessage(speechStatus, message);
    }

    function renderCurrentBusiness({ focusStatus = false } = {}) {
      stopDirectoryPreview();

      if (!currentBusiness) {
        results.innerHTML = `
          <div class="panel empty-state">
            <h3>No businesses matched your search</h3>
            <p>Try another business name, service, or location, or clear the search to browse every listing.</p>
          </div>
        `;
        statusMessage(resultCount, "No verified businesses found.");
        previousButton.disabled = true;
        previewButton.disabled = true;
        nextButton.disabled = true;
        if (focusStatus) resultCount.focus();
        return;
      }

      const absolutePosition = ((currentPage - 1) * pageSize) + currentIndex + 1;
      const searchDescription = queryField.value.trim() ? " matching your search" : "";
      results.innerHTML = listingSpotlight(currentBusiness);
      statusMessage(
        resultCount,
        `Showing business ${absolutePosition} of ${totalListings}${searchDescription}: ${currentBusiness.name}.`
      );
      previousButton.disabled = totalListings <= 1;
      nextButton.disabled = totalListings <= 1;
      previewButton.disabled = !speechSupported;
      previousButton.setAttribute("aria-label", `Show the previous business before ${currentBusiness.name}`);
      nextButton.setAttribute("aria-label", `Show the next business after ${currentBusiness.name}`);
      resetPreviewButton();
      if (focusStatus) resultCount.focus();
    }

    async function loadResults({ page = 1, targetIndex = 0, focusStatus = false } = {}) {
      if (searchController) searchController.abort();
      const controller = new AbortController();
      searchController = controller;
      stopDirectoryPreview();
      results.setAttribute("aria-busy", "true");
      results.innerHTML = '<div class="panel empty-state"><p>Searching verified businesses.</p></div>';
      statusMessage(resultCount, "Searching verified businesses.");
      previousButton.disabled = true;
      previewButton.disabled = true;
      nextButton.disabled = true;

      const parameters = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        group: directoryGroup
      });
      if (queryField.value.trim()) parameters.set("q", queryField.value.trim());

      try {
        const output = await api(`/listings?${parameters.toString()}`, { signal: controller.signal });
        listings = output.listings || [];
        currentPage = output.pagination.page;
        totalPages = output.pagination.totalPages;
        totalListings = output.pagination.total;
        currentIndex = listings.length
          ? Math.min(Math.max(0, targetIndex), listings.length - 1)
          : 0;
        currentBusiness = listings[currentIndex] || null;
        updateAddressBar();
        renderCurrentBusiness({ focusStatus });
      } catch (error) {
        if (error.name === "AbortError") return;
        listings = [];
        currentBusiness = null;
        results.innerHTML = `
          <div class="panel empty-state">
            <h3>The directory could not load</h3>
            <p>Please try again. If the problem continues, contact ETIB.</p>
          </div>
        `;
        statusMessage(resultCount, error.message, true);
        previousButton.disabled = true;
        previewButton.disabled = true;
        nextButton.disabled = true;
      } finally {
        if (searchController === controller) {
          results.setAttribute("aria-busy", "false");
        }
      }
    }

    function speakCurrentBusiness() {
      if (!speechSupported || !currentBusiness) {
        statusMessage(speechStatus, "Spoken preview is not supported by this browser.", true);
        return;
      }
      if (previewButton.dataset.speaking === "true") {
        stopDirectoryPreview("Preview stopped.");
        return;
      }

      window.speechSynthesis.cancel();
      const token = ++directorySpeechToken;
      const utterance = new SpeechSynthesisUtterance(currentBusiness.spokenSummary || currentBusiness.summary);
      utterance.onstart = () => {
        if (token !== directorySpeechToken) return;
        previewButton.dataset.speaking = "true";
        previewButton.textContent = "Stop preview";
        previewButton.setAttribute("aria-label", `Stop preview for ${currentBusiness.name}`);
        statusMessage(speechStatus, `Playing preview for ${currentBusiness.name}.`);
      };
      const finish = () => {
        if (token !== directorySpeechToken) return;
        resetPreviewButton();
        statusMessage(speechStatus, "");
      };
      utterance.onend = finish;
      utterance.onerror = () => {
        if (token !== directorySpeechToken) return;
        resetPreviewButton();
        statusMessage(speechStatus, "The spoken preview stopped before it finished.", true);
      };
      window.speechSynthesis.speak(utterance);
    }

    function navigate(direction) {
      if (totalListings <= 1 || !currentBusiness) return;
      stopDirectoryPreview();

      if (direction === "next") {
        if (currentIndex < listings.length - 1) {
          currentIndex += 1;
          currentBusiness = listings[currentIndex];
          renderCurrentBusiness();
          return;
        }
        const nextPage = currentPage < totalPages ? currentPage + 1 : 1;
        loadResults({ page: nextPage, targetIndex: 0 });
        return;
      }

      if (currentIndex > 0) {
        currentIndex -= 1;
        currentBusiness = listings[currentIndex];
        renderCurrentBusiness();
        return;
      }
      const previousPage = currentPage > 1 ? currentPage - 1 : totalPages;
      loadResults({ page: previousPage, targetIndex: pageSize - 1 });
    }

    async function loadOptions() {
      try {
        const options = await api("/directory-options");
        const count = options.businessCount || 0;
        catalogSummary.textContent = `${count} verified business${count === 1 ? "" : "es"} available. Catalog updated ${formatDate(options.catalogUpdated)}.`;
      } catch {
        catalogSummary.textContent = "Search the verified ETIB business catalog.";
      }
    }

    function updateDirectoryTabs() {
      directoryTabs.forEach((tab) => {
        const selected = tab.dataset.directoryGroup === directoryGroup;
        tab.classList.toggle("is-active", selected);
        tab.setAttribute("aria-selected", String(selected));
      });
    }

    directoryTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        directoryGroup = tab.dataset.directoryGroup === "media" ? "media" : "business";
        updateDirectoryTabs();
        loadResults({ page: 1, targetIndex: 0, focusStatus: true });
      });
    });
    updateDirectoryTabs();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      loadResults({ page: 1, targetIndex: 0, focusStatus: true });
    });

    resetButton.addEventListener("click", () => {
      form.reset();
      loadResults({ page: 1, targetIndex: 0, focusStatus: true });
    });

    previousButton.addEventListener("click", () => {
      navigate("previous");
    });

    nextButton.addEventListener("click", () => {
      navigate("next");
    });

    previewButton.addEventListener("click", speakCurrentBusiness);

    loadOptions();
    loadResults({ page: 1, targetIndex: 0 });
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
