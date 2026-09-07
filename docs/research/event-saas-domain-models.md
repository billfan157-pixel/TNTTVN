# Event Management SaaS — Domain Model Research

**Research date:** 2026-09-07
**Scope:** Core entities, registration, schedule, task/checklist, communication, permissions, reporting, on-site/offline behavior for Eventbrite, Cvent, Whova, Bizzabo, Splash, Luma, Hopin / RingCentral Events, plus Cvent vs Bizzabo.
**Method:** Official platform documentation (developer/API docs, support/help centers, product pages). Each fact tagged VERIFIED (sourced) or UNKNOWN (no confirmed source found).

---

## 1. Comparison tables

### 1.1 Core entities

| Entity | Eventbrite | Cvent | Whova | Bizzabo | Splash | Luma | Hopin / RingCentral Events |
|---|---|---|---|---|---|---|---|
| Event | `Event` (id, currency, start/end) | `Event` + `Registration Path` | `Event` (multi-day) | `Event` (in-person/virtual/hybrid) | `Event` page | `Event` (evt-) + `Calendar` | `Event` (hidden_event, etc.) |
| Session / Track | not in core data model | `Session` (Included/Optional), `Session Group`, `Session Bundle` | `Session` with track, room, speakers | `Session` + rooms/locations | not as first-class public object | not as a first-class object (calendar events only) | `Session` + `Stage` + schedule items |
| Ticket / Order | `Ticket Class`, `Order` | `Admission Item`, `Registration Type`, `Registrant` | `Ticket` (with sales start/end, visibility, restrictions) | `Ticket` (RSVP vs paid, tiers) | `Ticket` (RSVP or paid) | `TicketType` (free, paid, crypto) | `Ticket` (free/paid, private, waitlist) |
| Attendee / Registration | `Attendee` (1 per ticket), status `attending/not_attending/unpaid` | `Registrant` (status Accepted/Pending/Declined), `Contact` | `Attendee`/`Registration` (free or paid, add-ons) | `Registration`, `Contact` | `Guest` (+ Guest List) | `Guest` (statuses Going/Pending/Declined/Waitlist/Invited) | `Registrant` |
| Speaker | not a first-class Eventbrite object | `Speaker` (profile, category, library, Speaker Resource Center) | Speaker with profile, sessions | `Speaker` (Speaker Portal) | not as a dedicated entity | Co-host (shown on event page) | `Speaker` profile (auto-created for Studio invites) |
| Sponsor | not core | supplier-related; `Sponsor` referenced in CSN | `Sponsor` (with `Sponsor Tier`, `Sponsor Manager`) | `Sponsor` (tier Platinum/Gold/Silver), dedicated Sponsor Portal | not first-class | not first-class | `Expo Booth` (Exhibitor) |
| Venue / Room | `Venue` (capacity, address, age_restriction) | `Venue`, `Room` | `Venue`, `Room` in agenda | `Location` / `Main Location` | not first-class | `Address` (geo_address_json, coordinate) | `Venue` |
| Schedule / Agenda | event-level only | `Agenda` (sessions, agenda items) | `Agenda` (multi-day, sessions, My Agenda) | `Agenda Builder` (multi-track) | limited | calendar feed | `Schedule items` (linked to Sessions/Stages) |
| RSVP | implicit (free Ticket Class) | `Registration Path` / `Registration Type` | RSVP supported via free ticket | RSVP (simplified flow for free events) | explicit RSVP event vs Ticketed event | RSVP via free ticket / guest list | ticket-based; private ticket link |

### 1.2 Registration

