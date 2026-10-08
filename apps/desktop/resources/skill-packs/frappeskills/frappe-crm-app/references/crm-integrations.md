# Frappe CRM Integrations

Telephony, WhatsApp, lead syncing, website enrichment, and the ERPNext
bridge — all under `crm/integrations/`, `crm/lead_syncing/`,
`crm/domain_enrichment/`, and `crm/fcrm/doctype/erpnext_crm_settings/`.

## ERPNext bridge — same-site and cross-site

`ERPNext CRM Settings` (singleton) has two integration modes controlled by
`is_erpnext_in_different_site` (`erpnext_crm_settings.json`):

- **Same site** (ERPNext installed alongside CRM): the bridge runs through
  ordinary `doc_events` — `Item`, `User Permission`, `DocShare` full CRUD
  hooks under `crm.integrations.erpnext.*`
  (see [crm-customization.md](crm-customization.md#doc_events-table)) mirror
  ERPNext master data and sharing into the CRM site directly via the ORM.
- **Different site**: `api_key`/`api_secret`/`erpnext_site_url` fields
  configure a `frappe.frappeclient.FrappeClient` (`erpnext_crm_settings.py`,
  `get_erpnext_site_client`) that talks to a remote ERPNext instance over
  its REST API instead of the local ORM — this is how CRM integrates with
  ERPNext when the two are genuinely separate deployments, not just separate
  apps on one bench.

`CRM Deal.on_update` calls `create_customer_in_erpnext`
(`hooks.py:186-190`); `Sales Order.before_validate` calls
`create_customer_on_sales_order` (`hooks.py:191-195`) for the reverse
direction. `prefill_quotation_items(crm_deal)` and `get_quotation_url(...)`
(`erpnext_crm_settings.py`) build a Quotation (local or remote) pre-filled
from a Deal's `CRM Products` child table, rather than requiring the agent to
re-enter items in ERPNext. `sync_products` mirrors ERPNext `Item` into
`CRM Product`, logging failures to `CRM Product Sync Issue` — inspect that
child table before assuming a missing product synced silently.

## Telephony

Two provider integrations under `crm/integrations/`, each with an inbound
webhook plus an outbound call trigger:

- **Exotel** (`integrations/exotel/handler.py`): `handle_request(**kwargs)`
  is `@frappe.whitelist(allow_guest=True)` — the public webhook Exotel calls
  on call events; `validate_request()` checks the request before trusting
  it. `make_a_call(to_number, from_number=None, caller_id=None)` is the
  agent-initiated outbound call endpoint. `create_call_log`/`get_call_log`/
  `get_call_log_status` write/read `CRM Call Log`.
- **Twilio** (`integrations/twilio/api.py` +
  `integrations/twilio/twilio_handler.py`): `generate_access_token()` issues
  a client-side Voice SDK token; `voice(**kwargs)` and
  `twilio_incoming_call_handler(**kwargs)` are the `allow_guest=True`
  webhooks (marked `# nosemgrep: guest-whitelisted-method` — Twilio's own
  request-signature check is the auth, not a Frappe session, so the guest
  flag is intentional and reviewed). `validate_twilio_request(args,
  require_application_sid=False)` verifies Twilio's signature before acting
  on webhook payloads.

Both providers register phone numbers/agents through `CRM Telephony Phone` /
`CRM Telephony Agent` rather than hardcoding a number-to-agent map, and both
write to the same `CRM Call Log` DocType — a third provider should follow
that shape (its own `integrations/<provider>/` module, webhook + outbound
call function, writing to the shared `CRM Call Log`) instead of inventing a
parallel call-log DocType.

## WhatsApp

`crm/api/whatsapp.py` layers CRM-specific behaviour on top of the
(separately installed) `WhatsApp Message` DocType: `validate_access(
reference_doctype=None, reference_name=None, permtype="read")` gates every
endpoint on read/write permission for the linked Lead/Deal/Contact, not just
on WhatsApp Message's own permissions. `doc_events["WhatsApp
Message"]["on_update"]` calls `notify_agent(doc)` — a Deal/Lead's assigned
agent gets a CRM Notification when a WhatsApp reply arrives, mirroring how
`Communication`/`Comment` inserts feed the same activity timeline (see
[crm-customization.md](crm-customization.md#doc_events-table)).
`is_whatsapp_installed()`/`is_whatsapp_enabled()` are separate checks — a
site can have the WhatsApp app installed but the integration turned off in
`FCRM Settings`; guard on both, not just app presence.

## Lead syncing (Facebook Lead Ads)

`crm/lead_syncing/doctype/` holds `Facebook Page`, `Facebook Lead Form` (+
`Facebook Lead Form Question`), `Lead Sync Source`, and
`Failed Lead Sync Log`. `background_sync.py` is driven entirely from
`scheduler_events` (`hooks.py:224-241`) at six cadences —
`sync_leads_from_sources_5_minutes`/`_10_minutes`/`_15_minutes` (cron),
`_hourly`/`_daily`/`_monthly` (named buckets) — each calling
`sync_leads_from_all_enabled_sources(frequency=...)`. A `Lead Sync Source`
row's own configured frequency selects which of the six jobs actually
processes it; a failed pull logs to `Failed Lead Sync Log`, which
`hooks.py`'s `ignore_links_on_delete` explicitly exempts from blocking
Lead/Contact deletion (see
[crm-customization.md](crm-customization.md#doc_events-table)).

## Domain enrichment

`crm/domain_enrichment/` is a website crawler that fills in
Lead/Deal/Organization fields (industry, employee count, etc.) from the
prospect's own website. `ENABLE_FLAG_BY_DOCTYPE = {"CRM Lead": "enable_lead",
"CRM Deal": "enable_deal", "CRM Organization": "enable_organization"}`
(`config.py`) is the single source of truth both the manual (`api.py`) and
scheduled auto-enrich (`tasks.py`) paths check — a custom app adding
enrichment for a fourth DocType should extend this dict, not branch on
doctype name in the pipeline itself. `get_config()` rebuilds an
`EnrichmentConfig` from the config DocTypes **on every call** (deliberately
uncached, per the module docstring) — hot paths use `get_settings()`/
`auto_enrich_enabled_for()` instead of a full `get_config()` build.
`pipeline.py` exposes `preview(website, cfg=None)` (dry run, no DB writes)
and `run(website, cfg=None, progress=None)` (applies results) as the two
entry points — crawl limits (`max_pages`, `max_depth`, `use_sitemap`,
`request_timeout`, `max_download_bytes`) come from `DEFAULT_SETTINGS` in
`config.py` when the settings singleton has never been saved.

## Sources

Verified against the installed Frappe CRM app:

- `crm/fcrm/doctype/erpnext_crm_settings/erpnext_crm_settings.json` — `is_erpnext_in_different_site`, `api_key`/`api_secret`/`erpnext_site_url` fields
- `crm/fcrm/doctype/erpnext_crm_settings/erpnext_crm_settings.py` — `get_erpnext_site_client`, `prefill_quotation_items`, `get_quotation_url`
- `crm/hooks.py` — `CRM Deal`/`Sales Order` doc_events (:186-195), `scheduler_events` (:224-242), `ignore_links_on_delete` (:270)
- `crm/integrations/exotel/handler.py` — `handle_request`, `make_a_call`, `validate_request`
- `crm/integrations/twilio/api.py` — `generate_access_token`, `voice`, `twilio_incoming_call_handler`, `validate_twilio_request`
- `crm/api/whatsapp.py` — `validate_access`, `validate`, `on_update`, `notify_agent`, `is_whatsapp_installed`/`is_whatsapp_enabled`
- `crm/lead_syncing/background_sync.py` — cadence functions
- `crm/lead_syncing/doctype/` — directory listing
- `crm/domain_enrichment/config.py` — `ENABLE_FLAG_BY_DOCTYPE`, `DEFAULT_SETTINGS`, module docstring on `get_config()` caching
- `crm/domain_enrichment/pipeline.py` — `preview`, `run`
