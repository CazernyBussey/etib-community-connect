(() => {
  "use strict";

  const results = document.getElementById("directoryResults");
  if (!results) return;

  let requestToken = 0;

  function safeWebsiteUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function businessIdFromProfileLink(link) {
    try {
      return new URL(link.href, window.location.href).searchParams.get("business");
    } catch {
      return null;
    }
  }

  async function addWebsiteLink() {
    const actions = results.querySelector(".quick-contact-actions");
    if (!actions || actions.querySelector("[data-front-page-website]")) return;

    const profileLink = [...actions.querySelectorAll("a")]
      .find((link) => link.href.includes("business-profile.html"));
    const businessId = profileLink ? businessIdFromProfileLink(profileLink) : null;
    if (!businessId) return;

    const token = ++requestToken;

    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(businessId)}`, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) return;

      const output = await response.json();
      if (token !== requestToken) return;

      const business = output.business;
      const website = safeWebsiteUrl(business?.contact?.website);
      if (!website || !actions.isConnected || actions.querySelector("[data-front-page-website]")) return;

      const link = document.createElement("a");
      link.className = "btn";
      link.href = website;
      link.textContent = "Visit website";
      link.dataset.frontPageWebsite = "true";
      link.setAttribute("aria-label", `Visit the ${business.name || "business"} website`);

      const emailLink = [...actions.querySelectorAll("a")]
        .find((item) => item.href.startsWith("mailto:"));
      if (emailLink) {
        emailLink.insertAdjacentElement("afterend", link);
      } else if (profileLink) {
        actions.insertBefore(link, profileLink);
      } else {
        actions.append(link);
      }
    } catch {
      // Keep the listing usable if website details cannot be loaded.
    }
  }

  const observer = new MutationObserver(addWebsiteLink);
  observer.observe(results, { childList: true, subtree: true });
  addWebsiteLink();
})();
