import sanitizeHtml from "sanitize-html";

/**
 * Whitelist-based sanitiser for note `contentHtml`.
 *
 * Notes are authored by the TipTap/NotionEditor (web) and the mobile note editor,
 * then rendered into other users' browsers via dangerouslySetInnerHTML — so any
 * stored HTML runs in a colleague's session unless it is scrubbed. This helper
 * strips everything the editor can never legitimately produce (scripts, event
 * handlers, javascript: URLs, inline styles) while preserving the formatting the
 * editors emit (headings, lists, task lists, code, quotes, links, images).
 *
 * Used by BOTH POST /api/notes and PATCH /api/notes/:id so the stored value is
 * always safe regardless of which client wrote it.
 */
export function sanitizeNoteHtml(html: unknown): string {
  if (typeof html !== "string" || html.length === 0) {
    return typeof html === "string" ? html : "";
  }

  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "strong", "b", "em", "i", "u", "s", "strike", "del",
      "code", "pre",
      "blockquote",
      "ul", "ol", "li",
      "a", "img",
      "span", "label", "input", "div",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      // TipTap task lists use data-* attributes + checkbox inputs to render checked state.
      ul: ["data-type", "class"],
      li: ["data-type", "data-checked", "class"],
      input: ["type", "checked", "disabled"],
      span: ["data-*", "class"],
      div: ["data-*", "class"],
      p: ["data-*", "class"],
      label: ["class"],
    },
    // Only allow safe URL schemes; this drops javascript:, data: (for hrefs), vbscript:, etc.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      // Images are served from our own /objects route (relative paths) or http(s);
      // base64/data: images are disallowed to mirror the editor's allowBase64: false.
      img: ["http", "https"],
    },
    // Permit protocol-relative and root-relative URLs (e.g. /objects/company/.../file).
    allowProtocolRelative: true,
    // Force checkbox inputs to be non-interactive/safe; strip any stray attributes.
    transformTags: {
      input: (tagName, attribs) => ({
        tagName: "input",
        attribs: {
          type: "checkbox",
          ...(attribs.checked !== undefined ? { checked: "checked" } : {}),
          disabled: "disabled",
        },
      }),
    },
    // Disallow all inline styles (blocks style-based script/expression vectors).
    allowedStyles: {},
  });
}
