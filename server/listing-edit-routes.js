export function normalizeListingPayload(body = {}) {
  return {
    businessName: String(body.businessName || "").trim(),
    ownerContactName: String(body.ownerContactName || "").trim(),
    businessEmail: String(body.businessEmail || "").trim(),
    phone: String(body.phone || "").trim(),
    textNumber: body.textNumber ? String(body.textNumber).trim() : null,
    websiteUrl: body.websiteUrl ? String(body.websiteUrl).trim() : null,
    listingType: String(body.listingType || "").trim(),
    category: String(body.category || "").trim(),
    shortSummary: String(body.shortSummary || "").trim(),
    fullDescription: String(body.fullDescription || "").trim(),
    listenSummary: body.listenSummary ? String(body.listenSummary).trim() : null,
    supportsBvi: String(body.supportsBvi || "").trim(),
    accessibilityDetails: String(body.accessibilityDetails || "").trim(),
    primaryContactMethod: String(body.primaryContactMethod || "").trim(),
    city: String(body.city || "").trim(),
    state: String(body.state || "").trim(),
    serviceAreaType: String(body.serviceAreaType || "Local").trim(),
    hours: String(body.hours || "By appointment").trim(),
    languages: body.languages ? String(body.languages).trim() : null,
    remoteDetails: body.remoteDetails ? String(body.remoteDetails).trim() : null,
    inpersonNotes: body.inpersonNotes ? String(body.inpersonNotes).trim() : null,
    socialLinks: body.socialLinks ? String(body.socialLinks).trim() : null,
    certifications: body.certifications ? String(body.certifications).trim() : null,
    testimonial: body.testimonial ? String(body.testimonial).trim() : null
  };
}

export function validateListingPayload(input, helpers) {
  const { validEmail, validPhone, validWebUrl, validateMissionFit } = helpers;
  const allowedListingTypes = ["Blind-Owned / Visually Impaired-Owned", "Community Service Provider", "Both"];
  const allowedCategories = [
    "Healthcare",
    "Transportation",
    "Legal Services",
    "Education and Tutoring",
    "Technology Support",
    "Accessibility Consulting",
    "Home Services",
    "Financial Services",
    "Employment and Career Services",
    "Coaching and Counseling",
    "Creative Services",
    "Retail and Products",
    "Nonprofit and Community Support",
    "Entertainment and Media",
    "Other"
  ];
  const allowedContactMethods = ["Call", "Text", "Email", "Website"];
  const allowedServiceAreas = ["Local", "Regional", "Nationwide", "Remote", "Hybrid"];
  const required = [
    ["businessName", "businessName"],
    ["ownerContactName", "ownerContactName"],
    ["businessEmail", "businessEmail"],
    ["phone", "phone"],
    ["listingType", "listingType"],
    ["category", "category"],
    ["shortSummary", "shortSummary"],
    ["fullDescription", "fullDescription"],
    ["supportsBvi", "supportsBvi"],
    ["accessibilityDetails", "accessibilityDetails"],
    ["primaryContactMethod", "primaryContactMethod"],
    ["city", "city"],
    ["state", "state"],
    ["serviceAreaType", "serviceAreaType"],
    ["hours", "hours"]
  ];

  for (const [key, label] of required) {
    if (!input[key] || String(input[key]).trim() === "") return `Missing: ${label}`;
  }
  if (input.businessName.length > 140) return "Business name must be 140 characters or fewer";
  if (input.ownerContactName.length > 120) return "Owner or contact name must be 120 characters or fewer";
  if (input.shortSummary.length < 20 || input.shortSummary.length > 220) return "Short summary must be between 20 and 220 characters";
  if (input.fullDescription.length < 40 || input.fullDescription.length > 5000) return "Full description must be between 40 and 5,000 characters";
  if (input.supportsBvi.length < 20 || input.supportsBvi.length > 3000) return "Mission support details must be between 20 and 3,000 characters";
  if (input.accessibilityDetails.length < 20 || input.accessibilityDetails.length > 3000) return "Accessibility details must be between 20 and 3,000 characters";
  if (![input.businessName, input.ownerContactName, input.shortSummary].every((value) => !/[\r\n\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))) {
    return "Business details contain unsupported control characters";
  }
  if (!allowedListingTypes.includes(input.listingType)) return "Invalid listing type";
  if (!allowedCategories.includes(input.category)) return "Invalid business category";
  if (!allowedContactMethods.includes(input.primaryContactMethod)) return "Invalid primary contact method";
  if (!allowedServiceAreas.includes(input.serviceAreaType)) return "Invalid service area type";
  if (!validateMissionFit(input.listingType, input.supportsBvi)) return "Mission fit not met.";
  if (!validEmail(input.businessEmail)) return "Invalid business email";
  if (!validPhone(input.phone)) return "Invalid business phone";
  if (input.textNumber && !validPhone(input.textNumber)) return "Invalid business text number";
  if (input.websiteUrl && !validWebUrl(input.websiteUrl)) return "Website must use a valid http or https address";
  if (input.primaryContactMethod === "Text" && !input.textNumber) return "A text number is required when Text is the primary contact method";
  if (input.primaryContactMethod === "Website" && !input.websiteUrl) return "A website is required when Website is the primary contact method";
  if (input.listenSummary && input.listenSummary.length > 1500) return "Spoken summary must be 1,500 characters or fewer";
  if (input.hours.length > 500) return "Hours must be 500 characters or fewer";
  for (const value of [input.languages, input.remoteDetails, input.inpersonNotes, input.socialLinks, input.certifications, input.testimonial]) {
    if (value && value.length > 2000) return "One or more optional details are too long";
  }
  return "";
}

