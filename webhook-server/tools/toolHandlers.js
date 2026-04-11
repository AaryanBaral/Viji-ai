// toolHandlers.js
// processToolCall and resolveOrderingCustomer

const axios = require('axios');
const { supabase, CUSTOMER_CARE_PHONE } = require('../shared');
const { searchProducts, searchWorkshops, bulkSearchProducts, calculatePrice } = require('../services/productService');
const { addToCart, calculateCartTotal, createOrder, getOrderStatus, getCustomerOrders, checkStockForCart, decrementStock } = require('../services/orderService');
const { saveKnowledge, lookupKnowledge } = require('../db/knowledgeBase');
const { loadConfig } = require('../ai/promptBuilder');
const { sendOrderConfirmation } = require('../services/notifications');

function isNepalPhone(phone) {
  return (phone || '').startsWith('+977') || (phone || '').startsWith('977');
}

async function getCustomerPriceNPR(mrpNpr, grade, hsnCode) {
  if (!mrpNpr) return { originalPrice: null, discount: 0, finalPrice: null };
  try {
    const { data, error } = await supabase.rpc('get_customer_price', {
      p_mrp_npr: mrpNpr,
      p_grade: grade || null,
      p_hsn_code: hsnCode || null
    });
    if (error || data == null) {
      console.warn('[getCustomerPriceNPR] RPC error, falling back to mrp_npr:', error?.message);
      return { originalPrice: mrpNpr, discount: 0, finalPrice: mrpNpr };
    }
    const finalPrice = Number(data);
    return { originalPrice: mrpNpr, discount: mrpNpr - finalPrice, finalPrice };
  } catch (err) {
    console.warn('[getCustomerPriceNPR] exception, falling back:', err.message);
    return { originalPrice: mrpNpr, discount: 0, finalPrice: mrpNpr };
  }
}

