#!/usr/bin/env node
/**
 * Backfill script: Populate city and order stats for existing customers
 * Run after migration: node scripts/backfill_customer_fields.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://spkimmrtaxwnysjqkxix.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error('Please set SUPABASE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Oklahoma city name normalization
const CITY_ALIASES = {
  'OKC': 'OKLAHOMA CITY',
  'OK CITY': 'OKLAHOMA CITY',
  'BA': 'BROKEN ARROW',
  'B.A.': 'BROKEN ARROW',
  'JENKS ': 'JENKS',
  'TULSA ': 'TULSA',
};

// Known Oklahoma cities for validation
const OK_CITIES = new Set([
  'TULSA', 'OKLAHOMA CITY', 'NORMAN', 'BROKEN ARROW', 'EDMOND', 'LAWTON',
  'MOORE', 'MIDWEST CITY', 'ENID', 'STILLWATER', 'MUSKOGEE', 'BARTLESVILLE',
  'OWASSO', 'SHAWNEE', 'PONCA CITY', 'ARDMORE', 'DUNCAN', 'DEL CITY',
  'BIXBY', 'SAPULPA', 'ALTUS', 'BETHANY', 'SAND SPRINGS', 'YUKON',
  'MCALESTER', 'CLAREMORE', 'EL RENO', 'JENKS', 'DURANT', 'TAHLEQUAH',
  'MUSTANG', 'CHICKASHA', 'GUTHRIE', 'WEATHERFORD', 'OKMULGEE', 'ADA',
  'CHOCTAW', 'WOODWARD', 'MIAMI', 'PRYOR', 'GROVE', 'CATOOSA', 'COWETA',
  'COLLINSVILLE', 'GLENPOOL', 'WARR ACRES', 'WAGONER', 'EUFAULA', 'VINITA',
  'SALLISAW', 'CUSHING', 'SEMINOLE', 'CHECOTAH', 'POTEAU', 'BLANCHARD',
  'NOBLE', 'SKIATOOK', 'PURCELL', 'CLINTON', 'PAULS VALLEY', 'HENRYETTA',
  'PIEDMONT', 'NEWCASTLE', 'ELK CITY', 'HARRAH', 'GUYMON', 'TECUMSEH',
  'GOLDSBY', 'LOCUST GROVE', 'MANNFORD', 'BRISTOW', 'IDABEL', 'LINDSAY',
  'PRAGUE', 'FORT GIBSON', 'JAY', 'MADILL', 'KINGFISHER', 'STROUD',
  'LONE GROVE', 'TUTTLE', 'BLACKWELL', 'MARLOW', 'CHANDLER', 'HUGO',
  'ANADARKO', 'LINDSAY', 'ATOKA', 'SULPHUR', 'CACHE', 'HOLDENVILLE',
  'LEXINGTON', 'COALGATE', 'PERKINS', 'VELMA', 'HENNESSEY', 'WEWOKA',
  'SPERRY', 'INOLA', 'CHOUTEAU', 'STIGLER', 'FAIRVIEW', 'DRUMRIGHT',
  'HOMINY', 'PAWHUSKA', 'NOWATA', 'WILBURTON', 'RINGLING', 'KREBS',
]);

function extractCity(address) {
  if (!address) return null;
  
  // Clean up the address
  let cleaned = address.toUpperCase().trim();
  
  // Remove zip codes (5 digit or 5-4 format)
  cleaned = cleaned.replace(/\b\d{5}(-\d{4})?\b/g, '').trim();
  
  // Remove state codes
  cleaned = cleaned.replace(/\b(OK|OKLAHOMA)\b\s*$/i, '').trim();
  cleaned = cleaned.replace(/,\s*(OK|OKLAHOMA)\s*$/i, '').trim();
  
  // Split by comma
  const parts = cleaned.split(',').map(p => p.trim()).filter(p => p);
  
  if (parts.length === 0) return null;
  
  // Take the last part (usually city)
  let city = parts[parts.length - 1];
  
  // If it looks like a street address, try the second to last
  if (parts.length > 1 && /^\d+|street|st|ave|blvd|rd|drive|dr|lane|ln|way|hwy/i.test(city)) {
    city = parts[parts.length - 2] || city;
  }
  
  // Apply aliases
  city = CITY_ALIASES[city] || city;
  
  // Remove any remaining numbers (likely zip remnants)
  city = city.replace(/\d+/g, '').trim();
  
  // Remove trailing punctuation
  city = city.replace(/[.,;:]+$/, '').trim();
  
  // Validate against known cities (if not found, still use it but log)
  if (city && city.length > 1 && !OK_CITIES.has(city)) {
    // Check if it's a partial match
    const match = [...OK_CITIES].find(c => c.includes(city) || city.includes(c));
    if (match) {
      city = match;
    }
  }
  
  return city && city.length > 1 ? city : null;
}

async function backfillCities() {
  console.log('=== BACKFILLING CITY FIELD ===\n');
  
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, address, city')
    .is('city', null);
  
  if (error) {
    console.error('Error fetching customers:', error);
    return;
  }
  
  console.log(`Customers without city: ${customers.length}`);
  
  const cityCount = {};
  let updated = 0;
  let failed = 0;
  
  for (const customer of customers) {
    const city = extractCity(customer.address);
    
    if (city) {
      cityCount[city] = (cityCount[city] || 0) + 1;
      
      const { error: updateError } = await supabase
        .from('customers')
        .update({ city })
        .eq('id', customer.id);
      
      if (updateError) {
        console.error(`Failed to update ${customer.id}:`, updateError.message);
        failed++;
      } else {
        updated++;
      }
    } else {
      failed++;
    }
    
    if ((updated + failed) % 200 === 0) {
      process.stdout.write(`\rProcessed: ${updated + failed}/${customers.length}`);
    }
  }
  
  console.log(`\n\nUpdated: ${updated}`);
  console.log(`Could not extract city: ${failed}`);
  console.log(`\nTop 20 cities:`);
  
  const sorted = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 20);
  sorted.forEach(([city, count]) => console.log(`  ${city}: ${count}`));
}

async function backfillOrderStats() {
  console.log('\n=== BACKFILLING ORDER STATS ===\n');
  
  // Get all orders grouped by customer
  const { data: orders, error } = await supabase
    .from('orders')
    .select('customer_id, order_date');
  
  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }
  
  console.log(`Total orders: ${orders.length}`);
  
  // Group by customer
  const customerStats = {};
  for (const order of orders) {
    if (!order.customer_id) continue;
    
    if (!customerStats[order.customer_id]) {
      customerStats[order.customer_id] = {
        count: 0,
        dates: []
      };
    }
    customerStats[order.customer_id].count++;
    if (order.order_date) {
      customerStats[order.customer_id].dates.push(new Date(order.order_date));
    }
  }
  
  console.log(`Customers with orders: ${Object.keys(customerStats).length}`);
  
  // Update each customer
  let updated = 0;
  for (const [customerId, stats] of Object.entries(customerStats)) {
    const dates = stats.dates.sort((a, b) => a - b);
    const firstDate = dates[0]?.toISOString().split('T')[0] || null;
    const lastDate = dates[dates.length - 1]?.toISOString().split('T')[0] || null;
    
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        has_orders: true,
        order_count: stats.count,
        first_order_date: firstDate,
        last_order_date: lastDate
      })
      .eq('id', customerId);
    
    if (updateError) {
      console.error(`Failed to update ${customerId}:`, updateError.message);
    } else {
      updated++;
    }
  }
  
  console.log(`Updated order stats for: ${updated} customers`);
}

async function main() {
  console.log('Starting backfill...\n');
  
  await backfillCities();
  await backfillOrderStats();
  
  console.log('\n=== BACKFILL COMPLETE ===');
  
  // Verify
  const { count: withCity } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .not('city', 'is', null);
  
  const { count: withOrders } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('has_orders', true);
  
  console.log(`\nCustomers with city: ${withCity}`);
  console.log(`Customers with orders: ${withOrders}`);
}

main().catch(console.error);