| Capability | Eventbrite | Cvent | Whova | Bizzabo | Splash | Luma | RingCentral Events |
|---|---|---|---|---|---|---|---|
| RSVP | free Ticket Class | Registration Path | free ticket | explicit RSVP mode | explicit RSVP page | free ticket | free ticket / Magic Link |
| Ticket tiers | Ticket Class (free/paid/donation) + Ticket Group (discount) | Admission Items, Registration Types | Tickets w/ price, sales window, visibility, member/org restrictions | Tickets (free/paid, VIP, membership tiers) | Tickets (RSVP or paid, free RSVP option) | Ticket Types (free/paid/crypto) | Tickets (free/paid Stripe-backed, private) |
| Capacity | quantity_total per Ticket Class | admission-item capacity + session capacity | ticket capacity, event-level via registration | per-ticket, room capacity | ticket capacity | event capacity + ticket capacity | per-ticket + event-level capacity |
| Waitlist | not documented as first-class | supported per Cvent docs | supported (ticket restrictions) | supported (registration) | supported | yes (paid waitlist authorizes card; auto-activates at event capacity) | yes (per-ticket waitlist) |
| Group registration | max per order (max quantity) | Group Registration supported | organization-restricted tickets; bulk import | group registrations | +1 guests on RSVP tickets | bulk paste, multiple tickets per guest | Group ticket registrations supported |
| Custom registration fields | yes (via Attendee `answers`) | yes (conditional logic, session selection) | yes (Registration Form Analytics) | yes (Custom Registration flows) | yes (custom questions per ticket) | yes (text/options/social/company/checkbox/terms/website) | yes (many field types incl. Conditional) |
| Attendee approval workflow | not first-class | Yes (Registration Type, approval flow) | Restricted tickets (member / invite-only) | yes (custom registration flows) | approval not central; manual | Yes (Require Approval per ticket + per event) | not explicitly documented as "approval"; Magic Link / private ticket instead |

### 1.3 Schedule / agenda

| Capability | Eventbrite | Cvent | Whova | Bizzabo | Splash | Luma | RingCentral Events |
|---|---|---|---|---|---|---|---|
| Multi-day | start/end UTC; no first-class "day" | yes | yes (calendar at top of agenda; switch days) | yes | n/a | single event with start_at/end_at | yes |
| Multi-track | no | yes (Session Groups, Bundles) | yes (session tracks, speed networking, roundtables) | yes (Multi-track agenda) | no | no | yes (Stages, Sessions, Expo) |
| Sessions within event | no | yes (Included/Optional, Bundles, Groups) | yes | yes | no | no (events only) | yes |
| Speakers per session | n/a | yes (speaker reorder per session) | yes | yes (Speaker Portal; multiple speakers) | n/a | n/a | yes (Speaker profile) |
| Room booking | n/a | yes (Rooms in agenda) | yes (room field in session) | yes (Locations / Main Location) | n/a | n/a (Address) | yes (Venue / Hall assignment) |

### 1.4 Task / checklist tied to event

| Platform | First-class "Task" entity? | Source |
|---|---|---|
| Eventbrite | UNKNOWN — no documented task/checklist entity for organizers in Eventbrite Platform docs. | (no help-center doc found) |
| Cvent | UNKNOWN as a documented entity; "event lifecycle" / planning checklists exist as blog content, but a per-event task entity is not surfaced as a product object in the developer docs. | Cvent blog `cvent.com/en/blog/events/event-lifecycle` (2025-07-07) — describes stages only |
| Whova | UNKNOWN — no first-class "task/checklist" object documented. Organizer "Admin Settings" lists Check-in staff, etc. | whova.zendesk.com event organizer categories |
| Bizzabo | UNKNOWN — sponsor "deliverables / tasks" mentioned in blog marketing copy; not documented as a first-class event task object. | bizzabo.com/blog/mastering-sponsor-management (2026-06-18) |
| Splash | UNKNOWN — Team Manager covers roles/groups, not per-event checklist entity. | support.splashthat.com Roles & Permissions |
| Luma | UNKNOWN — no documented per-event task entity; only Hosts/Managers, Check-in staff. | help.luma.com/p/adding-hosts-and-managers |
| RingCentral Events | UNKNOWN — no documented per-event task object. | partnersupport.ringcentral.com |

### 1.5 Communication