async function processToolCall(toolName, toolInput, session) {
  console.log(`🔧 Processing tool: ${toolName}`);
  try {
    switch (toolName) {
      case 'search_products': {
        const products = await searchProducts(toolInput, session);
        // Determine customer region: Nepal customers get mrp_npr as price base
        const phoneForRegion = session.customer?.phone || session.phoneNumber || '';
        const isNepalCustomer = phoneForRegion.startsWith('+977') || phoneForRegion.startsWith('977');
        const discountPct = session.customer?.base_discount_percentage || 0;
        const customerGrade = session.customer?.customer_grade || null;
        // Cap at 5 results — prompt says "show max 3", so no need to send 20 to the LLM
        const productsWithDiscount = await Promise.all(products.slice(0, 5).map(async product => {
          let pricing;
          if (isNepalCustomer) {
            pricing = await getCustomerPriceNPR(product.mrp_npr, customerGrade, product.hsn_no);
          } else {
            pricing = calculatePrice(product.mrp_inr, discountPct);
          }
          return {
            product_code: product.product_code,
            name: product.name,
            brand: product.brand || '',
            oem_number: product.oem_number || '',
            category: product.category,
            vehicle_model: product.vehicle_model,
            mrp_inr: product.mrp_inr || null,
            mrp_npr: product.mrp_npr || null,
            final_price: pricing.finalPrice,
            availability: product.availability,
            movement: product.movement || null,
          };
        }));
        return { success: true, count: productsWithDiscount.length, products: productsWithDiscount,
          price_currency: isNepalCustomer ? 'NPR' : 'INR' };
      }
      case 'search_workshops': {
        const workshops = await searchWorkshops(toolInput);
        return { success: true, count: workshops.length, workshops };
      }
      case 'add_to_cart': {
        const currentCart = session.context.cart || [];
        const updatedCart = await addToCart(currentCart, toolInput.product_code, toolInput.quantity || 1);
        session.context.cart = updatedCart;
        // Determine region for cart price calculation
        const cartPhone = session.customer?.phone || session.phoneNumber || '';
        const isNepalCart = isNepalPhone(cartPhone);
        const cartSummary = calculateCartTotal(updatedCart, session.customer?.base_discount_percentage || 0, isNepalCart);
        const cartDiscountPct = session.customer?.base_discount_percentage || 0;
        // Return cart items with final_price only (no original_price/discount) — reduces
        // chance of Claude calling out the discount percentage in the response.
        const cartForClaude = updatedCart.map(item => {
          const cartPriceBase = isNepalCart ? (item.mrp_npr || item.mrp_inr) : item.mrp_inr;
          const cartItemFinalPrice = cartPriceBase ? cartPriceBase * (1 - cartDiscountPct / 100) : null;
          return {
            product_code: item.product_code,
            name: item.name,
            brand: item.brand || '',
            quantity: item.quantity,
            mrp_inr: item.mrp_inr || null,
            mrp_npr: item.mrp_npr || null,
            final_price: cartItemFinalPrice !== null ? Math.round(cartItemFinalPrice * 100) / 100 : null
          };
        });
        return {
          success: true,
          cart: cartForClaude,
          summary: {
            itemCount: cartSummary.itemCount,
            total: cartSummary.total,
            estimatedDeliveryDays: cartSummary.estimatedDeliveryDays
          }
        };
      }
      case 'view_cart': {
        const cart = session.context.cart || [];
        const viewPhone = session.customer?.phone || session.phoneNumber || '';
        const summary = calculateCartTotal(cart, session.customer?.base_discount_percentage || 0, isNepalPhone(viewPhone));
        return { success: true, cart, summary };
      }
      case 'place_order': {
        console.log('[order] place_order called with:', JSON.stringify(toolInput));
        // ── Handle pending partial-stock decision (customer replied "1" or "2") ──
        if (session.pendingStockDecision?.awaitingResponse) {
          const pending = session.pendingStockDecision;
          const decision = (toolInput.decision || '1').toString().trim();

          const customerForDecision = session.customer;

          if (!customerForDecision) {
            session.pendingStockDecision = null;
            return { success: false, message: 'Session expired. Please try again.' };
          }

          if (decision === '2' || decision.toLowerCase().includes('wait')) {
            // Customer wants to wait for full stock → pending_stock, no decrement
            const fullSummary = calculateCartTotal(pending.items, customerForDecision.base_discount_percentage || 0, isNepalPhone(customerForDecision.phone));
            const order = await createOrder(customerForDecision.id, pending.items, fullSummary, 'pending_stock');
            session.context.cart = [];
            session.pendingStockDecision = null;
            return {
              success: true,
              order,
              stockMessage: 'pending_stock_wait',
              paymentMethod: 'Cash on Delivery (COD) — payment collected at delivery'
            };
          } else {
            // Decision "1" — confirm for available quantity → partial_stock, decrement availableQty
            const confirmedItems = pending.items.map(item => {
              if (item.stockStatus === 'partial') {
                return { ...item, quantity: item.availableQty };
              }
              return item;
            });
            const partialSummary = calculateCartTotal(confirmedItems, customerForDecision.base_discount_percentage || 0, isNepalPhone(customerForDecision.phone));
            const order = await createOrder(customerForDecision.id, confirmedItems, partialSummary, 'partial_stock');
            await decrementStock(pending.items, supabase);
            session.context.cart = [];
            session.pendingStockDecision = null;
            const partialItem = pending.items.find(i => i.stockStatus === 'partial');
            const remaining = partialItem ? (partialItem.quantity - partialItem.availableQty) : 0;
            return {
              success: true,
              order,
              stockMessage: 'partial_confirmed',
              partialDetails: {
                productName: partialItem?.name || '',
                confirmedQty: partialItem?.availableQty || 0,
                remainingQty: remaining
              },
              paymentMethod: 'Cash on Delivery (COD) — payment collected at delivery'
            };
          }
        }

        // ── Standard flow ──
        const orderCart = session.context.cart || [];
        console.log('[order] cart length:', orderCart.length, '| isEmployee:', !!session.isEmployee, '| customer:', session.customer?.id || 'none');
        if (orderCart.length === 0) {
          console.log('[order] ERROR: cart is empty');
          return { success: false, message: 'Cart is empty. Cannot place order.' };
        }

        // session.customer is always the correct customer (injected for employees by handleConversation)
        const customerForOrder = session.customer;
        console.log('[order] customer resolved:', customerForOrder?.id, customerForOrder?.name);

        if (!customerForOrder) {
          console.log('[order] ERROR: no customer — isEmployee:', session.isEmployee, 'customerForEmployee:', session.customerForEmployee);
          if (session.isEmployee) {
            return { success: false, message: 'No customer selected. Please select a customer from the Customers tab first, then try again.' };
          }
          const config = await loadConfig();
          return { success: false, message: config.registration_message || `Please register first by calling ${CUSTOMER_CARE_PHONE}.` };
        }

        // Check stock for all items in cart
        console.log('[order] checking stock for', orderCart.length, 'items');
        const checkedItems = await checkStockForCart(orderCart, supabase);

        const outOfStockItems = checkedItems.filter(i => i.stockStatus === 'out_of_stock');
        const partialStockItems = checkedItems.filter(i => i.stockStatus === 'partial');
        const availableItems = checkedItems.filter(i => i.stockStatus === 'available');
        const untrackedItems = checkedItems.filter(i => i.stockStatus === 'untracked');

        // CASE C: Any partial item — ask customer before placing order
        if (partialStockItems.length > 0) {
          session.pendingStockDecision = {
            items: checkedItems,
            awaitingResponse: true
          };
          const partialItem = partialStockItems[0];
          return {
            success: false,
            awaitingDecision: true,
            partialDetails: {
              productName: partialItem.name,
              availableQty: partialItem.availableQty,
              requestedQty: partialItem.quantity
            }
          };
        }

        // CASE B: All items out of stock → pending_stock, no decrement
        if (outOfStockItems.length > 0 && availableItems.length === 0 && untrackedItems.length === 0) {
          const orderSummaryB = calculateCartTotal(orderCart, customerForOrder.base_discount_percentage || 0, isNepalPhone(customerForOrder.phone));
          const order = await createOrder(customerForOrder.id, orderCart, orderSummaryB, 'pending_stock');
          session.context.cart = [];
          return {
            success: true,
            order,
            stockMessage: 'out_of_stock',
            outOfStockItems: outOfStockItems.map(i => i.name),
            paymentMethod: 'Cash on Delivery (COD) — payment collected at delivery'
          };
        }

        // CASE D: Mixed — some available, some out_of_stock → decrement available, flag rest
        if (outOfStockItems.length > 0) {
          const orderSummaryD = calculateCartTotal(orderCart, customerForOrder.base_discount_percentage || 0, isNepalPhone(customerForOrder.phone));
          const order = await createOrder(customerForOrder.id, orderCart, orderSummaryD, 'pending_stock');
          await decrementStock(availableItems, supabase);
          session.context.cart = [];
          return {
            success: true,
            order,
            stockMessage: 'mixed_stock',
            availableItems: availableItems.map(i => i.name),
            outOfStockItems: outOfStockItems.map(i => i.name),
            paymentMethod: 'Cash on Delivery (COD) — payment collected at delivery'
          };
        }

        // CASE A: All untracked or available → confirmed, decrement available
        const orderSummaryA = calculateCartTotal(orderCart, customerForOrder.base_discount_percentage || 0, isNepalPhone(customerForOrder.phone));
        console.log('[order] creating order for customer:', customerForOrder.id, 'cart items:', orderCart.length, 'total:', orderSummaryA.total);
        const order = await createOrder(customerForOrder.id, orderCart, orderSummaryA, 'confirmed');
        console.log('[order] created:', order.orderNumber);
        await decrementStock(availableItems, supabase);
        session.context.cart = [];
        if (session.isEmployee) {
          console.log(`📦 Employee order placed for customer: ${customerForOrder.name} (${customerForOrder.phone})`);
        }
        return { success: true, order, paymentMethod: 'Cash on Delivery (COD) — payment collected at delivery' };
      }
      case 'check_order_status': {
        const orderStatus = await getOrderStatus(toolInput.order_number);
        return { success: orderStatus !== null, order: orderStatus };
      }
      case 'get_my_orders': {
        if (!session.customer) return { success: false, message: 'Customer not found.' };
        const orders = await getCustomerOrders(session.customer.id, toolInput.limit || 5);
        return { success: true, orders };
      }
      case 'get_product_image': {
        const { product_id, product_name, brand } = toolInput;

        // 1. Check DB for existing cached image (< 30 days old)
        if (product_id) {
          const { data: prod } = await supabase
            .from('products')
            .select('image_url, image_source, image_fetched_at')
            .eq('id', product_id)
            .single();
          if (prod?.image_url && prod.image_fetched_at) {
            const ageMs = Date.now() - new Date(prod.image_fetched_at).getTime();
            if (ageMs < 30 * 24 * 60 * 60 * 1000) {
              console.log('🖼️ Returning cached product image');
              return { success: true, image_url: prod.image_url, source: prod.image_source, product_name };
            }
          }
        }

        // 2. Search brand official site via Google Custom Search
        let imageUrl = null;
        let imageSource = null;
        try {
          const brandQuery = brand ? `${brand} ` : '';
          const q1 = `${brandQuery}${product_name} official site image`;
          const r1 = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: { key: process.env.GOOGLE_API_KEY, cx: process.env.GOOGLE_CX, q: q1, searchType: 'image', num: 1 }
          });
          if (r1.data?.items?.[0]?.link) {
            imageUrl = r1.data.items[0].link;
            imageSource = 'google_brand_search';
          }
        } catch (e) { console.error('❌ Google image search (brand):', e.message); }

        // 3. Fallback: IndiaMART/TradeIndia search
        if (!imageUrl) {
          try {
            const q2 = `${product_name} spare part indiamart`;
            const r2 = await axios.get('https://www.googleapis.com/customsearch/v1', {
              params: { key: process.env.GOOGLE_API_KEY, cx: process.env.GOOGLE_CX, q: q2, searchType: 'image', num: 1 }
            });
            if (r2.data?.items?.[0]?.link) {
              imageUrl = r2.data.items[0].link;
              imageSource = 'indiamart_search';
            }
          } catch (e) { console.error('❌ Google image search (indiamart):', e.message); }
        }

        // 4. Save found URL back to products table
        if (imageUrl && product_id) {
          await supabase.from('products').update({
            image_url: imageUrl,
            image_source: imageSource,
            image_fetched_at: new Date().toISOString()
          }).eq('id', product_id);
        }

        return { success: !!imageUrl, image_url: imageUrl, source: imageSource, product_name };
      }
      case 'bulk_search_products': {
        const bulkItems = toolInput.items || [];
        const bulkResult = await bulkSearchProducts(bulkItems, session);
        // Apply customer pricing to all found products — use mrp_npr RPC for Nepal customers
        const bulkPhoneForRegion = session.customer?.phone || session.phoneNumber || '';
        const isNepalBulk = bulkPhoneForRegion.startsWith('+977') || bulkPhoneForRegion.startsWith('977');
        const bulkDiscountPct = session.customer?.base_discount_percentage || 0;
        const bulkCustomerGrade = session.customer?.customer_grade || null;
        // Cap each item's results to 5 — prompt says "show max 3"
        bulkResult.results = await Promise.all(bulkResult.results.map(async r => ({
          ...r,
          products: await Promise.all(r.products.slice(0, 5).map(async product => {
            let pricing;
            if (isNepalBulk) {
              pricing = await getCustomerPriceNPR(product.mrp_npr, bulkCustomerGrade, product.hsn_no);
            } else {
              pricing = calculatePrice(product.mrp_inr, bulkDiscountPct);
            }
            return {
              product_code: product.product_code,
              name: product.name,
              brand: product.brand || '',
              oem_number: product.oem_number || '',
              category: product.category,
              vehicle_model: product.vehicle_model,
              mrp_inr: product.mrp_inr || null,
              mrp_npr: product.mrp_npr || null,
              final_price: pricing.finalPrice,
              availability: product.availability,
              broadSearch: product.broadSearch || false,
              modelHint: product.modelHint || null,
              movement: product.movement || null,
            };
          }))
        })));
        return { success: true, ...bulkResult };
      }
      case 'learn_product_term': {
        const { type, input_term, mapped_to, product_id, region, language } = toolInput;
        const saved = await saveKnowledge({
          type,
          inputTerm: input_term,
          mappedTo: mapped_to,
          productId: product_id || null,
          region: region || null,
          language: language || null,
          createdBy: 'bot_learned'
        });
        return { success: true, message: `Saved mapping: "${input_term}" → "${mapped_to}"`, entry: saved };
      }
      case 'lookup_knowledge': {
        const { term } = toolInput;
        const matches = await lookupKnowledge(term);
        return {
          success: true,
          found: matches.length > 0,
          count: matches.length,
          matches: matches.map(m => ({
            input_term: m.input_term,
            mapped_to: m.mapped_to,
            type: m.type,
            region: m.region,
            language: m.language,
            confidence: m.confidence
          }))
        };
      }
      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`❌ Error in tool ${toolName}:`, error);
    if (toolName === 'place_order') console.log('[order] ERROR:', error.message);
    return { success: false, error: error.message };
  }
}

