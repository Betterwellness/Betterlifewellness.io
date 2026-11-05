const DEFAULT_SITE_URL = "https://betterlife.wellness4u.workers.dev";

const PRODUCT_FIELDS = [
  "slug", "name", "category", "short_description", "image_url", "image_alt",
  "review_title", "review_intro", "checklist", "warning", "official_url",
  "affiliate_url", "cta_text", "is_published", "updated_at"
].join(",");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  }[char]));
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function plainText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shortText(value, max = 160) {
  const text = plainText(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function siteUrl(env) {
  const configured = String(env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return configured;
}

async function getPublishedProducts(env, slug = null) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase public configuration is missing.");
  }

  const endpoint = new URL(`${String(env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/products`);
  endpoint.searchParams.set("select", PRODUCT_FIELDS);
  endpoint.searchParams.set("is_published", "eq.true");
  endpoint.searchParams.set("order", "name.asc");
  if (slug) {
    endpoint.searchParams.set("slug", `eq.${slug}`);
    endpoint.searchParams.set("limit", "1");
  }

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      "apikey": env.SUPABASE_PUBLISHABLE_KEY,
      "Accept": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Supabase catalog request failed (${response.status}).`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Supabase returned an unexpected catalog response.");
  return rows;
}

function htmlResponse(html, status = 200, method = "GET") {
  return new Response(method === "HEAD" ? null : html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    }
  });
}

function notFound(method) {
  return htmlResponse(
    "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>Guide not found | BetterLife Wellness</title><body><h1>Guide not found</h1><p>This product guide is unavailable or is no longer published.</p><p><a href=\"/\">Return to BetterLife Wellness</a></p></body></html>",
    404,
    method
  );
}

function renderProductPage(product, env) {
  const base = siteUrl(env);
  const slug = String(product.slug || "");
  const canonical = `${base}/${encodeURIComponent(slug)}-review.html`;
  const name = plainText(product.name) || "Product";
  const title = plainText(product.review_title) || `${name} Review: What to Check Before Buying`;
  const description = shortText(
    product.review_intro || product.short_description ||
    `Read this ${name} product guide covering product information, purchase terms, and safety considerations.`,
    158
  );
  const category = plainText(product.category) || "Wellness";
  const intro = plainText(product.review_intro || product.short_description) ||
    `Review the current product information for ${name} before making a purchase decision.`;
  const shortDescription = plainText(product.short_description) || intro;
  const warning = plainText(product.warning) ||
    "This guide is for general educational purposes only and is not medical advice.";
  const image = safeHttpUrl(product.image_url);
  const imageAlt = plainText(product.image_alt) || `${name} product image`;
  const officialUrl = safeHttpUrl(product.official_url);
  const affiliateUrl = safeHttpUrl(product.affiliate_url);
  const primaryUrl = affiliateUrl || officialUrl;
  const ctaText = plainText(product.cta_text) || "Visit Official Website";
  const checklist = Array.isArray(product.checklist)
    ? product.checklist.map((item) => plainText(item)).filter(Boolean).slice(0, 30)
    : [];

  const checklistHtml = checklist.length
    ? checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : [
        "Check the current product label and complete ingredient list.",
        "Review the total price, shipping, refund policy, and any recurring-order terms.",
        "Look for reliable evidence supporting the specific product claims.",
        "Ask a qualified healthcare professional about personal suitability when needed."
      ].map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  const imageHtml = image
    ? `<img class="product-image" src="${escapeHtml(image)}" alt="${escapeHtml(imageAlt)}" loading="lazy">`
    : "";

  const ctaHtml = primaryUrl
    ? `<a class="btn btn-primary" href="${escapeHtml(primaryUrl)}" target="_blank" rel="sponsored nofollow noopener">${escapeHtml(ctaText)}</a>`
    : "";

  const officialHtml = officialUrl && affiliateUrl
    ? `<a class="btn btn-secondary" href="${escapeHtml(officialUrl)}" target="_blank" rel="nofollow noopener">Visit official product website</a>`
    : "";

  const affiliateDisclosure = affiliateUrl
    ? `<section class="panel"><h2>Affiliate Disclosure</h2><div class="disclosure">This page contains an affiliate link. If you choose to make a purchase through it, BetterLife Wellness may earn a commission at no additional cost to you. Affiliate relationships do not guarantee product effectiveness or results.</div></section>`
    : "";

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "author": { "@type": "Organization", "name": "BetterLife Wellness" },
    "publisher": { "@type": "Organization", "name": "BetterLife Wellness", "url": `${base}/` },
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical }
  };
  if (image) articleSchema.image = [image];
  const schemaJson = JSON.stringify(articleSchema).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow,max-image-preview:large">
<title>${escapeHtml(title)} | BetterLife Wellness</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="theme-color" content="#f5f7f2">
<style>
:root{--ink:#1e2b25;--muted:#5d6b63;--green:#245c43;--green2:#eaf3ed;--line:#e1e8e2;--paper:#fff;--bg:#f5f7f2}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 Arial,Helvetica,sans-serif}a{color:var(--green);text-underline-offset:3px}
.topbar{background:#173d2c;color:#fff;padding:12px 20px}.topbar-inner{max-width:1060px;margin:auto;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.brand{font-weight:700;color:#fff;text-decoration:none}.topbar a.back{color:#e4f1e8;font-size:14px}
.wrap{max-width:900px;margin:34px auto;padding:0 18px 60px}.crumb{font-size:13px;color:var(--muted);margin-bottom:18px}.hero,.panel{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:clamp(22px,4vw,38px);box-shadow:0 8px 28px rgba(22,54,37,.045)}
.eyebrow{color:var(--green);font-size:12px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase}h1{font-size:clamp(30px,5vw,46px);line-height:1.14;letter-spacing:-1px;margin:10px 0 14px}h2{font-size:25px;line-height:1.25;margin:0 0 14px}p{margin:0 0 15px}.lead{font-size:18px;color:#46564c;max-width:760px}.meta{font-size:13px;color:var(--muted);margin-top:18px}
.notice{background:#fff8e9;border:1px solid #f0dfb8;border-left:4px solid #c28a32;border-radius:10px;padding:14px 16px;margin:22px 0;font-size:14px}.cta-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.btn{display:inline-block;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:700}.btn-primary{background:var(--green);color:#fff}.btn-secondary{border:1px solid var(--green);color:var(--green);background:#fff}
.panel{margin-top:20px}ul{padding-left:22px;margin:8px 0 16px}li{padding-left:4px;margin:7px 0}.product-image{display:block;max-width:min(100%,420px);max-height:340px;object-fit:contain;border-radius:12px;margin:20px auto 0}.disclosure{background:#f0f4f1;border-radius:10px;padding:16px;font-size:14px}footer{text-align:center;color:var(--muted);font-size:13px;padding:26px 10px}
@media(max-width:600px){.topbar-inner{align-items:flex-start;flex-direction:column}.wrap{margin-top:20px}}
</style>
<script type="application/ld+json">${schemaJson}</script>
</head>
<body>
<header class="topbar"><div class="topbar-inner"><a class="brand" href="${escapeHtml(base)}/">BetterLife Wellness</a><a class="back" href="${escapeHtml(base)}/">← Back to website</a></div></header>
<main class="wrap">
<div class="crumb"><a href="${escapeHtml(base)}/">Home</a> / Product Reviews / ${escapeHtml(name)}</div>
<article>
<section class="hero">
<div class="eyebrow">Product review guide · ${escapeHtml(category)}</div>
<h1>${escapeHtml(title)}</h1>
<p class="lead">${escapeHtml(intro)}</p>
${imageHtml}
<div class="notice"><strong>Important:</strong> Product formulas, seller terms, and promotional claims can change. Verify current information directly on the product label and seller website. This guide does not promise a particular health outcome.</div>
<div class="cta-row">${ctaHtml}${officialHtml}<a class="btn btn-secondary" href="${escapeHtml(base)}/">Explore more wellness guides</a></div>
<p class="meta">Review focus: product information, label transparency, purchase terms, and safety checks.</p>
</section>
<section class="panel"><h2>1. Product Overview</h2><p>${escapeHtml(shortDescription)}</p><p>${escapeHtml(intro)}</p></section>
<section class="panel"><h2>2. What to Check Before Buying</h2><p>Use this checklist to review the product information and current seller terms:</p><ul>${checklistHtml}</ul></section>
<section class="panel"><h2>3. Purchase Terms and Seller Information</h2><ul><li><strong>Total cost:</strong> Confirm the full amount due, including shipping, taxes, and other charges.</li><li><strong>Order type:</strong> Check whether the purchase is one-time or renews automatically.</li><li><strong>Refund policy:</strong> Read the current return conditions, deadlines, and exclusions.</li><li><strong>Seller details:</strong> Confirm the seller's contact information and terms for your location.</li></ul></section>
<section class="panel"><h2>4. Safety Considerations</h2><p>${escapeHtml(warning)}</p><p>Supplements and wellness products are not suitable for everyone. Ask a qualified healthcare professional about personal suitability or possible interactions, especially if you take medication, have a health condition, are pregnant or breastfeeding, or have new or worsening symptoms.</p><div class="notice">This guide is for general educational purposes only. It is not medical advice and does not diagnose, treat, cure, or prevent any disease.</div></section>
<section class="panel"><h2>5. Frequently Asked Questions</h2><details><summary>Where can I check the latest product details?</summary><p>Review the current product label, full ingredient list, and information provided by the seller. Details can change over time.</p></details><details><summary>Are product claims a guarantee of results?</summary><p>No. Marketing statements are not a guarantee of individual results. Check the evidence for specific claims and keep expectations realistic.</p></details><details><summary>What should I check before ordering?</summary><p>Review the total price, shipping, recurring-order terms, refund conditions, seller details, and product warnings before checkout.</p></details><details><summary>Is this guide medical advice?</summary><p>No. It is an educational product-information guide. Consult a qualified healthcare professional for advice about your circumstances.</p></details></section>
<section class="panel"><h2>6. Final Thoughts</h2><p>${escapeHtml(name)} should be assessed using current product information, reliable evidence for specific claims, clear purchase terms, and appropriate safety considerations. Verify details with the seller and seek professional advice when needed.</p><div class="cta-row">${ctaHtml}<a class="btn btn-secondary" href="${escapeHtml(base)}/">Explore More Wellness Guides</a></div></section>
${affiliateDisclosure}
</article>
<footer>© 2026 BetterLife Wellness. For informational purposes only. Results and suitability may vary.</footer>
</main>
</body>
</html>`;
}


function setTagAttribute(html, selectorAttribute, selectorValue, attribute, value) {
  const escapedSelector = selectorValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`<([a-z][a-z0-9]*)\\b(?=[^>]*\\b${selectorAttribute}=["']${escapedSelector}["'])[^>]*>`, "i");
  return html.replace(tagPattern, (tag) => {
    const attrPattern = new RegExp(`\\b${attribute}=["'][^"']*["']`, "i");
    const safeValue = escapeHtml(value);
    if (attrPattern.test(tag)) return tag.replace(attrPattern, `${attribute}="${safeValue}"`);
    return tag.replace(/>$/, ` ${attribute}="${safeValue}">`);
  });
}