| Capability | Eventbrite | Cvent | Whova | Bizzabo | Splash | Luma | RingCentral Events |
|---|---|---|---|---|---|---|---|
| Email blast | via Email Marketing product | Cvent Email Marketing (drag-and-drop, automation) | Announcements + Email blasts to attendees | Email campaigns (in pricing) | Confirmation + custom email templates | Event Email / Blasts (send & schedule) | suppressEmails flag; transactional emails |
| In-app notification | not central | Attendee Hub | Mobile app push | Mobile app push | limited | Calendar notifications | Session push (default = 5 min before scheduled) |
| Push | Organizer app push | Attendee Hub push (polls/Q&A) | push toggleable per category | mobile app push | Splash Host app | push notifications for invites | app push |
| Reminder cadence | automated confirmation emails | branded confirmation + reminders | automatic survey reminders; agenda reminders | "automation and reminders" (Speaker Portal) | confirmation with QR | calendar invite auto-adds; reminders around event | scheduled Session appears 5 min before |
| Attendee messaging | contact-the-organizer form | Attendee Hub messaging | Community Board (private chat, group chat, topic follow) | in-app messaging | limited | Community (post-event follow-up, discussion) | Direct messages (overwritten if entered via Magic Link) |

### 1.6 Permission model

| Platform | Roles documented | Source |
|---|---|---|
| Eventbrite | User → Organization → Members; Admins/owners for check-in roles; "Organizer" is a public entity, not necessarily a user account | platform docs Organizations; help center check-in roles |
| Cvent | Organization admins/members; Testing Scenarios; Speakers via Speaker Resource Center | developers.cvent.com event-terms |
| Whova | "Admins" (Attendees → Admin Settings); Admin Roles exist but "all admins have the same privileges and access" | whova.zendesk.com "When adding an admin" |
| Bizzabo | Speaker Portal, Sponsor/Exhibitor Portal, Moderator Portal (organizers grant access) | bizzabo.com blog + speaker guide |
| Splash | 7 roles (Admin, Admin (Basic), Group Manager, Creative Specialist, Integrations Specialist, Event Organizer, On-site Specialist, Viewer); 3 license types (Builder/Host/Crew) | support.splashthat.com Team Manager Overview; Roles & Permissions |
| Luma | Hosts (Manager / Non-Manager), Check-in staff (Luma Plus), Calendar admins, Collaborating Calendars | help.luma.com/p/adding-hosts-and-managers; /p/luma-calendar-overview; /p/collaborating-calendars |
| RingCentral Events | Organization admin/member, Organizer Pass, Attendee, Moderator, Speaker, Invited Exhibitor | partnersupport.ringcentral.com "Understanding roles & permissions" |

### 1.7 Audit & reporting

| Capability | Eventbrite | Cvent | Whova | Bizzabo | Splash | Luma | RingCentral Events |
|---|---|---|---|---|---|---|---|
| Registration count | Sales report / dashboard | reporting across events | Live Stats, ticket sales analytics | registration analytics | Guest List (export/filter) | guest list with status breakdown | Registrants report |
| Attendance | Eventbrite Organizer app real-time check-in | Attendance Tracking (per session) | Check-in analytics, Attendee Data tab (sessions checked in) | Check-in analytics | check-in via Host app; "attended" status exportable | Check-in feature (check-in staff) | No-Shows report, Time spent online, Engagement metrics |
| Revenue | Sales report; payouts | financial reporting | ticket sales | Event ROI reporting | ticket revenue (paid tickets) | paid tickets | Stripe integration for paid tickets |
| Capacity utilization | quantity_total vs quantity_sold | cross-event analytics | post-event report | analytics dashboard | guest list | event capacity vs approved | per-ticket capacity reporting |
| Post-event survey | Eventbrite Surveys (separate product) | Post-event survey + CventIQ Engagement Scoring | "Comprehensive event feedback tools" (polls, session feedback, post-event report) | engagement + sponsor ROI | post-event follow-up emails | feedback_email field per event | Poll results report, Q&As report, Engagement metrics |

### 1.8 Offline / on-site behavior

| Platform | Mobile check-in | QR / barcode | Badge print | Offline mode |
|---|---|---|---|---|
| Eventbrite | Eventbrite Organizer app (iOS/Android) | QR on each ticket; Zebra scanner support | supported via integrations | Offline check-in, sync when online (confirmed in onsite blog 2025-08-20) |
| Cvent | Cvent OnArrival kiosks + ScanApp | QR / badge scanning | OnArrival badge printing | limited public doc |
| Whova | Whova mobile app + check-in staff | QR on attendee badge; self check-in supported | name badge with unique QR | doc mentions "self check-in" |
| Bizzabo | Bizzabox kit (iPads, stands, badge printers, router) | Klik SmartBadge wearables for lead capture + QR | bundled in Bizzabox | onsite technicians quoted per event |
| Splash | Splash Host app (iOS/Android) | QR on confirmation email PDFs | limited public doc | real-time sync across devices |
| Luma | Luma iOS / Android app; Check-in staff role | QR / ticket scan | doc says "scan tickets" via check-in staff | public doc not detailed |
| RingCentral Events | Event Dashboard Magic Link, mobile attendee experience | QR on tickets via barcode scanning app | supported (kiosk mode docs) | limited public doc |

