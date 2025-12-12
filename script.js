// Storage keys
const LS_KEYS = {
  CART: "ora_cart",
  ORDERS: "ora_orders",
  CONTACTS: "ora_contacts",
  PENDING_ORDER: "ora_pending_order" // used for Khalti success completion
};

let catalog = { newArrival: [], men: [], women: [] };
let productIndex = {}; // id -> product

// Utilities for localStorage
function readLS(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Load products from product.json
async function loadProducts() {
  try {
    const res = await fetch("product.json");
    catalog = await res.json();
    // Build index for quick lookup
    [catalog.newArrival, catalog.men, catalog.women].flat().forEach(p => { productIndex[p.id] = p; });

    // Render sections across pages
    if (document.getElementById("newArrival")) renderList("newArrival", catalog.newArrival);
    if (document.getElementById("menSection")) renderList("menSection", catalog.men);
    if (document.getElementById("womenSection")) renderList("womenSection", catalog.women);

    if (document.getElementById("productsNewArrival")) renderList("productsNewArrival", catalog.newArrival);
    if (document.getElementById("productsMen")) renderList("productsMen", catalog.men);
    if (document.getElementById("productsWomen")) renderList("productsWomen", catalog.women);

    // Bind slider only on home
    bindSlider();
  } catch (err) {
    console.error("Failed to load products:", err);
  }
}

// Slider autoplay (home page)
function bindSlider() {
  const slides = document.querySelectorAll(".hero-slider .slide");
  if (!slides.length) return;
  let idx = 0;
  setInterval(() => {
    slides[idx].classList.remove("active");
    idx = (idx + 1) % slides.length;
    slides[idx].classList.add("active");
  }, 3500);
}

// Render a list of products into a container
function renderList(containerId, list) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  list.forEach(p => container.appendChild(productCard(p)));
}

// Product card element
function productCard(p) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <img src="${p.img}" alt="${p.name}">
    <div class="info">
      <span class="badge">${p.tag}</span>
      <strong>${p.name}</strong>
      <span class="price">NPR ${p.price.toLocaleString()}</span>
      <div class="actions">
        <button class="btn outline" onclick="viewProduct('${p.id}')">View</button>
        <button class="btn primary" onclick="addToCart('${p.id}')">Add to Cart</button>
      </div>
    </div>
  `;
  return el;
}

// View product quick alert
function viewProduct(id) {
  const p = productIndex[id];
  if (!p) return;
  alert(`${p.name}\nPrice: NPR ${p.price.toLocaleString()}`);
}

// Cart operations
function addToCart(id) {
  const product = productIndex[id];
  if (!product) return;
  const cart = readLS(LS_KEYS.CART);
  const existing = cart.find(c => c.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, img: product.img, qty: 1 });
  }
  writeLS(LS_KEYS.CART, cart);
  toast(`Added to cart: ${product.name}`);
}

function renderCart() {
  const cart = readLS(LS_KEYS.CART);
  const listEl = document.getElementById("cartList");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!cart.length) {
    listEl.innerHTML = "<p>Your cart is empty.</p>";
  } else {
    cart.forEach(item => {
      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <img src="${item.img}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <div class="qty">
            <button class="btn" onclick="changeQty('${item.id}', -1)">-</button>
            <span>${item.qty}</span>
            <button class="btn" onclick="changeQty('${item.id}', 1)">+</button>
          </div>
          <span class="price">NPR ${(item.price * item.qty).toLocaleString()}</span>
        </div>
        <span class="remove" onclick="removeItem('${item.id}')">Remove</span>
      `;
      listEl.appendChild(row);
    });
  }
  updateTotals();
}

function changeQty(id, delta) {
  const cart = readLS(LS_KEYS.CART);
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    const idx = cart.findIndex(i => i.id === id);
    cart.splice(idx, 1);
  }
  writeLS(LS_KEYS.CART, cart);
  renderCart();
}

function removeItem(id) {
  const cart = readLS(LS_KEYS.CART).filter(i => i.id !== id);
  writeLS(LS_KEYS.CART, cart);
  renderCart();
}

function updateTotals() {
  const cart = readLS(LS_KEYS.CART);
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const total = subtotal; // free shipping demo
  const subEl = document.getElementById("cartSubtotal");
  const totEl = document.getElementById("cartTotal");
  if (subEl) subEl.textContent = `NPR ${subtotal.toLocaleString()}`;
  if (totEl) totEl.textContent = `NPR ${total.toLocaleString()}`;
}

// Payment flow with Khalti integration
function bindPayment() {
  const btn = document.getElementById("payBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const method = document.querySelector('input[name="payment"]:checked');
    const statusEl = document.getElementById("paymentStatus");
    const cart = readLS(LS_KEYS.CART);
    if (!cart.length) {
      statusEl.textContent = "Your cart is empty.";
      statusEl.style.color = "#ef4444";
      return;
    }
    if (!method) {
      statusEl.textContent = "Please select a payment method (eSewa, Khalti, or COD).";
      statusEl.style.color = "#ef4444";
      return;
    }

    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const orderId = "ORD-" + Date.now();

    if (method.value === "Khalti") {
      // store pending order locally (finalize on success page)
      writeLS(LS_KEYS.PENDING_ORDER, { id: orderId, items: cart, total, method: "Khalti" });

      try {
        const res = await fetch("/pay/khalti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: total * 100, // Khalti expects paisa
            orderId,
            orderName: "ORA Watch Purchase",
            customer: { name: "Customer", email: "customer@example.com", phone: "9800000000" }
          })
        });
        const data = await res.json();
        if (data.payment_url) {
          statusEl.textContent = "Redirecting to Khalti...";
          statusEl.style.color = "#22c55e";
          window.location.href = data.payment_url;
        } else {
          statusEl.textContent = "Error initiating Khalti payment.";
          statusEl.style.color = "#ef4444";
        }
      } catch {
        statusEl.textContent = "Network error initiating Khalti payment.";
        statusEl.style.color = "#ef4444";
      }
      return;
    }

    // eSewa or COD simulation
    const orders = readLS(LS_KEYS.ORDERS);
    orders.push({
      id: orderId,
      items: cart,
      total,
      method: method.value,
      status: "Processing",
      createdAt: new Date().toISOString()
    });
    writeLS(LS_KEYS.ORDERS, orders);
    writeLS(LS_KEYS.CART, []);
    statusEl.textContent = `Payment successful via ${method.value}. Order ${orderId} placed!`;
    statusEl.style.color = "#22c55e";
    setTimeout(() => { window.location.href = "profile.html"; }, 1200);
  });
}