async function resolveOrderingCustomer(session, supabaseClient) {
  const client = supabaseClient || supabase;
  // If not an employee session, return existing session.customer
  if (!session.isEmployee) {
    return session.customer || null;
  }

  // Employee session — use customerForEmployee if set
  if (!session.customerForEmployee) {
    return null; // No customer selected yet
  }

  const selectedId = session.customerForEmployee;

  // Try customers table first
  const { data: customer } = await client
    .from('customers')
    .select('id, name, phone, customer_grade, base_discount_percentage, is_active')
    .eq('id', selectedId)
    .single();

  if (customer && customer.is_active) {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      customer_grade: customer.customer_grade || 'BASIC',
      base_discount_percentage: customer.base_discount_percentage || 25,
      source: 'customer'
    };
  }

  // Try workshops table
  const { data: workshop } = await client
    .from('workshops')
    .select('id, name, owner_whatsapp, mechanic_phone, is_active')
    .eq('id', selectedId)
    .single();

  if (workshop && workshop.is_active) {
    return {
      id: workshop.id,
      name: workshop.name,
      phone: workshop.owner_whatsapp || workshop.mechanic_phone,
      customer_grade: 'PUBLIC',
      base_discount_percentage: 25,
      source: 'workshop'
    };
  }

  return null; // Not found in either table
}

module.exports = { processToolCall, resolveOrderingCustomer };
