(() => {
  'use strict';

  let site = null;
  let dict = null;
  let currentLang = 'fr';

  // ---------- Utilities --------------------------------------------------
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const photoSrc = (i) => `public/images/photo-${String(i).padStart(2, '0')}.jpeg`;

  const loadJSON = async (url) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
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
    // data-bind-md: markdown binding; value may be a string or array of paragraphs
    document.querySelectorAll('[data-bind-md]').forEach((el) => {
      const v = resolve(el.getAttribute('data-bind-md'));
      if (v != null) el.innerHTML = renderMarkdown(v);
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

  // ---------- Gallery ----------------------------------------------------
  const buildGallery = () => {
    const galleryEl = document.getElementById('gallery');
    galleryEl.innerHTML = '';
    const hero = site.photos?.hero || [1, 2, 3, 4, 5];
    hero.forEach((n) => {
      const div = document.createElement('div');
      div.className = 'photo';
      const alt = (dict.gallery?.photoOf || 'Photo {n}').replace('{n}', n);
      div.innerHTML = `<img src="${photoSrc(n)}" alt="${alt}" loading="lazy" />`;
      div.addEventListener('click', () => openLightbox(n));
      galleryEl.appendChild(div);
    });
  };

  // ---------- Lightbox ---------------------------------------------------
  const lb = {
    el: null, img: null, count: null, current: 1,
    init() {
      this.el = document.getElementById('lightbox');
      this.img = document.getElementById('lb-img');
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
      this.img.src = photoSrc(this.current);
      this.img.alt = (dict.gallery?.photoOf || 'Photo {n}').replace('{n}', this.current);
      this.count.textContent = `${this.current} / ${site.photos.total}`;
    },
  };
  const openLightbox = (n) => lb.open(n);

  // ---------- Wire up listing/contact links -----------------------------
  const wireLinks = () => {
    const tel = (site.contact?.phone || '').replace(/\s+/g, '');
    document.getElementById('airbnb-link').href = site.listings?.airbnb || '#';
    document.getElementById('booking-link').href = site.listings?.booking || '#';
    document.getElementById('call-link').href = tel ? `tel:${tel}` : '#';
    document.getElementById('sms-link').href = tel ? `sms:${tel}` : '#';
    const subj = encodeURIComponent(
      currentLang === 'en'
        ? 'Sceaux Serenity — booking inquiry'
        : 'Sceaux Sérénité — demande de réservation'
    );
    document.getElementById('email-link').href = site.contact?.email
      ? `mailto:${site.contact.email}?subject=${subj}`
      : '#';

    // Map iframe
    const m = site.map || {};
    const iframe = document.getElementById('map-iframe');
    if (m.bbox && m.marker) {
      iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${m.bbox}&layer=mapnik&marker=${m.marker}`;
    }
  };

  // ---------- Lang switch ------------------------------------------------
  const setLang = async (lang) => {
    if (!['fr', 'en'].includes(lang)) lang = 'fr';
    currentLang = lang;
    dict = await loadJSON(`content/${lang}.json`);
    applyContent();
    buildGallery();
    wireLinks();
    try { localStorage.setItem('lang', lang); } catch (_) {}
  };

  // ---------- Boot -------------------------------------------------------
  const init = async () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    lb.init();

    document.querySelectorAll('.lang-switch button').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });

    try {
      site = await loadJSON('content/site.json');
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
