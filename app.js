(() => {
  'use strict';

  let site = null;
  let dict = null;
  let reviews = null;
  let prose = {};
  const proseCache = {};
  let currentLang = 'fr';
  let activeCategory = 'all';

  // ---------- Utilities --------------------------------------------------
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const photoBase = (i) => `public/images/photo-${String(i).padStart(2, '0')}`;
  const photoSrc = (i) => `${photoBase(i)}.jpeg`;
  const photoSrcWebp = (i) => `${photoBase(i)}.webp`;
  const photoPicture = (i, { alt = '', loading = 'lazy', cls = '' } = {}) => `
    <picture${cls ? ` class="${cls}"` : ''}>
      <source srcset="${photoSrcWebp(i)}" type="image/webp" />
      <img src="${photoSrc(i)}" alt="${alt}" loading="${loading}" />
    </picture>`;

  const loadJSON = async (url) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  };
  const loadText = async (url) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.text();
  };

  // Slugs map to content/prose/{lang}/{slug}.md
  const PROSE_KEYS = ['about', 'access', 'location', 'book-intro', 'book-direct', 'rules-checkin', 'rules-health'];
  const loadProse = async (lang) => {
    if (proseCache[lang]) return proseCache[lang];
    const entries = await Promise.all(PROSE_KEYS.map(async (key) => {
      try {
        return [key, await loadText(`content/prose/${lang}/${key}.md`)];
      } catch (err) {
        console.warn(`Missing prose file: ${key} (${lang})`, err);
        return [key, ''];
      }
    }));
    proseCache[lang] = Object.fromEntries(entries);
    return proseCache[lang];
  };

  // ---------- Minimal markdown -> HTML ----------------------------------
  // Supports: **bold**, *italic*, `code`, [text](url), unordered lists,
  // ## h2, ### h3, paragraphs separated by blank lines, single \n -> <br>.
  // Input is HTML-escaped first; safe to render with innerHTML.
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const mdInline = (s) => s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  const renderMarkdown = (input) => {
    if (input == null) return '';
    const text = Array.isArray(input) ? input.join('\n\n') : String(input);
    const escaped = escapeHTML(text);
    return escaped.split(/\n\s*\n/).map((block) => {
      block = block.trim();
      if (!block) return '';
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return '<ul>' + lines.map((l) => `<li>${mdInline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('') + '</ul>';
      }
      if (/^###\s+/.test(block)) return `<h3>${mdInline(block.slice(4).trim())}</h3>`;
      if (/^##\s+/.test(block))  return `<h2>${mdInline(block.slice(3).trim())}</h2>`;
      return `<p>${mdInline(block).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  };

  // ---------- Binding ----------------------------------------------------
  const applyContent = () => {
    document.documentElement.lang = currentLang;
    document.title = dict.meta?.title || document.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && dict.meta?.description) metaDesc.setAttribute('content', dict.meta.description);

    // data-bind: plain text binding (dotted path in dict, then site config)
    const resolve = (path) => {
      let v = getPath(dict, path);
      if (v == null) v = getPath(site, path);
      return v;
    };
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const v = resolve(el.getAttribute('data-bind'));
      if (typeof v === 'string') el.textContent = v;
    });
    // data-bind-md: renders content/prose/{lang}/{slug}.md as HTML.
    document.querySelectorAll('[data-bind-md]').forEach((el) => {
      const slug = el.getAttribute('data-bind-md');
      const md = prose[slug];
      if (md != null) el.innerHTML = renderMarkdown(md);
    });

    // Quick facts
    const factsEl = document.getElementById('quick-facts');
    factsEl.innerHTML = '';
    ['guests', 'bedrooms', 'beds', 'baths'].forEach((k) => {
      const f = dict.facts?.[k];
      if (!f) return;
      const li = document.createElement('li');
      li.innerHTML = `<strong>${f.value}</strong><span>${f.label}</span>`;
      factsEl.appendChild(li);
    });

    // Features
    const featRow = document.getElementById('feature-row');
    featRow.innerHTML = '';
    const featIcons = [
      'M3 11v8m18-8v8M3 13h18M5 13v-2a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2',
      'M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 6V4m4 2V4m4 2V4',
      'M12 22V12m0 0c-3 0-5-2-5-5 3 0 5 2 5 5zm0 0c3 0 5-2 5-5-3 0-5 2-5 5z',
      'M4 17h16M6 17V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v9M9 21v-2m6 2v-2',
    ];
    (dict.features || []).forEach((f, idx) => {
      const div = document.createElement('div');
      div.className = 'feature';
      div.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="${featIcons[idx] || featIcons[0]}"/></svg>
        <div><h3></h3><p></p></div>`;
      div.querySelector('h3').textContent = f.title;
      div.querySelector('p').textContent = f.body;
      featRow.appendChild(div);
    });

    // Rooms
    const roomsEl = document.getElementById('rooms');
    roomsEl.innerHTML = '';
    (dict.rooms?.items || []).forEach((r) => {
      const art = document.createElement('article');
      art.className = 'room';
      art.innerHTML = '<h4></h4><p></p>';
      art.querySelector('h4').textContent = r.title;
      art.querySelector('p').textContent = r.body;
      roomsEl.appendChild(art);
    });

    // Amenities
    const amenitiesEl = document.getElementById('amenities-list');
    amenitiesEl.innerHTML = '';
    const icons = site.amenityIcons || [];
    (dict.amenities?.items || []).forEach((label, idx) => {
      const li = document.createElement('li');
      const icon = icons[idx] || icons[0] || '';
      li.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="${icon}"/></svg><span></span>`;
      li.querySelector('span').textContent = label;
      amenitiesEl.appendChild(li);
    });

    // Reviews
    renderReviews();

    // Lightbox button aria-labels
    document.getElementById('lb-close').setAttribute('aria-label', dict.lightbox?.close || 'Close');
    document.getElementById('lb-prev').setAttribute('aria-label', dict.lightbox?.prev || 'Previous');
    document.getElementById('lb-next').setAttribute('aria-label', dict.lightbox?.next || 'Next');

    // Language toggle state
    document.querySelectorAll('.lang-switch button').forEach((b) => {
      const on = b.dataset.lang === currentLang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  // ---------- Reviews ----------------------------------------------------
  const renderReviews = () => {
    const summaryEl = document.getElementById('reviews-summary');
    const tagsEl = document.getElementById('reviews-tags');
    const gridEl = document.getElementById('reviews-grid');
    if (!summaryEl || !gridEl || !reviews) return;
    const s = reviews.summary || {};
    const cats = s.categories || {};
    const basedOn = (dict.reviews?.basedOn || 'based on {n} reviews').replace('{n}', s.count || 0);
    const catRows = Object.values(cats).map((c) => {
      const label = c[currentLang] || c.fr || c.en || '';
      const score = Number(c.score) || 0;
      const pct = Math.max(0, Math.min(100, (score / 5) * 100));
      return `
        <div class="rs-cat">
          <span class="rs-cat-label">${label}</span>
          <span class="rs-cat-bar"><span style="width: ${pct}%"></span></span>
          <span class="rs-cat-score">${score.toFixed(2).replace('.', currentLang === 'fr' ? ',' : '.')}</span>
        </div>`;
    }).join('');
    const favBadge = s.guestFavorite
      ? `<span class="rs-fav" title="${dict.reviews?.guestFavorite || ''}">★ ${dict.reviews?.guestFavorite || 'Guest favorite'}</span>`
      : '';
    summaryEl.innerHTML = `
      <div class="rs-overall">
        <div class="rs-big">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>
          <span class="rs-rating">${s.rating || ''}</span>
        </div>
        <div class="rs-overall-text">
          <strong>${dict.reviews?.overall || 'Overall'}</strong>
          <span class="muted">${basedOn}</span>
          ${favBadge}
        </div>
      </div>
      <div class="rs-cats">${catRows}</div>`;

    // Tags ("guests often mention")
    if (tagsEl) {
      const tags = reviews.tags || [];
      if (tags.length) {
        const countTpl = dict.reviews?.tagsCount || '{n} reviews';
        const tagsHtml = tags.map((t) => {
          const c = countTpl.replace('{n}', t.count);
          return `<li class="rs-tag"><span class="rs-tag-name"></span><span class="rs-tag-count muted small">${c}</span></li>`;
        }).join('');
        tagsEl.innerHTML = `
          <h3 class="rs-tags-title">${dict.reviews?.tagsTitle || 'Guests often mention'}</h3>
          <ul class="rs-tag-list">${tagsHtml}</ul>`;
        // Set tag names safely (avoid HTML injection)
        const nameEls = tagsEl.querySelectorAll('.rs-tag-name');
        tags.forEach((t, i) => {
          if (nameEls[i]) nameEls[i].textContent = t[currentLang] || t.fr || t.en || '';
        });
      } else {
        tagsEl.innerHTML = '';
      }
    }

    gridEl.innerHTML = '';
    (reviews.items || []).forEach((r) => {
      const text = (r.text && (r.text[currentLang] || r.text.fr || r.text.en)) || '';
      const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(Math.max(0, 5 - (r.rating || 5)));
      const card = document.createElement('article');
      card.className = 'review-card';
      card.innerHTML = `
        <header>
          <div class="rc-avatar" aria-hidden="true">${(r.author || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div class="rc-author">${r.author || ''}</div>
            <div class="rc-date muted small">${r.date || ''}</div>
          </div>
        </header>
        <div class="rc-stars" aria-label="${r.rating || 5}/5">${stars}</div>
        <p class="rc-text"></p>`;
      card.querySelector('.rc-text').textContent = text;
      gridEl.appendChild(card);
    });
  };

  // ---------- Gallery ----------------------------------------------------
  const galleryPhotos = () => {
    const featured = Number(site.photos?.featured) || 1;
    const support = (site.photos?.hero || [2, 3, 4, 5]).filter((n) => n !== featured);
    return [featured, ...support].slice(0, 5);
  };
  const buildGallery = () => {
    const galleryEl = document.getElementById('gallery');
    galleryEl.innerHTML = '';
    galleryPhotos().forEach((n) => {
      const div = document.createElement('div');
      div.className = 'photo';
      const alt = (dict.gallery?.photoOf || 'Photo {n}').replace('{n}', n);
      div.innerHTML = photoPicture(n, { alt });
      div.addEventListener('click', () => openLightbox(n));
      galleryEl.appendChild(div);
    });
  };

  // ---------- All-photos overlay ----------------------------------------
  const overlay = {
    el: null, grid: null, tabs: null,
    init() {
      this.el = document.getElementById('photo-overlay');
      this.grid = document.getElementById('po-grid');
      this.tabs = document.getElementById('po-tabs');
      document.getElementById('po-close').addEventListener('click', () => this.close());
      document.getElementById('show-all').addEventListener('click', () => this.open());
      document.addEventListener('keydown', (e) => {
        if (!this.el.hidden && lb.el.hidden && e.key === 'Escape') this.close();
      });
    },
    open() {
      activeCategory = 'all';
      this.renderTabs();
      this.renderGrid();
      this.el.hidden = false;
      this.el.scrollTop = 0;
      document.body.style.overflow = 'hidden';
    },
    close() {
      this.el.hidden = true;
      document.body.style.overflow = '';
    },
    photosFor(category) {
      const total = site.photos?.total || 1;
      if (category === 'all') {
        return Array.from({ length: total }, (_, i) => i + 1);
      }
      const cat = (site.photos?.categories || {})[category];
      return (cat?.items || []).filter((n) => n >= 1 && n <= total);
    },
    renderTabs() {
      const cats = site.photos?.categories || {};
      const keys = ['all', ...Object.keys(cats)];
      this.tabs.innerHTML = '';
      keys.forEach((key) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'po-tab' + (key === activeCategory ? ' active' : '');
        const label = key === 'all'
          ? (dict.gallery?.allCategory || 'All')
          : (cats[key]?.[currentLang] || cats[key]?.fr || cats[key]?.en || key);
        const count = this.photosFor(key).length;
        btn.innerHTML = `<span>${label}</span><span class="po-tab-count">${count}</span>`;
        btn.addEventListener('click', () => {
          activeCategory = key;
          this.renderTabs();
          this.renderGrid();
          this.el.scrollTop = 0;
        });
        this.tabs.appendChild(btn);
      });
    },
    renderGrid() {
      const featured = Number(site.photos?.featured) || 1;
      const total = site.photos?.total || 1;
      const altTpl = dict.gallery?.photoOf || 'Photo {n}';
      const photos = this.photosFor(activeCategory);
      this.grid.innerHTML = '';
      photos.forEach((i) => {
        const div = document.createElement('div');
        div.className = 'po-photo' + (i === featured ? ' featured' : '');
        const alt = altTpl.replace('{n}', i);
        div.innerHTML = `${photoPicture(i, { alt })}<span class="po-photo-num">${i} / ${total}</span>`;
        div.addEventListener('click', () => openLightbox(i));
        this.grid.appendChild(div);
      });
    },
  };

  // ---------- Lightbox ---------------------------------------------------
  const lb = {
    el: null, img: null, source: null, count: null, current: 1,
    init() {
      this.el = document.getElementById('lightbox');
      this.img = document.getElementById('lb-img');
      this.source = document.getElementById('lb-source');
      this.count = document.getElementById('lb-count');
      document.getElementById('lb-close').addEventListener('click', () => this.close());
      document.getElementById('lb-next').addEventListener('click', () => this.next());
      document.getElementById('lb-prev').addEventListener('click', () => this.prev());
      this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
      document.addEventListener('keydown', (e) => {
        if (this.el.hidden) return;
        if (e.key === 'Escape') this.close();
        else if (e.key === 'ArrowRight') this.next();
        else if (e.key === 'ArrowLeft') this.prev();
      });
    },
    open(n) { this.current = n; this.render(); this.el.hidden = false; document.body.style.overflow = 'hidden'; },
    close() { this.el.hidden = true; document.body.style.overflow = ''; },
    next() { const t = site.photos.total; this.current = this.current === t ? 1 : this.current + 1; this.render(); },
    prev() { const t = site.photos.total; this.current = this.current === 1 ? t : this.current - 1; this.render(); },
    render() {
      if (this.source) this.source.srcset = photoSrcWebp(this.current);
      this.img.src = photoSrc(this.current);
      this.img.alt = (dict.gallery?.photoOf || 'Photo {n}').replace('{n}', this.current);
      this.count.textContent = `${this.current} / ${site.photos.total}`;
    },
  };
  const openLightbox = (n) => lb.open(n);

  // ---------- Wire up listing/contact links -----------------------------
  const wireLinks = () => {
    const tel = (site.contact?.phone || '').replace(/\s+/g, '');
    const telDigits = tel.replace(/[^\d+]/g, '').replace(/^\+/, '');
    document.getElementById('airbnb-link').href = site.listings?.airbnb || '#';
    document.getElementById('booking-link').href = site.listings?.booking || '#';

    // Google Business (shown only if a URL is configured)
    const googleBtn = document.getElementById('google-link');
    if (googleBtn) {
      if (site.listings?.google) {
        googleBtn.href = site.listings.google;
        googleBtn.hidden = false;
      } else {
        googleBtn.hidden = true;
      }
    }
    document.getElementById('call-link').href = tel ? `tel:${tel}` : '#';
    document.getElementById('sms-link').href = tel ? `sms:${tel}` : '#';

    // Reviews → Airbnb link
    const revLink = document.getElementById('reviews-airbnb-link');
    if (revLink) revLink.href = site.listings?.airbnb || '#';

    // WhatsApp (shown only if site.contact.whatsapp === true)
    const waBtn = document.getElementById('whatsapp-link');
    if (waBtn) {
      if (site.contact?.whatsapp && telDigits) {
        const waMsg = encodeURIComponent(
          currentLang === 'en'
            ? "Hello, I'd like to ask about Sceaux Serenity."
            : 'Bonjour, je souhaite obtenir des informations sur Sceaux Sérénité.'
        );
        waBtn.href = `https://wa.me/${telDigits}?text=${waMsg}`;
        waBtn.hidden = false;
      } else {
        waBtn.hidden = true;
      }
    }

    const subj = encodeURIComponent(
      currentLang === 'en'
        ? 'Sceaux Serenity — booking inquiry'
        : 'Sceaux Sérénité — demande de réservation'
    );
    document.getElementById('email-link').href = site.contact?.email
      ? `mailto:${site.contact.email}?subject=${subj}`
      : '#';

    // Map iframe — full address (house-level), else exact coords, else name, else OSM
    const m = site.map || {};
    const iframe = document.getElementById('map-iframe');
    const zoom = m.zoom || 16;
    if (m.address) {
      iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(m.address)}&z=${zoom}&output=embed`;
    } else if (m.center) {
      // q=lat,lng(Label) drops a labeled pin and centers the view on it
      const label = m.label ? ` (${m.label})` : '';
      iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(m.center + label)}&z=${zoom}&output=embed`;
    } else if (m.googleQuery) {
      iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(m.googleQuery)}&z=${zoom}&output=embed`;
    } else if (m.bbox && m.marker) {
      iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${m.bbox}&layer=mapnik&marker=${m.marker}`;
    }

    // "Open in Google Maps" link under the map
    const mapLink = document.getElementById('map-link');
    if (mapLink) {
      const href = site.listings?.google
        || (m.address ? `https://maps.google.com/maps?q=${encodeURIComponent(m.address)}&z=${zoom}` : null)
        || (m.center ? `https://maps.google.com/maps?q=${encodeURIComponent(m.center)}&z=${zoom}` : null)
        || (m.googleQuery ? `https://maps.google.com/maps?q=${encodeURIComponent(m.googleQuery)}` : null);
      if (href) {
        mapLink.href = href;
        mapLink.hidden = false;
      } else {
        mapLink.hidden = true;
      }
    }

    // Rewrite OG / canonical / JSON-LD from site config
    const ld = document.getElementById('ld-json');
    let ldData = null;
    if (ld) { try { ldData = JSON.parse(ld.textContent); } catch (_) {} }

    if (ldData) {
      // Address + geo from site.json (single source of truth)
      const addr = site.address || {};
      if (addr.street || addr.city) {
        ldData.address = {
          '@type': 'PostalAddress',
          streetAddress: addr.street || undefined,
          postalCode: addr.postalCode || undefined,
          addressLocality: addr.city || undefined,
          addressRegion: addr.region || undefined,
          addressCountry: addr.country || undefined,
        };
      }
      const center = (site.map || {}).center;
      if (center && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(center)) {
        const [lat, lng] = center.split(',').map(Number);
        ldData.geo = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
      }
    }

    if (site.siteUrl) {
      const base = site.siteUrl.replace(/\/$/, '');
      const featured = Number(site.photos?.featured) || 1;
      const imgUrl = `${base}/public/images/photo-${String(featured).padStart(2, '0')}.jpeg`;
      const setMeta = (selector, attr, value) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute(attr, value);
      };
      setMeta('meta[property="og:url"]', 'content', `${base}/`);
      setMeta('meta[property="og:image"]', 'content', imgUrl);
      setMeta('meta[name="twitter:image"]', 'content', imgUrl);
      setMeta('link[rel="canonical"]', 'href', `${base}/`);
      if (ldData) { ldData.url = `${base}/`; ldData.image = imgUrl; }
    }

    if (ld && ldData) ld.textContent = JSON.stringify(ldData, null, 2);
  };

  // ---------- Lang switch ------------------------------------------------
  const setLang = async (lang) => {
    if (!['fr', 'en'].includes(lang)) lang = 'fr';
    currentLang = lang;
    [dict, prose] = await Promise.all([
      loadJSON(`content/${lang}.json`),
      loadProse(lang),
    ]);
    applyContent();
    buildGallery();
    wireLinks();
    try { localStorage.setItem('lang', lang); } catch (_) {}
  };

  // ---------- Theme switch ----------------------------------------------
  const THEMES = ['serenity', 'classique', 'azur', 'nuit'];
  const setTheme = (theme) => {
    if (!THEMES.includes(theme)) theme = 'serenity';
    if (theme === 'serenity') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-picker button').forEach((b) => {
      const on = b.dataset.theme === theme;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    try { localStorage.setItem('theme', theme); } catch (_) {}
  };

  // ---------- Boot -------------------------------------------------------
  const init = async () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    lb.init();
    overlay.init();

    document.querySelectorAll('.lang-switch button').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
    document.querySelectorAll('.theme-picker button').forEach((btn) => {
      btn.addEventListener('click', () => setTheme(btn.dataset.theme));
    });

    let savedTheme = 'serenity';
    try {
      const t = localStorage.getItem('theme');
      if (t && THEMES.includes(t)) savedTheme = t;
    } catch (_) {}
    setTheme(savedTheme);

    try {
      [site, reviews] = await Promise.all([
        loadJSON('content/site.json'),
        loadJSON('content/reviews.json').catch(() => ({ summary: {}, items: [] })),
      ]);
    } catch (err) {
      console.error('Failed to load site.json', err);
      document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif">
        <h1>Content failed to load</h1>
        <p>Make sure the site is served via HTTP (e.g. <code>python3 -m http.server</code>), not opened via <code>file://</code>.</p>
        <pre>${String(err)}</pre></div>`;
      return;
    }

    let initial = 'fr';
    try {
      const saved = localStorage.getItem('lang');
      if (saved === 'fr' || saved === 'en') initial = saved;
      else if ((navigator.language || '').toLowerCase().startsWith('en')) initial = 'en';
    } catch (_) {}
    await setLang(initial);
  };

  init();
})();