---

## 2. Per-system paragraphs (sourced)

### Eventbrite
Entities: `Event`, `Ticket Class` (free/paid/donation), `Order` (one or more tickets), `Attendee` (one per ticket), `Organizer` (public entity, no Eventbrite account), `Venue` (capacity, address), `Ticket Group` (for shared discounts). Webhooks track Event/Order/Attendee/Organizer/Ticket Class/Venue lifecycle (eventbrite.at/platform/docs/webhooks). Registration: free ticket class for RSVP; quantity_total + quantity_sold for capacity; refunds via organizer-set policy with 5-business-day SLA, and Eventbrite can intervene for events cancelled ≤45 days or postponed >90 days (eventbrite.co.uk/help/en-gb/articles/721549). Reporting: sales, attendee status (attending/not_attending/unpaid), barcodes field with checkin_type and is_printed (platform/docs/orders). On-site: Eventbrite Organizer app scans QR; multi-device real-time sync; offline check-in supported; Zebra scanners for high-volume; Tap to Pay for at-door sales (eventbrite.com/blog/onsite-operations-tools-eventbrite, 2025-08-20). (VERIFIED)

### Cvent
Entities: `Event`, `Registration Path`, `Registration Type`, `Admission Item`, `Registrant`, `Contact`, `Session` (Included vs Optional with capacity/fee), `Session Group` (radio of one), `Session Bundle`, `Speaker` (Speaker Library, Speaker Resource Center), `Agenda`, `Venue`, `Room`, CSN `Supplier` (developers.cvent.com/docs/platform/explanation/event-terms; support.cvent.com community articles). Registration: per-registration-type paths, advanced rules (min/max sessions), session association, audience-segment limits (support.cvent.com The Complete Guide to Sessions). REST API: POST /attendees with status `Accepted`, optional session enrollment via POST /sessions/{id}/enrollment/{attendeeId} (developers.cvent.com/docs/rest-api/guides/registration-guide, 2026-08-05). On-site: Cvent OnArrival kiosks, badge printing, ScanApp per review (invitedesk.com Cvent review, 2026-01-22). Reporting: cross-event analytics, Engagement Scoring (CventIQ) per official Cvent blog (cvent.com/en/blog/events/benefits-of-an-event-management-platform, 2026-06-23). (VERIFIED)

### Whova
Entities: `Event` with multi-day agenda, `Session` (tracks, rooms, speakers), `Sponsor` with `Sponsor Tier` (Whova Help Center "How do I add or edit sponsor tiers"), tiered vs a-la-carte sponsor registration (help center article 24270575775259). Registration: ticket setup with sales start/end, visibility window, member & invite-only restrictions (help center article 41499406822171); name badges with unique QR (whova.com/event-registration-software). Mobile/web app with Community Board (topics, meet-ups, ice breakers, follow), private messaging, group chat (whova.com attendee/networking guides). Reporting: Pre-event attendee analytics, Live Stats, Post-Event Report, Attendee Analytics (sessions on agenda, surveys submitted, session feedback, check-in days/sessions) (whova.com/blog/new-attendee-analytics-feature 2024-10-31; help center 38414682837275). (VERIFIED). Permission: Admin Roles dropdown exists but "all admins have the same privileges and access" (whova.zendesk.com article 12558490430619). (VERIFIED)