// Finalize Khalti order on success page
function completeKhaltiOrderIfApplicable() {
  const pendingRaw = localStorage.getItem(LS_KEYS.PENDING_ORDER);
  if (!pendingRaw) return;
  const pending = JSON.parse(pendingRaw);
  const orders = readLS(LS_KEYS.ORDERS);
  orders.push({
    id: pending.id,
    items: pending.items,
    total: pending.total,
    method: "Khalti",
    status: "Processing",
    createdAt: new Date().toISOString()
  });
  writeLS(LS_KEYS.ORDERS, orders);
  writeLS(LS_KEYS.CART, []);
  localStorage.removeItem(LS_KEYS.PENDING_ORDER);
  setTimeout(() => { window.location.href = "profile.html"; }, 1200);
}

// Orders rendering (Profile)
function renderOrders() {
  const orders = readLS(LS_KEYS.ORDERS);
  const container = document.getElementById("ordersList");
  if (!container) return;
  container.innerHTML = "";
  if (!orders.length) {
    container.innerHTML = "<p>No orders yet. Buy something you love.</p>";
    return;
  }
  orders.slice().reverse().forEach(order => {
    const card = document.createElement("div");
    card.className = "order-card";
    const firstImg = order.items[0]?.img || "";
    const itemNames = order.items.map(i => `${i.name} ×${i.qty}`).join(", ");
    card.innerHTML = `
      <img src="${firstImg}" alt="Order item">
      <div class="details">
        <strong>Order ${order.id}</strong>
        <p>${itemNames}</p>
        <p>Total: NPR ${order.total.toLocaleString()}</p>
        <p class="order-status">Status: ${order.status}</p>
        <p>Payment: ${order.method}</p>
      </div>
      <div class="actions">
        <button class="btn outline" onclick="advanceStatus('${order.id}')">Advance Status</button>
        <button class="btn primary" onclick="markDelivered('${order.id}')">Mark Delivered</button>
        <button class="btn danger" onclick="deleteOrder('${order.id}')">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function advanceStatus(orderId) {
  const orders = readLS(LS_KEYS.ORDERS);
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  const stages = ["Processing", "Packed", "Shipped", "Out for Delivery", "Delivered"];
  const idx = stages.indexOf(order.status);
  order.status = stages[Math.min(idx + 1, stages.length - 1)];
  writeLS(LS_KEYS.ORDERS, orders);
  renderOrders();
}

function markDelivered(orderId) {
  const orders = readLS(LS_KEYS.ORDERS);
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.status = "Delivered";
    writeLS(LS_KEYS.ORDERS, orders);
    renderOrders();
  }
}

function deleteOrder(orderId) {
  let orders = readLS(LS_KEYS.ORDERS);
  orders = orders.filter(o => o.id !== orderId);
  writeLS(LS_KEYS.ORDERS, orders);
  renderOrders();
}

// Contact form
function bindContactForm() {
  const form = document.getElementById("contactForm");
  const status = document.getElementById("contactStatus");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("contactName").value.trim();
    const email = document.getElementById("contactEmail").value.trim();
    const message = document.getElementById("contactMessage").value.trim();
    if (!name || !email || !message) {
      status.textContent = "Please fill in all fields.";
      status.style.color = "#ef4444";
      return;
    }
    const contacts = readLS(LS_KEYS.CONTACTS);
    contacts.push({ id: Date.now(), name, email, message });
    writeLS(LS_KEYS.CONTACTS, contacts);
    status.textContent = "Message sent successfully. We’ll get back to you soon.";
    status.style.color = "#22c55e";
    form.reset();
  });
}

// Toast
function toast(msg) {
  let bar = document.getElementById("toast");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "toast";
    bar.style.position = "fixed";
    bar.style.bottom = "20px";
    bar.style.left = "50%";
    bar.style.transform = "translateX(-50%)";
    bar.style.background = "#111827";
    bar.style.color = "#eaeef6";
    bar.style.border = "1px solid #2a3140";
    bar.style.padding = "10px 14px";
    bar.style.borderRadius = "8px";
    bar.style.zIndex = "100";
    document.body.appendChild(bar);
  }
  bar.textContent = msg;
  bar.style.opacity = "1";
  setTimeout(() => { bar.style.opacity = "0"; }, 1600);
}

// Bootstrap
document.addEventListener("DOMContentLoaded", () => {
  loadProducts(); // dynamic product loading
  const path = window.location.pathname;
  if (path.endsWith("cart.html")) { renderCart(); bindPayment(); }
  if (path.endsWith("about.html")) bindContactForm();
  if (path.endsWith("profile.html")) renderOrders();
  if (path.endsWith("payment-success.html")) completeKhaltiOrderIfApplicable();
});