function replaceFirstElement(html, selector, content) {
  const pattern = new RegExp(`(<${selector}\\b[^>]*>)[\\s\\S]*?(<\\/${selector}>)`, "i");
  return html.replace(pattern, `$1${content}$2`);
}

function updateExistingReviewHtml(html, product, env) {
  const base = siteUrl(env);
  const slug = String(product.slug || "");
  const canonical = `${base}/${encodeURIComponent(slug)}-review.html`;
  const name = plainText(product.name) || "Product";
  const title = plainText(product.review_title) || `${name} Review: What to Check Before Buying`;
  const intro = plainText(product.review_intro || product.short_description) ||
    `Review the current product information for ${name} before making a purchase decision.`;
  const description = shortText(intro || product.short_description, 158);
  const category = plainText(product.category) || "Wellness";
  const image = safeHttpUrl(product.image_url);
  const imageAlt = plainText(product.image_alt) || `${name} product image`;
  const actionUrl = safeHttpUrl(product.affiliate_url) || safeHttpUrl(product.official_url);
  const actionText = plainText(product.cta_text) || "Visit Official Website";

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)} | BetterLife Wellness</title>`);
  html = setTagAttribute(html, "name", "description", "content", description);
  html = setTagAttribute(html, "rel", "canonical", "href", canonical);
  html = setTagAttribute(html, "property", "og:title", "content", title);
  html = setTagAttribute(html, "property", "og:description", "content", description);
  html = setTagAttribute(html, "property", "og:url", "content", canonical);
  html = setTagAttribute(html, "name", "twitter:title", "content", title);
  html = setTagAttribute(html, "name", "twitter:description", "content", description);
  if (image) {
    html = setTagAttribute(html, "property", "og:image", "content", image);
    html = setTagAttribute(html, "name", "twitter:image", "content", image);
  }

  html = replaceFirstElement(html, "h1", escapeHtml(title));
  html = html.replace(/<span\s+class=["']eyebrow["'][^>]*>[\s\S]*?<\/span>/i,
    `<span class="eyebrow">${escapeHtml(category)}</span>`);
  html = html.replace(/<p\s+class=["']lead["'][^>]*>[\s\S]*?<\/p>/i,
    `<p class="lead">${escapeHtml(intro)}</p>`);

  if (image) {
    const imagePattern = /<img\b(?=[^>]*\bclass=["'][^"']*\bproduct-image\b[^"']*["'])[^>]*>/i;
    html = html.replace(imagePattern, (tag) => {
      let next = tag;
      const replaceAttr = (name, val) => {
        const re = new RegExp(`\\b${name}=["'][^"']*["']`, "i");
        return re.test(next) ? next.replace(re, `${name}="${escapeHtml(val)}"`) : next.replace(/>$/, ` ${name}="${escapeHtml(val)}">`);
      };
      next = replaceAttr("src", image);
      next = replaceAttr("alt", imageAlt);
      return next;
    });
  }

  if (actionUrl) {
    html = html.replace(/<a\b(?=[^>]*\bclass=["'][^"']*\bbtn-primary\b[^"']*["'])[^>]*>[\s\S]*?<\/a>/i,
      `<a class="btn btn-primary" href="${escapeHtml(actionUrl)}" target="_blank" rel="sponsored nofollow noopener noreferrer">${escapeHtml(actionText)}</a>`);
  }

  const safetyNote = plainText(product.warning);
  html = html.replace(/<div class=["']dynamic-safety-note["'][^>]*>[\s\S]*?<\/div>/i, "");
  if (safetyNote) {
    const note = `<div class="dynamic-safety-note" style="margin:16px 0;padding:12px 14px;border-left:4px solid #c28a32;background:#fff8e9;border-radius:8px;font-size:14px"><strong>Safety note:</strong> ${escapeHtml(safetyNote)}</div>`;
    html = html.replace(/(<p\s+class=["']lead["'][^>]*>[\s\S]*?<\/p>)/i, `$1${note}`);
  }

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${canonical}#webpage`, "url": canonical, "name": `${title} | BetterLife Wellness`, "description": description, "breadcrumb": { "@id": `${canonical}#breadcrumb` } },
      { "@type": "Article", "headline": title, "description": description, "mainEntityOfPage": { "@id": `${canonical}#webpage` }, "publisher": { "@type": "Organization", "name": "BetterLife Wellness", "url": `${base}/` }, "about": { "@type": "Product", "name": name, "category": category } },
      { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": `${base}/` },
        { "@type": "ListItem", "position": 2, "name": `${name} Review`, "item": canonical }
      ] }
    ]
  };
  const schemaTag = `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
  if (/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i.test(html)) {
    html = html.replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i, schemaTag);
  } else {
    html = html.replace(/<\/head>/i, `${schemaTag}\n</head>`);
  }
  return html;
}

function renderSitemap(products, env) {
  const base = siteUrl(env);
  const urls = [
    `<url><loc>${escapeXml(`${base}/`)}</loc></url>`,
    ...products.map((product) => {
      const slug = String(product.slug || "");
      const lastmod = product.updated_at && !Number.isNaN(Date.parse(product.updated_at))
        ? `<lastmod>${new Date(product.updated_at).toISOString().slice(0, 10)}</lastmod>`
        : "";
      return `<url><loc>${escapeXml(`${base}/${encodeURIComponent(slug)}-review.html`)}</loc>${lastmod}</url>`;
    })
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff"
    }
  });
}

async function staticFallback(request, env) {
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return new Response("Static assets binding is unavailable.", { status: 500 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const isSitemap = url.pathname === "/sitemap.xml";
    const reviewMatch = url.pathname.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)-review\.html$/i);

    if (!isSitemap && !reviewMatch) {
      return staticFallback(request, env);
    }

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { "allow": "GET, HEAD", "cache-control": "no-store" }
      });
    }

    try {
      if (isSitemap) {
        const products = await getPublishedProducts(env);
        const response = renderSitemap(products, env);
        if (method === "HEAD") return new Response(null, { status: 200, headers: response.headers });
        return response;
      }

      const slug = reviewMatch[1].toLowerCase();
      const products = await getPublishedProducts(env, slug);
      const product = products.find((row) => String(row.slug || "").toLowerCase() === slug);
      if (!product) return notFound(method);

      // Keep the complete existing review article as the base. Only synchronize
      // catalog-controlled fields and SEO metadata; preserve all longer editorial sections.
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(new Request(url.toString(), request));
        const contentType = assetResponse.headers.get("content-type") || "";
        if (assetResponse.ok && contentType.includes("text/html")) {
          const originalHtml = await assetResponse.text();
          const updatedHtml = updateExistingReviewHtml(originalHtml, product, env);
          return htmlResponse(updatedHtml, 200, method);
        }
      }

      // New catalog products have no pre-existing editorial page, so create a
      // complete starter guide from the fields already stored in Supabase.
      return htmlResponse(renderProductPage(product, env), 200, method);
    } catch (error) {
      // Keep the last known static review page and sitemap available if Supabase is temporarily unreachable.
      console.error("Dynamic SEO route failed; using static fallback:", error?.message || error);
      return staticFallback(request, env);
    }
  }
};