### Bizzabo
Entities: `Event` (in-person/virtual/hybrid/field), multi-track `Agenda`, `Session`, `Speaker` (Speaker Portal with virtual room access), `Sponsor` with tiers (Platinum/Gold/Silver; sponsored sessions for Platinum/Gold), dedicated Sponsor/Exhibitor Portal (bizzabo.com blog 2026-06-18; bizzabo.com sponsor-management-software). Registration: RSVP mode and Ticketed registration; free/paid tickets; session registration filtered by ticket type; embed anywhere; custom flows (bizzabo.com/blog/bizzabo-event-registration-solution 2025-05-14). On-site: Bizzabox self-service kit (iPads, stands, badge printers, router); Klik SmartBadge wearables for lead capture; onsite technicians (bizzabo.com pricing 2024-04-19; nunify.com 2026-08-11). Reporting: engagement data + Klik lead capture for sponsor ROI. (VERIFIED). Task entity: blog references "sponsor deliverables" but no documented first-class task object — UNKNOWN.

### Splash
Entities: `Event` page (RSVP vs Ticketed), `Ticket` (free "RSVP ticket" option supported), `Guest`, `Contact`, `Hubs` (microsite/calendar), integrations via CRM API key (support.splashthat.com). Registration: custom registration questions per ticket, hidden input fields (used for RingCentral Events + Magic Link integration, partnersupport.ringcentral.com). Permissions: 7 roles (Admin, Admin Basic, Group Manager, Creative Specialist, Integrations Specialist, Event Organizer, On-site Specialist, Viewer); 3 license types (Builder/Host/Crew) (support.splashthat.com Roles & Permissions; splashthat.com/platform/team-management). On-site: Splash Host app (iOS/Android) with QR scan from confirmation PDF; real-time sync across devices (support.splashthat.com 360037128672). (VERIFIED)

### Luma
Entities: `Event` (evt-), `Guest` (status: approved/Declined/Pending_approval/Waitlist/Invited), `TicketType`, `Calendar` (Luma Calendar / Team Calendar), `Host` (Manager/Non-Manager), `Check-in staff` (docs.luma.com API; help.luma.com event-registration-process). Registration: Require Approval per ticket type, paid tickets authorize card and only capture on approval (help.luma.com/p/payment-require-approval); custom registration questions (text/long-text/options/social/company/checkbox/terms/website) (help.luma.com/p/collect-registration-questions). Waitlist: event-level capacity triggers Over-Capacity Waitlist; paid waitlist authorizes card, captures on host approval (help.luma.com/p/waitlist). Calendar invite is automatically attached to confirmation email (help.luma.com/p/event-registration-process). Multi-channel invites (email, SMS, WhatsApp, push) (help.luma.com/p/inviting-and-adding-guests). Permissions: Hosts (Manager/Non-Manager), Check-in staff (Luma Plus), Calendar admins, Collaborating Calendars co-manage (help.luma.com/p/luma-calendar-overview, /p/collaborating-calendars). Reporting: CSV export, registration question summaries, guest list filters. (VERIFIED)

### Hopin / RingCentral Events
Entities: `Organization`, `Event` (eventType, networkType, doorsOpenBeforeMinutes, etc.), `Session`, `Stage`, `Expo Booth`, `Schedule items`, `Ticket` (free/paid via Stripe), `Magic Link`, `Speaker`, `Moderator`, `Invited Exhibitor`, `Registrants`, `Tags`, `Data subscriptions` (developer.events.ringcentral.com OpenAPI). Registration: free/paid ticket types (private ticket link), waitlist per ticket (manual approval, not auto-reservation), group ticket registrations, Magic Link invite + bulk CSV upload, embedded registration widget, Stripe required for paid tickets (partnersupport.ringcentral.com Creating tickets; Registration & ticketing FAQ). Custom registration form: single/paragraph/multi-choice/checkboxes/conditional/date/country/legal/hidden (partnersupport.ringcentral.com Creating a registration form). Permissions: Organization admin/member → Organizer Pass; Attendee; Moderator (assigned per event); Speaker (profile); Invited Exhibitor (per booth). Speakers don't have moderator access by default; Exhibitors don't have attendee access by default (events-support.ringcentral.com 360056529291). Reporting: Registrants, Attendees, No-Shows, Time-spent-online, Engagement metrics, Poll results, Q&As reports (partnersupport.ringcentral.com Creating a registration form). (VERIFIED)

---

## 3. Cvent vs Bizzabo (consolidated)

