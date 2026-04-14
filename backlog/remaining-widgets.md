# Remaining Custom Widgets

Widgets not yet implemented in the CMS form. All are activated by `format` in JSON Schema.

## Deferred (require site infrastructure or further discussion)

These widgets depend on runtime loaders, fetching data from the live site, or admin-specific APIs. Not worth implementing until we have the equivalent infrastructure in the MCP app.

### `select` (complex)
**Complexity: high**
Not the basic enum select (already implemented). This is the advanced select that detects whether the value is a saved block, a matcher/variant, a lazy section, or a file-based block. Renders different sub-components (`SelectBlock`, `SelectSectionBlock`, `SelectVariant`, or plain radio/select) depending on context. Tightly coupled to deco.cx block resolution logic.

### `button-group`
**Complexity: medium**
Group of icon buttons for single/multi selection. Options are fetched dynamically from a site loader (`domain/live/invoke/...`). Without access to the site's invoke endpoint, this is inert.

### `icon-select`
**Complexity: medium**
Dropdown to select an icon. Available icons are fetched via a dynamic loader defined in `schema.options`. Same loader dependency as `button-group`.

### `dynamic-options`
**Complexity: medium-high**
Select with dynamically loaded options. Supports Mustache templates in `schema.options` to build the loader URL using form data. Resolves options via fetch to the site. Requires the invoke/loader infrastructure.

### `secret`
**Complexity: low**
Masked password input. Encrypts value via `SiteSecretEncrypt` endpoint before saving. The encryption part requires the admin API; the UI itself is trivial (password input).

### `unused-path`
**Complexity: low-medium**
Path/URL input that validates whether the path is already used by another block. Requires fetching the list of existing blocks/routes from the site.

### `unique-sitename`
**Complexity: low**
Site name input with real-time uniqueness validation (debounce 1s). Checks via `actions.sites.checkSiteName`. Admin-specific, not relevant for the CMS section editor.

### `map`
**Complexity: medium-high**
Interactive map for selecting a geographic area (lat, lng, radius). Value stored as string `"lat,lng,radius"`. Old admin uses Google Maps with API key. May need to expose something via the admin MCP. Needs further discussion on approach.

### `checkbox` (format override)
**Complexity: none**
Boolean fields already render as checkboxes via type detection. The old admin's `format: "checkbox"` was just an RJSF widget override for styling. No action needed.