export function registerListingEditRoutes(app, deps) {
  const { authRequired, adminRequired, get, run, sendMail, logAdminAction, validEmail, validPhone, validWebUrl, validateMissionFit, ADMIN_EMAIL } = deps;

  app.get("/api/owner/listings/:id", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid listing id" });
    const listing = await get("SELECT * FROM listings WHERE id=? AND owner_user_id=?", [id, req.user.sub]);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    return res.json({ listing });
  });

  app.put("/api/owner/listings/:id", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid listing id" });
    const existing = await get("SELECT id, owner_user_id, business_name FROM listings WHERE id=? AND owner_user_id=?", [id, req.user.sub]);
    if (!existing) return res.status(404).json({ error: "Listing not found" });

    const input = normalizeListingPayload(req.body || {});
    const error = validateListingPayload(input, { validEmail, validPhone, validWebUrl, validateMissionFit });
    if (error) return res.status(400).json({ error });

    await run(
      `UPDATE listings SET
        business_name=?, owner_contact_name=?, business_email=?, phone=?, text_number=?, website_url=?,
        listing_type=?, category=?, short_summary=?, full_description=?, listen_summary=?, supports_bvi=?, accessibility_details=?,
        primary_contact_method=?, city=?, state=?, service_area_type=?, hours=?, languages=?, remote_details=?, inperson_notes=?,
        social_links=?, certifications=?, testimonial=?, status='pending', admin_note='Updated by owner and pending review.',
        moderated_by_user_id=NULL, moderated_at=NULL, is_featured=0, featured_rank=NULL, last_updated=datetime('now')
       WHERE id=? AND owner_user_id=?`,
      [
        input.businessName, input.ownerContactName, input.businessEmail, input.phone, input.textNumber, input.websiteUrl,
        input.listingType, input.category, input.shortSummary, input.fullDescription, input.listenSummary, input.supportsBvi, input.accessibilityDetails,
        input.primaryContactMethod, input.city, input.state, input.serviceAreaType, input.hours, input.languages, input.remoteDetails, input.inpersonNotes,
        input.socialLinks, input.certifications, input.testimonial, id, req.user.sub
      ]
    );

    await sendMail({
      to: ADMIN_EMAIL,
      subject: `ETIB listing updated and pending review: ${input.businessName}`,
      text: `A listing was edited by its owner and is pending review again. Listing ID: ${id}`
    });

    return res.json({ ok: true, status: "pending" });
  });

  app.get("/api/admin/listings/:id", authRequired, adminRequired, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid listing id" });
    const listing = await get("SELECT * FROM listings WHERE id=?", [id]);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    return res.json({ listing });
  });

  app.put("/api/admin/listings/:id/edit", authRequired, adminRequired, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid listing id" });
    const existing = await get("SELECT id, business_name, status FROM listings WHERE id=?", [id]);
    if (!existing) return res.status(404).json({ error: "Listing not found" });

    const input = normalizeListingPayload(req.body || {});
    const error = validateListingPayload(input, { validEmail, validPhone, validWebUrl, validateMissionFit });
    if (error) return res.status(400).json({ error });

    await run(
      `UPDATE listings SET
        business_name=?, owner_contact_name=?, business_email=?, phone=?, text_number=?, website_url=?,
        listing_type=?, category=?, short_summary=?, full_description=?, listen_summary=?, supports_bvi=?, accessibility_details=?,
        primary_contact_method=?, city=?, state=?, service_area_type=?, hours=?, languages=?, remote_details=?, inperson_notes=?,
        social_links=?, certifications=?, testimonial=?, last_updated=datetime('now')
       WHERE id=?`,
      [
        input.businessName, input.ownerContactName, input.businessEmail, input.phone, input.textNumber, input.websiteUrl,
        input.listingType, input.category, input.shortSummary, input.fullDescription, input.listenSummary, input.supportsBvi, input.accessibilityDetails,
        input.primaryContactMethod, input.city, input.state, input.serviceAreaType, input.hours, input.languages, input.remoteDetails, input.inpersonNotes,
        input.socialLinks, input.certifications, input.testimonial, id
      ]
    );

    await logAdminAction({ adminUserId: req.user.sub, action: "listing_edit_admin", targetType: "listing", targetId: id, meta: { businessName: input.businessName } });
    return res.json({ ok: true, status: existing.status });
  });
}
