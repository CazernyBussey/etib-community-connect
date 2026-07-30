# ETIB Community Connect business intake guide

This is the internal information-gathering standard for every business considered for the directory. It is not a public upload form. ETIB gathers and verifies the information, then updates `server/data/businesses.json` through GitHub.

## 1. Eligibility and verification

1. Is the business blind-owned or visually impaired-owned, specifically serving blind and visually impaired people, or both?
2. What evidence supports that classification?
3. Who at ETIB verified the information?
4. On what date was the listing last verified?
5. Should the record be public now (`active`) or held from public view (`inactive`)?
6. Is this an ordinary listing or an ETIB-approved featured placement?

## 2. Public business identity

- Exact public business name
- Stable short ID using lowercase letters and hyphens, such as `accessible-tech-solutions`
- Listing type:
  - `Blind-Owned / Visually Impaired-Owned`
  - `Community Service Provider`
  - `Both`
- One or more categories
- Specific services and search keywords

## 3. Public description

- Search summary: one clear sentence
- Full description: what the business does and who it serves
- Spoken summary: a short version that sounds natural when read aloud
- Blind-community support: how the business is owned by, led by, or specifically supports blind and visually impaired people
- Accessibility details: concrete accommodations, communication options, accessible formats, physical-access notes, and known limitations

Avoid vague claims such as “fully accessible” unless ETIB has verified them.

## 4. Public contact details

- Public contact person or team
- Email
- Phone
- Text number, if different
- Website
- Preferred contact method: `Phone`, `Text`, `Email`, or `Website`
- Social links, each with a plain-language label and full secure URL

At least one direct contact method is required.

## 5. Location and availability

- City
- State, province, or region
- Country
- Service area, such as Local, Statewide, Nationwide, or Worldwide
- Whether remote service is available
- Remote-service details
- In-person accessibility or visit notes
- Business hours
- Languages available

## 6. Optional trust details

- Certifications
- A short testimonial ETIB has permission to publish
- Any legacy numeric directory ID that should continue to resolve

## 7. Publishing workflow

1. Gather and verify every required answer.
2. Copy `server/data/business-template.json` and replace the example values.
3. Add the completed object to the `businesses` array in `server/data/businesses.json`.
4. Update the top-level `catalogUpdated` date.
5. Run:

   ```bash
   cd server
   npm test
   ```

6. Submit the change through GitHub. Render publishes the updated catalog after the approved change reaches `main`.

The validator blocks duplicate IDs, malformed contact details, invalid listing types, conflicting featured ranks, and incomplete required fields before deployment.
