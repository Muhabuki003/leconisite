(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────────────
  // Update WORKER_URL after deploying the Cloudflare Worker:
  //   wrangler deploy  →  copy the workers.dev URL here
  const WORKER_URL = 'https://leconi-checkout.YOUR_SUBDOMAIN.workers.dev';

  // ── Product catalog (mirrors the React app's hardcoded data) ───────────────
  const PRODUCTS = [
    // Latest Collections (article-card horizontal scroll)
    { id: 'heart-bean-necklace',     name: 'Heart Bean Necklace',    price: 99,  image: '/product-necklace.jpg', category: 'Necklaces'  },
    { id: 'love-bracelet',           name: 'Love Bracelet',          price: 99,  image: '/product-bracelet.jpg', category: 'Bracelets'  },
    { id: 'gold-hoop-earrings',      name: 'Gold Hoop Earrings',     price: 79,  image: '/product-earrings.jpg', category: 'Earrings'   },
    { id: 'chain-bracelet-stack',    name: 'Chain Bracelet Stack',   price: 89,  image: '/product-chain.jpg',    category: 'Bracelets'  },
    { id: 'statement-ring',          name: 'Statement Ring',         price: 69,  image: '/product-ring.jpg',     category: 'Rings'      },
    // New Arrivals grid (grid-article)
    { id: 'layered-gold-necklace',   name: 'Layered Gold Necklace',  price: 129, image: '/product-necklace.jpg', category: 'Necklaces'  },
    { id: 'crystal-tennis-bracelet', name: 'Crystal Tennis Bracelet',price: 149, image: '/product-bracelet.jpg', category: 'Bracelets'  },
    { id: 'pearl-drop-earrings',     name: 'Pearl Drop Earrings',    price: 89,  image: '/product-earrings.jpg', category: 'Earrings'   },
    { id: 'signet-ring',             name: 'Signet Ring',            price: 59,  image: '/product-ring.jpg',     category: 'Rings'      },
    // Curated Designs (design-tile)
    { id: 'sunburst-pearl',          name: 'Sunburst Pearl',         price: 159, image: '/design-1.jpg',         category: 'Designs'    },
    { id: 'art-deco-brooch',         name: 'Art Deco Brooch',        price: 199, image: '/design-2.jpg',         category: 'Designs'    },
    { id: 'charm-bracelet',          name: 'Charm Bracelet',         price: 119, image: '/design-3.jpg',         category: 'Bracelets'  },
    { id: 'pearl-blossom',           name: 'Pearl Blossom',          price: 89,  image: '/design-4.jpg',         category: 'Designs'    },
    { id: 'golden-stack',            name: 'Golden Stack',           price: 139, image: '/design-5.jpg',         category: 'Sets'       },
    { id: 'floral-brooch',           name: 'Floral Brooch',          price: 179, image: '/design-6.jpg',         category: 'Designs'    },
  ];

  // Build a lookup map by product name for fast matching
  const PRODUCT_BY_NAME = {};
  PRODUCTS.forEach((p) => { PRODUCT_BY_NAME[p.name] = p; });

  // ── Cart state ─────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'leconi_cart';

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  let cart = loadCart();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fmt(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function cartTotal() {
    return cart.reduce((sum, item) => sum + item.price * 100 * item.qty, 0);
  }

  function cartCount() {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }

  // ── Cart CRUD ──────────────────────────────────────────────────────────────
  function addToCart(product) {
    const existing = cart.find((i) => i.id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ id: product.id, name: product.name, price: product.price, image: product.image, category: product.category, qty: 1 });
    }
    saveCart(cart);
    renderCart();
    updateCartBadge();
    showToast(product.name + ' added');
  }

  function removeFromCart(id) {
    cart = cart.filter((i) => i.id !== id);
    saveCart(cart);
    renderCart();
    updateCartBadge();
  }

  function updateQty(id, delta) {
    const item = cart.find((i) => i.id === id);
    if (!item) return;
    item.qty = Math.max(0, item.qty + delta);
    if (item.qty === 0) { removeFromCart(id); return; }
    saveCart(cart);
    renderCart();
    updateCartBadge();
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') node.className = v;
      else if (k === 'textContent') node.textContent = v;
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(c));
    return node;
  }

  // ── UI: cart drawer ────────────────────────────────────────────────────────
  function injectCartUI() {
    // Floating cart button
    const cartBtn = el('button', { id: 'lc-cart-btn', 'aria-label': 'Open cart' });
    cartBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 01-8 0"/>
      </svg>
      Cart&nbsp;<span id="lc-cart-count">0</span>`;
    cartBtn.addEventListener('click', openDrawer);

    // Backdrop
    const backdrop = el('div', { id: 'lc-backdrop' });
    backdrop.addEventListener('click', closeDrawer);

    // Drawer
    const drawer = el('div', { id: 'lc-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Shopping cart' });
    drawer.innerHTML = `
      <div id="lc-drawer-header">
        <h2 id="lc-drawer-title">Your Cart</h2>
        <button id="lc-drawer-close" aria-label="Close cart">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div id="lc-items"></div>
      <div id="lc-drawer-footer">
        <div id="lc-subtotal-row">
          <span id="lc-subtotal-label">Subtotal</span>
          <span id="lc-subtotal-value">$0.00</span>
        </div>
        <button id="lc-checkout-btn" disabled>Checkout</button>
        <p id="lc-checkout-note">Secure checkout powered by Square</p>
      </div>`;

    // Toast
    const toast = el('div', { id: 'lc-toast' });

    document.body.appendChild(cartBtn);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
    document.body.appendChild(toast);

    drawer.querySelector('#lc-drawer-close').addEventListener('click', closeDrawer);
    drawer.querySelector('#lc-checkout-btn').addEventListener('click', startCheckout);

    renderCart();
  }

  function openDrawer() {
    document.getElementById('lc-drawer').classList.add('open');
    document.getElementById('lc-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    document.getElementById('lc-drawer').classList.remove('open');
    document.getElementById('lc-backdrop').classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Render cart contents ───────────────────────────────────────────────────
  function renderCart() {
    const container = document.getElementById('lc-items');
    const checkoutBtn = document.getElementById('lc-checkout-btn');
    const subtotalEl = document.getElementById('lc-subtotal-value');
    if (!container) return;

    if (cart.length === 0) {
      container.innerHTML = `
        <div id="lc-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          <p>Your cart is empty</p>
        </div>`;
      checkoutBtn.disabled = true;
      subtotalEl.textContent = '$0.00';
      return;
    }

    container.innerHTML = '';
    cart.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'lc-item';
      row.dataset.id = item.id;
      row.innerHTML = `
        <img class="lc-item-img" src="${item.image}" alt="${item.name}" loading="lazy">
        <div class="lc-item-info">
          <p class="lc-item-cat">${item.category}</p>
          <p class="lc-item-name">${item.name}</p>
          <div class="lc-item-actions">
            <button class="lc-qty-btn" data-action="dec" data-id="${item.id}" aria-label="Decrease quantity">−</button>
            <span class="lc-qty">${item.qty}</span>
            <button class="lc-qty-btn" data-action="inc" data-id="${item.id}" aria-label="Increase quantity">+</button>
            <button class="lc-remove" data-id="${item.id}" aria-label="Remove item">Remove</button>
          </div>
          <p class="lc-item-price">${fmt(item.price * 100 * item.qty)}</p>
        </div>`;
      container.appendChild(row);
    });

    // Event delegation on the container
    container.onclick = (e) => {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'inc') updateQty(id, 1);
      else if (btn.dataset.action === 'dec') updateQty(id, -1);
      else if (btn.classList.contains('lc-remove')) removeFromCart(id);
    };

    subtotalEl.textContent = fmt(cartTotal());
    checkoutBtn.disabled = false;
  }

  function updateCartBadge() {
    const badge = document.getElementById('lc-cart-count');
    if (badge) badge.textContent = cartCount();
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  let toastTimer;
  function showToast(message) {
    const toast = document.getElementById('lc-toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ── Checkout ───────────────────────────────────────────────────────────────
  async function startCheckout() {
    const btn = document.getElementById('lc-checkout-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="lc-spinner"></span> Processing…';

    try {
      const res = await fetch(`${WORKER_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({ id: i.id, quantity: i.qty })),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout failed');
      }

      // Clear cart then redirect to Square's hosted checkout
      cart = [];
      saveCart(cart);
      updateCartBadge();
      window.location.href = data.url;

    } catch (err) {
      console.error('Leconi checkout error:', err);
      showToast('Checkout failed — please try again');
      btn.disabled = false;
      btn.textContent = 'Checkout';
    }
  }

  // ── Inject "Add to Cart" buttons into product cards ───────────────────────
  function injectCartButtons() {
    injectArticleCardButtons();
    injectGridArticleButtons();
    injectDesignTileButtons();
  }

  // Latest Collections — horizontal-scroll article-cards
  function injectArticleCardButtons() {
    document.querySelectorAll('.article-card').forEach((card) => {
      if (card.querySelector('.lc-add-btn')) return;
      const titleEl = card.querySelector('h1, h2, h3, h4, h5, h6');
      if (!titleEl) return;
      const product = PRODUCT_BY_NAME[titleEl.textContent.trim()];
      if (!product) return;

      const btn = document.createElement('button');
      btn.className = 'lc-add-btn';
      btn.textContent = 'Add to Cart';
      btn.dataset.productId = product.id;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(product);
        flashAdded(btn);
      });

      // Append after the title's parent container
      const infoArea = titleEl.closest('div') || card;
      infoArea.appendChild(btn);
    });
  }

  // New Arrivals — grid-article cards
  function injectGridArticleButtons() {
    document.querySelectorAll('.grid-article').forEach((card) => {
      if (card.querySelector('.lc-add-btn')) return;
      const titleEl = card.querySelector('h1, h2, h3, h4, h5, h6');
      if (!titleEl) return;
      const product = PRODUCT_BY_NAME[titleEl.textContent.trim()];
      if (!product) return;

      const btn = document.createElement('button');
      btn.className = 'lc-add-btn';
      btn.textContent = 'Add to Cart';
      btn.dataset.productId = product.id;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(product);
        flashAdded(btn);
      });

      card.appendChild(btn);
    });
  }

  // Curated Designs — design-tile hover overlays
  function injectDesignTileButtons() {
    document.querySelectorAll('.design-tile').forEach((tile) => {
      if (tile.querySelector('.lc-add-btn')) return;
      const titleEl = tile.querySelector('h1, h2, h3, h4, h5, h6');
      if (!titleEl) return;
      const product = PRODUCT_BY_NAME[titleEl.textContent.trim()];
      if (!product) return;

      const btn = document.createElement('button');
      btn.className = 'lc-add-btn';
      btn.textContent = 'Add to Cart';
      btn.dataset.productId = product.id;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(product);
        flashAdded(btn);
      });

      // Place inside the overlay div if it exists, otherwise append to tile
      const overlay = tile.querySelector('.absolute');
      (overlay || tile).appendChild(btn);
    });
  }

  function flashAdded(btn) {
    btn.textContent = 'Added ✓';
    btn.classList.add('added');
    setTimeout(() => {
      btn.textContent = 'Add to Cart';
      btn.classList.remove('added');
    }, 1800);
  }

  // ── MutationObserver to catch React renders ────────────────────────────────
  function watchForCards() {
    let debounce;
    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(injectCartButtons, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    injectCartButtons();
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  function init() {
    injectCartUI();
    watchForCards();
    updateCartBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
