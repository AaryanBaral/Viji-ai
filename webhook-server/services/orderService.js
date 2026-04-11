// orderService.js
// Cart and order management functions

const { supabase } = require('../shared');

async function addToCart(currentCart = [], productCode, quantity = 1) {
  try {
    console.log(`🛒 Adding to cart: ${productCode} x${quantity}`);
    const { data: product, error } = await supabase
      .from('products').select('*').eq('product_code', productCode).single();

    if (error || !product) throw new Error('Product not found');
    if (product.stock_quantity !== null && product.stock_quantity <= 0) {
      throw new Error('Product is not in stock. We can check from the market and get back to you.');
    }
    const minQty = product.min_order_quantity || 1;
    if (quantity < minQty) throw new Error(`Minimum order quantity for this product is ${minQty}`);

    const existingIndex = currentCart.findIndex(item => item.product_code === productCode);
    if (existingIndex >= 0) {
      currentCart[existingIndex].quantity += quantity;
    } else {
      currentCart.push({
        product_id: product.id,
        product_code: productCode,
        name: product.name,
        brand: product.brand || '',
        oem_number: product.oem_number || '',
        mrp_inr: product.mrp_inr,
        mrp_npr: product.mrp_npr || null,
        quantity,
        expected_delivery_days: product.expected_delivery_days || null
      });
    }
    console.log(`✅ Cart updated. Total items: ${currentCart.length}`);
    return currentCart;
  } catch (error) {
    console.error('❌ Error in addToCart:', error);
    throw error;
  }
}

function calculateCartTotal(cart = [], discountPercentage = 0, useNpr = false) {
  let subtotal = 0;
  let maxDeliveryDays = 0;
  cart.forEach(item => {
    const priceBase = useNpr ? (item.mrp_npr || item.mrp_inr) : item.mrp_inr;
    subtotal += priceBase * item.quantity;
    if (item.expected_delivery_days && item.expected_delivery_days > maxDeliveryDays) {
      maxDeliveryDays = item.expected_delivery_days;
    }
  });
  const discount = (subtotal * discountPercentage) / 100;
  return {
    itemCount: cart.length,
    subtotal,
    discount,
    discountPercentage,
    total: subtotal - discount,
    estimatedDeliveryDays: maxDeliveryDays > 0 ? maxDeliveryDays : null,
    useNpr
  };
}

async function createOrder(customerUUID, cart, orderSummary, orderStatus = 'pending') {
  try {
    const { total, subtotal, discount = 0 } = orderSummary;
    console.log(`📦 Creating order for customer UUID: ${customerUUID}`);

    let maxDeliveryDays = 0;
    cart.forEach(item => {
      if (item.expected_delivery_days && item.expected_delivery_days > maxDeliveryDays) {
        maxDeliveryDays = item.expected_delivery_days;
      }
    });

    const orderNumber = `ORD-${Date.now()}`;
    const insertData = {
      order_number: orderNumber,
      customer_id: customerUUID,
      order_date: new Date().toISOString(),
      subtotal,
      discount_amount: discount,
      total_amount: total,
      status: orderStatus,
      payment_status: 'pending'
    };

    const result1 = await supabase.from('orders').insert(insertData).select().single();
    if (result1.error) throw result1.error;
    const order = result1.data;
    console.log(`✅ Order record created: ${orderNumber}`);

    // Resolve missing product_ids
    const itemsMissingId = cart.filter(item => !item.product_id && item.product_code);
    if (itemsMissingId.length > 0) {
      const codes = itemsMissingId.map(item => item.product_code);
      const { data: foundProducts } = await supabase.from('products').select('id, product_code').in('product_code', codes);
      if (foundProducts) {
        const codeToId = {};
        foundProducts.forEach(p => { codeToId[p.product_code] = p.id; });
        itemsMissingId.forEach(item => { if (codeToId[item.product_code]) item.product_id = codeToId[item.product_code]; });
      }
      const stillMissing = cart.filter(item => !item.product_id);
      if (stillMissing.length > 0) {
        throw new Error(`Cannot place order: product_id missing for: ${stillMissing.map(i => i.product_code || i.name).join(', ')}`);
      }
    }

    const discPct = orderSummary.discountPercentage || 0;
    const useNpr = orderSummary.useNpr || false;
    const orderItems = cart.map(item => {
      const priceBase = useNpr ? (item.mrp_npr || item.mrp_inr) : item.mrp_inr;
      const gross = priceBase * item.quantity;
      const itemDiscount = Math.round((gross * discPct) / 100 * 100) / 100;
      return {
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        mrp: priceBase,
        discount_percentage: discPct,
        discount_amount: itemDiscount,
        line_total: Math.round((gross - itemDiscount) * 100) / 100
      };
    });

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;

    console.log(`✅ Order fully created: ${orderNumber} with ${orderItems.length} items`);
    return {
      orderNumber,
      orderId: order.id,
      total,
      status: orderStatus,
      estimatedDeliveryDays: maxDeliveryDays > 0 ? maxDeliveryDays : null
    };
  } catch (error) {
    console.error('❌ Error in createOrder:', error);
    throw error;
  }
}

async function getOrderStatus(orderNumber) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(name))')
      .eq('order_number', orderNumber)
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('❌ Error in getOrderStatus:', error);
    return null;
  }
}

async function getCustomerOrders(customerId, limit = 5) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('order_number, order_date, total_amount, status')
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('❌ Error in getCustomerOrders:', error);
    return [];
  }
}

async function checkStockForCart(cartItems, supabaseClient) {
  const client = supabaseClient || supabase;
  const productIds = cartItems.map(item => item.product_id);

  const { data: products, error } = await client
    .from('products')
    .select('id, name, stock_quantity, product_code')
    .in('id', productIds);

  if (error || !products) return cartItems.map(item => ({
    ...item,
    stockStatus: 'untracked',
    availableQty: null
  }));

  return cartItems.map(item => {
    const product = products.find(p => p.id === item.product_id);
    const stock = product?.stock_quantity;
    const qty = item.quantity;

    if (stock === null || stock === undefined) {
      return { ...item, stockStatus: 'untracked', availableQty: null };
    }
    if (stock === 0) {
      return { ...item, stockStatus: 'out_of_stock', availableQty: 0 };
    }
    if (stock >= qty) {
      return { ...item, stockStatus: 'available', availableQty: stock };
    }
    // stock > 0 but < qty
    return { ...item, stockStatus: 'partial', availableQty: stock };
  });
}

async function decrementStock(items, supabaseClient) {
  const client = supabaseClient || supabase;
  for (const item of items) {
    if (item.stockStatus === 'untracked' || item.stockStatus === 'out_of_stock') {
      continue;
    }

    const decrementBy = item.stockStatus === 'partial'
      ? item.availableQty
      : item.requestedQty || item.quantity;

    // Try RPC first; fall back to fetch-then-update if function doesn't exist
    const { error: rpcError } = await client.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_quantity: decrementBy
    });

    if (rpcError) {
      console.error('⚠️ decrement_stock RPC failed, using fallback:', rpcError.message);
      const { data } = await client
        .from('products')
        .select('stock_quantity')
        .eq('id', item.product_id)
        .single();

      if (data && data.stock_quantity !== null) {
        await client
          .from('products')
          .update({ stock_quantity: Math.max(0, data.stock_quantity - decrementBy) })
          .eq('id', item.product_id);
      }
    }
  }
}

module.exports = { addToCart, calculateCartTotal, createOrder, getOrderStatus, getCustomerOrders, checkStockForCart, decrementStock };