Architecture: Bizzabo positions itself as a unified Event Experience Operating System; Cvent has grown via acquisitions (ON24 + Goldcast in Dec 2025 per nunify.com) with separate modules (registration, venue sourcing CSN, OnArrival, Attendee Hub) (bizzabo.com/blog/bizzabo-vs-cvent 2026-03-11). Pricing: Bizzabo publishes ~$17,999/yr (3 users, $499/user/mo) with on-site/SSO/API/white-label as add-ons; Cvent is quote-only with license + per-registrant + ~20–30% implementation in year one (nunify.com 2026-08-11). Registration depth: Cvent excels at conditional logic, multi-registration-type approval, session availability rules; Bizzabo emphasizes faster setup and embeddable flows with custom fields (dryfta.com 2026-07-01). Sponsor: Cvent has CSN supplier marketplace and OnArrival lead capture; Bizzabo emphasizes sponsor portal + Klik SmartBadge wearable tap-to-lead (bizzabo.com blog 2026-06-18). On-site: Cvent OnArrival module (kiosks, badging, scan); Bizzabo Bizzabox kits + Klik wearables, both separately quoted. Mobile app: Cvent Attendee Hub; Bizzabo branded mobile app included in core. Reporting: Cvent CventIQ engagement scoring; Bizzabo ties reporting to event ROI and Klik interaction data. (VERIFIED via bizzabo.com 2026-03-11, nunify.com 2026-08-11, dryfta.com 2026-07-01.)

---

## 4. Verification status — UNKNOWN items

- **Per-event "Task / Checklist" first-class entity** — UNKNOWN for every platform surveyed (Eventbrite, Cvent, Whova, Bizzabo, Splash, Luma, RingCentral Events). None of the official help centers or developer docs surface a per-event task object with subtasks, owner, due date, status. Whova and Cvent reference the concept in marketing content but not as a documented product entity. Recommend treating the Task domain as a novel entity in our model if we need it.
- **Eventbrite co-organizer permissions** — UNKNOWN detail (Eventbrite organizations have Members and Permissions but the granular permission matrix was not surfaced in this search).
- **Eventbrite "Sponsor" entity** — UNKNOWN; not surfaced as a first-class object in core docs.
- **Cvent per-event planning checklist** — UNKNOWN as a product entity (only described in blog content).
- **Bizzabo per-event task entity** — UNKNOWN; only sponsor "deliverables" referenced in marketing.
- **Splash attendee approval workflow** — UNKNOWN as a first-class workflow (manual via Guest List).
- **Hopin/RingCentral Events approval workflow distinct from Magic Link/private ticket** — UNKNOWN; docs emphasize Magic Link rather than approval.
- **Badge printing per-platform detail** — partially verified for Eventbrite, Cvent OnArrival, Bizzabo Bizzabox; less explicit for Splash/Luma/Whova/RingCentral.

---

## 5. Source URLs (deduplicated)

Eventbrite
- https://www.eventbrite.at/platform/docs/orders
- https://www.eventbrite.at/platform/docs/ticket-classes
- https://www.eventbrite.com/platform/docs/attendees
- https://www.eventbrite.com/platform/docs/events
- https://www.eventbrite.com.au/platform/docs/webhooks
- https://www.eventbrite.com/platform/docs/organizations
- https://www.eventbrite.co.uk/help/en-gb/articles/721549/can-i-get-a-refund/
- https://www.eventbrite.com/help/en-us/articles/741083/how-to-check-in-attendees-at-the-event-with-eventbrite-organizer/
- https://www.eventbrite.com/blog/onsite-operations-tools-eventbrite/ (2025-08-20)

Cvent
- https://developers.cvent.com/docs/platform/explanation/event-terms
- https://support.cvent.com/s/communityarticle/The-Complete-Guide-to-Sessions
- https://support.cvent.com/s/communityarticle/Adding-Speakers-to-Your-Event
- https://developers.cvent.com/docs/rest-api/guides/registration-guide (2026-08-05)
- https://www.cvent.com/en/blog/events/event-lifecycle (2025-07-07)
- https://www.cvent.com/en/blog/events/benefits-of-an-event-management-platform (2026-06-23)
- https://invitedesk.com/en-gb/blog/cvent-event-management-review/ (2026-01-22)

