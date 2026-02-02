#!/usr/bin/env node
/**
 * Backfill commissions for delivered orders missing commission records
 * Usage: SUPABASE_KEY=xxx node scripts/backfill_commissions.mjs [--dry-run] [--month YYYY-MM]
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://spkimmrtaxwnysjqkxix.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error('Please set SUPABASE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const monthIndex = args.indexOf('--month');
const monthFilter = monthIndex !== -1 ? args[monthIndex + 1] : null;

console.log('=== COMMISSION BACKFILL ===');
console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
if (monthFilter) console.log(`Month filter: ${monthFilter}`);
console.log('');

// 1. Find delivered orders without commissions
let query = supabase
  .from('orders')
  .select(`
    id,
    order_number,
    agent_id,
    order_date,
    total_price,
    status,
    order_items (
      id,
      sku_id,
      quantity,
      unit_price,
      line_total,
      sku:skus (
        id,
        product_type_id
      )
    )
  `)
  .eq('status', 'delivered')
  .not('agent_id', 'is', null);

if (monthFilter) {
  const startDate = `${monthFilter}-01`;
  const endDate = new Date(monthFilter + '-01');
  endDate.setMonth(endDate.getMonth() + 1);
  const endDateStr = endDate.toISOString().split('T')[0];
  query = query.gte('order_date', startDate).lt('order_date', endDateStr);
}

const { data: orders, error: ordersError } = await query;

if (ordersError) {
  console.error('Error fetching orders:', ordersError);
  process.exit(1);
}

console.log(`Found ${orders.length} delivered orders${monthFilter ? ` in ${monthFilter}` : ''}`);

// 2. Find which ones already have commissions
const orderIds = orders.map(o => o.id);
const { data: existingCommissions } = await supabase
  .from('commissions')
  .select('order_id')
  .in('order_id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000']);

const existingOrderIds = new Set(existingCommissions?.map(c => c.order_id) || []);
const ordersNeedingCommission = orders.filter(o => !existingOrderIds.has(o.id));

console.log(`Orders already have commissions: ${existingOrderIds.size}`);
console.log(`Orders needing commission: ${ordersNeedingCommission.length}`);
console.log('');

if (ordersNeedingCommission.length === 0) {
  console.log('Nothing to backfill!');
  process.exit(0);
}

// 3. Calculate and insert commissions
let created = 0;
let errors = 0;

for (const order of ordersNeedingCommission) {
  let totalCommission = 0;
  const lineDetails = [];
  
  // Calculate commission per line item
  for (const item of order.order_items || []) {
    const unitPrice = item.unit_price || 0;
    const lineTotal = item.line_total || 0;
    const productTypeId = item.sku?.product_type_id || null;
    
    // Get commission rate for this line item
    const { data: rate } = await supabase.rpc('get_commission_rate', {
      p_salesperson_id: order.agent_id,
      p_sku_id: item.sku_id,
      p_product_type_id: productTypeId,
      p_unit_price: unitPrice,
      p_date: order.order_date?.split('T')[0] || new Date().toISOString().split('T')[0]
    });
    
    const lineCommission = Math.round(lineTotal * (rate / 100) * 100) / 100;
    totalCommission += lineCommission;
    
    lineDetails.push({
      sku_id: item.sku_id,
      unit_price: unitPrice,
      line_total: lineTotal,
      rate: rate,
      commission: lineCommission
    });
  }
  
  // Calculate average rate
  const avgRate = order.total_price > 0 
    ? Math.round((totalCommission / order.total_price) * 100 * 100) / 100
    : 0;
  
  console.log(`Order ${order.order_number || order.id.slice(0,8)}:`);
  console.log(`  Date: ${order.order_date?.split('T')[0]}`);
  console.log(`  Total: $${order.total_price?.toFixed(2)}`);
  console.log(`  Lines: ${lineDetails.length}`);
  for (const line of lineDetails) {
    console.log(`    - $${line.unit_price?.toFixed(2)} x ${line.line_total?.toFixed(2)} @ ${line.rate}% = $${line.commission.toFixed(2)}`);
  }
  console.log(`  Commission: $${totalCommission.toFixed(2)} (avg ${avgRate}%)`);
  
  if (!dryRun) {
    const { error: insertError } = await supabase
      .from('commissions')
      .insert({
        order_id: order.id,
        salesperson_id: order.agent_id,
        order_date: order.order_date?.split('T')[0],
        order_total: order.total_price,
        commission_amount: totalCommission,
        rate_applied: avgRate,
        status: 'pending',
        notes: 'Backfilled'
      });
    
    if (insertError) {
      console.log(`  ERROR: ${insertError.message}`);
      errors++;
    } else {
      console.log(`  ✓ Created`);
      created++;
    }
  } else {
    console.log(`  [DRY RUN - not created]`);
  }
  console.log('');
}

console.log('=== SUMMARY ===');
console.log(`Processed: ${ordersNeedingCommission.length}`);
if (!dryRun) {
  console.log(`Created: ${created}`);
  console.log(`Errors: ${errors}`);
} else {
  console.log('(Dry run - no changes made)');
}