Whova
- https://whova.com/resources/how-to-guide/whova-app-faq/
- https://whova.com/pages/attendee-guide/
- https://whova.com/pages/how-to-participate-event/
- https://whova.com/pages/attendee-networking-guide/
- https://whova.com/event-registration-software/
- https://whova.com/event-management-software/post-event-report/
- https://whova.com/blog/new-attendee-analytics-feature/ (2024-10-31)
- https://whova.com/blog/registration-form-analytics/ (2023-12-21)
- https://whova.zendesk.com/hc/en-us/articles/11205646220699 (sponsor tiers)
- https://whova.zendesk.com/hc/en-us/articles/24270575775259 (tiered vs a-la-carte)
- https://whova.zendesk.com/hc/en-us/articles/41499406822171 (organization-restricted tickets)
- https://whova.zendesk.com/hc/en-us/articles/12558490430619 (admin roles)
- https://whova.zendesk.com/hc/en-us/articles/11813369861275 (adding admins, 2026-07-01)
- https://whova.zendesk.com/hc/en-us/articles/115003534751 (dashboard access)

Bizzabo
- https://www.bizzabo.com/blog/mastering-sponsor-management-for-b2b-events (2026-06-18)
- https://www.bizzabo.com/blog/bizzabo-event-registration-solution (2025-05-14)
- https://www.bizzabo.com/event-management-software/event-sponsor-management-software (2023-01-17)
- https://www.bizzabo.com/pricing (2024-04-19)
- https://welcome.bizzabo.com/en/bizzabos-virtual-experience-speaker-guide5
- https://www.bizzabo.com/blog/bizzabo-vs-cvent (2026-03-11)

Splash
- https://support.splashthat.com/hc/en-us/articles/201649869 (RSVP vs ticketed)
- https://support.splashthat.com/hc/en-us/articles/360037128672 (QR check-in)
- https://splashthat.com/platform/event-calendars (Hubs)
- https://splashthat.com/platform/ticketing
- https://splashthat.com/platform/team-management
- https://support.cvent.com/s/communityarticle/Team-Manager-Overview
- https://support.cvent.com/s/communityarticle/Roles-and-Permissions

Luma
- https://docs.luma.com/reference/post_v1-events-guests-add
- https://docs.luma.com/reference/post_v1-events-guests-update-status
- https://docs.luma.com/reference/post_v1-events-guests-send-invites
- https://help.luma.com/p/event-registration-process
- https://help.luma.com/p/inviting-and-adding-guests-to-your-event
- https://help.luma.com/p/waitlist
- https://help.luma.com/p/setting-up-ticket-types
- https://help.luma.com/p/collect-registration-questions
- https://help.luma.com/p/payment-require-approval
- https://help.luma.com/p/adding-hosts-and-managers-to-your-event
- https://help.luma.com/p/luma-calendar-overview
- https://help.luma.com/p/collaborating-calendars
- https://help.luma.com/p/contacting-event-hosts

RingCentral Events / Hopin
- https://developer.events.ringcentral.com/external-api
- https://partnersupport.ringcentral.com/article-v2/session-tutorial.html
- https://partnersupport.ringcentral.com/article-v2/understanding-roles--permissions-organizers-attendees-moderators-speakers-and-exhibitors.html
- https://partnersupport.ringcentral.com/article-v2/registration--ticketing-faq.html
- https://partnersupport.ringcentral.com/article-v2/ringcentral-events-registration-overview.html
- https://partnersupport.ringcentral.com/article-v2/creating-tickets.html
- https://partnersupport.ringcentral.com/article-v2/creating-a-registration-form.html
- https://partnersupport.ringcentral.com/article-v2/integrating-splash-with-ringcentral-events.html
- https://events-support.ringcentral.com/hc/en-us/articles/360056529291

Cvent vs Bizzabo
- https://www.bizzabo.com/blog/bizzabo-vs-cvent (2026-03-11)
- https://www.capterra.com/compare/26318-135385/Cvent-Event-Management-vs-Bizzabo (2026)
- https://www.g2.com/compare/bizzabo-vs-cvent-event-marketing-management (2026-08-14)
- https://www.nunify.com/blogs/bizzabo-vs-cvent (2026-08-11)
- https://dryfta.com/cvent-vs-bizzabo-a-detailed-comparison-for-enterprise-events/ (2026-07-01)